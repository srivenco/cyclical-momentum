#!/usr/bin/env python3
"""
backfill_v2.py — Regenerate signals_history.json using CIO-improved strategy parameters.

Key improvements vs original backfill:
  - ATR-based stops (1.5× ATR14, capped at 10%)
  - 3-day crossover window instead of strict 1-day
  - Relative strength filter for Defensive book (vs Nifty)
  - target_price field (entry + 2× risk = 2:1 R:R)
  - Expanded universe (118 stocks)
  - MA20 for Defensive; MA50 for all others

Reads macro_history.json to determine which books were active each day.
Downloads all tickers once, then slices per date to avoid look-ahead bias.
"""

import json
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

DATA_DIR = Path(__file__).parent / "data"

# ── Parameters ────────────────────────────────────────────────────────────────
VOL_THRESHOLD_DEFAULT     = 2.0
VOL_THRESHOLD_COMMODITY   = 3.0
ATR_MULTIPLIER            = 1.5
ATR_MAX_STOP_PCT          = 0.10
STOP_FALLBACK_PCT         = 0.07
MOMENTUM_FILTER_PCT       = 0.05
MOMENTUM_FILTER_DEFENSIVE = 0.03
COOLDOWN_DAYS             = 30
SIGNAL_REENTRY_DAYS       = 7    # don't re-enter same ticker within 7 days of any signal
SEASONAL_EXCLUDE_MONTHS   = [1, 2]
MA_FILTER_STANDARD        = 50
MA_FILTER_DEFENSIVE       = 20
CROSSOVER_WINDOW_DAYS     = 3
CLOSE_POSITION_MIN        = 0.50  # close must be in upper half of day's range
REQUIRE_CLOSE_ABOVE_PREV  = True  # close today > close yesterday

# ── Universe (identical to signals.py) ───────────────────────────────────────
COMMODITY_BOOK = {
    "METAL": [
        "APLAPOLLO.NS", "JINDALSTEL.NS", "SAIL.NS", "NMDC.NS", "MOIL.NS",
        "NATIONALUM.NS", "HINDZINC.NS",
        "JSWSTEEL.NS", "TATASTEEL.NS", "HINDALCO.NS", "VEDL.NS",
        "RATNAMANI.NS", "HINDCOPPER.NS", "WELCORP.NS",
    ],
    "ENERGY": [
        "JSWENERGY.NS", "TATAPOWER.NS", "ADANIGREEN.NS", "PFC.NS", "RECLTD.NS",
        "NHPC.NS", "SJVN.NS", "CESC.NS", "WAAREEENER.NS",
        "NTPC.NS", "POWERGRID.NS", "TORNTPOWER.NS", "GAIL.NS",
        "PETRONET.NS", "IEX.NS",
    ],
}

RATEHIKE_BOOK = {
    "ENERGY": [
        "JSWENERGY.NS", "TATAPOWER.NS", "CESC.NS", "NHPC.NS", "SJVN.NS",
        "NTPC.NS", "POWERGRID.NS", "TORNTPOWER.NS", "GAIL.NS", "IEX.NS",
    ],
    "FMCG": [
        "MARICO.NS", "DABUR.NS", "COLPAL.NS", "GODREJCP.NS", "TATACONSUM.NS",
        "EMAMILTD.NS", "VARUNBEV.NS", "RADICO.NS", "JYOTHYLAB.NS", "BIKAJI.NS",
    ],
}

