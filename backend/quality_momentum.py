"""
quality_momentum.py — Quality-Momentum Strategy Engine

Philosophy:
  - Universe: curated ~90 Midcap 150 + Smallcap 250 quality names
  - Quality gate: ROE > 15%, Debt/Equity < 1.0 (from Screener.in)
  - Momentum rank: 12-month return, top quartile; exclude top decile of 3-month
    (avoids chasing parabolic moves)
  - Entry timing: vol-crossover signal (same engine as main strategy)
  - Hold period: minimum 12 months → LTCG at 12.5% vs STCG at 20%
  - Target: beat Nifty by 2-3%+ after tax, 55%+ win rate

Data flow:
  1. quality_screen()   → filter universe by ROE/D/E from Screener.in (cached 7 days)
  2. momentum_rank()    → rank passing stocks by 12m return
  3. get_buy_signals()  → stocks in top-ranked watchlist firing vol crossover today
"""

import json
import logging
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

try:
    import requests
    from bs4 import BeautifulSoup
    SCRAPING_AVAILABLE = True
except ImportError:
    SCRAPING_AVAILABLE = False

logger = logging.getLogger(__name__)

DATA_DIR   = Path(__file__).parent / "data"
CACHE_FILE = DATA_DIR / "quality_cache.json"
CACHE_TTL_DAYS = 7       # re-scrape Screener.in every 7 days

# ── Quality Filters ───────────────────────────────────────────────────────────
MIN_ROE          = 15.0   # Return on Equity % (TTM)
MAX_DEBT_EQUITY  = 1.0    # Debt / Equity ratio

# ── Momentum Parameters ───────────────────────────────────────────────────────
MOMENTUM_LOOKBACK  = 252  # 12-month (trading days)
MOMENTUM_SKIP      = 21   # skip last 1 month (standard momentum factor)
MOMENTUM_3M        = 63   # 3-month lookback for "already ran" filter
MOMENTUM_TOP_PCT   = 0.75 # keep stocks in top 75th percentile by 12m momentum
MOMENTUM_3M_EXCL   = 0.90 # exclude stocks in top 10% by 3m momentum (chasing)

# ── Vol-Crossover Entry Timing ────────────────────────────────────────────────
VOL_THRESHOLD      = 2.0
CROSSOVER_WINDOW   = 3
MA_PERIOD          = 50
MOMENTUM_MIN_PCT   = 0.05  # 20d momentum must be positive at entry
MOMENTUM_MAX_PCT   = 0.25  # don't enter if >25% already run
CLOSE_POSITION_MIN = 0.50  # bullish candle filter

# ── Universe ──────────────────────────────────────────────────────────────────
# Curated Nifty Midcap 150 + Smallcap 250 quality names. Sectors known for
# high ROE and low capital intensity — these are the compounders.
QUALITY_UNIVERSE = {
    "FMCG": [
        "MARICO.NS", "DABUR.NS", "EMAMILTD.NS", "COLPAL.NS", "GODREJCP.NS",
        "TATACONSUM.NS", "RADICO.NS", "JYOTHYLAB.NS", "BIKAJI.NS", "WESTLIFE.NS",
        "BRITANNIA.NS", "VBL.NS",
    ],
    "IT": [
        "COFORGE.NS", "PERSISTENT.NS", "LTIM.NS", "MPHASIS.NS", "KPITTECH.NS",
        "TATAELXSI.NS", "HAPPSTMNDS.NS", "MASTEK.NS", "CYIENT.NS", "ROUTE.NS",
        "TANLA.NS", "NEWGEN.NS",
    ],
    "PHARMA": [
        "ALKEM.NS", "ZYDUSLIFE.NS", "TORNTPHARM.NS", "AJANTPHARM.NS", "MANKIND.NS",
        "IPCALAB.NS", "NATCOPHARM.NS", "GLENMARK.NS", "GRANULES.NS", "LAURUSLABS.NS",
        "METROPOLIS.NS", "LALPATHLAB.NS",
    ],
    "AUTO_ANCILLARY": [
        "TVSMOTOR.NS", "SONACOMS.NS", "MINDAIND.NS", "MOTHERSON.NS",
        "BALKRISIND.NS", "CEATLTD.NS", "BOSCHLTD.NS",
    ],
    "SPECIALTY_CHEM": [
        "PIIND.NS", "SRF.NS", "NAVINFLUOR.NS", "FINEORG.NS", "GALAXYSURF.NS",
        "VINDHYATEL.NS", "CLEAN.NS",
    ],
    "CONSUMER_DISC": [
        "TRENT.NS", "PAGEIND.NS", "BATAINDIA.NS", "TITAN.NS", "VEDANT.NS",
        "MANYAVAR.NS", "CAMPUS.NS",
    ],
    "NBFC": [
        "CHOLAFIN.NS", "MUTHOOTFIN.NS", "AAVAS.NS", "HOMEFIRST.NS",
        "CREDITACC.NS",
    ],
    "INDUSTRIALS": [
        "ABB.NS", "SIEMENS.NS", "GRINDWELL.NS", "SCHAEFFLER.NS",
        "TIMKEN.NS", "SKFINDIA.NS", "KAYNES.NS",
    ],
}

