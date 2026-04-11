"""
main.py — FastAPI application for Cyclical Momentum Strategy backend.
"""

import json
import logging
import os
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import yfinance as yf
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auth import (LoginRequest, TokenResponse, create_access_token,
                  get_current_user, verify_password)
from macro import load_macro_state, load_macro_history
from signals import load_signals_history, load_signals_latest, load_warming_up
from quality_momentum import (
    get_quality_data, refresh_quality_cache, load_quality_cache,
    compute_ltcg_status,
)

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Cyclical Momentum API", version="1.0.0")

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"
PORTFOLIO_FILE = DATA_DIR / "portfolio.json"
SETTINGS_FILE = DATA_DIR / "settings.json"


# ── Settings helpers ──────────────────────────────────────────────────────────
def _load_settings() -> dict:
    if SETTINGS_FILE.exists():
        with open(SETTINGS_FILE) as f:
            return json.load(f)
    return {"capital": None, "risk_pct": 2.0, "alert_email": None}


def _save_settings(s: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_FILE, "w") as f:
        json.dump(s, f, indent=2)


# ── Portfolio helpers ─────────────────────────────────────────────────────────
def _load_portfolio() -> dict:
    if PORTFOLIO_FILE.exists():
        with open(PORTFOLIO_FILE) as f:
            return json.load(f)
    return {"trades": []}


def _save_portfolio(portfolio: dict):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(PORTFOLIO_FILE, "w") as f:
        json.dump(portfolio, f, indent=2)


def _fetch_current_price(ticker: str) -> Optional[float]:
    try:
        df = yf.download(ticker, period="2d", progress=False, auto_adjust=True)
        if df.empty:
            return None
        return round(float(df["Close"].squeeze().iloc[-1]), 2)
    except Exception:
        return None


# ── Models ────────────────────────────────────────────────────────────────────
class TradeRequest(BaseModel):
    ticker: str
    book: str
    entry_date: str
    entry_price: float
    quantity: int
    initial_stop: float
    current_stop: Optional[float] = None
    target_price: Optional[float] = None   # 2:1 R:R target from signal


class ExitRequest(BaseModel):
    trade_id: str
    exit_price: float
    exit_date: Optional[str] = None


class UpdateStopRequest(BaseModel):
    trade_id: str
    new_stop: float


class SettingsRequest(BaseModel):
    capital: Optional[float] = None
    risk_pct: Optional[float] = 2.0
    alert_email: Optional[str] = None