RATECUT_BOOK = {
    "BANK": [
        "IDFCFIRSTB.NS", "FEDERALBNK.NS", "RBLBANK.NS", "AUBANK.NS",
        "BANDHANBNK.NS", "EQUITASBNK.NS",
        "KARURVYSYA.NS", "DCBBANK.NS", "SURYODAY.NS", "UJJIVANSFB.NS",
        "CSBBANK.NS", "UTKARSHBNK.NS",
    ],
    "REALTY": [
        "DLF.NS", "GODREJPROP.NS", "OBEROIRLTY.NS", "PRESTIGE.NS",
        "PHOENIXLTD.NS", "BRIGADE.NS",
        "SOBHA.NS", "ANANTRAJ.NS", "KOLTEPATIL.NS", "SUNTECK.NS", "RAYMOND.NS",
    ],
    "INFRA": [
        "KNRCON.NS", "NCC.NS", "PNCINFRA.NS", "IRB.NS", "RVNL.NS",
        "RAILTEL.NS", "HAL.NS", "BEL.NS",
        "AHLUCONT.NS", "PSPPROJECT.NS", "GRINFRA.NS", "DBL.NS",
        "JKCEMENT.NS", "RAMCOCEM.NS", "APOLLOPIPE.NS",
    ],
}

DEFENSIVE_BOOK = {
    "PHARMA": [
        "LAURUSLABS.NS", "GRANULES.NS", "NATCOPHARM.NS", "IPCALAB.NS",
        "ALKEM.NS", "ZYDUSLIFE.NS", "METROPOLIS.NS", "LALPATHLAB.NS", "MANKIND.NS",
        "GLENMARK.NS", "TORNTPHARM.NS", "AJANTPHARM.NS", "CIPLA.NS",
        "GLAND.NS", "ASTRAZEN.NS",
    ],
    "IT": [
        "LTIM.NS", "COFORGE.NS", "PERSISTENT.NS", "MPHASIS.NS",
        "KPITTECH.NS", "TATAELXSI.NS", "HAPPSTMNDS.NS", "MASTEK.NS",
    ],
    "FMCG": [
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
def _flatten(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return df


def _calc_atr_stop(df_slice: pd.DataFrame, entry_price: float) -> float:
    if len(df_slice) < 20:
        return round(entry_price * (1 - STOP_FALLBACK_PCT), 2)
    high  = df_slice["High"].squeeze()
    low   = df_slice["Low"].squeeze()
    close = df_slice["Close"].squeeze()
    prev_c = close.shift(1)
    tr = pd.concat([high - low, (high - prev_c).abs(), (low - prev_c).abs()], axis=1).max(axis=1)
    atr14 = tr.rolling(14).mean().iloc[-1]
    if pd.isna(atr14) or atr14 <= 0:
        return round(entry_price * (1 - STOP_FALLBACK_PCT), 2)
    stop_dist = min(ATR_MULTIPLIER * float(atr14), entry_price * ATR_MAX_STOP_PCT)
    return round(entry_price - stop_dist, 2)


def _check_signal(df_full, ticker, book, sector, threshold, check_date, nifty_20d_return=None):
    if check_date.month in SEASONAL_EXCLUDE_MONTHS:
        return None

    # Slice to data available as of check_date (no lookahead)
    df = df_full[df_full.index.date <= check_date]
    if len(df) < 100:
        return None

    close  = df["Close"].squeeze()
    volume = df["Volume"].squeeze()

    vol_10 = volume.rolling(10).mean()
    vol_91 = volume.rolling(91).mean().replace(0, np.nan)
    vol_s  = vol_10 / vol_91

    if len(vol_s) < CROSSOVER_WINDOW_DAYS + 2:
        return None

    vol_now    = float(vol_s.iloc[-1])
    vol_3d_ago = float(vol_s.iloc[-(CROSSOVER_WINDOW_DAYS + 1)])

    if pd.isna(vol_now) or pd.isna(vol_3d_ago):
        return None
    if not (vol_now >= threshold and vol_3d_ago < threshold):
        return None

    ma_period = MA_FILTER_DEFENSIVE if book == "F4_DEFENSIVE" else MA_FILTER_STANDARD
    ma = close.rolling(ma_period).mean()
    if len(ma) < ma_period or float(close.iloc[-1]) <= float(ma.iloc[-1]):
        return None

    if len(close) < 21:
        return None
    mom_thr = MOMENTUM_FILTER_DEFENSIVE if book == "F4_DEFENSIVE" else MOMENTUM_FILTER_PCT
    ret20   = (float(close.iloc[-1]) - float(close.iloc[-21])) / float(close.iloc[-21])
    if ret20 <= mom_thr:
        return None

    if book == "F4_DEFENSIVE" and nifty_20d_return is not None:
        if ret20 <= nifty_20d_return:
            return None

    # ── Bullish candle: close in upper half of day's range ────────────────────
    if "High" in df.columns and "Low" in df.columns:
        day_high  = float(df["High"].squeeze().iloc[-1])
        day_low_v = float(df["Low"].squeeze().iloc[-1])
        day_range = day_high - day_low_v
        if day_range > 0:
            close_pos = (float(close.iloc[-1]) - day_low_v) / day_range
            if close_pos < CLOSE_POSITION_MIN:
                return None

    # ── Close above previous close (no down-day entries) ─────────────────────
    if REQUIRE_CLOSE_ABOVE_PREV and len(df) >= 2:
        if float(close.iloc[-1]) <= float(close.iloc[-2]):
            return None

    entry_price  = float(close.iloc[-1])
    initial_stop = _calc_atr_stop(df, entry_price)
    if initial_stop >= entry_price:
        initial_stop = round(entry_price * (1 - STOP_FALLBACK_PCT), 2)

    stop_pct     = round((initial_stop - entry_price) / entry_price * 100, 2)
    risk         = entry_price - initial_stop
    target_price = round(entry_price + 2.0 * risk, 2)

    if vol_now >= threshold * 1.5:
        strength = "STRONG"
    elif vol_now >= threshold * 1.2:
        strength = "MODERATE"
    else:
        strength = "NORMAL"

    regime_map = {
        "F2_COMMODITY": "COMMODITY_BULL",
        "F3B_RATEHIKE": "RATE_HIKE",
        "F_RATECUT":    "RATE_CUT",
        "F4_DEFENSIVE": "NIFTY_BEAR",
    }

    return {
        "ticker":          ticker,
        "date":            check_date.isoformat(),
        "book":            book,
        "sector":          sector,
        "entry_price":     round(entry_price, 2),
        "initial_stop":    initial_stop,
        "target_price":    target_price,
        "stop_pct":        stop_pct,
        "vol_ratio":       round(vol_now, 2),
        "prior_20d_return": round(ret20 * 100, 2),
        "regime":          regime_map.get(book, book),
        "signal_strength": strength,
        "circuit_breaker": False,
        "cap_type":        "mid_small",
    }


def _download_all(start_str: str) -> dict:
    all_tickers = {"^NSEI"}
    for universe, _ in BOOK_MAP.values():
        for tickers in universe.values():
            all_tickers.update(tickers)

    print(f"Downloading {len(all_tickers)} tickers since {start_str}…")
    cache = {}
    sorted_tickers = sorted(all_tickers)
    for i, ticker in enumerate(sorted_tickers):
        sys.stdout.write(f"\r  [{i+1:3d}/{len(sorted_tickers)}] {ticker:<30}")
        sys.stdout.flush()
        try:
            df = yf.download(ticker, start=start_str, progress=False, auto_adjust=True)
            df = _flatten(df)
            cache[ticker] = df if not df.empty else pd.DataFrame()
        except Exception as exc:
            cache[ticker] = pd.DataFrame()
    print()
    return cache


def main():
    # ── Load macro history ────────────────────────────────────────────────────
    macro_file = DATA_DIR / "macro_history.json"
    if not macro_file.exists():
        print("ERROR: macro_history.json not found")
        return

    with open(macro_file) as f:
        macro_history = json.load(f)

    today    = date.today()
    cutoff   = (today - timedelta(days=365)).isoformat()

    # Build date → active_books map (only dates with at least one active book)
    date_to_books = {
        e["date"]: e["active_books"]
        for e in macro_history
        if e.get("date", "") >= cutoff and e.get("active_books")
    }

    trading_dates = sorted(date_to_books.keys())
    print(f"Found {len(trading_dates)} active-book dates in the last 365 days")
    print(f"Date range: {trading_dates[0] if trading_dates else '—'} → {trading_dates[-1] if trading_dates else '—'}")

    if not trading_dates:
        print("Nothing to backfill.")
        return

    # ── Download all price data ───────────────────────────────────────────────
    # Start 3 months before our earliest date to have enough history for vol ratios
    earliest = (date.fromisoformat(trading_dates[0]) - timedelta(days=120)).isoformat()
    cache = _download_all(earliest)

    ok  = sum(1 for df in cache.values() if not df.empty)
    bad = sum(1 for df in cache.values() if df.empty)
    print(f"  Downloaded: {ok} OK, {bad} failed/empty")

    # ── Run signal generation per date ───────────────────────────────────────
    all_signals   = []
    seen_keys     = set()  # (ticker, date) dedup
    total_checked = 0

    for date_str in trading_dates:
        check_date   = date.fromisoformat(date_str)
        active_books = date_to_books[date_str]

        # Cooldown set from signals generated so far
        cooldown_set = set()
        for sig in all_signals:
            # 30-day cooldown after stop exit
            if sig.get("exit_reason") == "stop" and sig.get("exit_date"):
                exit_dt = date.fromisoformat(sig["exit_date"])
                if (check_date - exit_dt).days <= COOLDOWN_DAYS:
                    cooldown_set.add(sig["ticker"])
            # 7-day re-entry cooldown after ANY signal
            if sig.get("date"):
                sig_dt = date.fromisoformat(sig["date"])
                if 0 <= (check_date - sig_dt).days <= SIGNAL_REENTRY_DAYS:
                    cooldown_set.add(sig["ticker"])

        # Nifty 20d return for Defensive relative-strength filter
        nifty_20d_return = None
        if "F4_DEFENSIVE" in active_books:
            nifty_df = cache.get("^NSEI", pd.DataFrame())
            if not nifty_df.empty:
                ns = nifty_df[nifty_df.index.date <= check_date]
                if len(ns) >= 21:
                    nc = ns["Close"].squeeze()
                    nifty_20d_return = (float(nc.iloc[-1]) - float(nc.iloc[-21])) / float(nc.iloc[-21])

        day_signals = []
        for book_name in active_books:
            if book_name not in BOOK_MAP:
                continue
            universe, threshold = BOOK_MAP[book_name]
            for sector, tickers in universe.items():
                for ticker in tickers:
                    if ticker in cooldown_set:
                        continue
                    total_checked += 1
                    key = (ticker, date_str)
                    if key in seen_keys:
                        continue
                    df_full = cache.get(ticker, pd.DataFrame())
                    if df_full.empty:
                        continue
                    nifty_ret = nifty_20d_return if book_name == "F4_DEFENSIVE" else None
                    result = _check_signal(df_full, ticker, book_name, sector, threshold,
                                           check_date, nifty_ret)
                    if result:
                        day_signals.append(result)
                        seen_keys.add(key)

        if day_signals:
            print(f"  {date_str}  {len(day_signals):2d} signals  books={active_books}")
            all_signals.extend(day_signals)

    # ── Save ──────────────────────────────────────────────────────────────────
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out_file = DATA_DIR / "signals_history.json"
    with open(out_file, "w") as f:
        json.dump(all_signals, f, indent=2)

    print(f"\n{'='*60}")
    print(f"Backfill complete — {len(all_signals)} signals across {len(trading_dates)} dates")
    print(f"Stocks checked (total): {total_checked}")
    print(f"Saved to {out_file}")

    # Summary by book
    book_counts = {}
    for s in all_signals:
        b = s["book"]
        book_counts[b] = book_counts.get(b, 0) + 1
    for b, c in sorted(book_counts.items()):
        print(f"  {b}: {c} signals")


if __name__ == "__main__":
    main()
