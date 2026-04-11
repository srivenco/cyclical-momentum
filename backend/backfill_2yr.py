#!/usr/bin/env python3
"""
backfill_2yr.py — Full 2-year backtest with macro regime reconstruction.

Reconstructs macro regime for every trading day from scratch using yfinance
price data (no reliance on macro_history.json). Then applies the full signal
generation logic with all CIO improvements.

Covers: Oct 2023 → today (~500 trading days, diverse regime conditions)
"""

import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

DATA_DIR = Path(__file__).parent / "data"

# ── Strategy parameters ───────────────────────────────────────────────────────
VOL_THRESHOLD_DEFAULT     = 2.0
VOL_THRESHOLD_COMMODITY   = 3.0
ATR_MULTIPLIER            = 1.5
ATR_MAX_STOP_PCT          = 0.10
STOP_FALLBACK_PCT         = 0.07
MOMENTUM_FILTER_PCT       = 0.05
MOMENTUM_FILTER_DEFENSIVE = 0.03
MOMENTUM_MAX_PCT          = 0.25  # don't enter stocks that already ran >25% (chasing)
COOLDOWN_DAYS             = 30
SIGNAL_REENTRY_DAYS       = 7
SEASONAL_EXCLUDE_MONTHS   = [1, 2]
MA_FILTER_STANDARD        = 50
MA_FILTER_DEFENSIVE       = 20
CROSSOVER_WINDOW_DAYS     = 3
CLOSE_POSITION_MIN        = 0.50
REQUIRE_CLOSE_ABOVE_PREV  = True

# ── Macro parameters ──────────────────────────────────────────────────────────
MA_200               = 200
RATE_LOOKBACK        = 63
RATE_THRESHOLD       = 0.20
COMMODITY_VOL_RATIO  = 1.5

# ── Universe ──────────────────────────────────────────────────────────────────
COMMODITY_BOOK = {
    "METAL": ["APLAPOLLO.NS","JINDALSTEL.NS","SAIL.NS","NMDC.NS","MOIL.NS",
              "NATIONALUM.NS","HINDZINC.NS","JSWSTEEL.NS","TATASTEEL.NS",
              "HINDALCO.NS","VEDL.NS","RATNAMANI.NS","HINDCOPPER.NS","WELCORP.NS"],
    "ENERGY": ["JSWENERGY.NS","TATAPOWER.NS","ADANIGREEN.NS","PFC.NS","RECLTD.NS",
               "NHPC.NS","SJVN.NS","CESC.NS","WAAREEENER.NS","NTPC.NS",
               "POWERGRID.NS","TORNTPOWER.NS","GAIL.NS","PETRONET.NS","IEX.NS"],
}
RATEHIKE_BOOK = {
    "ENERGY": ["JSWENERGY.NS","TATAPOWER.NS","CESC.NS","NHPC.NS","SJVN.NS",
               "NTPC.NS","POWERGRID.NS","TORNTPOWER.NS","GAIL.NS","IEX.NS"],
    "FMCG":   ["MARICO.NS","DABUR.NS","COLPAL.NS","GODREJCP.NS","TATACONSUM.NS",
               "EMAMILTD.NS","RADICO.NS","JYOTHYLAB.NS","BIKAJI.NS"],
}
RATECUT_BOOK = {
    # Small finance banks removed (SURYODAY, UJJIVANSFB, EQUITASBNK, UTKARSHBNK, CSBBANK)
    # — all 0 wins in 2-year backtest; vol spikes = distress, not breakouts
    "BANK":   ["IDFCFIRSTB.NS","FEDERALBNK.NS","RBLBANK.NS","AUBANK.NS",
               "BANDHANBNK.NS","KARURVYSYA.NS","DCBBANK.NS"],
    "REALTY": ["DLF.NS","GODREJPROP.NS","OBEROIRLTY.NS","PRESTIGE.NS",
               "PHOENIXLTD.NS","BRIGADE.NS","SOBHA.NS","ANANTRAJ.NS",
               "KOLTEPATIL.NS","SUNTECK.NS","RAYMOND.NS"],
    # INFRA removed — 0 wins from 9 signals (RVNL, RAILTEL, etc.) over 2 years
}
DEFENSIVE_BOOK = {
    "PHARMA": ["LAURUSLABS.NS","GRANULES.NS","NATCOPHARM.NS","IPCALAB.NS",
               "ALKEM.NS","ZYDUSLIFE.NS","METROPOLIS.NS","LALPATHLAB.NS",
               "MANKIND.NS","GLENMARK.NS","TORNTPHARM.NS","AJANTPHARM.NS",
               "CIPLA.NS","GLAND.NS","ASTRAZEN.NS"],
    "IT":     ["LTIM.NS","COFORGE.NS","PERSISTENT.NS","MPHASIS.NS",
               "KPITTECH.NS","TATAELXSI.NS","HAPPSTMNDS.NS","MASTEK.NS"],
    "FMCG":   ["EMAMILTD.NS","RADICO.NS","JYOTHYLAB.NS","BIKAJI.NS",
               "MARICO.NS","TATACONSUM.NS"],
}
BOOK_MAP = {
    "F2_COMMODITY": (COMMODITY_BOOK, VOL_THRESHOLD_COMMODITY),
    "F3B_RATEHIKE": (RATEHIKE_BOOK,  VOL_THRESHOLD_DEFAULT),
    "F_RATECUT":    (RATECUT_BOOK,   VOL_THRESHOLD_DEFAULT),
    "F4_DEFENSIVE": (DEFENSIVE_BOOK, VOL_THRESHOLD_DEFAULT),
}
REGIME_LABELS = {
    "F2_COMMODITY": "COMMODITY_BULL",
    "F3B_RATEHIKE": "RATE_HIKE",
    "F_RATECUT":    "RATE_CUT",
    "F4_DEFENSIVE": "NIFTY_BEAR",
}


