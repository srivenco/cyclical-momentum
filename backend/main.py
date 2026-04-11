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
from macro import load_macro_state
from signals import load_signals_history, load_signals_latest

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


class ExitRequest(BaseModel):
    trade_id: str
    exit_price: float
    exit_date: Optional[str] = None


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
    return load_signals_history(days=90)


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
        "status": "open",
        "exit_date": None,
        "exit_price": None,
        "pnl_pct": None,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    portfolio["trades"].append(trade)
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
