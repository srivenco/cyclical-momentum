"""
macro_dashboard.py — Full macro intelligence layer for cyclical investing.

Instruments:
  Commodities    : WTI, Brent, Natural Gas, Copper, Gold, Silver
  Global Equities: S&P 500, Nasdaq, Nikkei, Hang Seng, Euro Stoxx, MSCI EM
  Credit Markets : HYG (high yield), LQD (investment grade), TLT (long bond)
  Global Macro   : US10Y, US2Y, VIX, DXY
  India Macro    : Nifty, Bank Nifty, Midcap, India VIX, USD/INR
  NSE Sectors    : Metal, Energy, Banks, IT, Auto, Pharma, FMCG, Realty, Infra
  Macro Ratios   : Copper/Gold, Oil/Gold, Gold/Silver, HYG/LQD, 10Y-2Y
  Cycle Scores   : India phase + US phase with sector playbooks
  FII/DII Flows  : NSE daily institutional flows (best-effort scrape)
"""

import json
import logging
import time
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)

DATA_DIR   = Path(__file__).parent / "data"
CACHE_FILE = DATA_DIR / "macro_dashboard_cache.json"
FII_FILE   = DATA_DIR / "fii_dii_cache.json"
CACHE_TTL  = 15 * 60   # 15 min
FII_TTL    = 4  * 3600  # 4 hours


# ── Instrument registry ───────────────────────────────────────────────────────

COMMODITIES = [
    {"key": "crude_wti",   "name": "WTI Crude",    "ticker": "CL=F",     "unit": "$/bbl"},
    {"key": "crude_brent", "name": "Brent Crude",  "ticker": "BZ=F",     "unit": "$/bbl"},
    {"key": "natural_gas", "name": "Natural Gas",  "ticker": "NG=F",     "unit": "$/MMBtu"},
    {"key": "copper",      "name": "Copper",        "ticker": "HG=F",     "unit": "$/lb"},
    {"key": "gold",        "name": "Gold",          "ticker": "GC=F",     "unit": "$/oz"},
    {"key": "silver",      "name": "Silver",        "ticker": "SI=F",     "unit": "$/oz"},
]

GLOBAL_EQUITIES = [
    {"key": "sp500",    "name": "S&P 500",     "ticker": "^GSPC",    "region": "US"},
    {"key": "nasdaq",   "name": "Nasdaq",      "ticker": "^IXIC",    "region": "US"},
    {"key": "nikkei",   "name": "Nikkei 225",  "ticker": "^N225",    "region": "Asia"},
    {"key": "hangseng", "name": "Hang Seng",   "ticker": "^HSI",     "region": "Asia"},
    {"key": "stoxx",    "name": "Euro Stoxx",  "ticker": "^STOXX50E","region": "Europe"},
    {"key": "msci_em",  "name": "MSCI EM",     "ticker": "EEM",      "region": "EM"},
]

CREDIT_MARKETS = [
    {"key": "hyg",  "name": "HY Bonds (HYG)", "ticker": "HYG", "unit": "ETF"},
    {"key": "lqd",  "name": "IG Bonds (LQD)", "ticker": "LQD", "unit": "ETF"},
    {"key": "tlt",  "name": "LT Treasuries",  "ticker": "TLT", "unit": "ETF"},
]

GLOBAL_MACRO = [
    {"key": "us10y", "name": "US 10Y Yield", "ticker": "^TNX",     "unit": "%"},
    {"key": "us2y",  "name": "US 2Y Yield",  "ticker": "^IRX",     "unit": "%"},
    {"key": "vix",   "name": "VIX",           "ticker": "^VIX",     "unit": "pts"},
    {"key": "dxy",   "name": "DXY (Dollar)",  "ticker": "DX-Y.NYB", "unit": "idx"},
]