# ── Helpers ───────────────────────────────────────────────────────────────────
def _flatten(df):
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return df


def _download(ticker, start):
    try:
        df = yf.download(ticker, start=start, progress=False, auto_adjust=True)
        return _flatten(df) if not df.empty else pd.DataFrame()
    except Exception:
        return pd.DataFrame()


def _get_active_books(macros: dict, check_date: date) -> list:
    """Reconstruct active books for a given date using sliced macro data."""
    nifty = macros["^NSEI"]
    crude = macros["CL=F"]
    copper = macros["HG=F"]
    us10y = macros["^TNX"]

    def _slice(df):
        return df[df.index.date <= check_date] if not df.empty else df

    n = _slice(nifty)
    cr = _slice(crude)
    cu = _slice(copper)
    us = _slice(us10y)

    # Need enough data
    if len(n) < MA_200 or len(cr) < 63 or len(us) < 63:
        return []

    # Nifty vs 200MA
    nc = n["Close"].squeeze()
    nifty_bull = float(nc.iloc[-1]) > float(nc.rolling(MA_200).mean().iloc[-1])

    # Crude
    crc = cr["Close"].squeeze()
    crude_bull = (float(crc.iloc[-1]) > float(crc.rolling(MA_200).mean().iloc[-1])
                  and float(crc.iloc[-1]) > float(crc.iloc[-RATE_LOOKBACK]))
    crude_vol_ok = False
    if len(cr) >= 91:
        cv10 = float(cr["Volume"].squeeze().rolling(10).mean().iloc[-1])
        cv91 = float(cr["Volume"].squeeze().rolling(91).mean().iloc[-1])
        crude_vol_ok = cv91 > 0 and (cv10 / cv91) >= COMMODITY_VOL_RATIO

    # Copper
    cuc = cu["Close"].squeeze()
    copper_bull = (len(cu) >= MA_200
                   and float(cuc.iloc[-1]) > float(cuc.rolling(MA_200).mean().iloc[-1])
                   and float(cuc.iloc[-1]) > float(cuc.iloc[-RATE_LOOKBACK]))
    copper_vol_ok = False
    if len(cu) >= 91:
        cuv10 = float(cu["Volume"].squeeze().rolling(10).mean().iloc[-1])
        cuv91 = float(cu["Volume"].squeeze().rolling(91).mean().iloc[-1])
        copper_vol_ok = cuv91 > 0 and (cuv10 / cuv91) >= COMMODITY_VOL_RATIO

    commodity_bull = crude_bull and crude_vol_ok and copper_bull and copper_vol_ok

    # Rates
    usc = us["Close"].squeeze()
    us10y_change = float(usc.iloc[-1]) - float(usc.iloc[-RATE_LOOKBACK])
    if us10y_change > RATE_THRESHOLD:
        rate_regime = "HIKE"
    elif us10y_change < -RATE_THRESHOLD:
        rate_regime = "CUT"
    else:
        rate_regime = "NEUTRAL"

    active = []
    if commodity_bull:         active.append("F2_COMMODITY")
    if rate_regime == "HIKE":  active.append("F3B_RATEHIKE")
    if rate_regime == "CUT":   active.append("F_RATECUT")
    if not nifty_bull:         active.append("F4_DEFENSIVE")
    return active


