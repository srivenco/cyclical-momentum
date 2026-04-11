"""
signals.py — Signal generation for Cyclical Momentum Strategy.
CIO improvements v2:
  - ATR-based stops (1.5× ATR14, capped at 10%)
  - Expanded universe: ~120 stocks across Nifty Midcap/Smallcap sectors
  - 3-day crossover window (not strict 1-day)
  - Relative strength filter for Defensive book
  - target_price field on every signal (2:1 R:R)
  - MA20 for Defensive book; MA50 for all others
"""

import json
import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
SIGNALS_LATEST_FILE  = DATA_DIR / "signals_latest.json"
SIGNALS_HISTORY_FILE = DATA_DIR / "signals_history.json"
SIGNALS_WARMING_FILE = DATA_DIR / "signals_warming.json"

# ── Strategy Parameters ───────────────────────────────────────────────────────
VOL_THRESHOLD_DEFAULT   = 2.0
VOL_THRESHOLD_COMMODITY = 3.0
ATR_MULTIPLIER          = 1.5   # 1.5 × ATR(14)
ATR_MAX_STOP_PCT        = 0.10  # cap stop distance at 10% of entry
STOP_FALLBACK_PCT       = 0.07
MOMENTUM_FILTER_PCT     = 0.05  # 20-day momentum must exceed this
MOMENTUM_FILTER_DEFENSIVE = 0.03  # lower bar for defensive (already outperforming)
COOLDOWN_DAYS           = 30
SEASONAL_EXCLUDE_MONTHS = [1, 2]
MA_FILTER_STANDARD      = 50
MA_FILTER_DEFENSIVE     = 20    # faster MA for defensive / IT / FMCG
CIRCUIT_BREAKER_LOSSES  = 3
CROSSOVER_WINDOW_DAYS   = 3     # signal fires if crossover happened within 3 trading days

# ── Expanded Universe ─────────────────────────────────────────────────────────
COMMODITY_BOOK = {
    "METAL": [
        # Original
        "APLAPOLLO.NS", "JINDALSTEL.NS", "SAIL.NS", "NMDC.NS", "MOIL.NS",
        "NATIONALUM.NS", "HINDZINC.NS",
        # Added (Nifty Midcap/Smallcap metals)
        "JSWSTEEL.NS", "TATASTEEL.NS", "HINDALCO.NS", "VEDL.NS",
        "RATNAMANI.NS", "HINDCOPPER.NS", "WELCORP.NS",
    ],
    "ENERGY": [
        # Original
        "JSWENERGY.NS", "TATAPOWER.NS", "ADANIGREEN.NS", "PFC.NS", "RECLTD.NS",
        "NHPC.NS", "SJVN.NS", "CESC.NS", "WAAREEENER.NS",
        # Added
        "NTPC.NS", "POWERGRID.NS", "TORNTPOWER.NS", "GAIL.NS",
        "PETRONET.NS", "IEX.NS",
    ],
}

RATEHIKE_BOOK = {
    "ENERGY": [
        # Original
        "JSWENERGY.NS", "TATAPOWER.NS", "CESC.NS", "NHPC.NS", "SJVN.NS",
        # Added
        "NTPC.NS", "POWERGRID.NS", "TORNTPOWER.NS", "GAIL.NS", "IEX.NS",
    ],
    "FMCG": [
        # Original
        "MARICO.NS", "DABUR.NS", "COLPAL.NS", "GODREJCP.NS", "TATACONSUM.NS",
        # Added (stable FMCG beneficiaries in high-rate environment)
        "EMAMILTD.NS", "VARUNBEV.NS", "RADICO.NS", "JYOTHYLAB.NS", "BIKAJI.NS",
    ],
}