INDIA_MACRO = [
    {"key": "nifty",     "name": "Nifty 50",     "ticker": "^NSEI",     "unit": "pts"},
    {"key": "banknifty", "name": "Bank Nifty",   "ticker": "^NSEBANK",  "unit": "pts"},
    {"key": "midcap",    "name": "Nifty Midcap", "ticker": "^NSMIDCP",  "unit": "pts"},
    {"key": "india_vix", "name": "India VIX",    "ticker": "^INDIAVIX", "unit": "pts"},
    {"key": "usdinr",    "name": "USD/INR",       "ticker": "USDINR=X",  "unit": "₹"},
]

SECTORS = [
    {"key": "metal",  "name": "Metals",  "ticker": "^CNXMETAL"},
    {"key": "energy", "name": "Energy",  "ticker": "^CNXENERGY"},
    {"key": "bank",   "name": "Banks",   "ticker": "^NSEBANK"},
    {"key": "it",     "name": "IT",      "ticker": "^CNXIT"},
    {"key": "auto",   "name": "Auto",    "ticker": "^CNXAUTO"},
    {"key": "pharma", "name": "Pharma",  "ticker": "^CNXPHARMA"},
    {"key": "fmcg",   "name": "FMCG",   "ticker": "^CNXFMCG"},
    {"key": "realty", "name": "Realty",  "ticker": "^CNXREALTY"},
    {"key": "infra",  "name": "Infra",   "ticker": "^CNXINFRA"},
    {"key": "midcap", "name": "Midcap",  "ticker": "^NSMIDCP"},
]

ALL_TICKERS = list(dict.fromkeys(
    [c["ticker"] for c in COMMODITIES]
    + [g["ticker"] for g in GLOBAL_EQUITIES]
    + [c["ticker"] for c in CREDIT_MARKETS]
    + [g["ticker"] for g in GLOBAL_MACRO]
    + [i["ticker"] for i in INDIA_MACRO]
    + [s["ticker"] for s in SECTORS]
))


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _cache_fresh(path: Path, ttl: int) -> bool:
    if not path.exists():
        return False
    return (datetime.utcnow().timestamp() - path.stat().st_mtime) < ttl

def _read_json(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)

def _write_json(path: Path, data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# ── Price stats ───────────────────────────────────────────────────────────────

def _stats(close: pd.Series) -> dict:
    if close is None or len(close) < 5:
        return {}
    price = float(close.iloc[-1])

    def _ret(n):
        if len(close) <= n:
            return None
        base = float(close.iloc[-n - 1])
        return round((price - base) / base * 100, 2) if base else None

    ytd = None
    try:
        prior_year = close[close.index.year < close.index[-1].year]
        if len(prior_year):
            b = float(prior_year.iloc[-1])
            ytd = round((price - b) / b * 100, 2)
    except Exception:
        pass

    ma200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else None
    ma50  = float(close.rolling(50).mean().iloc[-1])  if len(close) >= 50  else None
    vs200 = round((price - ma200) / ma200 * 100, 2)   if ma200 else None

    hi52     = float(close.tail(252).max()) if len(close) >= 20 else None
    lo52     = float(close.tail(252).min()) if len(close) >= 20 else None
    from_hi  = round((price - hi52) / hi52 * 100, 1) if hi52 else None

    spark_raw = close.tail(30).tolist()
    s_min, s_max = min(spark_raw), max(spark_raw)
    rng = s_max - s_min
    spark = [round((v - s_min) / rng * 100, 1) if rng else 50 for v in spark_raw]

    return {
        "price":       round(price, 4 if price < 10 else 2),
        "change_1d":   _ret(1),
        "change_1w":   _ret(5),
        "change_1m":   _ret(21),
        "change_3m":   _ret(63),
        "change_6m":   _ret(126),
        "ytd":         ytd,
        "ma200":       round(ma200, 2) if ma200 else None,
        "ma50":        round(ma50,  2) if ma50  else None,
        "vs_200ma":    vs200,
        "above_200ma": (price > ma200) if ma200 else None,
        "above_50ma":  (price > ma50)  if ma50  else None,
        "hi52":        round(hi52, 2)  if hi52  else None,
        "lo52":        round(lo52, 2)  if lo52  else None,
        "pct_from_hi": from_hi,
        "sparkline":   spark,
    }


# ── FII / DII flows ───────────────────────────────────────────────────────────

def fetch_fii_dii() -> dict:
    """Fetch NSE FII/DII cash market flows. Best-effort — returns {} on failure."""
    if _cache_fresh(FII_FILE, FII_TTL):
        return _read_json(FII_FILE)

    try:
        import requests
        session = requests.Session()
        session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept":          "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer":         "https://www.nseindia.com/",
            "X-Requested-With": "XMLHttpRequest",
        })
        # Warm up session (NSE requires cookie)
        session.get("https://www.nseindia.com", timeout=10)
        time.sleep(1.5)

        resp = session.get(
            "https://www.nseindia.com/api/fiidiiTradeReact",
            timeout=10,
        )
        if resp.status_code != 200:
            raise ValueError(f"NSE returned {resp.status_code}")

        raw = resp.json()
        # raw is a list; entries have category, buyValue, sellValue, netValue, date
        result = {"rows": raw, "fetched_at": datetime.utcnow().isoformat()}
        _write_json(FII_FILE, result)
        return result

    except Exception as exc:
        logger.warning(f"FII/DII fetch failed: {exc}")
        # Return stale cache if available
        if FII_FILE.exists():
            return _read_json(FII_FILE)
        return {}


