"""
macro_dashboard.py — Comprehensive macro & commodity data for cyclical investing.

Instruments covered:
  Commodities : WTI Crude, Brent, Natural Gas, Copper, Gold, Silver
  Global Macro: US10Y, VIX, DXY (dollar index), US short-term rate
  India Macro : Nifty50, Bank Nifty, Nifty Midcap, India VIX, USD/INR
  NSE Sectors : Metal, IT, Auto, Pharma, Energy, Realty, FMCG, Bank, Infra

All data via yfinance. Cached 15 minutes so page loads are instant.
"""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

DATA_DIR   = Path(__file__).parent / "data"
CACHE_FILE = DATA_DIR / "macro_dashboard_cache.json"
CACHE_TTL  = 15 * 60   # seconds

# ── Instrument registry ───────────────────────────────────────────────────────
COMMODITIES = [
    {"key": "crude_wti",   "name": "WTI Crude",    "ticker": "CL=F",      "unit": "USD/bbl"},
    {"key": "crude_brent", "name": "Brent Crude",  "ticker": "BZ=F",      "unit": "USD/bbl"},
    {"key": "natural_gas", "name": "Natural Gas",  "ticker": "NG=F",      "unit": "USD/MMBtu"},
    {"key": "copper",      "name": "Copper",        "ticker": "HG=F",      "unit": "USD/lb"},
    {"key": "gold",        "name": "Gold",          "ticker": "GC=F",      "unit": "USD/oz"},
    {"key": "silver",      "name": "Silver",        "ticker": "SI=F",      "unit": "USD/oz"},
]

GLOBAL_MACRO = [
    {"key": "us10y",  "name": "US 10Y Yield", "ticker": "^TNX",      "unit": "%"},
    {"key": "us2y",   "name": "US 2Y Yield",  "ticker": "^IRX",      "unit": "%"},
    {"key": "vix",    "name": "VIX",           "ticker": "^VIX",      "unit": "pts"},
    {"key": "dxy",    "name": "DXY (Dollar)",  "ticker": "DX-Y.NYB",  "unit": "index"},
]

INDIA_MACRO = [
    {"key": "nifty",      "name": "Nifty 50",      "ticker": "^NSEI",      "unit": "pts"},
    {"key": "banknifty",  "name": "Bank Nifty",    "ticker": "^NSEBANK",   "unit": "pts"},
    {"key": "midcap",     "name": "Nifty Midcap",  "ticker": "^NSMIDCP",   "unit": "pts"},
    {"key": "india_vix",  "name": "India VIX",     "ticker": "^INDIAVIX",  "unit": "pts"},
    {"key": "usdinr",     "name": "USD/INR",        "ticker": "USDINR=X",   "unit": "₹"},
]

SECTORS = [
    {"key": "metal",   "name": "Metals",   "ticker": "^CNXMETAL"},
    {"key": "energy",  "name": "Energy",   "ticker": "^CNXENERGY"},
    {"key": "bank",    "name": "Banks",    "ticker": "^NSEBANK"},
    {"key": "it",      "name": "IT",       "ticker": "^CNXIT"},
    {"key": "auto",    "name": "Auto",     "ticker": "^CNXAUTO"},
    {"key": "pharma",  "name": "Pharma",   "ticker": "^CNXPHARMA"},
    {"key": "fmcg",    "name": "FMCG",     "ticker": "^CNXFMCG"},
    {"key": "realty",  "name": "Realty",   "ticker": "^CNXREALTY"},
    {"key": "infra",   "name": "Infra",    "ticker": "^CNXINFRA"},
    {"key": "midcap",  "name": "Midcap",   "ticker": "^NSMIDCP"},
]

ALL_TICKERS = (
    [c["ticker"] for c in COMMODITIES]
    + [g["ticker"] for g in GLOBAL_MACRO]
    + [i["ticker"] for i in INDIA_MACRO]
    + [s["ticker"] for s in SECTORS]
)
# Deduplicate while preserving order
ALL_TICKERS = list(dict.fromkeys(ALL_TICKERS))


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _cache_is_fresh() -> bool:
    if not CACHE_FILE.exists():
        return False
    age = datetime.utcnow().timestamp() - CACHE_FILE.stat().st_mtime
    return age < CACHE_TTL