RATECUT_BOOK = {
    "BANK": [
        # Original
        "IDFCFIRSTB.NS", "FEDERALBNK.NS", "RBLBANK.NS", "AUBANK.NS",
        "BANDHANBNK.NS", "EQUITASBNK.NS",
        # Added (small finance + regional banks most rate-sensitive)
        "KARURVYSYA.NS", "DCBBANK.NS", "SURYODAY.NS", "UJJIVANSFB.NS",
        "CSBBANK.NS", "UTKARSHBNK.NS",
    ],
    "REALTY": [
        # Original
        "DLF.NS", "GODREJPROP.NS", "OBEROIRLTY.NS", "PRESTIGE.NS",
        "PHOENIXLTD.NS", "BRIGADE.NS",
        # Added
        "SOBHA.NS", "ANANTRAJ.NS", "KOLTEPATIL.NS", "SUNTECK.NS", "RAYMOND.NS",
    ],
    "INFRA": [
        # Original
        "KNRCON.NS", "NCC.NS", "PNCINFRA.NS", "IRB.NS", "RVNL.NS",
        "RAILTEL.NS", "HAL.NS", "BEL.NS",
        # Added
        "AHLUCONT.NS", "PSPPROJECT.NS", "GRINFRA.NS", "DBL.NS",
        "JKCEMENT.NS", "RAMCOCEM.NS", "APOLLOPIPE.NS",
    ],
}

DEFENSIVE_BOOK = {
    "PHARMA": [
        # Original (removed SOLARA due to operational issues)
        "LAURUSLABS.NS", "GRANULES.NS", "NATCOPHARM.NS", "IPCALAB.NS",
        "ALKEM.NS", "ZYDUSLIFE.NS", "METROPOLIS.NS", "LALPATHLAB.NS", "MANKIND.NS",
        # Added
        "GLENMARK.NS", "TORNTPHARM.NS", "AJANTPHARM.NS", "CIPLA.NS",
        "GLAND.NS", "ASTRAZEN.NS",
    ],
    "IT": [
        # IT outperforms in bear markets (USD-earning, cash-rich, low-capex)
        "LTIM.NS", "COFORGE.NS", "PERSISTENT.NS", "MPHASIS.NS",
        "KPITTECH.NS", "TATAELXSI.NS", "HAPPSTMNDS.NS", "MASTEK.NS",
    ],
    "FMCG": [
        # Defensive consumer staples
        "EMAMILTD.NS", "VARUNBEV.NS", "RADICO.NS", "JYOTHYLAB.NS",
        "BIKAJI.NS", "MARICO.NS", "TATACONSUM.NS",
    ],
}

BOOK_MAP = {
    "F2_COMMODITY": (COMMODITY_BOOK, VOL_THRESHOLD_COMMODITY),
    "F3B_RATEHIKE": (RATEHIKE_BOOK, VOL_THRESHOLD_DEFAULT),
    "F_RATECUT":    (RATECUT_BOOK,  VOL_THRESHOLD_DEFAULT),
    "F4_DEFENSIVE": (DEFENSIVE_BOOK, VOL_THRESHOLD_DEFAULT),
}


# ── Helpers ───────────────────────────────────────────────────────────────────
def _load_history() -> list:
    if SIGNALS_HISTORY_FILE.exists():
        with open(SIGNALS_HISTORY_FILE) as f:
            return json.load(f)
    return []


def _tickers_in_cooldown(history: list) -> set:
    """Return tickers that had a stop exit within COOLDOWN_DAYS."""
    today = date.today()
    cooldown_set = set()
    for sig in history:
        if sig.get("exit_reason") == "stop" and sig.get("exit_date"):
            try:
                exit_dt = date.fromisoformat(sig["exit_date"])
                if (today - exit_dt).days <= COOLDOWN_DAYS:
                    cooldown_set.add(sig["ticker"])
            except ValueError:
                pass
    return cooldown_set


def _circuit_breaker_status(history: list, book: str) -> bool:
    """True if book has 3+ consecutive recent losses."""
    book_exits = [
        s for s in history
        if s.get("book") == book and s.get("exit_reason") in ("stop", "loss")
        and s.get("exit_date")
    ]
    book_exits.sort(key=lambda x: x["exit_date"], reverse=True)
    if len(book_exits) < CIRCUIT_BREAKER_LOSSES:
        return False
    last_n = book_exits[:CIRCUIT_BREAKER_LOSSES]
    return all(s.get("pnl_pct", 0) < 0 for s in last_n)