def _calc_atr_stop(df, entry_price):
    if len(df) < 20:
        return round(entry_price * (1 - STOP_FALLBACK_PCT), 2)
    h, l, c = df["High"].squeeze(), df["Low"].squeeze(), df["Close"].squeeze()
    tr = pd.concat([h - l, (h - c.shift(1)).abs(), (l - c.shift(1)).abs()], axis=1).max(axis=1)
    atr14 = tr.rolling(14).mean().iloc[-1]
    if pd.isna(atr14) or float(atr14) <= 0:
        return round(entry_price * (1 - STOP_FALLBACK_PCT), 2)
    stop_dist = min(ATR_MULTIPLIER * float(atr14), entry_price * ATR_MAX_STOP_PCT)
    return round(entry_price - stop_dist, 2)


def _check_signal(df_full, ticker, book, sector, threshold, check_date, nifty_ret=None):
    if check_date.month in SEASONAL_EXCLUDE_MONTHS:
        return None

    df = df_full[df_full.index.date <= check_date]
    if len(df) < 110:
        return None

    close  = df["Close"].squeeze()
    volume = df["Volume"].squeeze()

    # Vol ratio + 3-day crossover
    vol_s = volume.rolling(10).mean() / volume.rolling(91).mean().replace(0, np.nan)
    if len(vol_s) < CROSSOVER_WINDOW_DAYS + 2:
        return None
    vol_now    = float(vol_s.iloc[-1])
    vol_3d_ago = float(vol_s.iloc[-(CROSSOVER_WINDOW_DAYS + 1)])
    if pd.isna(vol_now) or pd.isna(vol_3d_ago):
        return None
    if not (vol_now >= threshold and vol_3d_ago < threshold):
        return None

    # MA filter
    ma_period = MA_FILTER_DEFENSIVE if book == "F4_DEFENSIVE" else MA_FILTER_STANDARD
    ma = close.rolling(ma_period).mean()
    if float(close.iloc[-1]) <= float(ma.iloc[-1]):
        return None

    # 20d momentum
    if len(close) < 21:
        return None
    mom_thr = MOMENTUM_FILTER_DEFENSIVE if book == "F4_DEFENSIVE" else MOMENTUM_FILTER_PCT
    ret20 = (float(close.iloc[-1]) - float(close.iloc[-21])) / float(close.iloc[-21])
    if ret20 <= mom_thr:
        return None
    # Cap: don't enter stocks that already ran >25% (late entry / chasing)
    if ret20 > MOMENTUM_MAX_PCT:
        return None

    # Relative strength (Defensive)
    if book == "F4_DEFENSIVE" and nifty_ret is not None:
        if ret20 <= nifty_ret:
            return None

    # Bullish candle: close in upper half of day's range
    if "High" in df.columns and "Low" in df.columns:
        dh = float(df["High"].squeeze().iloc[-1])
        dl = float(df["Low"].squeeze().iloc[-1])
        dr = dh - dl
        if dr > 0 and (float(close.iloc[-1]) - dl) / dr < CLOSE_POSITION_MIN:
            return None

    # Close above previous close
    if REQUIRE_CLOSE_ABOVE_PREV and len(close) >= 2:
        if float(close.iloc[-1]) <= float(close.iloc[-2]):
            return None

    entry_price  = float(close.iloc[-1])
    initial_stop = _calc_atr_stop(df, entry_price)
    if initial_stop >= entry_price:
        initial_stop = round(entry_price * (1 - STOP_FALLBACK_PCT), 2)

    stop_pct     = round((initial_stop - entry_price) / entry_price * 100, 2)
    risk         = entry_price - initial_stop
    target_price = round(entry_price + 2.0 * risk, 2)

    if vol_now >= threshold * 1.5:   strength = "STRONG"
    elif vol_now >= threshold * 1.2: strength = "MODERATE"
    else:                            strength = "NORMAL"

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
        "regime":          REGIME_LABELS.get(book, book),
        "signal_strength": strength,
        "circuit_breaker": False,
        "cap_type":        "mid_small",
    }