# ── Auth ──────────────────────────────────────────────────────────────────────
@app.post("/auth/login", response_model=TokenResponse)
def login(body: LoginRequest):
    if not verify_password(body.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_access_token({"sub": "dashboard_user"})
    return {"token": token}


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"}


@app.post("/api/run-scan")
def run_scan(request: Request):
    # Secured with a simple bearer secret (SCAN_SECRET env var)
    scan_secret = os.getenv("SCAN_SECRET", "")
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.replace("Bearer ", "")
    if not scan_secret or token != scan_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")
    from scheduler import run_daily_job
    import threading
    threading.Thread(target=run_daily_job, daemon=True).start()
    return {"status": "scan started", "timestamp": datetime.utcnow().isoformat() + "Z"}


# ── Settings ─────────────────────────────────────────────────────────────────
@app.get("/api/settings")
def get_settings(user=Depends(get_current_user)):
    return _load_settings()


@app.post("/api/settings")
def save_settings(body: SettingsRequest, user=Depends(get_current_user)):
    settings = _load_settings()
    if body.capital is not None:
        settings["capital"] = body.capital
    if body.risk_pct is not None:
        settings["risk_pct"] = body.risk_pct
    if body.alert_email is not None:
        settings["alert_email"] = body.alert_email
    _save_settings(settings)
    return settings


# ── Macro ─────────────────────────────────────────────────────────────────────
@app.get("/api/macro")
def get_macro(user=Depends(get_current_user)):
    return load_macro_state()


# ── Signals ───────────────────────────────────────────────────────────────────
@app.get("/api/signals/today")
def get_signals_today(user=Depends(get_current_user)):
    return load_signals_latest()


@app.get("/api/signals/history")
def get_signals_history(user=Depends(get_current_user)):
    return load_signals_history(days=365)


@app.get("/api/signals/warming")
def get_signals_warming(user=Depends(get_current_user)):
    return load_warming_up()


@app.get("/api/macro/history")
def get_macro_history(user=Depends(get_current_user)):
    return load_macro_history(days=365)


@app.get("/api/nifty/benchmark")
def get_nifty_benchmark(start_date: Optional[str] = None, user=Depends(get_current_user)):
    """Return Nifty daily % returns from start_date to today, anchored at 0."""
    from datetime import timedelta
    if not start_date:
        start_date = (date.today() - timedelta(days=365)).isoformat()
    try:
        df = yf.download("^NSEI", start=start_date, progress=False, auto_adjust=True)
        if df.empty:
            return []
        close = df["Close"].squeeze()
        base = float(close.iloc[0])
        result = []
        for dt, price in close.items():
            result.append({
                "date": str(dt.date()),
                "pct": round((float(price) - base) / base * 100, 2),
            })
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Portfolio ─────────────────────────────────────────────────────────────────
@app.get("/api/portfolio")
def get_portfolio(user=Depends(get_current_user)):
    portfolio = _load_portfolio()
    enriched_trades = []
    for trade in portfolio["trades"]:
        t = dict(trade)
        if t["status"] == "open":
            current = _fetch_current_price(t["ticker"])
            t["current_price"] = current
            if current is not None and t["entry_price"]:
                t["pnl_pct"] = round(
                    (current - t["entry_price"]) / t["entry_price"] * 100, 2
                )
            else:
                t["pnl_pct"] = None
            # Flag at-target trades (current price >= target price)
            target = t.get("target_price")
            t["at_target"] = bool(target and current is not None and current >= target)
        enriched_trades.append(t)

    # Summary stats
    open_trades = [t for t in enriched_trades if t["status"] == "open"]
    closed_trades = [t for t in enriched_trades if t["status"] == "closed"]

    total_deployed = sum(
        (t.get("entry_price", 0) or 0) * (t.get("quantity", 0) or 0)
        for t in open_trades
    )
    unrealised_pnl = sum(
        ((t.get("current_price", t["entry_price"]) or t["entry_price"]) - t["entry_price"])
        * t["quantity"]
        for t in open_trades
        if t.get("current_price") is not None
    )
    closed_pnls = [t.get("pnl_pct") for t in closed_trades if t.get("pnl_pct") is not None]
    best_trade = max(closed_pnls) if closed_pnls else None
    worst_trade = min(closed_pnls) if closed_pnls else None

    return {
        "trades": enriched_trades,
        "summary": {
            "total_deployed": round(total_deployed, 2),
            "unrealised_pnl": round(unrealised_pnl, 2),
            "best_trade": best_trade,
            "worst_trade": worst_trade,
            "open_count": len(open_trades),
            "closed_count": len(closed_trades),
        },
    }


@app.post("/api/portfolio/trade")
def add_trade(body: TradeRequest, user=Depends(get_current_user)):
    portfolio = _load_portfolio()
    trade = {
        "id": str(uuid.uuid4()),
        "ticker": body.ticker,
        "book": body.book,
        "entry_date": body.entry_date,
        "entry_price": body.entry_price,
        "quantity": body.quantity,
        "initial_stop": body.initial_stop,
        "current_stop": body.current_stop or body.initial_stop,
        "target_price": body.target_price,   # 2:1 R:R target
        "status": "open",
        "exit_date": None,
        "exit_price": None,
        "pnl_pct": None,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    portfolio["trades"].append(trade)
    _save_portfolio(portfolio)
    return trade


@app.post("/api/portfolio/update-stop")
def update_stop(body: UpdateStopRequest, user=Depends(get_current_user)):
    portfolio = _load_portfolio()
    trade = next((t for t in portfolio["trades"] if t["id"] == body.trade_id), None)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade["status"] != "open":
        raise HTTPException(status_code=400, detail="Cannot update stop on closed trade")
    if body.new_stop >= trade["entry_price"]:
        raise HTTPException(status_code=400, detail="Stop must be below entry price")
    trade["current_stop"] = body.new_stop
    _save_portfolio(portfolio)
    return trade


@app.post("/api/portfolio/exit")
def record_exit(body: ExitRequest, user=Depends(get_current_user)):
    portfolio = _load_portfolio()
    trade = next((t for t in portfolio["trades"] if t["id"] == body.trade_id), None)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade["status"] != "open":
        raise HTTPException(status_code=400, detail="Trade already closed")

    trade["status"] = "closed"
    trade["exit_price"] = body.exit_price
    trade["exit_date"] = body.exit_date or date.today().isoformat()
    trade["pnl_pct"] = round(
        (body.exit_price - trade["entry_price"]) / trade["entry_price"] * 100, 2
    )
    _save_portfolio(portfolio)

    # Update signals history with exit info
    _mark_history_exit(trade)

    return trade


# ── Quality Momentum ─────────────────────────────────────────────────────────

@app.get("/api/quality/watchlist")
def get_quality_watchlist(user=Depends(get_current_user)):
    """
    Returns ranked quality-momentum watchlist + any active vol-crossover signals.
    Reads from cache; does NOT trigger a live scrape (use /refresh for that).
    """
    return get_quality_data()


@app.post("/api/quality/refresh-cache")
def refresh_quality(user=Depends(get_current_user)):
    """
    Trigger a fresh Screener.in scrape for all quality universe tickers.
    This is slow (~2 min for 90 stocks) — run it once a week via scheduler.
    """
    import threading
    def _bg():
        refresh_quality_cache(force=True)
    threading.Thread(target=_bg, daemon=True).start()
    return {"status": "cache refresh started — check back in ~2 minutes"}


@app.get("/api/quality/ltcg/{trade_id}")
def get_ltcg_status(trade_id: str, user=Depends(get_current_user)):
    """Return LTCG tax status for a specific open trade."""
    portfolio = _load_portfolio()
    trade = next((t for t in portfolio["trades"] if t["id"] == trade_id), None)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade["status"] != "open":
        return {"error": "Trade is closed"}

    current = _fetch_current_price(trade["ticker"])
    if current is None:
        raise HTTPException(status_code=503, detail="Could not fetch current price")

    return compute_ltcg_status(trade["entry_date"], trade["entry_price"], current)


def _mark_history_exit(trade: dict):
    """Mark corresponding signal history entry with exit info."""
    history_file = DATA_DIR / "signals_history.json"
    if not history_file.exists():
        return
    with open(history_file) as f:
        history = json.load(f)
    for sig in history:
        if (sig.get("ticker") == trade["ticker"]
                and sig.get("date") == trade["entry_date"]):
            sig["exit_date"] = trade["exit_date"]
            sig["exit_price"] = trade["exit_price"]
            sig["pnl_pct"] = trade["pnl_pct"]
            sig["exit_reason"] = "stop" if trade["pnl_pct"] < 0 else "target"
            break
    with open(history_file, "w") as f:
        json.dump(history, f, indent=2)