ALL_TICKERS = [t for tickers in QUALITY_UNIVERSE.values() for t in tickers]


# ── Screener.in Scraper ───────────────────────────────────────────────────────

def _screener_symbol(ticker: str) -> str:
    """Convert NSE ticker to Screener.in company code."""
    return ticker.replace(".NS", "").replace("-", "-")


def _scrape_quality(symbol: str) -> dict:
    """
    Scrape ROE and Debt/Equity from Screener.in public company page.
    Returns {"roe": float|None, "de": float|None}.
    """
    if not SCRAPING_AVAILABLE:
        return {"roe": None, "de": None}

    url = f"https://www.screener.in/company/{symbol}/"
    try:
        resp = requests.get(url, timeout=10, headers={
            "User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)",
        })
        if resp.status_code != 200:
            logger.warning(f"Screener.in {symbol}: HTTP {resp.status_code}")
            return {"roe": None, "de": None}

        soup = BeautifulSoup(resp.text, "html.parser")

        roe = None
        de  = None

        # Method 1: #top-ratios list items
        for li in soup.select("#top-ratios li"):
            name_el = li.find(class_="name")
            val_el  = li.find(class_="number") or li.find(class_="value")
            if not name_el or not val_el:
                continue
            name = name_el.get_text(strip=True).lower()
            val_text = val_el.get_text(strip=True).replace(",", "").replace("%", "").strip()

            try:
                val = float("".join(c for c in val_text if c in "0123456789.-"))
            except ValueError:
                continue

            if "roe" in name or "return on equity" in name:
                roe = val
            elif "debt / eq" in name or "debt to equity" in name or "d/e" in name:
                de = val

        # Method 2: fallback — scan all ratio list items on the page
        if roe is None or de is None:
            for li in soup.find_all("li"):
                name_el = li.find(class_="name")
                val_el  = li.find(class_="number") or li.find(class_="value")
                if not name_el or not val_el:
                    continue
                name = name_el.get_text(strip=True).lower()
                val_text = val_el.get_text(strip=True).replace(",", "").replace("%", "").strip()
                try:
                    val = float("".join(c for c in val_text if c in "0123456789.-"))
                except ValueError:
                    continue
                if roe is None and ("roe" in name or "return on equity" in name):
                    roe = val
                if de is None and ("debt / eq" in name or "debt to equity" in name or "d/e" in name):
                    de = val

        return {"roe": roe, "de": de}

    except Exception as exc:
        logger.warning(f"Screener.in scrape failed for {symbol}: {exc}")
        return {"roe": None, "de": None}


def _load_cache() -> dict:
    if CACHE_FILE.exists():
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {"updated_at": None, "data": {}}


def _save_cache(cache: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)


def _cache_is_fresh(cache: dict) -> bool:
    if not cache.get("updated_at"):
        return False
    updated = datetime.fromisoformat(cache["updated_at"])
    return (datetime.utcnow() - updated).days < CACHE_TTL_DAYS