def _parse_fii_dii(raw: dict) -> list:
    """Parse NSE FII/DII response into clean list of {category, buy, sell, net, date}."""
    rows = raw.get("rows", [])
    out = []
    for r in rows:
        try:
            out.append({
                "category": r.get("category", ""),
                "buy":      float(str(r.get("buyValue",  "0")).replace(",", "") or 0),
                "sell":     float(str(r.get("sellValue", "0")).replace(",", "") or 0),
                "net":      float(str(r.get("netValue",  "0")).replace(",", "") or 0),
                "date":     r.get("date", ""),
            })
        except Exception:
            continue
    return out


# ── Macro ratios ──────────────────────────────────────────────────────────────

def _compute_ratios(price_map: dict) -> list:
    """
    Derive classic macro cross-asset ratios.
    Each ratio is a leading indicator of a specific macro condition.
    """
    def _ratio(num_ticker, den_ticker, name, key, interpretation):
        n = price_map.get(num_ticker, {})
        d = price_map.get(den_ticker, {})
        np_ = n.get("price")
        dp_ = d.get("price")
        if not np_ or not dp_:
            return None
        val = round(np_ / dp_, 4)

        # Trend: compute ratio's own 1M and 3M change from component returns
        # ratio_change ≈ (1 + n_ret) / (1 + d_ret) - 1
        r1m_n = n.get("change_1m", 0) or 0
        r1m_d = d.get("change_1m", 0) or 0
        r3m_n = n.get("change_3m", 0) or 0
        r3m_d = d.get("change_3m", 0) or 0
        ratio_1m = round(((1 + r1m_n/100) / (1 + r1m_d/100) - 1) * 100, 2)
        ratio_3m = round(((1 + r3m_n/100) / (1 + r3m_d/100) - 1) * 100, 2)

        rising = ratio_1m > 0

        return {
            "key":             key,
            "name":            name,
            "value":           val,
            "change_1m":       ratio_1m,
            "change_3m":       ratio_3m,
            "rising":          rising,
            "interpretation":  interpretation,
            "signal":          interpretation["bull"] if rising else interpretation["bear"],
            "signal_color":    interpretation["bull_color"] if rising else interpretation["bear_color"],
        }

    ratios = []

    # 1. Copper / Gold — growth barometer
    #    Rising → markets pricing in economic expansion
    #    Falling → growth fears, recession risk
    r = _ratio("HG=F", "GC=F", "Copper / Gold", "cu_au",
               {"bull": "Growth optimism — cyclicals, banks", "bear": "Growth fears — defensives, bonds",
                "bull_color": "green", "bear_color": "red"})
    if r: ratios.append(r)

    # 2. Oil / Gold — inflation vs deflation
    #    Rising → inflation expectations up → real assets, energy
    #    Falling → deflation risk or demand collapse
    r = _ratio("CL=F", "GC=F", "Oil / Gold", "oil_au",
               {"bull": "Inflation expectations rising — energy, materials",
                "bear": "Deflation risk / demand collapse — bonds, consumer",
                "bull_color": "amber", "bear_color": "blue"})
    if r: ratios.append(r)

    # 3. Gold / Silver — risk appetite
    #    Rising ratio → risk OFF (gold outperforms, silver is industrial)
    #    Falling ratio → risk ON (silver demand rising with growth)
    r = _ratio("GC=F", "SI=F", "Gold / Silver", "au_ag",
               {"bull": "Risk-off — gold outperforming, caution warranted",
                "bear": "Risk-on — silver demand up, growth positive",
                "bull_color": "red", "bear_color": "green"})
    if r: ratios.append(r)

    # 4. HYG / LQD — credit health
    #    Rising → credit spreads tightening, risk appetite healthy
    #    Falling → spreads widening, credit stress — leading equity indicator
    r = _ratio("HYG", "LQD", "HYG / LQD (Credit)", "hyg_lqd",
               {"bull": "Credit healthy — spreads tight, equity supportive",
                "bear": "Credit stress — spreads widening, equities at risk",
                "bull_color": "green", "bear_color": "red"})
    if r: ratios.append(r)

    # 5. DXY vs Crude (inverse proxy)
    #    Strong dollar → commodity headwind → EM pressure
    #    Weak dollar → commodity tailwind → EM/India outperform
    dxy = price_map.get("DX-Y.NYB", {})
    crude = price_map.get("CL=F", {})
    dxy_1m = dxy.get("change_1m", 0) or 0
    crude_1m = crude.get("change_1m", 0) or 0
    # Divergence: if dollar strong + crude weak → EM negative
    em_signal = "positive" if dxy_1m < 0 and crude_1m > 0 else \
                "negative" if dxy_1m > 0 and crude_1m < 0 else "mixed"
    ratios.append({
        "key":   "dxy_crude",
        "name":  "DXY vs Crude",
        "value": round(dxy_1m - crude_1m, 2),
        "change_1m": round(dxy_1m, 2),
        "change_3m": round(dxy.get("change_3m", 0) or 0, 2),
        "rising": dxy_1m < 0,  # weak dollar = good for EM
        "interpretation": {
            "bull": "Weak $ + strong crude → EM/India tailwind",
            "bear": "Strong $ + weak crude → EM/India headwind",
            "bull_color": "green", "bear_color": "red",
        },
        "signal": "EM Tailwind" if em_signal == "positive" else
                  "EM Headwind" if em_signal == "negative" else "Mixed",
        "signal_color": "green" if em_signal == "positive" else
                        "red" if em_signal == "negative" else "amber",
        "em_signal": em_signal,
    })

    return ratios