def _calc_atr_stop(df: pd.DataFrame, entry_price: float) -> float:
    """
    Calculate ATR-based stop: entry - 1.5 × ATR(14).
    Capped so stop is no more than ATR_MAX_STOP_PCT below entry.
    Falls back to percentage-based stop if data insufficient.
    """
    if len(df) < 20:
        return round(entry_price * (1 - STOP_FALLBACK_PCT), 2)

    high  = df["High"].squeeze()
    low   = df["Low"].squeeze()
    close = df["Close"].squeeze()
    prev_close = close.shift(1)

    tr = pd.concat([
        high - low,
        (high - prev_close).abs(),
        (low  - prev_close).abs(),
    ], axis=1).max(axis=1)
    atr14 = float(tr.rolling(14).mean().iloc[-1])

    if np.isnan(atr14) or atr14 <= 0:
        return round(entry_price * (1 - STOP_FALLBACK_PCT), 2)

    stop_distance = min(ATR_MULTIPLIER * atr14, entry_price * ATR_MAX_STOP_PCT)
    return round(entry_price - stop_distance, 2)


def _analyse_ticker(
    ticker: str,
    book: str,
    sector: str,
    threshold: float,
    cooldown_set: set,
    history: list,
    nifty_20d_return: Optional[float] = None,
) -> Optional[dict]:
    """Return a signal dict if all conditions are met, else None."""
    today = date.today()

    # Seasonal filter
    if today.month in SEASONAL_EXCLUDE_MONTHS:
        return None

    # Cooldown
    if ticker in cooldown_set:
        return None

    try:
        df = yf.download(ticker, period="200d", progress=False, auto_adjust=True)
    except Exception as exc:
        logger.warning(f"{ticker}: download error — {exc}")
        return None

    if df.empty or len(df) < 100:
        return None

    # Flatten MultiIndex if present
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    close  = df["Close"].squeeze()
    volume = df["Volume"].squeeze()

    # Vol ratio series
    vol_10 = volume.rolling(10).mean()
    vol_91 = volume.rolling(91).mean().replace(0, np.nan)
    vol_ratio_series = vol_10 / vol_91

    # ── 3-day crossover window ────────────────────────────────────────────────
    # Signal fires if: today >= threshold AND it was below threshold 3 bars ago
    # (i.e., crossover happened within the last 3 trading days)
    if len(vol_ratio_series) < CROSSOVER_WINDOW_DAYS + 2:
        return None

    vol_now   = float(vol_ratio_series.iloc[-1])
    vol_3d_ago = float(vol_ratio_series.iloc[-(CROSSOVER_WINDOW_DAYS + 1)])

    if pd.isna(vol_now) or pd.isna(vol_3d_ago):
        return None
    if not (vol_now >= threshold and vol_3d_ago < threshold):
        return None

    # ── MA filter (MA20 for Defensive, MA50 for others) ──────────────────────
    ma_period = MA_FILTER_DEFENSIVE if book == "F4_DEFENSIVE" else MA_FILTER_STANDARD
    ma = close.rolling(ma_period).mean()
    if len(ma) < ma_period or float(close.iloc[-1]) <= float(ma.iloc[-1]):
        return None

    # ── 20-day momentum ───────────────────────────────────────────────────────
    if len(close) < 21:
        return None
    mom_threshold = MOMENTUM_FILTER_DEFENSIVE if book == "F4_DEFENSIVE" else MOMENTUM_FILTER_PCT
    prior_20d_return = (float(close.iloc[-1]) - float(close.iloc[-21])) / float(close.iloc[-21])
    if prior_20d_return <= mom_threshold:
        return None

    # ── Relative strength filter for Defensive book ───────────────────────────
    # Stock's 20d return must exceed Nifty's 20d return (stock is outperforming)
    if book == "F4_DEFENSIVE" and nifty_20d_return is not None:
        if prior_20d_return <= nifty_20d_return:
            return None

    # ── ATR-based stop ────────────────────────────────────────────────────────
    entry_price  = float(close.iloc[-1])
    initial_stop = _calc_atr_stop(df, entry_price)
    # Safety: stop must be below entry
    if initial_stop >= entry_price:
        initial_stop = round(entry_price * (1 - STOP_FALLBACK_PCT), 2)

    stop_pct = round((initial_stop - entry_price) / entry_price * 100, 2)

    # ── Target price (2:1 R:R) ───────────────────────────────────────────────
    risk_distance = entry_price - initial_stop
    target_price  = round(entry_price + 2.0 * risk_distance, 2)

    # ── Signal strength ───────────────────────────────────────────────────────
    if vol_now >= threshold * 1.5:
        strength = "STRONG"
    elif vol_now >= threshold * 1.2:
        strength = "MODERATE"
    else:
        strength = "NORMAL"

    circuit = _circuit_breaker_status(history, book)

    return {
        "ticker": ticker,
        "date": today.isoformat(),
        "book": book,
        "sector": sector,
        "entry_price": round(entry_price, 2),
        "initial_stop": initial_stop,
        "target_price": target_price,
        "stop_pct": stop_pct,
        "vol_ratio": round(vol_now, 2),
        "prior_20d_return": round(prior_20d_return * 100, 2),
        "regime": book,       # overridden by caller with readable label
        "signal_strength": strength,
        "circuit_breaker": circuit,
        "cap_type": "mid_small",
    }


