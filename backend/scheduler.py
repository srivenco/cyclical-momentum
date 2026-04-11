"""
scheduler.py — Daily signal generation + email alert for Cyclical Momentum Strategy.
Run via GitHub Actions cron: 0 1 * * 1-5  (6:30am IST = 1:00am UTC, Mon-Fri)
Can also be run manually: python scheduler.py
"""

import json
import logging
import math
import os
import smtplib
import sys
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("scheduler")

DATA_DIR = Path(__file__).parent / "data"

BOOK_LABELS = {
    "F2_COMMODITY": "Commodity",
    "F3B_RATEHIKE": "Rate Hike",
    "F_RATECUT": "Rate Cut",
    "F4_DEFENSIVE": "Defensive",
}

BOOK_COLORS = {
    "F2_COMMODITY": "#F4C430",
    "F3B_RATEHIKE": "#fb923c",
    "F_RATECUT": "#22d3ee",
    "F4_DEFENSIVE": "#34d399",
}


def _load_settings() -> dict:
    f = DATA_DIR / "settings.json"
    if f.exists():
        with open(f) as fh:
            return json.load(fh)
    return {"capital": None, "risk_pct": 2.0, "alert_email": None}


def _calc_position_size(capital, risk_pct, entry_price, stop_pct) -> dict | None:
    if not capital or not stop_pct:
        return None
    risk_amount = capital * (risk_pct / 100)
    risk_per_share = abs(stop_pct / 100) * entry_price
    if risk_per_share == 0:
        return None
    qty = math.floor(risk_amount / risk_per_share)
    return {"qty": qty, "value": round(qty * entry_price, 2), "risk_amount": round(risk_amount, 2)}