# ── Cycle scoring ─────────────────────────────────────────────────────────────

US_CYCLE_PHASES = {
    "EXPANSION":   {
        "color": "green",
        "description": "Economy growing, earnings rising, credit healthy.",
        "overweight":  ["Financials", "Industrials", "Materials", "Consumer Disc"],
        "underweight": ["Utilities", "Staples"],
        "watch":       ["Energy rising with demand"],
    },
    "LATE CYCLE":  {
        "color": "amber",
        "description": "Growth peaking, inflation elevated, Fed near pause.",
        "overweight":  ["Energy", "Materials", "Healthcare"],
        "underweight": ["Consumer Disc", "Financials"],
        "watch":       ["Yield curve inversion — watch credit spreads"],
    },
    "SLOWDOWN":    {
        "color": "orange",
        "description": "Growth decelerating, yield curve inverted, credit widening.",
        "overweight":  ["Healthcare", "Utilities", "Staples", "Quality tech"],
        "underweight": ["Banks", "Industrials", "Small caps"],
        "watch":       ["HYG/LQD spread — leading recession indicator"],
    },
    "RECESSION":   {
        "color": "red",
        "description": "Contraction. Credit stress, earnings falling, unemployment rising.",
        "overweight":  ["Cash", "Gold", "Long bonds (TLT)", "Utilities"],
        "underweight": ["Cyclicals", "Banks", "Consumer Disc"],
        "watch":       ["Fed pivot — early recovery signal"],
    },
    "RECOVERY":    {
        "color": "blue",
        "description": "Activity bottoming, Fed easing, credit healing.",
        "overweight":  ["Tech", "Financials", "Consumer Disc", "Small caps"],
        "underweight": ["Utilities", "Staples"],
        "watch":       ["Copper/Gold ratio turning up — key early signal"],
    },
}