def refresh_quality_cache(force: bool = False) -> dict:
    """
    Scrape Screener.in for all universe tickers and update the quality cache.
    Respects cache TTL (7 days) unless force=True.
    Returns the full cache data dict keyed by NSE ticker.
    """
    cache = _load_cache()
    if not force and _cache_is_fresh(cache):
        logger.info("Quality cache is fresh, skipping scrape.")
        return cache["data"]

    logger.info(f"Refreshing quality cache for {len(ALL_TICKERS)} tickers…")
    data = dict(cache.get("data", {}))

    for i, ticker in enumerate(ALL_TICKERS):
        symbol = _screener_symbol(ticker)
        result = _scrape_quality(symbol)
        data[ticker] = {
            "roe": result["roe"],
            "de":  result["de"],
            "scraped_at": datetime.utcnow().isoformat(),
        }
        logger.info(f"  [{i+1}/{len(ALL_TICKERS)}] {ticker}: ROE={result['roe']}, D/E={result['de']}")
        time.sleep(0.5)   # polite rate-limiting

    cache = {"updated_at": datetime.utcnow().isoformat(), "data": data}
    _save_cache(cache)
    logger.info("Quality cache refresh complete.")
    return data


def load_quality_cache() -> dict:
    """Load cached quality data (ROE, D/E) without triggering a scrape."""
    cache = _load_cache()
    return cache.get("data", {})


# ── Quality Filter ────────────────────────────────────────────────────────────

def _passes_quality(ticker: str, quality_data: dict) -> bool:
    """Return True if stock passes ROE and D/E filters."""
    d = quality_data.get(ticker, {})
    roe = d.get("roe")
    de  = d.get("de")

    # If we couldn't scrape, don't reject — let it through with a warning flag
    if roe is None and de is None:
        return True   # can't confirm, optimistically include

    if roe is not None and roe < MIN_ROE:
        return False
    if de is not None and de > MAX_DEBT_EQUITY:
        return False
    return True


# ── Momentum Engine ───────────────────────────────────────────────────────────

def _compute_momentum(tickers: list) -> pd.DataFrame:
    """
    Download price history and compute 12-month and 3-month momentum for each ticker.
    Returns DataFrame with columns: ticker, ret_12m, ret_3m, price, sector.
    """
    records = []
    start = (date.today() - timedelta(days=400)).isoformat()

    for ticker in tickers:
        try:
            df = yf.download(ticker, start=start, progress=False, auto_adjust=True)
            if df.empty or len(df) < MOMENTUM_LOOKBACK // 2:
                continue
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            close = df["Close"].squeeze()

            # 12-month: compare today to ~252 days ago, skip last 21 days
            idx_now   = -1
            idx_12m   = min(len(close) - 1, MOMENTUM_LOOKBACK)
            idx_3m    = min(len(close) - 1, MOMENTUM_3M)

            price_now = float(close.iloc[idx_now])
            price_12m = float(close.iloc[-idx_12m]) if idx_12m < len(close) else None
            price_3m  = float(close.iloc[-idx_3m])  if idx_3m  < len(close) else None

            ret_12m = ((price_now - price_12m) / price_12m) if price_12m else None
            ret_3m  = ((price_now - price_3m)  / price_3m)  if price_3m  else None

            # Find sector
            sector = next(
                (s for s, tks in QUALITY_UNIVERSE.items() if ticker in tks),
                "OTHER"
            )

            records.append({
                "ticker":  ticker,
                "sector":  sector,
                "price":   round(price_now, 2),
                "ret_12m": round(ret_12m * 100, 2) if ret_12m is not None else None,
                "ret_3m":  round(ret_3m  * 100, 2) if ret_3m  is not None else None,
            })
        except Exception as exc:
            logger.warning(f"{ticker}: momentum compute failed — {exc}")
            continue

    return pd.DataFrame(records) if records else pd.DataFrame()