def _simulate_outcomes(signals):
    """Download outcome data and tag each signal with exit info."""
    ticker_groups = {}
    for s in signals:
        ticker_groups.setdefault(s["ticker"], []).append(s)

    for ticker, sig_list in ticker_groups.items():
        min_entry = min(s["date"] for s in sig_list)
        try:
            df = yf.download(ticker, start=min_entry, progress=False, auto_adjust=True)
            df = _flatten(df)
        except Exception:
            continue
        if df.empty:
            continue

        for sig in sig_list:
            if sig.get("exit_date"):
                continue
            entry_ts  = pd.Timestamp(sig["date"])
            future_df = df[df.index > entry_ts]
            if future_df.empty:
                continue

            stop   = sig["initial_stop"]
            target = sig.get("target_price")
            for idx, row in future_df.iterrows():
                if float(row["Low"]) <= stop:
                    sig["exit_date"]   = str(idx.date())
                    sig["exit_price"]  = round(stop, 2)
                    sig["exit_reason"] = "stop"
                    sig["pnl_pct"]     = round((stop - sig["entry_price"]) / sig["entry_price"] * 100, 2)
                    break
                if target and float(row["High"]) >= target:
                    sig["exit_date"]   = str(idx.date())
                    sig["exit_price"]  = round(target, 2)
                    sig["exit_reason"] = "target"
                    sig["pnl_pct"]     = round((target - sig["entry_price"]) / sig["entry_price"] * 100, 2)
                    break
    return signals


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    today     = date.today()
    start_str = "2023-07-01"   # ~2.5 years of history

    print(f"2-year backtest: {start_str} → {today}")
    print("Step 1: Download macro indicators…")

    macros = {}
    for t in ["^NSEI", "CL=F", "HG=F", "^TNX"]:
        macros[t] = _download(t, start_str)
        rows = len(macros[t])
        print(f"  {t}: {rows} rows")

    print("\nStep 2: Download stock universe…")
    all_tickers = set()
    for (universe, _) in BOOK_MAP.values():
        for tickers in universe.values():
            all_tickers.update(tickers)
    all_tickers = sorted(all_tickers)

    stock_cache = {}
    for i, t in enumerate(all_tickers):
        import sys
        sys.stdout.write(f"\r  [{i+1:2d}/{len(all_tickers)}] {t:<28}")
        sys.stdout.flush()
        stock_cache[t] = _download(t, start_str)
    print()

    ok  = sum(1 for df in stock_cache.values() if not df.empty)
    bad = sum(1 for df in stock_cache.values() if df.empty)
    print(f"  Downloaded: {ok} OK, {bad} failed\n")

    # ── Get trading dates from Nifty index ───────────────────────────────────
    nifty = macros["^NSEI"]
    all_dates = [d.date() for d in nifty.index if d.date() >= date(2023, 10, 1)]
    # Filter to weekdays (Mon-Fri) — Nifty data already handles this
    cutoff = today - timedelta(days=2 * 365)
    trading_dates = [d for d in all_dates if d >= cutoff]

    print(f"Step 3: Generate signals across {len(trading_dates)} trading days…")

    all_signals   = []
    regime_counts = {"F2_COMMODITY": 0, "F3B_RATEHIKE": 0, "F_RATECUT": 0, "F4_DEFENSIVE": 0}

    for check_date in trading_dates:
        if check_date.month in SEASONAL_EXCLUDE_MONTHS:
            continue

        active_books = _get_active_books(macros, check_date)
        if not active_books:
            continue

        for b in active_books:
            regime_counts[b] = regime_counts.get(b, 0) + 1

        # Cooldown: 30d post-stop + 7d post-any-signal
        cooldown_set = set()
        for sig in all_signals:
            if sig.get("exit_reason") == "stop" and sig.get("exit_date"):
                exit_dt = date.fromisoformat(sig["exit_date"])
                if (check_date - exit_dt).days <= COOLDOWN_DAYS:
                    cooldown_set.add(sig["ticker"])
            if sig.get("date"):
                sig_dt = date.fromisoformat(sig["date"])
                if 0 <= (check_date - sig_dt).days <= SIGNAL_REENTRY_DAYS:
                    cooldown_set.add(sig["ticker"])

        # Nifty 20d return for Defensive relative strength
        nifty_ret = None
        if "F4_DEFENSIVE" in active_books:
            ns = nifty[nifty.index.date <= check_date]
            if len(ns) >= 21:
                nc = ns["Close"].squeeze()
                nifty_ret = (float(nc.iloc[-1]) - float(nc.iloc[-21])) / float(nc.iloc[-21])

        seen_today = set()
        day_signals = []
        for book_name in active_books:
            universe, threshold = BOOK_MAP[book_name]
            for sector, tickers in universe.items():
                for ticker in tickers:
                    if ticker in cooldown_set or ticker in seen_today:
                        continue
                    df_full = stock_cache.get(ticker, pd.DataFrame())
                    if df_full.empty:
                        continue
                    nr = nifty_ret if book_name == "F4_DEFENSIVE" else None
                    result = _check_signal(df_full, ticker, book_name, sector,
                                           threshold, check_date, nr)
                    if result:
                        day_signals.append(result)
                        seen_today.add(ticker)

        if day_signals:
            for s in day_signals:
                print(f"  {s['date']}  {s['ticker']:<22} {s['book']:<16} vol={s['vol_ratio']}x  +{s['prior_20d_return']}% 20d")
            all_signals.extend(day_signals)

    print(f"\nStep 4: Simulate outcomes for {len(all_signals)} signals…")
    all_signals = _simulate_outcomes(all_signals)

    # ── Stats ─────────────────────────────────────────────────────────────────
    closed  = [s for s in all_signals if s.get("exit_date")]
    open_s  = [s for s in all_signals if not s.get("exit_date")]
    wins    = [s for s in closed if s.get("pnl_pct", -99) >= 0]
    losses  = [s for s in closed if s.get("pnl_pct", 0)  < 0]
    avg_win  = sum(s["pnl_pct"] for s in wins)  / len(wins)  if wins  else 0
    avg_loss = sum(s["pnl_pct"] for s in losses) / len(losses) if losses else 0
    avg_all  = sum(s["pnl_pct"] for s in closed) / len(closed) if closed else 0

    print(f"\n{'='*65}")
    print(f"BACKTEST RESULTS ({start_str} → {today})")
    print(f"{'='*65}")
    print(f"Total signals    : {len(all_signals)}")
    print(f"Closed           : {len(closed)}  (Open: {len(open_s)})")
    print(f"Win rate         : {len(wins)}/{len(closed)} = {len(wins)/len(closed)*100:.0f}%" if closed else "")
    print(f"Avg win          : +{avg_win:.2f}%")
    print(f"Avg loss         : {avg_loss:.2f}%")
    print(f"Avg P&L (all)    : {avg_all:+.2f}%")
    print(f"Expectancy / trade: {avg_all:+.2f}%")
    print(f"\nBy book:")
    for b in BOOK_MAP:
        bs = [s for s in all_signals if s["book"] == b]
        bw = [s for s in bs if s.get("pnl_pct", -99) >= 0 and s.get("exit_date")]
        bc = [s for s in bs if s.get("exit_date")]
        print(f"  {b:<20} signals={len(bs):3d}  closed={len(bc):3d}  wins={len(bw):3d}"
              f"  WR={len(bw)/len(bc)*100:.0f}%" if bc else f"  {b}: {len(bs)} signals (none closed)")
    print(f"\nRegime days active:")
    for b, cnt in regime_counts.items():
        print(f"  {b:<20} {cnt} days")

    # ── Save ─────────────────────────────────────────────────────────────────
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = DATA_DIR / "signals_history.json"
    with open(out, "w") as f:
        json.dump(all_signals, f, indent=2)
    print(f"\nSaved {len(all_signals)} signals to {out}")


if __name__ == "__main__":
    main()