INDIA_CYCLE_PHASES = {
    "BULL":        {
        "color": "green",
        "description": "Nifty trending, FII buying, credit growth strong.",
        "overweight":  ["Banks", "Realty", "Auto", "Consumer Disc", "Capex plays"],
        "underweight": ["Pharma", "IT (rupee risk)"],
        "watch":       ["Midcap premium expanding"],
    },
    "CAUTIOUS":    {
        "color": "amber",
        "description": "Bull intact but momentum fading. FII flows mixed.",
        "overweight":  ["Quality large caps", "FMCG", "IT (defensive)"],
        "underweight": ["Midcap / Smallcap", "Realty"],
        "watch":       ["FII flows and India VIX"],
    },
    "CORRECTION":  {
        "color": "orange",
        "description": "Nifty below 200MA or approaching it. FII selling.",
        "overweight":  ["IT (USD earner)", "Pharma (export)", "Gold ETFs"],
        "underweight": ["Banks", "Realty", "Consumer Disc"],
        "watch":       ["INR weakness — triggers more FII selling"],
    },
    "BEAR":        {
        "color": "red",
        "description": "Sustained downtrend. Capital outflows, INR under pressure.",
        "overweight":  ["Cash", "IT", "Pharma", "Gold"],
        "underweight": ["All cyclicals"],
        "watch":       ["Global risk-on signal for re-entry"],
    },
    "RATE CUT CYCLE": {
        "color": "blue",
        "description": "RBI cutting. Rate-sensitive sectors lead.",
        "overweight":  ["Banks", "NBFCs", "Realty", "Auto", "Consumer"],
        "underweight": ["IT"],
        "watch":       ["Credit growth acceleration"],
    },
}


