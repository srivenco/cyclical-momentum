#!/usr/bin/env python3
"""
simulate_outcomes.py — Simulate exit outcomes for all open signals in history.

For each signal without an exit_date:
  - Downloads OHLCV from entry_date to today
  - Walks day by day using actual High/Low data (not just close prices)
  - If day_low <= initial_stop → stopped out at stop price
  - If day_high >= target_price → target hit at target price
  - Stop takes priority on same day (conservative)
  - Remaining signals stay "open" if neither level was breached

Updates signals_history.json in place.
"""

import json
from datetime import date
from pathlib import Path

import pandas as pd
import yfinance as yf

DATA_DIR = Path(__file__).parent / "data"


def simulate_outcomes():
    history_file = DATA_DIR / "signals_history.json"
    if not history_file.exists():
        print("ERROR: signals_history.json not found")
        return

    with open(history_file) as f:
        signals = json.load(f)

    open_signals = [s for s in signals if not s.get("exit_date")]
    already_closed = len(signals) - len(open_signals)
    print(f"Total signals: {len(signals)}  |  Already have exit: {already_closed}  |  Need simulation: {len(open_signals)}")

    if not open_signals:
        print("Nothing to do.")
        return

    # ── Group by ticker to minimise downloads ────────────────────────────────
    ticker_groups = {}
    for s in open_signals:
        t = s["ticker"]
        if t not in ticker_groups:
            ticker_groups[t] = []
        ticker_groups[t].append(s)

    updated = 0
    stop_count = 0
    target_count = 0

    for ticker, sig_list in ticker_groups.items():
        min_entry = min(s["date"] for s in sig_list)
        try:
            df = yf.download(ticker, start=min_entry, progress=False, auto_adjust=True)
        except Exception as exc:
            print(f"  DOWNLOAD ERROR {ticker}: {exc}")
            continue

        if df.empty:
            continue

        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)

        for sig in sig_list:
            entry_date   = sig["date"]
            entry_price  = sig["entry_price"]
            initial_stop = sig["initial_stop"]
            target_price = sig.get("target_price")

            # Slice: only bars AFTER the entry date
            entry_ts  = pd.Timestamp(entry_date)
            future_df = df[df.index > entry_ts]

            if future_df.empty:
                continue  # entered today or no data yet

            exit_date   = None
            exit_price  = None
            exit_reason = None

            for idx, row in future_df.iterrows():
                day_low  = float(row["Low"])
                day_high = float(row["High"])

                # Stop takes priority on same day
                if day_low <= initial_stop:
                    exit_date   = str(idx.date())
                    exit_price  = round(initial_stop, 2)
                    exit_reason = "stop"
                    break

                if target_price and day_high >= target_price:
                    exit_date   = str(idx.date())
                    exit_price  = round(target_price, 2)
                    exit_reason = "target"
                    break

            if exit_date:
                pnl_pct = round((exit_price - entry_price) / entry_price * 100, 2)
                sig["exit_date"]   = exit_date
                sig["exit_price"]  = exit_price
                sig["exit_reason"] = exit_reason
                sig["pnl_pct"]     = pnl_pct
                updated += 1
                if exit_reason == "stop":
                    stop_count += 1
                else:
                    target_count += 1
                tag = "🔴 STOP  " if exit_reason == "stop" else "🟢 TARGET"
                print(f"  {tag}  {ticker:<22} entry {entry_date} → exit {exit_date}  "
                      f"{'%+.2f' % pnl_pct}%  (stop ₹{initial_stop}"
                      f"{f'  target ₹{target_price}' if target_price else ''})")

    still_open = len(open_signals) - updated
    print(f"\n{'='*65}")
    print(f"Outcomes simulated: {updated}  |  Stop hits: {stop_count}  |  Target hits: {target_count}")
    print(f"Still open (neither level breached yet): {still_open}")

    # Win rate
    with_pnl = [s for s in signals if s.get("pnl_pct") is not None]
    if with_pnl:
        wins  = [s for s in with_pnl if s["pnl_pct"] >= 0]
        avg   = sum(s["pnl_pct"] for s in with_pnl) / len(with_pnl)
        print(f"Win rate: {len(wins)}/{len(with_pnl)} = {len(wins)/len(with_pnl)*100:.0f}%  |  Avg P&L: {avg:+.2f}%")

    # Save
    with open(history_file, "w") as f:
        json.dump(signals, f, indent=2)
    print(f"Saved to {history_file}")


if __name__ == "__main__":
    simulate_outcomes()
