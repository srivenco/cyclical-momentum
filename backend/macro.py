"""
macro.py — Macro regime detection for Cyclical Momentum Strategy.
Downloads daily data via yfinance and classifies current environment.
"""

import json
import logging
from datetime import date, datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
MACRO_FILE = DATA_DIR / "macro_state.json"
MACRO_HISTORY_FILE = DATA_DIR / "macro_history.json"

# ── Tickers ──────────────────────────────────────────────────────────────────
NIFTY_TICKER = "^NSEI"
CRUDE_TICKER = "CL=F"
COPPER_TICKER = "HG=F"
US10Y_TICKER = "^TNX"

# ── Thresholds ────────────────────────────────────────────────────────────────
MA_PERIOD = 200
LOOKBACK_DAYS = 63      # ~3 months for rate change
RATE_CHANGE_THRESHOLD = 0.20   # 20 bps
COMMODITY_VOL_RATIO = 1.5      # 10d/91d volume ratio for extra confirmation


def _download(ticker: str, period: str = "300d") -> pd.DataFrame:
    """Download OHLCV for a single ticker, return empty DataFrame on failure."""
    try:
        df = yf.download(ticker, period=period, progress=False, auto_adjust=True)
        if df.empty:
            logger.warning(f"No data returned for {ticker}")
        return df
    except Exception as exc:
        logger.error(f"Failed to download {ticker}: {exc}")
        return pd.DataFrame()


def _price_above_ma(df: pd.DataFrame, ma: int = 200) -> bool:
    if df.empty or len(df) < ma:
        return False
    close = df["Close"].squeeze()
    return float(close.iloc[-1]) > float(close.rolling(ma).mean().iloc[-1])


def _trend_positive_63d(df: pd.DataFrame) -> bool:
    if df.empty or len(df) < LOOKBACK_DAYS + 1:
        return False
    close = df["Close"].squeeze()
    return float(close.iloc[-1]) > float(close.iloc[-LOOKBACK_DAYS])


def _vol_ratio(df: pd.DataFrame) -> float:
    """10-day avg volume / 91-day avg volume."""
    if df.empty or len(df) < 91:
        return 0.0
    vol = df["Volume"].squeeze()
    r10 = float(vol.rolling(10).mean().iloc[-1])
    r91 = float(vol.rolling(91).mean().iloc[-1])
    if r91 == 0:
        return 0.0
    return r10 / r91


def _pct_vs_ma(df: pd.DataFrame, ma: int = 200) -> float:
    if df.empty or len(df) < ma:
        return 0.0
    close = df["Close"].squeeze()
    price = float(close.iloc[-1])
    avg = float(close.rolling(ma).mean().iloc[-1])
    if avg == 0:
        return 0.0
    return round((price - avg) / avg * 100, 2)


def _latest_price(df: pd.DataFrame) -> float:
    if df.empty:
        return 0.0
    return round(float(df["Close"].squeeze().iloc[-1]), 2)