def _score_us_cycle(price_map: dict, ratios: list) -> dict:
    """Score the US business cycle from 0-10 signals."""
    signals = []

    def sig(label, condition, bull_label, bear_label, weight=1):
        ok = bool(condition) if condition is not None else None
        signals.append({
            "label":    label,
            "reading":  bull_label if ok else (bear_label if ok is not None else "No data"),
            "bullish":  ok,
            "weight":   weight,
        })
        return (weight if ok else -weight) if ok is not None else 0

    score = 0

    # 1. S&P 500 vs 200MA
    sp = price_map.get("^GSPC", {})
    score += sig("S&P 500 Trend", sp.get("above_200ma"),
                 f"Above 200MA (+{sp.get('vs_200ma', 0):.1f}%)",
                 f"Below 200MA ({sp.get('vs_200ma', 0):.1f}%)", weight=2)

    # 2. VIX level
    vix_p = price_map.get("^VIX", {}).get("price")
    vix_ok = vix_p is not None and vix_p < 20
    vix_label = f"VIX {vix_p:.1f} — {'Calm' if vix_ok else 'Elevated'}" if vix_p else "No data"
    score += sig("VIX (Risk Appetite)", vix_ok, vix_label, vix_label)

    # 3. Yield curve
    us10y_p = price_map.get("^TNX", {}).get("price")
    us2y_p  = price_map.get("^IRX", {}).get("price")
    curve_ok = None
    if us10y_p and us2y_p:
        curve = us10y_p - us2y_p / 100 * 10
        curve_ok = curve > 0
        score += sig("Yield Curve (10Y-2Y)",
                     curve_ok,
                     f"Normal +{curve:.2f}%",
                     f"Inverted {curve:.2f}%", weight=2)

    # 4. Credit health (HYG trend)
    hyg = price_map.get("HYG", {})
    score += sig("Credit (HYG)", hyg.get("above_50ma"),
                 "HYG above 50MA — spreads tightening",
                 "HYG below 50MA — spreads widening")

    # 5. Copper/Gold ratio trend
    cu_au = next((r for r in ratios if r["key"] == "cu_au"), None)
    if cu_au:
        score += sig("Copper/Gold Ratio", cu_au["rising"],
                     f"Rising {cu_au['change_1m']:+.1f}% 1M — growth signal",
                     f"Falling {cu_au['change_1m']:+.1f}% 1M — growth concern")

    # 6. Dollar trend (weak dollar = risk on)
    dxy = price_map.get("DX-Y.NYB", {})
    dxy_1m = dxy.get("change_1m", 0) or 0
    score += sig("Dollar (DXY)", dxy_1m < 0,
                 f"DXY weakening {dxy_1m:+.1f}% — risk-on",
                 f"DXY strengthening {dxy_1m:+.1f}% — risk-off")

    # 7. Rate trend
    us10y_3m = price_map.get("^TNX", {}).get("change_3m", 0) or 0
    score += sig("Rate Trend",
                 us10y_3m < 0,
                 f"US10Y falling {us10y_3m:+.2f}% — easing",
                 f"US10Y rising {us10y_3m:+.2f}% — tightening")

    # Map score to phase
    max_score = sum(s["weight"] for s in signals if s["bullish"] is not None) * 1
    # Recompute properly
    bull_scores = [s["weight"] for s in signals if s["bullish"] is True]
    bear_scores = [s["weight"] for s in signals if s["bullish"] is False]
    net = sum(bull_scores) - sum(bear_scores)
    total = sum(s["weight"] for s in signals if s["bullish"] is not None)
    pct = round((net + total) / (2 * total) * 100) if total else 50

    if pct >= 75:   phase = "EXPANSION"
    elif pct >= 55: phase = "LATE CYCLE"
    elif pct >= 40: phase = "SLOWDOWN"
    elif pct >= 25: phase = "RECOVERY"
    else:           phase = "RECESSION"

    meta = US_CYCLE_PHASES[phase]
    return {
        "phase":       phase,
        "score_pct":   pct,
        "signals":     signals,
        "color":       meta["color"],
        "description": meta["description"],
        "overweight":  meta["overweight"],
        "underweight": meta["underweight"],
        "watch":       meta["watch"],
    }


