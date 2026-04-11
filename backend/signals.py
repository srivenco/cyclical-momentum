"""
signals.py — Signal generation for Cyclical Momentum Strategy.
Implements exact parameters from BUILD_INSTRUCTIONS — do not change.
"""

import json
import logging
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
SIGNALS_LATEST_FILE = DATA_DIR / "signals_latest.json"
SIGNALS_HISTORY_FILE = DATA_DIR / "signals_history.json"

# ── Strategy Parameters (HARDCODED — do not change) ──────────────────────────
VOL_THRESHOLD_DEFAULT = 2.0
VOL_THRESHOLD_COMMODITY = 3.0
SWING_LOW_N = 8
STOP_FALLBACK_PCT = 0.07
MOMENTUM_FILTER_PCT = 0.05
COOLDOWN_DAYS = 30
SEASONAL_EXCLUDE_MONTHS = [1, 2]
MA_FILTER = 50
CIRCUIT_BREAKER_LOSSES = 3

# ── Universe ─────────────────────────────────────────────────────────────────
COMMODITY_BOOK = {
    "METAL": ["APLAPOLLO.NS", "JINDALSTEL.NS", "SAIL.NS", "NMDC.NS", "MOIL.NS",
              "NATIONALUM.NS", "HINDZINC.NS"],
    "ENERGY": ["JSWENERGY.NS", "TATAPOWER.NS", "ADANIGREEN.NS", "PFC.NS", "RECLTD.NS",
               "NHPC.NS", "SJVN.NS", "CESC.NS", "WAAREEENER.NS"],
}
RATEHIKE_BOOK = {
    "ENERGY": ["JSWENERGY.NS", "TATAPOWER.NS", "CESC.NS", "NHPC.NS", "SJVN.NS"],
    "FMCG": ["MARICO.NS", "DABUR.NS", "COLPAL.NS", "GODREJCP.NS", "TATACONSUM.NS"],
}
RATECUT_BOOK = {
    "BANK": ["IDFCFIRSTB.NS", "FEDERALBNK.NS", "RBLBANK.NS", "AUBANK.NS",
             "BANDHANBNK.NS", "EQUITASBNK.NS"],
    "REALTY": ["DLF.NS", "GODREJPROP.NS", "OBEROIRLTY.NS", "PRESTIGE.NS",
               "PHOENIXLTD.NS", "BRIGADE.NS"],
    "INFRA": ["KNRCON.NS", "NCC.NS", "PNCINFRA.NS", "IRB.NS", "RVNL.NS",
              "RAILTEL.NS", "HAL.NS", "BEL.NS"],
}
DEFENSIVE_BOOK = {
    "PHARMA": ["LAURUSLABS.NS", "GRANULES.NS", "NATCOPHARM.NS", "IPCALAB.NS",
               "ALKEM.NS", "ZYDUSLIFE.NS", "SOLARA.NS", "METROPOLIS.NS",
               "LALPATHLAB.NS", "MANKIND.NS"],
}

BOOK_MAP = {
    "F2_COMMODITY": (COMMODITY_BOOK, VOL_THRESHOLD_COMMODITY),
    "F3B_RATEHIKE": (RATEHIKE_BOOK, VOL_THRESHOLD_DEFAULT),
    "F_RATECUT": (RATECUT_BOOK, VOL_THRESHOLD_DEFAULT),
    "F4_DEFENSIVE": (DEFENSIVE_BOOK, VOL_THRESHOLD_DEFAULT),
}


# ── Helpers ───────────────────────────────────────────────────────────────────
def _load_history() -> list:
    if SIGNALS_HISTORY_FILE.exists():
        with open(SIGNALS_HISTORY_FILE) as f:
            return json.load(f)
    return []


def _tickers_in_cooldown(history: list) -> set:
    """Return set of tickers that had a stop exit in the last COOLDOWN_DAYS days."""
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


def _swing_low(close: pd.Series, n: int = SWING_LOW_N) -> Optional[float]:
    """Find most recent swing low below last close using n candles each side."""
    prices = close.values
    last_price = prices[-1]
    # Walk backwards from second-to-last bar to find a valid swing low
    for i in range(len(prices) - n - 1, n, -1):
        candidate = prices[i]
        if candidate >= last_price:
            continue
        left = prices[i - n: i]
        right = prices[i + 1: i + n + 1]
        if len(left) < n or len(right) < n:
            continue
        if all(candidate <= p for p in left) and all(candidate <= p for p in right):
            return float(candidate)
    return None


