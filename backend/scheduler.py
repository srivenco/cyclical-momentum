"""
scheduler.py — Daily signal generation job for Cyclical Momentum Strategy.
Run via Railway cron: 30 1 * * 1-5  (6:30am IST = 1:30am UTC, Mon-Fri)
Can also be run manually: python scheduler.py
"""

import logging
import sys
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("scheduler")


def run_daily_job():
    logger.info("=" * 60)
    logger.info(f"Daily job starting at {datetime.utcnow().isoformat()}Z")
    logger.info("=" * 60)

    # Step 1: Macro regime detection
    logger.info("Step 1/3 — Macro regime detection")
    from macro import detect_regime
    macro_state = detect_regime()
    logger.info(f"  Active books: {macro_state['active_books']}")
    logger.info(f"  Nifty regime: {macro_state['nifty_regime']}")
    logger.info(f"  Rate regime:  {macro_state['rate_regime']}")

    # Step 2: Signal generation for active books
    logger.info("Step 2/3 — Signal generation")
    from signals import generate_signals
    active_books = macro_state.get("active_books", [])
    if not active_books:
        logger.info("  No active books — skipping signal scan")
        result = {"signal_count": 0, "total_checked": 0, "signals": []}
    else:
        result = generate_signals(active_books)
    logger.info(f"  Checked {result['total_checked']} stocks, found {result['signal_count']} signals")

    if result["signals"]:
        for sig in result["signals"]:
            logger.info(
                f"  SIGNAL: {sig['ticker']} | {sig['book']} | "
                f"entry={sig['entry_price']} stop={sig['initial_stop']} "
                f"vol_ratio={sig['vol_ratio']}"
            )

    # Step 3: Done
    logger.info("Step 3/3 — Job complete")
    logger.info(f"Finished at {datetime.utcnow().isoformat()}Z")
    logger.info("=" * 60)


if __name__ == "__main__":
    run_daily_job()