def _score_india_cycle(price_map: dict, fii_data: list) -> dict:
    signals = []

    def sig(label, condition, bull_label, bear_label, weight=1):
        ok = bool(condition) if condition is not None else None
        signals.append({
            "label":   label,
            "reading": bull_label if ok else (bear_label if ok is not None else "No data"),
            "bullish": ok,
            "weight":  weight,
        })
        return (weight if ok else -weight) if ok is not None else 0

    score = 0

    # 1. Nifty vs 200MA
    nifty = price_map.get("^NSEI", {})
    score += sig("Nifty Trend", nifty.get("above_200ma"),
                 f"Above 200MA (+{nifty.get('vs_200ma', 0):.1f}%)",
                 f"Below 200MA ({nifty.get('vs_200ma', 0):.1f}%)", weight=3)

    # 2. India VIX
    ivix = price_map.get("^INDIAVIX", {}).get("price")
    vix_ok = ivix is not None and ivix < 18
    score += sig("India VIX", vix_ok,
                 f"India VIX {ivix:.1f} — calm" if ivix else "No data",
                 f"India VIX {ivix:.1f} — elevated" if ivix else "No data")

    # 3. USD/INR trend (rupee weakening = bearish for FII flows)
    usdinr = price_map.get("USDINR=X", {})
    inr_1m = usdinr.get("change_1m", 0) or 0
    inr_ok = inr_1m < 0.5  # <0.5% depreciation in 1M is OK
    score += sig("INR Stability", inr_ok,
                 f"Rupee stable/strengthening ({inr_1m:+.1f}% 1M)",
                 f"Rupee weakening ({inr_1m:+.1f}% 1M) — FII pressure")

    # 4. Rate regime
    us10y_3m = price_map.get("^TNX", {}).get("change_3m", 0) or 0
    rate_cut = us10y_3m < -0.2
    score += sig("Rate Environment", rate_cut,
                 "Rates declining — rate-sensitive sectors benefit",
                 "Rates rising or stable — growth stocks pressured")

    # 5. Global risk appetite (VIX)
    g_vix = price_map.get("^VIX", {}).get("price")
    score += sig("Global Risk (VIX)", g_vix and g_vix < 20,
                 f"Global VIX {g_vix:.1f} — FII risk appetite healthy" if g_vix else "No data",
                 f"Global VIX {g_vix:.1f} — FII risk-off" if g_vix else "No data")

    # 6. FII flows (if available)
    fii_net = None
    for row in fii_data:
        if "FII" in row.get("category", "").upper():
            fii_net = row.get("net")
            break
    if fii_net is not None:
        fii_ok = fii_net > 0
        score += sig("FII Flows (Today)", fii_ok,
                     f"FII buying ₹{fii_net:,.0f} Cr",
                     f"FII selling ₹{abs(fii_net):,.0f} Cr", weight=2)

    # 7. Midcap breadth (midcap vs nifty 1M)
    mid_1m   = price_map.get("^NSMIDCP", {}).get("change_1m", 0) or 0
    nifty_1m = price_map.get("^NSEI",   {}).get("change_1m", 0) or 0
    mid_rel  = mid_1m - nifty_1m
    score += sig("Midcap Breadth", mid_rel > 0,
                 f"Midcap outperforming Nifty +{mid_rel:.1f}% 1M — breadth healthy",
                 f"Midcap underperforming Nifty {mid_rel:.1f}% 1M — narrow rally")

    # Map to phase
    bull_w = sum(s["weight"] for s in signals if s["bullish"] is True)
    bear_w = sum(s["weight"] for s in signals if s["bullish"] is False)
    total  = sum(s["weight"] for s in signals if s["bullish"] is not None)
    pct    = round((bull_w + total) / (2 * total) * 100) if total else 50

    # Check for rate-cut cycle signal specifically
    if rate_cut and pct >= 50:
        phase = "RATE CUT CYCLE"
    elif pct >= 70:  phase = "BULL"
    elif pct >= 50:  phase = "CAUTIOUS"
    elif pct >= 35:  phase = "CORRECTION"
    else:            phase = "BEAR"

    meta = INDIA_CYCLE_PHASES[phase]
    return {
        "phase":       phase,
        "score_pct":   pct,
        "signals":     signals,
        "color":       meta["color"],
        "description": meta["description"],
        "overweight":  meta["overweight"],
        "underweight": meta["underweight"],
        "watch":       meta["watch"],
        "fii_today":   fii_net,
    }


# ── Macro regime (original) ───────────────────────────────────────────────────

def _regime_summary(price_map: dict) -> dict:
    out = {}
    nifty = price_map.get("^NSEI", {})
    if nifty.get("above_200ma") is not None:
        out["nifty_trend"]    = "BULL" if nifty["above_200ma"] else "BEAR"
        out["nifty_vs_200ma"] = nifty.get("vs_200ma")

    us10y_d = price_map.get("^TNX", {})
    us10y_3m = us10y_d.get("change_3m")
    if us10y_3m is not None:
        out["rate_regime"]     = "CUT" if us10y_3m < -0.20 else "HIKE" if us10y_3m > 0.20 else "NEUTRAL"
        out["us10y_3m_change"] = round(us10y_3m, 3)

    copper  = price_map.get("HG=F", {})
    crude   = price_map.get("CL=F", {})
    out["commodity_cycle"] = "BULL" if (
        copper.get("above_200ma") and (copper.get("change_3m") or 0) > 0
        and crude.get("above_200ma") and (crude.get("change_3m") or 0) > 0
    ) else "BEAR"

    dxy_1m = price_map.get("DX-Y.NYB", {}).get("change_1m")
    if dxy_1m is not None:
        out["dollar_trend"] = "STRONG" if dxy_1m > 1 else "WEAK" if dxy_1m < -1 else "NEUTRAL"

    vix_p = price_map.get("^VIX", {}).get("price")
    if vix_p:
        out["risk_regime"] = ("RISK ON" if vix_p < 15 else "CAUTIOUS" if vix_p < 20
                              else "RISK OFF" if vix_p < 30 else "FEAR")

    us10y_p = us10y_d.get("price")
    us2y_p  = price_map.get("^IRX", {}).get("price")
    if us10y_p and us2y_p:
        curve = round(us10y_p - us2y_p / 100 * 10, 3)
        out["yield_curve"]    = curve
        out["curve_inverted"] = curve < 0

    return out