def _analyse_ticker(ticker: str, book: str, sector: str, threshold: float,
                    cooldown_set: set, history: list) -> Optional[dict]:
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

    close = df["Close"].squeeze()
    volume = df["Volume"].squeeze()

    # Vol ratio
    vol_10 = volume.rolling(10).mean()
    vol_91 = volume.rolling(91).mean()
    vol_ratio_series = vol_10 / vol_91.replace(0, np.nan)

    if len(vol_ratio_series) < 2:
        return None

    vol_today = float(vol_ratio_series.iloc[-1])
    vol_yesterday = float(vol_ratio_series.iloc[-2])

    # Crossover: today >= threshold, yesterday < threshold
    if not (vol_today >= threshold and vol_yesterday < threshold):
        return None

    # MA50 filter
    ma50 = close.rolling(MA_FILTER).mean()
    if float(close.iloc[-1]) <= float(ma50.iloc[-1]):
        return None

    # Momentum pre-filter: 20-day return > 5%
    if len(close) < 21:
        return None
    prior_20d_return = (float(close.iloc[-1]) - float(close.iloc[-21])) / float(close.iloc[-21])
    if prior_20d_return <= MOMENTUM_FILTER_PCT:
        return None

    # Stop calculation
    entry_price = float(close.iloc[-1])
    swing = _swing_low(close)
    if swing is not None and swing < entry_price:
        initial_stop = round(swing, 2)
    else:
        initial_stop = round(entry_price * (1 - STOP_FALLBACK_PCT), 2)

    stop_pct = round((initial_stop - entry_price) / entry_price * 100, 2)

    # Signal strength
    if vol_today >= threshold * 1.5:
        strength = "STRONG"
    elif vol_today >= threshold * 1.2:
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
        "stop_pct": stop_pct,
        "vol_ratio": round(vol_today, 2),
        "prior_20d_return": round(prior_20d_return * 100, 2),
        "regime": book,   # overridden by caller
        "signal_strength": strength,
        "circuit_breaker": circuit,
        "cap_type": "mid_small",
    }


def generate_signals(active_books: list) -> dict:
    """
    Generate signals for all active books.
    Returns dict with signals list and scan metadata.
    """
    today = date.today()
    logger.info(f"Generating signals for books: {active_books}")

    history = _load_history()
    cooldown_set = _tickers_in_cooldown(history)

    signals = []
    total_checked = 0

    for book_name in active_books:
        if book_name not in BOOK_MAP:
            continue
        universe, threshold = BOOK_MAP[book_name]
        for sector, tickers in universe.items():
            for ticker in tickers:
                total_checked += 1
                result = _analyse_ticker(ticker, book_name, sector, threshold,
                                         cooldown_set, history)
                if result is not None:
                    # Tag the actual regime label
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

    # Persist
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SIGNALS_LATEST_FILE, "w") as f:
        json.dump(payload, f, indent=2)

    # Append to history
    _append_to_history(signals)

    logger.info(f"Signals generated: {len(signals)} from {total_checked} stocks checked")
    return payload


def _regime_label(book: str) -> str:
    mapping = {
        "F2_COMMODITY": "COMMODITY_BULL",
        "F3B_RATEHIKE": "RATE_HIKE",
        "F_RATECUT": "RATE_CUT",
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


SIGNALS_WARMING_FILE = DATA_DIR / "signals_warming.json"


def generate_warming_up(active_books: list) -> list:
    """
    Return stocks approaching a vol-ratio crossover (60–95% of threshold).
    Also checks price > MA50 and 20d momentum > 3%.
    Results saved to signals_warming.json for API consumption.
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
        high_band = threshold * 1.00   # below this = not yet triggered

        for sector, tickers in universe.items():
            for ticker in tickers:
                try:
                    df = yf.download(ticker, period="200d", progress=False, auto_adjust=True)
                except Exception:
                    continue
                if df.empty or len(df) < 100:
                    continue

                close  = df["Close"].squeeze()
                volume = df["Volume"].squeeze()

                vol_10 = volume.rolling(10).mean()
                vol_91 = volume.rolling(91).mean().replace(0, np.nan)
                vr = (vol_10 / vol_91)
                if len(vr) < 1 or pd.isna(vr.iloc[-1]):
                    continue

                vr_now = float(vr.iloc[-1])
                # Already triggered or too far away
                if vr_now >= high_band or vr_now < low_band:
                    continue

                # MA50 filter — price must be above (trend healthy)
                ma50 = close.rolling(MA_FILTER).mean()
                if len(ma50) < MA_FILTER or float(close.iloc[-1]) <= float(ma50.iloc[-1]):
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

    # Sort by proximity to trigger
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


def load_signals_history(days: int = 90) -> list:
    history = _load_history()
    cutoff = date.today().isoformat()
    # Return last `days` calendar days
    from datetime import timedelta
    cutoff_date = (date.today() - timedelta(days=days)).isoformat()
    return [s for s in history if s.get("date", "") >= cutoff_date]