def _build_email_html(macro: dict, signals: list, settings: dict) -> str:
    capital = settings.get("capital")
    risk_pct = settings.get("risk_pct", 2.0)
    date_str = macro.get("date", datetime.utcnow().date().isoformat())

    # Regime summary
    nifty_color = "#34d399" if macro.get("nifty_regime") == "BULL" else "#ef4444"
    rate_color = "#34d399" if macro.get("rate_regime") == "CUT" else "#fb923c" if macro.get("rate_regime") == "HIKE" else "#94a3b8"
    active_books = macro.get("active_books", [])

    active_badges = "".join([
        f'<span style="background:{BOOK_COLORS.get(b,"#64748b")}22;color:{BOOK_COLORS.get(b,"#64748b")};'
        f'border:1px solid {BOOK_COLORS.get(b,"#64748b")}44;padding:2px 10px;border-radius:12px;font-size:12px;margin-right:6px;">'
        f'{BOOK_LABELS.get(b, b)}</span>'
        for b in active_books
    ])

    # Signal rows
    if signals:
        signal_rows = ""
        for s in signals:
            pos = _calc_position_size(capital, risk_pct, s["entry_price"], s["stop_pct"])
            book_color = BOOK_COLORS.get(s["book"], "#64748b")
            strength_color = "#34d399" if s["signal_strength"] == "STRONG" else "#fbbf24" if s["signal_strength"] == "MODERATE" else "#94a3b8"
            cb_warn = " ⚠️" if s.get("circuit_breaker") else ""
            qty_str = f'{pos["qty"]} shares<br><span style="color:#475569;font-size:11px">₹{pos["value"]:,.0f} deployed</span>' if pos else "—"

            signal_rows += f"""
            <tr style="border-bottom:1px solid #1E3558;">
              <td style="padding:10px 12px;font-weight:600;color:white;">{s["ticker"].replace(".NS","")}{cb_warn}</td>
              <td style="padding:10px 12px;">
                <span style="background:{book_color}22;color:{book_color};border:1px solid {book_color}44;
                  padding:1px 8px;border-radius:10px;font-size:11px;">{BOOK_LABELS.get(s["book"], s["book"])}</span>
              </td>
              <td style="padding:10px 12px;color:#94a3b8;">{s["sector"]}</td>
              <td style="padding:10px 12px;color:white;text-align:right;">₹{s["entry_price"]}</td>
              <td style="padding:10px 12px;color:#ef4444;text-align:right;">₹{s["initial_stop"]}<br>
                <span style="font-size:11px">{s["stop_pct"]}%</span></td>
              <td style="padding:10px 12px;color:white;text-align:right;">{s["vol_ratio"]}x</td>
              <td style="padding:10px 12px;color:#34d399;text-align:right;">+{s["prior_20d_return"]}%</td>
              <td style="padding:10px 12px;text-align:center;font-weight:600;color:{strength_color};">{s["signal_strength"]}</td>
              <td style="padding:10px 12px;text-align:right;color:#00B4D8;">{qty_str}</td>
            </tr>"""

        signals_section = f"""
        <h2 style="color:#00B4D8;font-size:14px;font-weight:600;text-transform:uppercase;
          letter-spacing:0.05em;margin:0 0 12px;">
          {len(signals)} Signal{'s' if len(signals) > 1 else ''} Today
        </h2>
        {"".join([f'<p style="color:#64748b;font-size:12px;margin:0 0 4px;">⚠️ Circuit breaker active on one or more signals — book has 3+ consecutive losses.</p>' if any(s.get("circuit_breaker") for s in signals) else ""])}
        <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#162848;color:#64748b;font-size:11px;">
              <th style="padding:8px 12px;text-align:left;">Ticker</th>
              <th style="padding:8px 12px;text-align:left;">Book</th>
              <th style="padding:8px 12px;text-align:left;">Sector</th>
              <th style="padding:8px 12px;text-align:right;">Entry</th>
              <th style="padding:8px 12px;text-align:right;">Stop</th>
              <th style="padding:8px 12px;text-align:right;">Vol Ratio</th>
              <th style="padding:8px 12px;text-align:right;">Momentum</th>
              <th style="padding:8px 12px;text-align:center;">Strength</th>
              <th style="padding:8px 12px;text-align:right;">{'Suggested Qty' if capital else 'Qty'}</th>
            </tr>
          </thead>
          <tbody>{signal_rows}</tbody>
        </table>
        </div>"""
    else:
        signals_section = f"""
        <div style="background:#0D1F3C;border:1px solid #1E3558;border-radius:12px;padding:24px;text-align:center;">
          <p style="color:white;font-weight:600;margin:0 0 6px;">No signals today</p>
          <p style="color:#64748b;font-size:13px;margin:0;">
            Scanned {macro.get("total_checked", 0) if hasattr(macro, "get") else 0} stocks across
            {", ".join(BOOK_LABELS.get(b, b) for b in active_books) or "active books"}
          </p>
        </div>"""

    capital_note = f"""
      <p style="color:#64748b;font-size:12px;margin:6px 0 0;">
        Capital: ₹{capital:,.0f} &nbsp;|&nbsp; Risk per trade: {risk_pct}% (₹{capital * risk_pct / 100:,.0f})
      </p>""" if capital else """
      <p style="color:#475569;font-size:12px;margin:6px 0 0;">
        Set your capital in the dashboard to get position sizing in future alerts.
      </p>"""

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A1628;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;">
  <div style="max-width:720px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
      <div style="width:36px;height:36px;background:#162848;border:1.5px solid #00B4D8;
        border-radius:10px;display:flex;align-items:center;justify-content:center;">
        <span style="color:#00B4D8;font-size:18px;">↗</span>
      </div>
      <div>
        <h1 style="margin:0;color:white;font-size:16px;font-weight:700;">Cyclical Momentum</h1>
        <p style="margin:0;color:#64748b;font-size:12px;">Daily Signal Alert — {date_str}</p>
      </div>
    </div>

    <!-- Macro regime -->
    <div style="background:#0D1F3C;border:1px solid #1E3558;border-radius:14px;padding:18px;margin-bottom:20px;">
      <h2 style="color:#00B4D8;font-size:13px;font-weight:600;text-transform:uppercase;
        letter-spacing:0.05em;margin:0 0 14px;">Macro Regime</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px;">
        <div>
          <p style="color:#64748b;font-size:11px;margin:0 0 2px;">Nifty vs 200MA</p>
          <p style="color:{nifty_color};font-weight:700;font-size:14px;margin:0;">
            {macro.get("nifty_regime","—")}
            <span style="font-size:12px;font-weight:400;"> {macro.get("nifty_vs_200ma",0):+.2f}%</span>
          </p>
          <p style="color:#475569;font-size:11px;margin:2px 0 0;">₹{macro.get("nifty_price",0):,.0f}</p>
        </div>
        <div>
          <p style="color:#64748b;font-size:11px;margin:0 0 2px;">Rate Regime</p>
          <p style="color:{rate_color};font-weight:700;font-size:14px;margin:0;">
            {macro.get("rate_regime","—")}
          </p>
          <p style="color:#475569;font-size:11px;margin:2px 0 0;">
            US10Y {macro.get("us10y",0):.2f}% ({macro.get("us10y_63d_change",0):+.3f}% 63d)
          </p>
        </div>
        <div>
          <p style="color:#64748b;font-size:11px;margin:0 0 2px;">Commodity</p>
          <p style="color:{"#34d399" if macro.get("commodity_bull") else "#64748b"};font-weight:700;font-size:14px;margin:0;">
            {"BULL" if macro.get("commodity_bull") else "INACTIVE"}
          </p>
          <p style="color:#475569;font-size:11px;margin:2px 0 0;">
            Crude ${macro.get("crude_price",0):.1f} · Cu ${macro.get("copper_price",0):.2f}
          </p>
        </div>
      </div>
      <div>
        <p style="color:#64748b;font-size:11px;margin:0 0 6px;">Active Books</p>
        {active_badges if active_badges else '<span style="color:#475569;font-size:12px;">None</span>'}
      </div>
    </div>

    <!-- Signals -->
    <div style="background:#0D1F3C;border:1px solid #1E3558;border-radius:14px;padding:18px;margin-bottom:20px;">
      {signals_section}
      {capital_note}
    </div>

    <!-- Footer -->
    <p style="color:#334155;font-size:11px;text-align:center;margin:0;">
      SrivenCap · Cyclical Momentum Strategy ·
      <a href="https://srivenco.github.io/cyclical-momentum/" style="color:#00B4D8;text-decoration:none;">
        Open Dashboard
      </a>
    </p>
  </div>