# ── Main fetch ────────────────────────────────────────────────────────────────

def fetch_dashboard_data(force: bool = False) -> dict:
    if not force and _cache_fresh(CACHE_FILE, CACHE_TTL):
        return _read_json(CACHE_FILE)

    logger.info(f"Fetching macro dashboard: {len(ALL_TICKERS)} instruments…")
    try:
        raw = yf.download(
            ALL_TICKERS, period="2y",
            auto_adjust=True, progress=False,
            group_by="ticker", threads=True,
        )
    except Exception as exc:
        logger.error(f"Batch download failed: {exc}")
        return _read_json(CACHE_FILE) if CACHE_FILE.exists() else {"error": str(exc)}

    # Parse each ticker into stats
    price_map = {}
    for ticker in ALL_TICKERS:
        try:
            if len(ALL_TICKERS) == 1:
                df = raw
            elif ticker in raw.columns.get_level_values(0):
                df = raw[ticker]
            elif ticker in raw.columns.get_level_values(1):
                df = raw.xs(ticker, axis=1, level=1)
            else:
                continue
            df = df.dropna(how="all")
            if df.empty or "Close" not in df.columns:
                continue
            price_map[ticker] = _stats(df["Close"].squeeze())
        except Exception as exc:
            logger.warning(f"{ticker}: {exc}")

    def _enrich(specs):
        out = []
        for item in specs:
            s = price_map.get(item["ticker"], {})
            if s:
                out.append({**item, **s})
        return out

    commodities     = _enrich(COMMODITIES)
    global_equities = _enrich(GLOBAL_EQUITIES)
    credit_markets  = _enrich(CREDIT_MARKETS)
    global_macro    = _enrich(GLOBAL_MACRO)
    india_macro     = _enrich(INDIA_MACRO)
    regime          = _regime_summary(price_map)

    # Sectors with vs-Nifty relative performance
    nifty_stats = price_map.get("^NSEI", {})
    sectors = []
    for s in SECTORS:
        st = price_map.get(s["ticker"], {})
        if not st:
            continue
        row = {**s, **st}
        for p in ["change_1d", "change_1w", "change_1m", "change_3m"]:
            sv, nv = st.get(p), nifty_stats.get(p)
            if sv is not None and nv is not None:
                row[f"{p}_vs_nifty"] = round(sv - nv, 2)
        sectors.append(row)

    # Macro ratios
    ratios = _compute_ratios(price_map)

    # FII/DII flows
    fii_raw    = fetch_fii_dii()
    fii_parsed = _parse_fii_dii(fii_raw)

    # Cycle scorecards
    us_cycle    = _score_us_cycle(price_map, ratios)
    india_cycle = _score_india_cycle(price_map, fii_parsed)

    payload = {
        "commodities":     commodities,
        "global_equities": global_equities,
        "credit_markets":  credit_markets,
        "global_macro":    global_macro,
        "india_macro":     india_macro,
        "sectors":         sectors,
        "ratios":          ratios,
        "regime":          regime,
        "us_cycle":        us_cycle,
        "india_cycle":     india_cycle,
        "fii_dii":         fii_parsed,
        "generated_at":    datetime.utcnow().isoformat() + "Z",
    }

    _write_json(CACHE_FILE, payload)
    logger.info("Dashboard data cached.")
    return payload