def build_watchlist(quality_data: dict, max_stocks: int = 30) -> list:
    """
    1. Filter universe by quality (ROE > 15%, D/E < 1)
    2. Compute 12m + 3m momentum
    3. Keep top MOMENTUM_TOP_PCT by 12m return
    4. Exclude top MOMENTUM_3M_EXCL by 3m return (avoid chasers)
    5. Return ranked list of up to max_stocks

    Each record: ticker, sector, price, ret_12m, ret_3m, roe, de, rank, quality_confirmed
    """
    # Quality filter
    passing = [t for t in ALL_TICKERS if _passes_quality(t, quality_data)]
    logger.info(f"Quality filter: {len(passing)}/{len(ALL_TICKERS)} stocks passed")

    # Momentum
    mom_df = _compute_momentum(passing)
    if mom_df.empty:
        return []

    # Drop rows with no 12m return
    mom_df = mom_df.dropna(subset=["ret_12m"])

    # Momentum ranking percentiles
    if len(mom_df) >= 4:
        mom_df["pct_12m"] = mom_df["ret_12m"].rank(pct=True)
        mom_df["pct_3m"]  = mom_df["ret_3m"].rank(pct=True)

        # Keep top 75th percentile by 12m momentum
        mom_df = mom_df[mom_df["pct_12m"] >= MOMENTUM_TOP_PCT]

        # Exclude top 10% by 3m momentum (already ran too hard recently)
        if "pct_3m" in mom_df.columns:
            mom_df = mom_df[mom_df["pct_3m"] < MOMENTUM_3M_EXCL]

    # Sort by 12m return descending
    mom_df = mom_df.sort_values("ret_12m", ascending=False).head(max_stocks)

    # Add quality data and ranking
    result = []
    for rank, (_, row) in enumerate(mom_df.iterrows(), start=1):
        ticker = row["ticker"]
        qd = quality_data.get(ticker, {})
        result.append({
            "ticker":            ticker,
            "sector":            row["sector"],
            "price":             row["price"],
            "ret_12m":           row["ret_12m"],
            "ret_3m":            row.get("ret_3m"),
            "roe":               qd.get("roe"),
            "de":                qd.get("de"),
            "rank":              rank,
            "quality_confirmed": qd.get("roe") is not None,
        })

    return result


# ── Vol-Crossover Entry Timing ─────────────────────────────────────────────────

def _check_vol_crossover(ticker: str) -> Optional[dict]:
    """
    Returns timing signal dict if the stock is firing a vol crossover today,
    else None. Uses same 3-day crossover logic as main signals engine.
    """
    try:
        df = yf.download(ticker, period="200d", progress=False, auto_adjust=True)
        if df.empty or len(df) < 110:
            return None
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
    except Exception:
        return None

    close  = df["Close"].squeeze()
    volume = df["Volume"].squeeze()

    vol_10 = volume.rolling(10).mean()
    vol_91 = volume.rolling(91).mean().replace(0, np.nan)
    vr     = vol_10 / vol_91

    if len(vr) < CROSSOVER_WINDOW + 2:
        return None

    vol_now    = float(vr.iloc[-1])
    vol_3d_ago = float(vr.iloc[-(CROSSOVER_WINDOW + 1)])

    if pd.isna(vol_now) or pd.isna(vol_3d_ago):
        return None
    if not (vol_now >= VOL_THRESHOLD and vol_3d_ago < VOL_THRESHOLD):
        return None

    # MA50 filter
    ma50 = close.rolling(MA_PERIOD).mean()
    if float(close.iloc[-1]) <= float(ma50.iloc[-1]):
        return None

    # 20d momentum gate
    if len(close) < 21:
        return None
    ret20 = (float(close.iloc[-1]) - float(close.iloc[-21])) / float(close.iloc[-21])
    if ret20 <= MOMENTUM_MIN_PCT or ret20 > MOMENTUM_MAX_PCT:
        return None

    # Bullish candle filter
    if "High" in df.columns and "Low" in df.columns:
        dh = float(df["High"].squeeze().iloc[-1])
        dl = float(df["Low"].squeeze().iloc[-1])
        dr = dh - dl
        if dr > 0 and (float(close.iloc[-1]) - dl) / dr < CLOSE_POSITION_MIN:
            return None

    # Close above previous close
    if len(close) >= 2 and float(close.iloc[-1]) <= float(close.iloc[-2]):
        return None

    entry = float(close.iloc[-1])
    # ATR stop
    h  = df["High"].squeeze()
    l  = df["Low"].squeeze()
    c  = df["Close"].squeeze()
    tr = pd.concat([h - l, (h - c.shift(1)).abs(), (l - c.shift(1)).abs()], axis=1).max(axis=1)
    atr14 = float(tr.rolling(14).mean().iloc[-1])
    if pd.isna(atr14) or atr14 <= 0:
        stop = round(entry * 0.93, 2)
    else:
        stop = round(entry - min(1.5 * atr14, entry * 0.10), 2)

    risk   = entry - stop
    target = round(entry + 2.0 * risk, 2)

    return {
        "entry_price":   round(entry, 2),
        "initial_stop":  stop,
        "target_price":  target,
        "stop_pct":      round((stop - entry) / entry * 100, 2),
        "vol_ratio":     round(vol_now, 2),
        "ret_20d":       round(ret20 * 100, 2),
    }