def _load_cache() -> dict:
    with open(CACHE_FILE) as f:
        return json.load(f)


def _save_cache(data: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(CACHE_FILE, "w") as f:
        json.dump(data, f, indent=2)


# ── Price computation ─────────────────────────────────────────────────────────

def _stats(close: pd.Series) -> dict:
    """Compute price, returns, and 200MA status from a Close series."""
    if close is None or len(close) < 5:
        return {}

    price = float(close.iloc[-1])

    def _ret(n):
        if len(close) < n + 1:
            return None
        base = float(close.iloc[-n - 1])
        return round((price - base) / base * 100, 2) if base else None

    # Returns
    r1d  = _ret(1)
    r1w  = _ret(5)
    r1m  = _ret(21)
    r3m  = _ret(63)
    r6m  = _ret(126)
    ytd  = None
    try:
        year_start_idx = close.index[close.index.year < close.index[-1].year]
        if len(year_start_idx) > 0:
            ytd_base = float(close.loc[year_start_idx[-1]])
            ytd = round((price - ytd_base) / ytd_base * 100, 2)
    except Exception:
        pass

    # 200 MA
    ma200 = None
    vs_200ma = None
    if len(close) >= 200:
        ma200 = float(close.rolling(200).mean().iloc[-1])
        vs_200ma = round((price - ma200) / ma200 * 100, 2)

    # Trend: above or below key MAs
    ma50 = float(close.rolling(50).mean().iloc[-1]) if len(close) >= 50 else None

    # 52-week high/low
    hi52 = float(close.tail(252).max()) if len(close) >= 10 else None
    lo52 = float(close.tail(252).min()) if len(close) >= 10 else None
    pct_from_hi = round((price - hi52) / hi52 * 100, 1) if hi52 else None

    # Sparkline: last 30 closes normalised 0-100
    spark_raw  = close.tail(30).tolist()
    spark_min  = min(spark_raw)
    spark_max  = max(spark_raw)
    spark_rng  = spark_max - spark_min
    sparkline  = [round((v - spark_min) / spark_rng * 100, 1) if spark_rng else 50
                  for v in spark_raw]

    return {
        "price":       round(price, 4 if price < 10 else 2),
        "change_1d":   r1d,
        "change_1w":   r1w,
        "change_1m":   r1m,
        "change_3m":   r3m,
        "change_6m":   r6m,
        "ytd":         ytd,
        "ma200":       round(ma200, 2) if ma200 else None,
        "ma50":        round(ma50,  2) if ma50  else None,
        "vs_200ma":    vs_200ma,
        "above_200ma": (price > ma200) if ma200 else None,
        "above_50ma":  (price > ma50)  if ma50  else None,
        "hi52":        round(hi52, 2) if hi52 else None,
        "lo52":        round(lo52, 2) if lo52 else None,
        "pct_from_hi": pct_from_hi,
        "sparkline":   sparkline,
    }


# ── Macro regime summary ──────────────────────────────────────────────────────

def _regime_summary(price_map: dict) -> dict:
    """Derive plain-English macro regime signals from price data."""
    out = {}

    # Nifty trend
    nifty = price_map.get("^NSEI", {})
    if nifty.get("above_200ma") is not None:
        out["nifty_trend"]   = "BULL" if nifty["above_200ma"] else "BEAR"
        out["nifty_vs_200ma"] = nifty.get("vs_200ma")

    # US rates direction (63d change in 10Y yield)
    us10y_data = price_map.get("^TNX", {})
    us10y_1m   = us10y_data.get("change_1m")     # 1-month as proxy for 63d
    us10y_3m   = us10y_data.get("change_3m")
    if us10y_3m is not None:
        if us10y_3m > 0.20:
            out["rate_regime"] = "HIKE"
        elif us10y_3m < -0.20:
            out["rate_regime"] = "CUT"
        else:
            out["rate_regime"] = "NEUTRAL"
        out["us10y_3m_change"] = round(us10y_3m, 3)

    # Commodity cycle
    copper = price_map.get("HG=F", {})
    crude  = price_map.get("CL=F", {})
    commodity_bull = (
        copper.get("above_200ma") and copper.get("change_3m", 0) > 0
        and crude.get("above_200ma") and crude.get("change_3m", 0) > 0
    )
    out["commodity_cycle"] = "BULL" if commodity_bull else "BEAR"

    # Dollar strength
    dxy = price_map.get("DX-Y.NYB", {})
    if dxy.get("change_1m") is not None:
        out["dollar_trend"] = "STRONG" if dxy["change_1m"] > 1 else "WEAK" if dxy["change_1m"] < -1 else "NEUTRAL"

    # VIX regime
    vix = price_map.get("^VIX", {})
    vix_price = vix.get("price")
    if vix_price:
        if vix_price < 15:   out["risk_regime"] = "RISK ON"
        elif vix_price < 20: out["risk_regime"] = "CAUTIOUS"
        elif vix_price < 30: out["risk_regime"] = "RISK OFF"
        else:                out["risk_regime"] = "FEAR"

    # Yield curve (10Y - 2Y proxy: ^TNX - ^IRX)
    us2y_data = price_map.get("^IRX", {})
    if us10y_data.get("price") and us2y_data.get("price"):
        curve = round(us10y_data["price"] - us2y_data["price"] / 100 * 10, 3)
        out["yield_curve"]   = curve
        out["curve_inverted"] = curve < 0

    return out


# ── Main fetch ────────────────────────────────────────────────────────────────

def fetch_dashboard_data(force: bool = False) -> dict:
    """
    Fetch all macro/commodity/sector data in one batch download.
    Returns structured dashboard payload, cached for 15 minutes.
    """
    if not force and _cache_is_fresh():
        return _load_cache()

    logger.info(f"Fetching macro dashboard data for {len(ALL_TICKERS)} instruments…")

    try:
        raw = yf.download(
            ALL_TICKERS,
            period="2y",
            auto_adjust=True,
            progress=False,
            group_by="ticker",
            threads=True,
        )
    except Exception as exc:
        logger.error(f"Batch download failed: {exc}")
        if CACHE_FILE.exists():
            return _load_cache()
        return {"error": str(exc)}

    # Parse each ticker
    price_map = {}
    for ticker in ALL_TICKERS:
        try:
            if len(ALL_TICKERS) == 1:
                df = raw
            elif ticker in raw.columns.get_level_values(0):
                df = raw[ticker]
            elif ticker in raw.columns.get_level_values(1):
                df = raw.xs(ticker, axis=1, level=1)
            else:
                continue

            df = df.dropna(how="all")
            if df.empty or "Close" not in df.columns:
                continue

            close = df["Close"].squeeze()
            price_map[ticker] = _stats(close)
        except Exception as exc:
            logger.warning(f"{ticker}: parse error — {exc}")
            continue

    # Build structured output
    def _enrich(spec_list: list) -> list:
        out = []
        for item in spec_list:
            stats = price_map.get(item["ticker"], {})
            if not stats:
                continue
            out.append({**item, **stats})
        return out

    commodities = _enrich(COMMODITIES)
    global_macro = _enrich(GLOBAL_MACRO)
    india_macro  = _enrich(INDIA_MACRO)

    # Sector heatmap — also compute vs Nifty
    nifty_stats = price_map.get("^NSEI", {})
    sectors = []
    for s in SECTORS:
        stats = price_map.get(s["ticker"], {})
        if not stats:
            continue
        row = {**s, **stats}
        # Relative to Nifty (outperformance)
        for period in ["change_1d", "change_1w", "change_1m", "change_3m"]:
            sec_ret  = stats.get(period)
            nif_ret  = nifty_stats.get(period)
            if sec_ret is not None and nif_ret is not None:
                row[f"{period}_vs_nifty"] = round(sec_ret - nif_ret, 2)
        sectors.append(row)

    regime = _regime_summary(price_map)

    payload = {
        "commodities":   commodities,
        "global_macro":  global_macro,
        "india_macro":   india_macro,
        "sectors":       sectors,
        "regime":        regime,
        "generated_at":  datetime.utcnow().isoformat() + "Z",
    }

    _save_cache(payload)
    logger.info("Macro dashboard data fetched and cached.")
    return payload