def _fetch_nifty_20d_return() -> Optional[float]:
    """Download Nifty50 once; return its 20-day percentage return."""
    try:
        df = yf.download("^NSEI", period="60d", progress=False, auto_adjust=True)
        if df.empty or len(df) < 21:
            return None
        close = df["Close"].squeeze()
        return (float(close.iloc[-1]) - float(close.iloc[-21])) / float(close.iloc[-21])
    except Exception as exc:
        logger.warning(f"Nifty 20d return fetch failed: {exc}")
        return None


def generate_signals(active_books: list) -> dict:
    """
    Generate signals for all active books.
    Returns dict with signals list and scan metadata.
    """
    today = date.today()
    logger.info(f"Generating signals for books: {active_books}")

    history     = _load_history()
    cooldown_set = _tickers_in_cooldown(history)

    # Fetch Nifty 20d return once (used by Defensive book relative strength filter)
    nifty_20d_return = None
    if "F4_DEFENSIVE" in active_books:
        nifty_20d_return = _fetch_nifty_20d_return()
        logger.info(f"Nifty 20d return for relative strength filter: "
                    f"{round(nifty_20d_return * 100, 2) if nifty_20d_return else 'N/A'}%")

    signals       = []
    total_checked = 0

    for book_name in active_books:
        if book_name not in BOOK_MAP:
            continue
        universe, threshold = BOOK_MAP[book_name]
        for sector, tickers in universe.items():
            for ticker in tickers:
                total_checked += 1
                result = _analyse_ticker(
                    ticker, book_name, sector, threshold,
                    cooldown_set, history,
                    nifty_20d_return=nifty_20d_return if book_name == "F4_DEFENSIVE" else None,
                )
                if result is not None:
                    result["regime"] = _regime_label(book_name)
                    signals.append(result)

    payload = {
        "date": today.isoformat(),
        "active_books": active_books,
        "total_checked": total_checked,
        "signal_count": len(signals),
        "signals": signals,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SIGNALS_LATEST_FILE, "w") as f:
        json.dump(payload, f, indent=2)

    _append_to_history(signals)

    logger.info(f"Signals generated: {len(signals)} from {total_checked} stocks checked")
    return payload