def get_buy_signals(watchlist: list) -> list:
    """
    Check each watchlist stock for a vol-crossover signal today.
    Returns list of signals with all watchlist metadata attached.
    """
    signals = []
    for item in watchlist:
        timing = _check_vol_crossover(item["ticker"])
        if timing:
            sig = dict(item)
            sig.update(timing)
            sig["date"]            = date.today().isoformat()
            sig["book"]            = "QUALITY_MOMENTUM"
            sig["signal_strength"] = "STRONG" if timing["vol_ratio"] >= VOL_THRESHOLD * 1.5 else "MODERATE"
            signals.append(sig)
    return signals


# ── LTCG Tax Tracker ──────────────────────────────────────────────────────────

def compute_ltcg_status(entry_date_str: str, entry_price: float,
                        current_price: float) -> dict:
    """
    Given an entry date and prices, compute tax status for an open position.
    India LTCG: gains on equity held >365 days taxed at 12.5% (above ₹1.25L).
    STCG: gains held ≤365 days taxed at 20%.
    """
    try:
        entry_dt = date.fromisoformat(entry_date_str)
    except (ValueError, TypeError):
        return {}

    days_held  = (date.today() - entry_dt).days
    days_to_lt = max(0, 365 - days_held)
    is_ltcg    = days_held >= 365

    gross_gain_pct = ((current_price - entry_price) / entry_price * 100)
    tax_rate       = 0.125 if is_ltcg else 0.20
    net_gain_pct   = gross_gain_pct * (1 - tax_rate)

    return {
        "days_held":    days_held,
        "days_to_ltcg": days_to_lt,
        "is_ltcg":      is_ltcg,
        "tax_rate_pct": 12.5 if is_ltcg else 20.0,
        "gross_gain_pct": round(gross_gain_pct, 2),
        "net_gain_pct":   round(net_gain_pct, 2),
        "tax_drag_pct":   round(gross_gain_pct - net_gain_pct, 2),
    }


# ── Main Public API ───────────────────────────────────────────────────────────

def get_quality_data() -> dict:
    """
    Returns:
      watchlist: ranked list of quality-momentum stocks
      signals:   watchlist members firing vol crossover today
      cache_age: age of quality data in days
      cache_fresh: bool
    """
    cache     = _load_cache()
    qual_data = cache.get("data", {})
    is_fresh  = _cache_is_fresh(cache)

    # If cache is stale, trigger background refresh (non-blocking)
    # In production this runs via scheduler; here we surface the staleness flag
    watchlist = build_watchlist(qual_data, max_stocks=30)
    signals   = get_buy_signals(watchlist[:20])  # only check top 20 for signals

    cache_age = None
    if cache.get("updated_at"):
        try:
            updated  = datetime.fromisoformat(cache["updated_at"])
            cache_age = (datetime.utcnow() - updated).days
        except Exception:
            pass

    return {
        "watchlist":   watchlist,
        "signals":     signals,
        "cache_fresh": is_fresh,
        "cache_age":   cache_age,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