</body>
</html>"""


def send_email_alert(macro: dict, signals: list, settings: dict):
    alert_email = settings.get("alert_email")
    zoho_user = os.getenv("ZOHO_USER")          # prajit@sriven.co
    zoho_password = os.getenv("ZOHO_PASSWORD")  # Zoho app-specific password

    if not alert_email:
        logger.info("No alert_email configured — skipping email")
        return
    if not zoho_user or not zoho_password:
        logger.warning("ZOHO_USER or ZOHO_PASSWORD not set — skipping email")
        return

    date_str = macro.get("date", datetime.utcnow().date().isoformat())
    signal_count = len(signals)
    subject = (
        f"🚨 {signal_count} Signal{'s' if signal_count != 1 else ''} — Cyclical Momentum {date_str}"
        if signal_count > 0
        else f"📊 No Signals Today — Cyclical Momentum {date_str}"
    )

    html_body = _build_email_html(macro, signals, settings)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"SrivenCap Alerts <{zoho_user}>"
    msg["To"] = alert_email
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.zoho.in", 465) as server:
            server.login(zoho_user, zoho_password)
            server.sendmail(zoho_user, alert_email, msg.as_string())
        logger.info(f"Email alert sent to {alert_email}")
    except Exception as e:
        logger.error(f"Failed to send email: {e}")


def run_daily_job():
    logger.info("=" * 60)
    logger.info(f"Daily job starting at {datetime.utcnow().isoformat()}Z")
    logger.info("=" * 60)

    # Step 1: Macro regime
    logger.info("Step 1/3 — Macro regime detection")
    from macro import detect_regime
    macro_state = detect_regime()
    logger.info(f"  Active books: {macro_state['active_books']}")
    logger.info(f"  Nifty regime: {macro_state['nifty_regime']}")
    logger.info(f"  Rate regime:  {macro_state['rate_regime']}")

    # Step 2: Signals
    logger.info("Step 2/3 — Signal generation")
    from signals import generate_signals
    active_books = macro_state.get("active_books", [])
    if not active_books:
        logger.info("  No active books — skipping signal scan")
        result = {"signal_count": 0, "total_checked": 0, "signals": []}
    else:
        result = generate_signals(active_books)
    logger.info(f"  Checked {result['total_checked']} stocks, found {result['signal_count']} signals")

    for sig in result.get("signals", []):
        logger.info(f"  SIGNAL: {sig['ticker']} | {sig['book']} | entry={sig['entry_price']} stop={sig['initial_stop']}")

    # Step 3: Email alert
    logger.info("Step 3/3 — Sending email alert")
    settings = _load_settings()
    send_email_alert(macro_state, result.get("signals", []), settings)

    logger.info(f"Done at {datetime.utcnow().isoformat()}Z")
    logger.info("=" * 60)


if __name__ == "__main__":
    run_daily_job()