def _regime_label(book: str) -> str:
    mapping = {
        "F2_COMMODITY": "COMMODITY_BULL",
        "F3B_RATEHIKE": "RATE_HIKE",
        "F_RATECUT":    "RATE_CUT",
        "F4_DEFENSIVE": "NIFTY_BEAR",
    }
    return mapping.get(book, book)


def _append_to_history(signals: list):
    history = _load_history()
    existing_keys = {(s["ticker"], s["date"]) for s in history}
    new_entries = [s for s in signals if (s["ticker"], s["date"]) not in existing_keys]
    history.extend(new_entries)
    with open(SIGNALS_HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


def load_signals_latest() -> dict:
    if SIGNALS_LATEST_FILE.exists():
        with open(SIGNALS_LATEST_FILE) as f:
            return json.load(f)
    return {
        "date": date.today().isoformat(),
        "active_books": [],
        "total_checked": 0,
        "signal_count": 0,
        "signals": [],
        "generated_at": None,
    }


def load_signals_history(days: int = 365) -> list:
    history = _load_history()
    cutoff_date = (date.today() - timedelta(days=days)).isoformat()
    return [s for s in history if s.get("date", "") >= cutoff_date]


# ── Warming-Up Watchlist ──────────────────────────────────────────────────────

def generate_warming_up(active_books: list) -> list:
    """
    Return stocks approaching a vol-ratio crossover (60–95% of threshold).
    Also checks price > MA and 20d momentum > 3%.
    Results saved to signals_warming.json.
    """
    today = date.today()
    if today.month in SEASONAL_EXCLUDE_MONTHS:
        return []

    warming = []

    for book_name in active_books:
        if book_name not in BOOK_MAP:
            continue
        universe, threshold = BOOK_MAP[book_name]
        low_band  = threshold * 0.60
        high_band = threshold * 1.00   # below threshold = not yet triggered

        ma_period = MA_FILTER_DEFENSIVE if book_name == "F4_DEFENSIVE" else MA_FILTER_STANDARD

        for sector, tickers in universe.items():
            for ticker in tickers:
                try:
                    df = yf.download(ticker, period="200d", progress=False, auto_adjust=True)
                except Exception:
                    continue
                if df.empty or len(df) < 100:
                    continue

                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)

                close  = df["Close"].squeeze()
                volume = df["Volume"].squeeze()

                vol_10 = volume.rolling(10).mean()
                vol_91 = volume.rolling(91).mean().replace(0, np.nan)
                vr     = vol_10 / vol_91
                if len(vr) < 1 or pd.isna(vr.iloc[-1]):
                    continue

                vr_now = float(vr.iloc[-1])
                if vr_now >= high_band or vr_now < low_band:
                    continue

                # MA filter
                ma = close.rolling(ma_period).mean()
                if len(ma) < ma_period or float(close.iloc[-1]) <= float(ma.iloc[-1]):
                    continue

                # Momentum: > 3% over 20 days
                if len(close) < 21:
                    continue
                ret20 = (float(close.iloc[-1]) - float(close.iloc[-21])) / float(close.iloc[-21])
                if ret20 < 0.03:
                    continue

                pct_to_trigger = round(vr_now / threshold * 100, 1)

                warming.append({
                    "ticker": ticker,
                    "book": book_name,
                    "sector": sector,
                    "vol_ratio": round(vr_now, 2),
                    "threshold": threshold,
                    "pct_to_trigger": pct_to_trigger,
                    "prior_20d_return": round(ret20 * 100, 2),
                    "price": round(float(close.iloc[-1]), 2),
                    "date": today.isoformat(),
                })

    warming.sort(key=lambda x: x["pct_to_trigger"], reverse=True)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SIGNALS_WARMING_FILE, "w") as f:
        json.dump(warming, f, indent=2)

    return warming


def load_warming_up() -> list:
    if SIGNALS_WARMING_FILE.exists():
        with open(SIGNALS_WARMING_FILE) as f:
            return json.load(f)
    return []