def detect_regime() -> dict:
    """Run full macro regime detection and return state dict."""
    logger.info("Running macro regime detection…")

    nifty_df = _download(NIFTY_TICKER)
    crude_df = _download(CRUDE_TICKER)
    copper_df = _download(COPPER_TICKER)
    us10y_df = _download(US10Y_TICKER)

    # ── Nifty ────────────────────────────────────────────────────────────────
    nifty_bull = _price_above_ma(nifty_df, MA_PERIOD)
    nifty_pct = _pct_vs_ma(nifty_df, MA_PERIOD)
    nifty_regime = "BULL" if nifty_bull else "BEAR"

    # ── Commodity ────────────────────────────────────────────────────────────
    crude_above_ma = _price_above_ma(crude_df, MA_PERIOD)
    crude_trend_pos = _trend_positive_63d(crude_df)
    crude_vol = _vol_ratio(crude_df)

    copper_above_ma = _price_above_ma(copper_df, MA_PERIOD)
    copper_trend_pos = _trend_positive_63d(copper_df)
    copper_vol = _vol_ratio(copper_df)

    commodity_bull = (
        crude_above_ma and crude_trend_pos and crude_vol >= COMMODITY_VOL_RATIO
        and copper_above_ma and copper_trend_pos and copper_vol >= COMMODITY_VOL_RATIO
    )

    crude_trend_str = "UP" if (crude_above_ma and crude_trend_pos) else "DOWN"
    copper_trend_str = "UP" if (copper_above_ma and copper_trend_pos) else "DOWN"

    # ── Rates ────────────────────────────────────────────────────────────────
    us10y_change = 0.0
    if not us10y_df.empty and len(us10y_df) >= LOOKBACK_DAYS + 1:
        us10y_close = us10y_df["Close"].squeeze()
        us10y_change = round(
            float(us10y_close.iloc[-1]) - float(us10y_close.iloc[-LOOKBACK_DAYS]), 3
        )

    rate_regime = "NEUTRAL"
    if us10y_change > RATE_CHANGE_THRESHOLD:
        rate_regime = "HIKE"
    elif us10y_change < -RATE_CHANGE_THRESHOLD:
        rate_regime = "CUT"

    # ── Active books ─────────────────────────────────────────────────────────
    active_books = []
    inactive_books = []

    if commodity_bull:
        active_books.append("F2_COMMODITY")
    else:
        inactive_books.append("F2_COMMODITY")

    if rate_regime == "HIKE":
        active_books.append("F3B_RATEHIKE")
    else:
        inactive_books.append("F3B_RATEHIKE")

    if rate_regime == "CUT":
        active_books.append("F_RATECUT")
    else:
        inactive_books.append("F_RATECUT")

    if not nifty_bull:
        active_books.append("F4_DEFENSIVE")
    else:
        inactive_books.append("F4_DEFENSIVE")

    state = {
        "date": date.today().isoformat(),
        "nifty_vs_200ma": nifty_pct,
        "nifty_regime": nifty_regime,
        "crude_trend": crude_trend_str,
        "copper_trend": copper_trend_str,
        "us10y_63d_change": us10y_change,
        "rate_regime": rate_regime,
        "commodity_bull": commodity_bull,
        "active_books": active_books,
        "inactive_books": inactive_books,
        "nifty_price": _latest_price(nifty_df),
        "nifty_ma200": round(
            float(nifty_df["Close"].squeeze().rolling(MA_PERIOD).mean().iloc[-1])
            if not nifty_df.empty and len(nifty_df) >= MA_PERIOD else 0.0, 2
        ),
        "crude_price": _latest_price(crude_df),
        "copper_price": _latest_price(copper_df),
        "us10y": round(float(us10y_df["Close"].squeeze().iloc[-1]) if not us10y_df.empty else 0.0, 3),
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }

    # Persist to disk
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(MACRO_FILE, "w") as f:
        json.dump(state, f, indent=2)

    # Append to history (one entry per date)
    _append_macro_history(state)

    logger.info(f"Macro state saved: {state['active_books']}")
    return state


def _append_macro_history(state: dict):
    """Append today's regime snapshot to macro_history.json (one record per date)."""
    history = []
    if MACRO_HISTORY_FILE.exists():
        try:
            with open(MACRO_HISTORY_FILE) as f:
                history = json.load(f)
        except Exception:
            history = []

    # Update or insert today's record
    today = state.get("date", date.today().isoformat())
    existing = next((i for i, h in enumerate(history) if h.get("date") == today), None)
    record = {
        "date": today,
        "active_books": state.get("active_books", []),
        "nifty_regime": state.get("nifty_regime"),
        "rate_regime": state.get("rate_regime"),
        "commodity_bull": state.get("commodity_bull", False),
        "nifty_vs_200ma": state.get("nifty_vs_200ma"),
        "nifty_price": state.get("nifty_price"),
        "us10y": state.get("us10y"),
        "us10y_63d_change": state.get("us10y_63d_change"),
        "crude_price": state.get("crude_price"),
        "copper_price": state.get("copper_price"),
    }
    if existing is not None:
        history[existing] = record
    else:
        history.append(record)

    history.sort(key=lambda x: x.get("date", ""))
    with open(MACRO_HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)


def load_macro_history(days: int = 180) -> list:
    if not MACRO_HISTORY_FILE.exists():
        return []
    with open(MACRO_HISTORY_FILE) as f:
        history = json.load(f)
    from datetime import timedelta
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    return [h for h in history if h.get("date", "") >= cutoff]


def load_macro_state() -> dict:
    """Load cached macro state from disk (used by API routes)."""
    if MACRO_FILE.exists():
        with open(MACRO_FILE) as f:
            return json.load(f)
    # No cached state yet — run detection on the fly
    return detect_regime()
