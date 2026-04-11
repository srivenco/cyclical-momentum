import { useState, useEffect, useCallback } from 'react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
});

async function fetchDashboard(refresh = false) {
  const res = await fetch(`${BASE_URL}/api/macro/dashboard${refresh ? '?refresh=true' : ''}`, {
    headers: getHeaders(),
  });
  if (res.status === 401) { localStorage.removeItem('token'); window.location.reload(); }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      '#080f1e',
  surface: '#0c1829',
  card:    '#0f1f35',
  border:  '#1a3050',
  border2: '#142440',
  blue:    '#00b4d8',
  green:   '#22c55e',
  red:     '#ef4444',
  amber:   '#f59e0b',
  orange:  '#f97316',
  purple:  '#a78bfa',
  muted:   '#4a6080',
  dim:     '#2a4060',
};

const PHASE_COLORS = {
  green:  C.green,
  amber:  C.amber,
  orange: C.orange,
  red:    C.red,
  blue:   C.blue,
  purple: C.purple,
  muted:  C.muted,
};

// ── Cycle phase data ──────────────────────────────────────────────────────────
const US_PHASE_ORDER   = ['RECOVERY', 'EXPANSION', 'LATE CYCLE', 'SLOWDOWN', 'RECESSION'];
const INDIA_PHASE_ORDER = ['RATE CUT CYCLE', 'BULL', 'CAUTIOUS', 'CORRECTION', 'BEAR'];

// Hex colours for wheel segments (matches badge colour intent)
const WHEEL_COLOR = {
  'RECOVERY':       '#00b4d8',
  'EXPANSION':      '#22c55e',
  'LATE CYCLE':     '#f59e0b',
  'SLOWDOWN':       '#f97316',
  'RECESSION':      '#ef4444',
  'RATE CUT CYCLE': '#00b4d8',
  'BULL':           '#22c55e',
  'CAUTIOUS':       '#f59e0b',
  'CORRECTION':     '#f97316',
  'BEAR':           '#ef4444',
};

// Short labels for inside wheel segments (max ~6 chars)
const WHEEL_LABEL = {
  'RECOVERY':       ['RCOV','ERY'],
  'EXPANSION':      ['EXPAN',null],
  'LATE CYCLE':     ['LATE','CYCLE'],
  'SLOWDOWN':       ['SLOW',null],
  'RECESSION':      ['RCESS',null],
  'RATE CUT CYCLE': ['RATE','CUT'],
  'BULL':           ['BULL',null],
  'CAUTIOUS':       ['CAUT','IOUS'],
  'CORRECTION':     ['CORR',null],
  'BEAR':           ['BEAR',null],
};

// Historical sector performance per phase
const HISTORICAL_SECTORS = {
  // ── US phases ──────────────────────────────────────────────────────────────
  'RECOVERY': [
    { name: 'Small Caps',       perf: '+28%', note: 'First to re-rate as credit heals; IWM leads by 3-6 months' },
    { name: 'AI / Tech',        perf: '+25%', note: 'AI capex supercycle adds secular tailwind on top of cyclical recovery' },
    { name: 'Financials',       perf: '+22%', note: 'Net interest margin expansion + credit spread compression' },
    { name: 'Consumer Disc',    perf: '+18%', note: 'Pent-up demand + improving consumer confidence' },
  ],
  'EXPANSION': [
    { name: 'Financials',       perf: '+18%', note: 'Lending volumes peak; M&A cycle opens up' },
    { name: 'Industrials',      perf: '+15%', note: 'CapEx cycle in full swing; re-shoring + AI infra buildout' },
    { name: 'Consumer Disc',    perf: '+14%', note: 'Wages rising, employment full — discretionary spend peaks' },
    { name: 'Materials',        perf: '+12%', note: 'Commodity demand at peak; copper/steel outperform' },
  ],
  'LATE CYCLE': [
    { name: 'Energy',           perf: '+22%', note: 'Demand highest; supply tight; inflation still running' },
    { name: 'Materials',        perf: '+15%', note: 'Hard assets outperform paper; gold starts bid' },
    { name: 'Healthcare',       perf: '+8%',  note: 'Defensive rotation begins; non-cyclical revenue' },
    { name: 'AI Infra',         perf: 'var.', note: 'Data center power/cooling (VST, CEG) remain bid even late-cycle' },
  ],
  'SLOWDOWN': [
    { name: 'Healthcare',       perf: '+5%',  note: 'Inelastic demand; earnings resilience; dividend growers' },
    { name: 'Utilities',        perf: '+3%',  note: 'Rate cut beneficiary; data center power demand adds new floor' },
    { name: 'Staples',          perf: '+2%',  note: 'Pricing power holds; consumer trades down — volume stable' },
    { name: 'Quality Tech',     perf: '0-5%', note: 'MSFT/GOOGL AI revenue offsets macro headwind; mid-tier suffers' },
  ],
  'RECESSION': [
    { name: 'Gold',             perf: '+12%', note: 'Safe haven + falling real rates = double tailwind' },
    { name: 'Long Bonds (TLT)', perf: '+8%',  note: 'Duration play on Fed pivot; 10Y typically falls 100-150bps' },
    { name: 'Utilities',        perf: '+1%',  note: 'Dividend floor; but data center power demand adds support' },
    { name: 'Cash / T-bills',   perf: '—',    note: 'Capital preservation; optionality for recovery re-entry' },
  ],

  // ── India phases — AI-era aware ────────────────────────────────────────────
  'BULL': [
    { name: 'Realty',           perf: '+45%', note: 'Highest beta to credit growth; sentiment drives 2-3× fundamentals' },
    { name: 'Banks',            perf: '+35%', note: 'Credit cycle boom; HDFC Bank, ICICI — clean book + growth' },
    { name: 'Large-cap IT ★',   perf: '+30%', note: 'AI transformation deal wins (TCS AI.Cloud, Infosys Topaz) add growth on top of USD hedge' },
    { name: 'Auto',             perf: '+28%', note: 'Discretionary spend peaks; EV transition adds re-rating optionality' },
  ],
  'CAUTIOUS': [
    { name: 'Large-cap IT ★',   perf: '+18%', note: 'TCS/Infy/HCL: AI deal pipeline > $10B; USD revenue + INR hedge; outperform in slowdowns' },
    { name: 'Agile mid-IT ★',   perf: '+15%', note: 'Persistent Systems, LTIMindtree: AI-native revenue > 20% — re-rating story, not just cycle' },
    { name: 'FMCG',             perf: '+12%', note: 'Volume growth stable; rural recovery adds upside; Nestle, HUL, Dabur' },
    { name: 'Healthcare',       perf: '+6%',  note: 'Defensive + USFDA-approved export names; Sun Pharma, Dr Reddy' },
  ],
  'CORRECTION': [
    { name: 'Gold ETFs / SGB',  perf: '+15%', note: 'INR depreciation amplifies gold returns; SGB has tax advantage on maturity' },
    { name: 'Large-cap IT ★',   perf: '+12%', note: 'TCS, Infosys, HCL — USD revenue + multi-year AI contracts insulate from domestic selloff' },
    { name: 'Pharma (exports)', perf: '+8%',  note: 'Weak rupee directly lifts USD export revenue; Sun, Dr Reddy, Cipla USFDA pipeline' },
    { name: 'Cash (20-30%)',    perf: '—',    note: 'Raise dry powder; correction creates entry points in quality names' },
  ],
  'BEAR': [
    { name: 'Gold',             perf: '+20%', note: 'INR weakness + global risk-off = double tailwind; maximum allocation' },
    { name: 'Large-cap IT ★',   perf: '+8%',  note: 'Relative outperform only — USD revenue + AI deals provide floor, but FII selling caps upside' },
    { name: 'Pharma',           perf: '+3%',  note: 'Defensive domestic revenue; regulated pricing = earnings visibility' },
    { name: 'Cash / Liquid FD', perf: '—',    note: 'Risk-off posture; wait for FII flows to turn and Nifty > 50MA' },
  ],
  'RATE CUT CYCLE': [
    { name: 'Realty',           perf: '+35%', note: 'Highest rate sensitivity; DLF, Prestige, Oberoi — inventory turns fast when EMIs fall' },
    { name: 'NBFCs',            perf: '+30%', note: 'Cost of funds falls first; Bajaj Finance, Chola — spread expansion before banks feel it' },
    { name: 'Banks',            perf: '+25%', note: 'Lagged NIM expansion; HDFC Bank, ICICI — volume + spread improvement cycle' },
    { name: 'Auto',             perf: '+20%', note: 'EMI-driven demand surge; M&M, Maruti; EV penetration adds structural growth layer' },
  ],
};

// ── AI structural overlay ─────────────────────────────────────────────────────
// The AI boom is creating a structural bifurcation within Indian IT that
// overrides the usual cyclical IT playbook. This overlay is market-regime agnostic.
const AI_OVERLAY = {
  headline: 'AI Boom is bifurcating Indian IT',
  subline: 'Large-cap and AI-native mid-caps structurally outperform; headcount-model firms face disruption risk regardless of cycle phase',
  winners: [
    {
      tier: 'Large-cap AI Winners',
      color: 'green',
      stocks: ['TCS', 'Infosys', 'HCL Tech', 'Wipro'],
      thesis: 'Multi-year AI transformation mega-deals (avg $500M–$2B) insulate from short-cycle headcount pressure. TCS AI.Cloud pipeline >$5B; Infosys Topaz signed 60+ GenAI deals. USD revenue + INR depreciation = double hedge in corrections.',
      risk: 'Client AI expectations outpacing delivery speed; pricing pressure as AI reduces billed hours per output',
      action: 'Core holding across ALL India cycle phases',
    },
    {
      tier: 'Agile AI-Native Mid-caps',
      color: 'blue',
      stocks: ['Persistent Systems', 'LTIMindtree', 'KPIT Tech', 'Happiest Minds'],
      thesis: 'Persistent: AI/cloud revenue >20% of mix, growing 40% YoY — pure re-rating story independent of IT cycle. LTIMindtree: AI-led deal wins accelerating. KPIT: EV software + AI niche — secular tailwind. Smaller = more agile on AI transition.',
      risk: 'Concentrated client exposure; mid-caps sell off harder in corrections despite strong fundamentals',
      action: 'Overweight in BULL + CAUTIOUS; hold (not add) in CORRECTION; reduce in BEAR',
    },
  ],
  losers: [
    {
      tier: 'Headcount-Model Risk',
      color: 'red',
      stocks: ['Mid-tier commodity IT', 'BPO-heavy firms', 'Routine-code outsourcing'],
      thesis: 'Firms with >60% revenue from staff augmentation / routine coding face direct substitution from GitHub Copilot, Cursor, Claude Code. Revenue per head compresses; clients push for output-based pricing. No AI re-rating story.',
      risk: 'Revenue erosion could be 15-25% over 3-5 years if they don\'t transition to outcome-based models',
      action: 'Underweight / avoid — structural, not cyclical, headwind',
    },
  ],
  usNote: {
    headline: 'US AI Capex Supercycle',
    points: [
      'Hyperscalers (MSFT, AMZN, GOOGL, META) committing $300B+ combined AI CapEx in 2025 — not cyclical, structural',
      'NVDA, AVGO (ASICs), MRVL — GPU/accelerator supply chain; pricing power structural through at least 2026',
      'Nuclear power (CEG, VST) + data center REITs (EQIX, DLR) — AI infrastructure real assets, cycle-resilient',
      'AI-native SaaS (Palantir, Snowflake, ServiceNow) winning enterprise deals — different risk profile than legacy tech',
    ],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const pct = (n, dec = 2) => {
  if (n == null) return <span style={{ color: C.muted }}>—</span>;
  const pos = n >= 0;
  return <span style={{ color: pos ? C.green : C.red }}>{pos ? '+' : ''}{n.toFixed(dec)}%</span>;
};

const price = (n, decimals) => {
  if (n == null) return '—';
  const d = decimals ?? (n < 10 ? 4 : n < 100 ? 2 : 0);
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};

const trend = (above) => {
  if (above == null) return null;
  return above
    ? <span style={{ color: C.green, fontSize: 10 }}>▲ 200MA</span>
    : <span style={{ color: C.red,   fontSize: 10 }}>▼ 200MA</span>;
};

// ── Next-phase transition playbook ────────────────────────────────────────────
// Key: CURRENT → NEXT transition. These are actionable NOW, before the shift.
const NEXT_PHASE_INVESTING = {

  // ── US transitions ──────────────────────────────────────────────────────────
  'RECOVERY→EXPANSION': {
    start:   ['Financials (JPM, BAC)', 'Industrials (CAT, DE)', 'Consumer Disc (AMZN, HD)', 'Mid/Small Caps (IWM)'],
    reduce:  ['Long bonds (TLT)', 'Gold (GLD)', 'Utilities (XLU)'],
    trigger: 'ISM Manufacturing > 55 · Credit spreads below 300bps · Payrolls accelerating',
    etfs:    ['XLF', 'XLI', 'XLY', 'IWM'],
  },
  'EXPANSION→LATE CYCLE': {
    start:   ['Energy (XOM, CVX)', 'Materials (FCX, NEM)', 'Healthcare (JNJ, UNH)', 'TIPS / Real assets'],
    reduce:  ['Consumer Disc', 'Financials — peak margins', 'High-PE growth names'],
    trigger: 'Yield curve flattening < 50bps · ISM starts rolling over · Wage inflation > 4%',
    etfs:    ['XLE', 'XLB', 'XLV', 'TIP'],
  },
  'LATE CYCLE→SLOWDOWN': {
    start:   ['Healthcare (XLV)', 'Utilities (XLU)', 'Staples (XLP)', 'Quality bonds (LQD)', 'Add TLT'],
    reduce:  ['Cyclicals (XLB, XLE)', 'Small caps', 'Banks — spread risk rising'],
    trigger: 'Yield curve inverts · HYG/LQD ratio peaks · LEI falls 3 months consecutive',
    etfs:    ['XLV', 'XLU', 'XLP', 'TLT', 'LQD'],
  },
  'SLOWDOWN→RECESSION': {
    start:   ['Gold (GLD, IAU)', 'Long bonds (TLT)', 'Cash / T-bills', 'Utilities (XLU)'],
    reduce:  ['All cyclicals', 'Banks', 'Real estate', 'Consumer Disc — discretionary cuts'],
    trigger: 'GDP negative 2 quarters · Unemployment rising > 0.5% · HYG credit spreads blow out',
    etfs:    ['GLD', 'TLT', 'BIL', 'XLU'],
  },
  'RECESSION→RECOVERY': {
    start:   ['Small caps (IWM) — lead cycles', 'Quality Tech (QQQ)', 'Financials (XLF)', 'Consumer Disc (XLY)'],
    reduce:  ['Gold — real rates will rise', 'Long bonds — steepening ahead', 'Staples — expensive defensives'],
    trigger: 'Fed pivot / first rate cut · ISM bottoming · Leading indicators turn up · HYG recovering',
    etfs:    ['IWM', 'XLF', 'XLY', 'QQQ'],
  },

  // ── India transitions ────────────────────────────────────────────────────────
  'RATE CUT CYCLE→BULL': {
    start: [
      'Banks (HDFC Bank, ICICI, Axis) — credit cycle turns; NIM expansion + volume acceleration',
      'NBFCs (Bajaj Finance, Chola) — CoF falls first; spread expansion before banks catch up',
      'Realty (DLF, Prestige, Oberoi) — EMI drop → demand surge; inventory absorption fastest here',
      'Auto (M&M, Maruti) — EMI-driven volume inflection; EV adoption adds structural re-rating layer',
      'Large-cap IT ★ (TCS, Infosys) — AI deals structural; add on any dip as BULL phase re-rates IT too',
    ],
    reduce: [
      'Gold / SGB — real rates rising as growth accelerates; rupee strengthens on FII inflows',
      'Defensive Pharma — rotate out as beta preference rises; hold USFDA export names only',
      'Liquid funds / cash — deploy as market breadth expands and FII flows confirm',
    ],
    trigger: 'Nifty > 200MA for 20+ days · FII net buy > ₹8,000 Cr/month sustained · Credit growth > 13% YoY · India VIX < 14',
    etfs: ['BANKNIFTY ETF', 'NIFTY REALTY ETF', 'NIFTY AUTO ETF', 'NIFTY IT ETF'],
    note: 'Large-cap IT and AI-native mid-caps (Persistent, LTIMindtree) are structural buys regardless of transition — AI deals do not pause for macro cycles.',
  },
  'BULL→CAUTIOUS': {
    start: [
      'Large-cap IT ★ (TCS, Infosys, HCL Tech) — AI mega-deal pipeline >$5B; USD + INR hedge; best quality in slowdowns',
      'AI-native mid-IT ★ (Persistent Systems) — 40%+ AI revenue growth; re-rating independent of Nifty cycle; non-correlated alpha',
      'FMCG (HUL, Nestle, Dabur) — defensive with pricing power; rural recovery volume upside',
      'Healthcare (Sun Pharma, Dr Reddy) — USFDA pipeline + USD export revenue; non-cyclical domestic formulations',
    ],
    reduce: [
      'Realty — peak valuations; Nifty Realty PE 40-60× at cycle tops; trim 40-50% of position',
      'Midcap / smallcap ETFs — froth forming; retail-driven overvaluation compresses during CAUTIOUS phase',
      'Headcount-model mid-IT — avoid building any new position; AI disruption + cycle slowdown = double headwind',
      'Consumer Disc discretionary — premiumisation thesis intact but near-term volume softens',
    ],
    trigger: 'Nifty PE > 24× · FII monthly flow < ₹3,000 Cr for 2+ months · India VIX rising > 15 · Midcap-to-Nifty ratio > 1.4×',
    etfs: ['NIFTY IT ETF', 'NIFTY FMCG ETF', 'NIFTY PHARMA ETF', 'NIFTY50 ETF'],
    note: 'AI era shift: IT is no longer just a defensive play — TCS/Infosys are now GROWTH names in cautious phases due to AI contract wins. Size IT larger than historical playbooks suggest.',
  },
  'CAUTIOUS→CORRECTION': {
    start: [
      'Large-cap IT ★ (TCS, Infosys, HCL Tech, Wipro) — add aggressively on dips; INR weakness lifts USD earnings; AI contracts are multi-year, not cancelled in corrections',
      'Persistent Systems ★ — AI-native, less dependent on headcount; correction = buying opportunity, not business deterioration',
      'Pharma exports (Sun Pharma, Dr Reddy, Cipla) — USFDA pipeline + USD revenue + weak INR = earnings beat setup',
      'Gold ETFs / SGB — INR depreciation amplifies gold returns; SGB: 2.5% coupon + tax-free on maturity',
      'Raise cash to 20-30% — corrections typically -15 to -25%; dry powder for re-entry in quality',
    ],
    reduce: [
      'Banks (especially PSU banks) — NPA cycle risk; credit costs rise; FII selling hits banks first and hardest',
      'Realty — exit remaining position; rate risk + FII selling + sentiment collapse = worst performer in corrections',
      'Consumer Disc — demand compression as sentiment falls; avoid leveraged consumer plays',
      'Mid/smallcap IT with headcount model — business AND cycle headwind simultaneously; 25-40% drawdown risk',
    ],
    trigger: 'Nifty breaks 200MA on volume · FII sell > ₹12,000 Cr in a month · USDINR > 85.5 · India VIX > 18 · BankNifty underperforms Nifty by 5%+ in 1M',
    etfs: ['NIFTY IT ETF', 'NIFTY PHARMA ETF', 'GOLDBEES', 'NIFTY 50 ETF (reduce)'],
    note: '★ Critical: During corrections, large-cap IT bifurcates sharply from mid-tier. TCS/Infosys fall 10-15% but recover fastest; headcount-heavy mid-tiers fall 25-40% and recover slowly due to structural AI headwind on top of cyclical pressure.',
  },
  'CORRECTION→BEAR': {
    start: [
      'Gold (25-35% of portfolio) — INR + global risk-off + falling real rates = triple tailwind; no better asset in bear markets',
      'Large-cap IT ★ (hold; do not add) — USD floor from AI contracts but FII outflows cap upside; only add TCS/Infy on -20%+ dips',
      'Cash / liquid funds (30-40%) — T-bill rates elevated; generate return while waiting; preserve optionality for re-entry',
      'Short-duration debt — park in 1-3Y GSecs or overnight liquid funds; avoid duration risk until RBI signals cuts',
    ],
    reduce: [
      'All cyclicals immediately — Banks, Realty, Auto, Infra, Consumer Disc all fall 30-50% in full bear markets',
      'Midcap/smallcap index — indiscriminate selling; mid-tier IT faces AI disruption + FII selling + margin compression simultaneously',
      'Pharma domestic — hold exports only; domestic pricing regulation + volume slowdown in bears',
      'Any leveraged / high-PE position — multiple compression is most severe; exit before market confirms bear',
    ],
    trigger: 'Nifty -15% from 52-week high · FII cumulative outflow > ₹50,000 Cr in 3 months · USDINR > 87 · Global VIX > 28 · India VIX > 22',
    etfs: ['GOLDBEES / NIPPON GOLD ETF', 'LIQUID BEES', 'NIFTY IT ETF (hold only)'],
    note: 'India bear markets average -30 to -45% peak-to-trough over 8-18 months. Large-cap IT relative performance is +15 to +25% vs Nifty in bears — but absolute returns still negative. AI pipeline provides a floor, not immunity.',
  },
  'BEAR→RATE CUT CYCLE': {
    start: [
      'Banks & NBFCs — accumulate HDFC Bank (PB < 1.5×), Bajaj Finance at distressed valuations; rate-sensitive recover earliest',
      'Realty (DLF, Prestige, Oberoi) — position 6-9 months before rate cut announcement; real estate bottoms early in rate cycle',
      'Auto (M&M, Maruti) — pre-position before volume inflection; EV adds structural re-rating on top of rate-cut demand tailwind',
      'Large-cap IT ★ — add to existing position; AI deals continue; as INR stabilises with FII inflows, earnings upgrade cycle begins',
    ],
    reduce: [
      'Gold — real rates rising on rate cut expectations; reduce by 50% of peak position; keep 10-15% core structural allocation',
      'Cash — start deploying systematically over 3-6 months; SIP-style as signals confirm rather than lump sum',
      'Long-duration debt — rate cut already priced in; duration risk rises as yields stabilise and then normalise',
    ],
    trigger: 'RBI MPC votes to cut (or explicitly signals) · FII net buy for 2 consecutive months · Nifty > 50MA · India VIX < 16 · USDINR < 84',
    etfs: ['BANKNIFTY ETF', 'NIFTY REALTY ETF', 'NIFTY AUTO ETF', 'NIFTY IT ETF'],
    note: '★ AI overlay: As India transitions to rate cut cycle, large-cap IT gets double tailwind — AI deal momentum continues AND domestic recovery brings broader re-rating. LTIMindtree, Persistent Systems historically see 40-60% returns from bear lows into early bull.',
  },
};

const fmtCr = (n) => {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `₹${(abs / 1000).toFixed(1)}K Cr` : `₹${abs.toFixed(0)} Cr`;
  return n >= 0 ? `+${s}` : `-${s}`;
};

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Spark({ data = [], positive, width = 60, height = 24 }) {
  if (!data.length) return null;
  const w = width, h = height, pad = 2;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - (v / 100) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  const color = positive == null ? C.blue : positive ? C.green : C.red;
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── Regime badge ──────────────────────────────────────────────────────────────
function RegimeBadge({ label, color = 'blue' }) {
  const map = {
    green:  [C.green,  'rgba(34,197,94,0.12)',  'rgba(34,197,94,0.25)'],
    red:    [C.red,    'rgba(239,68,68,0.12)',   'rgba(239,68,68,0.25)'],
    amber:  [C.amber,  'rgba(245,158,11,0.12)',  'rgba(245,158,11,0.25)'],
    orange: [C.orange, 'rgba(249,115,22,0.12)',  'rgba(249,115,22,0.25)'],
    blue:   [C.blue,   'rgba(0,180,216,0.12)',   'rgba(0,180,216,0.25)'],
    purple: [C.purple, 'rgba(167,139,250,0.12)', 'rgba(167,139,250,0.25)'],
    muted:  [C.muted,  'rgba(74,96,128,0.12)',   'rgba(74,96,128,0.25)'],
  };
  const [fg, bg, border] = map[color] || map.blue;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                   padding: '2px 8px', borderRadius: 6, backgroundColor: bg,
                   color: fg, border: `1px solid ${border}` }}>
      {label}
    </span>
  );
}

// ── Ticker bar ────────────────────────────────────────────────────────────────
function TickerBar({ data }) {
  const items = [
    ...(data?.india_macro  || []).filter(d => ['nifty','banknifty','usdinr','india_vix'].includes(d.key)),
    ...(data?.commodities  || []).filter(d => ['crude_wti','gold','copper'].includes(d.key)),
    ...(data?.global_macro || []).filter(d => ['us10y','vix','dxy'].includes(d.key)),
    ...(data?.global_equities || []).filter(d => ['sp500','nasdaq'].includes(d.key)),
  ];

  return (
    <div className="flex items-center gap-0 overflow-x-auto shrink-0"
         style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}`,
                  height: 36 }}>
      {items.map((item) => (
        <div key={item.key}
             className="flex items-center gap-2 px-4 shrink-0"
             style={{ borderRight: `1px solid ${C.border2}`, height: '100%' }}>
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>
            {item.name.replace(' Crude','').replace('DXY (Dollar)','DXY').replace('US 10Y Yield','US10Y')}
          </span>
          <span style={{ fontSize: 12, color: 'white', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {price(item.price)}
          </span>
          {item.change_1d != null && (
            <span style={{ fontSize: 11, color: item.change_1d >= 0 ? C.green : C.red, fontVariantNumeric: 'tabular-nums' }}>
              {item.change_1d >= 0 ? '+' : ''}{item.change_1d.toFixed(2)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Commodity card ────────────────────────────────────────────────────────────
function CommodityRow({ item }) {
  const up = (item.change_1d ?? 0) >= 0;
  return (
    <div className="flex items-center gap-3 py-3 px-4"
         style={{ borderBottom: `1px solid ${C.border2}` }}>
      <div style={{ width: 120, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{item.name}</div>
        <div style={{ fontSize: 10, color: C.muted }}>{item.unit}</div>
      </div>
      <div style={{ width: 90, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{price(item.price)}</div>
        <div style={{ fontSize: 11 }}>{pct(item.change_1d)}</div>
      </div>
      <div className="flex gap-4 flex-1" style={{ justifyContent: 'flex-end' }}>
        {[['1W', item.change_1w], ['1M', item.change_1m], ['3M', item.change_3m], ['YTD', item.ytd]].map(([label, val]) => (
          <div key={label} style={{ textAlign: 'right', minWidth: 48 }}>
            <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
            <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{pct(val)}</div>
          </div>
        ))}
      </div>
      <div style={{ width: 72, textAlign: 'center' }}>
        {item.above_200ma != null && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
            backgroundColor: item.above_200ma ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: item.above_200ma ? C.green : C.red,
            border: `1px solid ${item.above_200ma ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            {item.above_200ma ? '▲ BULL' : '▼ BEAR'}
          </span>
        )}
      </div>
      <div style={{ width: 64, flexShrink: 0 }}>
        <Spark data={item.sparkline || []} positive={up} />
      </div>
    </div>
  );
}

// ── Macro stat card ───────────────────────────────────────────────────────────
function MacroStat({ item, highlight }) {
  const up = (item.change_1d ?? 0) >= 0;
  return (
    <div className="rounded-xl p-4"
         style={{ backgroundColor: highlight ? 'rgba(0,180,216,0.05)' : C.card,
                  border: `1px solid ${highlight ? 'rgba(0,180,216,0.2)' : C.border}` }}>
      <div className="flex items-start justify-between mb-2">
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>{item.name}</div>
        {trend(item.above_200ma)}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'white', fontVariantNumeric: 'tabular-nums' }}>
        {price(item.price)}<span style={{ fontSize: 11, color: C.muted, marginLeft: 3 }}>{item.unit}</span>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <div style={{ fontSize: 11 }}>{pct(item.change_1d)} 1D</div>
        <div style={{ fontSize: 11 }}>{pct(item.change_1m)} 1M</div>
        {item.change_3m != null && <div style={{ fontSize: 11 }}>{pct(item.change_3m)} 3M</div>}
      </div>
      <div className="mt-2">
        <Spark data={item.sparkline || []} positive={(item.change_1m ?? 0) >= 0} />
      </div>
    </div>
  );
}

// ── Global equity card ────────────────────────────────────────────────────────
const REGION_COLORS = { US: C.blue, Asia: C.purple, Europe: C.amber, EM: C.orange };

function GlobalEquityCard({ item }) {
  const up1d = (item.change_1d ?? 0) >= 0;
  const up1m = (item.change_1m ?? 0) >= 0;
  const regionColor = REGION_COLORS[item.region] || C.muted;
  return (
    <div className="rounded-xl p-3"
         style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{item.name}</div>
          <div style={{ fontSize: 10, color: regionColor, marginTop: 1 }}>{item.region}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          {item.above_200ma != null && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
              backgroundColor: item.above_200ma ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: item.above_200ma ? C.green : C.red,
              border: `1px solid ${item.above_200ma ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}>
              {item.above_200ma ? '▲' : '▼'} 200MA
            </span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'white', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
        {price(item.price)}
      </div>
      <div className="flex gap-3 mt-1">
        <div style={{ fontSize: 11 }}>{pct(item.change_1d)} 1D</div>
        <div style={{ fontSize: 11 }}>{pct(item.change_1m)} 1M</div>
        {item.ytd != null && <div style={{ fontSize: 11 }}>{pct(item.ytd)} YTD</div>}
      </div>
      <div className="mt-2">
        <Spark data={item.sparkline || []} positive={up1m} width={80} height={20} />
      </div>
    </div>
  );
}

// ── Macro ratio card ──────────────────────────────────────────────────────────
function MacroRatioCard({ ratio }) {
  const color = ratio.signal_color || 'muted';
  const fgColor = PHASE_COLORS[color] || C.muted;
  const bgColor = color === 'green'  ? 'rgba(34,197,94,0.06)'
                : color === 'red'    ? 'rgba(239,68,68,0.06)'
                : color === 'amber'  ? 'rgba(245,158,11,0.06)'
                : color === 'blue'   ? 'rgba(0,180,216,0.06)'
                : 'rgba(74,96,128,0.06)';
  const borderColor = color === 'green'  ? 'rgba(34,197,94,0.2)'
                    : color === 'red'    ? 'rgba(239,68,68,0.2)'
                    : color === 'amber'  ? 'rgba(245,158,11,0.2)'
                    : color === 'blue'   ? 'rgba(0,180,216,0.2)'
                    : C.border;

  return (
    <div className="rounded-xl p-4 flex flex-col gap-2"
         style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}` }}>
      <div className="flex items-center justify-between">
        <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{ratio.name}</div>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
          backgroundColor: ratio.rising ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
          color: ratio.rising ? C.green : C.red,
        }}>
          {ratio.rising ? '▲ Rising' : '▼ Falling'}
        </span>
      </div>

      <div style={{ fontSize: 20, fontWeight: 700, color: 'white', fontVariantNumeric: 'tabular-nums' }}>
        {ratio.value?.toFixed(ratio.key === 'dxy_crude' ? 2 : 4) ?? '—'}
      </div>

      <div className="flex gap-3">
        <div style={{ fontSize: 11 }}>{pct(ratio.change_1m)} 1M</div>
        <div style={{ fontSize: 11 }}>{pct(ratio.change_3m)} 3M</div>
      </div>

      <div style={{
        fontSize: 11, color: fgColor, lineHeight: 1.4,
        borderTop: `1px solid ${borderColor}`, paddingTop: 8, marginTop: 2,
      }}>
        {ratio.signal}
      </div>
    </div>
  );
}

// ── FII/DII flows panel ───────────────────────────────────────────────────────
function FIIDIIPanel({ fiiDii }) {
  if (!fiiDii || fiiDii.length === 0) {
    return (
      <div className="rounded-xl p-4"
           style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'white', marginBottom: 8 }}>FII / DII Flows</div>
        <div style={{ fontSize: 12, color: C.muted }}>No data — NSE scrape unavailable</div>
      </div>
    );
  }

  const fii = fiiDii.find(r => r.category?.toUpperCase().includes('FII') || r.category?.toUpperCase().includes('FPI'));
  const dii = fiiDii.find(r => r.category?.toUpperCase().includes('DII'));
  const date = fii?.date || dii?.date || '';

  const FlowRow = ({ label, data, color }) => {
    if (!data) return null;
    return (
      <div className="rounded-lg p-3" style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-2">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>{label}</div>
          <div style={{
            fontSize: 13, fontWeight: 700, color,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtCr(data.net)}
          </div>
        </div>
        <div className="flex gap-4">
          <div>
            <div style={{ fontSize: 9, color: C.muted }}>BUY</div>
            <div style={{ fontSize: 11, color: C.green, fontVariantNumeric: 'tabular-nums' }}>
              ₹{(data.buy / 1000).toFixed(1)}K Cr
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: C.muted }}>SELL</div>
            <div style={{ fontSize: 11, color: C.red, fontVariantNumeric: 'tabular-nums' }}>
              ₹{(data.sell / 1000).toFixed(1)}K Cr
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl overflow-hidden"
         style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>FII / DII Flows</div>
        {date && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Cash market · {date}</div>}
      </div>
      <div className="p-4 flex flex-col gap-3">
        <FlowRow
          label="FII / FPI"
          data={fii}
          color={fii?.net >= 0 ? C.green : C.red}
        />
        <FlowRow
          label="DII"
          data={dii}
          color={dii?.net >= 0 ? C.green : C.red}
        />
        {fii && dii && (
          <div style={{ fontSize: 10, color: C.muted, textAlign: 'center', paddingTop: 4 }}>
            Net combined:{' '}
            <span style={{ color: (fii.net + dii.net) >= 0 ? C.green : C.red, fontWeight: 700 }}>
              {fmtCr(fii.net + dii.net)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cycle wheel SVG ───────────────────────────────────────────────────────────
// ── AI Overlay panel ──────────────────────────────────────────────────────────
function AiOverlayPanel({ market }) {
  const [expanded, setExpanded] = useState(false);
  const overlay = market === 'India' ? AI_OVERLAY : null;
  if (!overlay) return null; // US overlay is shown inline in suggestions

  return (
    <div style={{
      margin: '0', borderTop: `1px solid ${C.border}`,
      background: 'linear-gradient(135deg, rgba(167,139,250,0.05) 0%, rgba(0,180,216,0.03) 100%)',
    }}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%', textAlign: 'left', padding: '10px 16px',
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
            backgroundColor: 'rgba(167,139,250,0.2)', color: C.purple,
            border: '1px solid rgba(167,139,250,0.4)', letterSpacing: '0.06em',
          }}>AI</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.purple }}>
            {overlay.headline}
          </span>
        </div>
        <span style={{ fontSize: 10, color: C.muted }}>{expanded ? '▲' : '▼'}</span>
      </button>
      <div style={{ fontSize: 10, color: C.muted, padding: '0 16px 8px', lineHeight: 1.4 }}>
        {overlay.subline}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Winners */}
          {overlay.winners.map((tier, i) => (
            <div key={i} style={{
              padding: '10px 12px', borderRadius: 8,
              backgroundColor: tier.color === 'green' ? 'rgba(34,197,94,0.06)' : 'rgba(0,180,216,0.06)',
              border: `1px solid ${tier.color === 'green' ? 'rgba(34,197,94,0.2)' : 'rgba(0,180,216,0.2)'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                  backgroundColor: tier.color === 'green' ? 'rgba(34,197,94,0.2)' : 'rgba(0,180,216,0.2)',
                  color: tier.color === 'green' ? C.green : C.blue,
                }}>★ BUY</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>{tier.tier}</span>
              </div>
              {/* Stock tags */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {tier.stocks.map((s, j) => (
                  <span key={j} style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600,
                    backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.85)',
                    border: `1px solid ${C.border}`,
                  }}>{s}</span>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: 4 }}>
                {tier.thesis}
              </div>
              <div style={{ fontSize: 9, color: C.amber, lineHeight: 1.4 }}>
                ⚠ Risk: {tier.risk}
              </div>
              <div style={{
                fontSize: 9, fontWeight: 700, marginTop: 5,
                color: tier.color === 'green' ? C.green : C.blue,
              }}>
                → {tier.action}
              </div>
            </div>
          ))}

          {/* Losers */}
          {overlay.losers.map((tier, i) => (
            <div key={i} style={{
              padding: '10px 12px', borderRadius: 8,
              backgroundColor: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                  backgroundColor: 'rgba(239,68,68,0.2)', color: C.red,
                }}>✕ AVOID</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'white' }}>{tier.tier}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                {tier.stocks.map((s, j) => (
                  <span key={j} style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4, fontWeight: 600,
                    backgroundColor: 'rgba(239,68,68,0.08)', color: 'rgba(255,255,255,0.75)',
                    border: '1px solid rgba(239,68,68,0.2)',
                  }}>{s}</span>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, marginBottom: 4 }}>
                {tier.thesis}
              </div>
              <div style={{ fontSize: 9, color: C.red, lineHeight: 1.4, fontWeight: 600 }}>
                → {tier.action}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CycleWheel({ phases, currentPhase }) {
  const size = 220;
  const cx = 110, cy = 110;
  const R = 92, r = 54;
  const n = phases.length;
  const degEach = 360 / n;
  const gap = 3; // degrees gap between segments

  const toRad = d => d * Math.PI / 180;
  const xy = (radius, deg) => [
    cx + radius * Math.cos(toRad(deg)),
    cy + radius * Math.sin(toRad(deg)),
  ];

  const arcPath = (startD, endD) => {
    const [x1, y1] = xy(R, startD);
    const [x2, y2] = xy(R, endD);
    const [x3, y3] = xy(r, endD);
    const [x4, y4] = xy(r, startD);
    const large = (endD - startD > 180) ? 1 : 0;
    return `M${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${x3},${y3} A${r},${r} 0 ${large},0 ${x4},${y4} Z`;
  };

  const currentIdx = phases.indexOf(currentPhase);
  const nextPhase  = phases[(currentIdx + 1) % n];
  const nextColor  = WHEEL_COLOR[nextPhase] || C.muted;
  const nowColor   = WHEEL_COLOR[currentPhase] || C.muted;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {phases.map((phase, i) => {
        const startDeg = -90 + i * degEach + gap / 2;
        const endDeg   = -90 + (i + 1) * degEach - gap / 2;
        const midDeg   = -90 + i * degEach + degEach / 2;
        const midR     = (R + r) / 2;
        const isCurrent = phase === currentPhase;
        const isNext    = phase === nextPhase;
        const color = WHEEL_COLOR[phase] || C.muted;
        const opacity = isCurrent ? 1 : isNext ? 0.45 : 0.18;

        const [lx, ly] = xy(midR, midDeg);
        const labels = WHEEL_LABEL[phase] || [phase.slice(0, 5), null];

        return (
          <g key={phase}>
            {/* Glow ring for current */}
            {isCurrent && (
              <path d={arcPath(startDeg, endDeg)}
                    fill={color} fillOpacity={0.25}
                    stroke={color} strokeWidth={3} strokeOpacity={0.5}
                    filter="url(#glow)" />
            )}
            {/* Segment */}
            <path d={arcPath(startDeg, endDeg)}
                  fill={color} fillOpacity={opacity}
                  stroke={color} strokeWidth={isCurrent ? 1.5 : 0.5}
                  strokeOpacity={isCurrent ? 0.9 : 0.4} />

            {/* Next-phase dashed border */}
            {isNext && (
              <path d={arcPath(startDeg, endDeg)}
                    fill="none"
                    stroke={color} strokeWidth={1.5} strokeOpacity={0.7}
                    strokeDasharray="3,2" />
            )}

            {/* Labels inside segment */}
            <text x={lx} y={ly - (labels[1] ? 4 : 0)}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={isCurrent ? 'white' : color}
                  fillOpacity={isCurrent ? 1 : opacity + 0.2}
                  fontSize={isCurrent ? 8 : 7}
                  fontWeight={isCurrent ? 700 : 500}
                  fontFamily="-apple-system,sans-serif">
              {labels[0]}
            </text>
            {labels[1] && (
              <text x={lx} y={ly + 8}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={isCurrent ? 'white' : color}
                    fillOpacity={isCurrent ? 1 : opacity + 0.2}
                    fontSize={isCurrent ? 8 : 7}
                    fontWeight={isCurrent ? 700 : 500}
                    fontFamily="-apple-system,sans-serif">
                {labels[1]}
              </text>
            )}
          </g>
        );
      })}

      {/* Center: current phase */}
      <circle cx={cx} cy={cy} r={r - 4} fill={C.bg} />
      <text x={cx} y={cy - 10} textAnchor="middle"
            fill={C.muted} fontSize={8} fontFamily="-apple-system,sans-serif">
        NOW
      </text>
      <text x={cx} y={cy + 3} textAnchor="middle"
            fill={nowColor} fontSize={9} fontWeight={700}
            fontFamily="-apple-system,sans-serif">
        {(currentPhase || '').split(' ').slice(0, 2).join(' ')}
      </text>
      {(currentPhase || '').split(' ').length > 2 && (
        <text x={cx} y={cy + 14} textAnchor="middle"
              fill={nowColor} fontSize={9} fontWeight={700}
              fontFamily="-apple-system,sans-serif">
          {(currentPhase || '').split(' ').slice(2).join(' ')}
        </text>
      )}

      {/* Next arrow */}
      <text x={cx} y={cy + 26} textAnchor="middle"
            fill={C.dim} fontSize={7} fontFamily="-apple-system,sans-serif">
        ▸ next:
      </text>
      <text x={cx} y={cy + 36} textAnchor="middle"
            fill={nextColor} fontSize={8} fontWeight={600}
            fontFamily="-apple-system,sans-serif">
        {(nextPhase || '').split(' ').slice(0, 2).join(' ')}
      </text>

      {/* Clockwise arrow around outer ring */}
      {(() => {
        const arrowDeg = -90 + (currentIdx + 0.5) * degEach + degEach + 4;
        const [ax, ay] = xy(R + 8, arrowDeg);
        return (
          <text x={ax} y={ay} textAnchor="middle" dominantBaseline="middle"
                fill={C.muted} fontSize={8} fontFamily="-apple-system,sans-serif">
            ↻
          </text>
        );
      })()}
    </svg>
  );
}

// ── Cycle scorecard panel ─────────────────────────────────────────────────────
function CycleScorecardPanel({ cycle, market }) {
  if (!cycle) return null;

  const phaseOrder  = market === 'India' ? INDIA_PHASE_ORDER : US_PHASE_ORDER;
  const phaseColor  = PHASE_COLORS[cycle.color] || C.muted;
  const borderGlow  = cycle.color === 'green'  ? 'rgba(34,197,94,0.25)'
                    : cycle.color === 'red'    ? 'rgba(239,68,68,0.25)'
                    : cycle.color === 'amber'  ? 'rgba(245,158,11,0.25)'
                    : cycle.color === 'orange' ? 'rgba(249,115,22,0.25)'
                    : cycle.color === 'blue'   ? 'rgba(0,180,216,0.25)'
                    : C.border;

  const score    = cycle.score_pct ?? 50;
  const barColor = score >= 65 ? C.green : score >= 50 ? C.amber : score >= 35 ? C.orange : C.red;

  const currentIdx      = phaseOrder.indexOf(cycle.phase);
  const nextPhase       = phaseOrder[(currentIdx + 1) % phaseOrder.length];
  const nextColor       = WHEEL_COLOR[nextPhase] || C.muted;
  const historicalSectors = HISTORICAL_SECTORS[cycle.phase] || [];
  const transitionKey   = `${cycle.phase}→${nextPhase}`;
  const nextInvesting   = NEXT_PHASE_INVESTING[transitionKey] || null;

  return (
    <div className="rounded-xl overflow-hidden flex flex-col"
         style={{ border: `1px solid ${borderGlow}`, backgroundColor: C.card }}>

      {/* ── Header strip ── */}
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between">
          <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>
            {market} Cycle
          </div>
          <RegimeBadge label={cycle.phase} color={cycle.color} />
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 3, lineHeight: 1.4 }}>
          {cycle.description}
        </div>
        {/* Score bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontSize: 9, color: C.muted }}>BEAR</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: barColor }}>{score}% Bullish</span>
            <span style={{ fontSize: 9, color: C.muted }}>BULL</span>
          </div>
          <div style={{ height: 5, backgroundColor: C.dim, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 3, width: `${score}%`,
                          backgroundColor: barColor, transition: 'width 0.5s ease' }} />
          </div>
        </div>
      </div>

      {/* ── Main body: wheel + signals ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', borderBottom: `1px solid ${C.border}` }}>

        {/* Wheel */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                      padding: '12px 8px 8px', borderRight: `1px solid ${C.border}` }}>
          <CycleWheel phases={phaseOrder} currentPhase={cycle.phase} />
          {/* Next phase callout */}
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 3 }}>TYPICALLY TRANSITIONS TO</div>
            <div style={{
              fontSize: 11, fontWeight: 700, color: nextColor,
              padding: '3px 10px', borderRadius: 6,
              backgroundColor: `${nextColor}18`,
              border: `1px dashed ${nextColor}60`,
              display: 'inline-block',
            }}>
              {nextPhase} →
            </div>
          </div>
        </div>

        {/* Signal matrix */}
        <div style={{ padding: '12px 14px', overflow: 'hidden' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.muted,
                        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Signal Matrix
          </div>
          <div className="flex flex-col gap-0">
            {(cycle.signals || []).map((sig, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 0',
                borderBottom: `1px solid ${C.border2}`,
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                  backgroundColor: sig.bullish === true  ? C.green
                                 : sig.bullish === false ? C.red
                                 : C.muted,
                  boxShadow: sig.bullish === true  ? `0 0 5px ${C.green}80`
                            : sig.bullish === false ? `0 0 5px ${C.red}80`
                            : 'none',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'white', lineHeight: 1.3 }}>{sig.label}</div>
                  <div style={{ fontSize: 9, color: C.muted, lineHeight: 1.3, marginTop: 1 }}>{sig.reading}</div>
                </div>
                {sig.weight > 1 && (
                  <div style={{ fontSize: 9, color: C.dim, flexShrink: 0, paddingTop: 2 }}>×{sig.weight}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Historical best sectors ── */}
      {historicalSectors.length > 0 && (
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: C.muted,
                        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            Historically Best Sectors · {cycle.phase}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {historicalSectors.map((s, i) => (
              <div key={i} style={{
                padding: '8px 10px', borderRadius: 8,
                backgroundColor: C.surface, border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: phaseColor }}>{s.perf}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'white', marginTop: 2 }}>{s.name}</div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 2, lineHeight: 1.3 }}>{s.note}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sector playbook ── */}
      <div style={{ padding: '12px 16px', borderBottom: nextInvesting ? `1px solid ${C.border}` : 'none' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: C.muted,
                      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Current Playbook
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: C.green, fontWeight: 600, marginBottom: 4 }}>▲ Overweight</div>
            <div className="flex flex-col gap-1">
              {(cycle.overweight || []).map((s, i) => (
                <span key={i} style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 4, display: 'inline-block',
                  backgroundColor: 'rgba(34,197,94,0.1)',
                  color: C.green, border: '1px solid rgba(34,197,94,0.2)',
                }}>{s}</span>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.red, fontWeight: 600, marginBottom: 4 }}>▼ Underweight</div>
            <div className="flex flex-col gap-1">
              {(cycle.underweight || []).map((s, i) => (
                <span key={i} style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 4, display: 'inline-block',
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  color: C.red, border: '1px solid rgba(239,68,68,0.2)',
                }}>{s}</span>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.amber, fontWeight: 600, marginBottom: 4 }}>◉ Watch</div>
            <div className="flex flex-col gap-1">
              {(cycle.watch || []).map((s, i) => (
                <span key={i} style={{
                  fontSize: 10, padding: '2px 7px', borderRadius: 4, display: 'inline-block',
                  backgroundColor: 'rgba(245,158,11,0.1)',
                  color: C.amber, border: '1px solid rgba(245,158,11,0.2)',
                }}>{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Position for next phase ── */}
      {nextInvesting && (
        <div style={{
          padding: '14px 16px',
          background: `linear-gradient(135deg, ${nextColor}08 0%, transparent 100%)`,
          borderTop: `2px dashed ${nextColor}40`,
        }}>
          {/* Title */}
          <div className="flex items-center gap-2 mb-10" style={{ marginBottom: 10 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: nextColor,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              ▸ Position NOW for
            </div>
            <div style={{
              fontSize: 11, fontWeight: 800, color: nextColor,
              padding: '2px 8px', borderRadius: 5,
              backgroundColor: `${nextColor}18`,
              border: `1px solid ${nextColor}50`,
            }}>
              {nextPhase}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {/* Start buying */}
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              backgroundColor: 'rgba(34,197,94,0.06)',
              border: '1px solid rgba(34,197,94,0.18)',
            }}>
              <div style={{ fontSize: 10, color: C.green, fontWeight: 700, marginBottom: 6 }}>
                ✦ Start Buying
              </div>
              <div className="flex flex-col gap-1">
                {(nextInvesting.start || []).map((s, i) => (
                  <div key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>
                    · {s}
                  </div>
                ))}
              </div>
              {nextInvesting.etfs?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-6" style={{ marginTop: 8 }}>
                  {nextInvesting.etfs.map((e, i) => (
                    <span key={i} style={{
                      fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                      backgroundColor: 'rgba(34,197,94,0.15)',
                      color: C.green, border: '1px solid rgba(34,197,94,0.3)',
                    }}>{e}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Start reducing */}
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              backgroundColor: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.18)',
            }}>
              <div style={{ fontSize: 10, color: C.red, fontWeight: 700, marginBottom: 6 }}>
                ✦ Start Reducing
              </div>
              <div className="flex flex-col gap-1">
                {(nextInvesting.reduce || []).map((s, i) => (
                  <div key={i} style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>
                    · {s}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Trigger to confirm transition */}
          {nextInvesting.trigger && (
            <div style={{
              padding: '8px 12px', borderRadius: 7, marginBottom: 8,
              backgroundColor: `${nextColor}0d`,
              border: `1px solid ${nextColor}30`,
            }}>
              <div style={{ fontSize: 9, color: nextColor, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                ⚡ Confirm Transition When
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                {nextInvesting.trigger}
              </div>
            </div>
          )}

          {/* Analyst note */}
          {nextInvesting.note && (
            <div style={{
              padding: '8px 12px', borderRadius: 7,
              backgroundColor: 'rgba(167,139,250,0.06)',
              border: '1px solid rgba(167,139,250,0.2)',
            }}>
              <div style={{ fontSize: 9, color: C.purple, fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                ★ Analyst Note
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>
                {nextInvesting.note}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── AI structural overlay (India only) ── */}
      <AiOverlayPanel market={market} />
    </div>
  );
}

// ── Sector heatmap ────────────────────────────────────────────────────────────
function HeatCell({ sector, period, vsNifty }) {
  const raw = vsNifty
    ? sector[`${period}_vs_nifty`]
    : sector[period];

  if (raw == null) {
    return (
      <div className="rounded-lg flex flex-col items-center justify-center p-2"
           style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, minHeight: 64 }}>
        <div style={{ fontSize: 11, color: C.muted }}>{sector.name}</div>
        <div style={{ fontSize: 10, color: C.dim }}>—</div>
      </div>
    );
  }

  const intensity = Math.min(Math.abs(raw) / 5, 1);
  const bg = raw >= 0
    ? `rgba(34,197,94,${0.08 + intensity * 0.25})`
    : `rgba(239,68,68,${0.08 + intensity * 0.25})`;
  const fg = raw >= 0 ? C.green : C.red;
  const border = raw >= 0
    ? `rgba(34,197,94,${0.15 + intensity * 0.3})`
    : `rgba(239,68,68,${0.15 + intensity * 0.3})`;

  return (
    <div className="rounded-lg flex flex-col items-center justify-center p-2 cursor-default"
         style={{ backgroundColor: bg, border: `1px solid ${border}`, minHeight: 64 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'white' }}>{sector.name}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: fg, fontVariantNumeric: 'tabular-nums' }}>
        {raw >= 0 ? '+' : ''}{raw.toFixed(1)}%
      </div>
      {vsNifty && (
        <div style={{ fontSize: 9, color: fg, opacity: 0.8 }}>vs Nifty</div>
      )}
    </div>
  );
}

function SectorHeatmap({ sectors }) {
  const [period, setPeriod] = useState('change_1m');
  const [vsNifty, setVsNifty] = useState(false);

  const PERIODS = [
    { key: 'change_1d', label: '1D' },
    { key: 'change_1w', label: '1W' },
    { key: 'change_1m', label: '1M' },
    { key: 'change_3m', label: '3M' },
  ];

  return (
    <div className="rounded-xl overflow-hidden"
         style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
      <div className="flex items-center justify-between px-4 py-3"
           style={{ borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>NSE Sector Heatmap</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVsNifty(v => !v)}
            className="text-xs px-3 py-1 rounded-lg transition-colors"
            style={{
              backgroundColor: vsNifty ? 'rgba(0,180,216,0.15)' : C.surface,
              color: vsNifty ? C.blue : C.muted,
              border: `1px solid ${vsNifty ? 'rgba(0,180,216,0.3)' : C.border}`,
            }}>
            vs Nifty
          </button>
          <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                      className="text-xs px-3 py-1 transition-colors"
                      style={{
                        backgroundColor: period === p.key ? C.blue : 'transparent',
                        color: period === p.key ? '#0A1628' : C.muted,
                        fontWeight: period === p.key ? 700 : 400,
                      }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="p-4 grid grid-cols-5 gap-2">
        {sectors.map(s => (
          <HeatCell key={s.key} sector={s} period={period} vsNifty={vsNifty} />
        ))}
      </div>
    </div>
  );
}

// ── Regime summary panel ──────────────────────────────────────────────────────
function RegimePanel({ regime }) {
  if (!regime) return null;

  const items = [
    {
      label: 'Equity Trend',
      value: regime.nifty_trend,
      color: regime.nifty_trend === 'BULL' ? 'green' : 'red',
      sub: regime.nifty_vs_200ma != null
        ? `${regime.nifty_vs_200ma > 0 ? '+' : ''}${regime.nifty_vs_200ma.toFixed(1)}% vs 200MA`
        : null,
    },
    {
      label: 'Rate Regime',
      value: regime.rate_regime,
      color: regime.rate_regime === 'CUT' ? 'green' : regime.rate_regime === 'HIKE' ? 'amber' : 'muted',
      sub: regime.us10y_3m_change != null
        ? `US10Y ${regime.us10y_3m_change > 0 ? '+' : ''}${regime.us10y_3m_change.toFixed(2)}% 3M`
        : null,
    },
    {
      label: 'Commodity Cycle',
      value: regime.commodity_cycle,
      color: regime.commodity_cycle === 'BULL' ? 'green' : 'red',
      sub: null,
    },
    {
      label: 'Dollar',
      value: regime.dollar_trend,
      color: regime.dollar_trend === 'STRONG' ? 'amber' : regime.dollar_trend === 'WEAK' ? 'purple' : 'muted',
      sub: null,
    },
    {
      label: 'Risk Appetite',
      value: regime.risk_regime,
      color: regime.risk_regime === 'RISK ON' ? 'green'
           : regime.risk_regime === 'CAUTIOUS' ? 'amber'
           : 'red',
      sub: null,
    },
    {
      label: 'Yield Curve',
      value: regime.yield_curve != null
        ? `${regime.yield_curve > 0 ? '+' : ''}${regime.yield_curve.toFixed(2)}%`
        : '—',
      color: regime.curve_inverted ? 'red' : 'green',
      sub: regime.curve_inverted ? 'Inverted — recession signal' : 'Normal',
    },
  ];

  return (
    <div className="rounded-xl overflow-hidden"
         style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
      <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>Macro Regime</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
          Cyclical investment framework signals
        </div>
      </div>
      <div className="p-4 grid grid-cols-2 gap-3">
        {items.map(item => (
          <div key={item.label} className="rounded-lg p-3"
               style={{ backgroundColor: C.surface, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{item.label}</div>
            <RegimeBadge label={item.value || '—'} color={item.color} />
            {item.sub && (
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{item.sub}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function MacroDashboard({ onLogout }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const d = await fetchDashboard(refresh);
      setData(d);
      setLastUpdate(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
                    gap: 12 }}>
        <div style={{ width: 32, height: 32, border: `2px solid ${C.border}`,
                      borderTop: `2px solid ${C.blue}`, borderRadius: '50%',
                      animation: 'spin 1s linear infinite' }} />
        <div style={{ fontSize: 13, color: C.muted }}>
          Fetching macro data…
          <span style={{ fontSize: 11, display: 'block', marginTop: 4, textAlign: 'center' }}>
            First load ~20s · Cached for 15 min after
          </span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex',
                    alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: C.red, fontSize: 14, marginBottom: 12 }}>{error}</div>
          <button onClick={() => load()} style={{ color: C.blue, fontSize: 13, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const {
    commodities = [], global_macro = [], india_macro = [], sectors = [], regime = {},
    global_equities = [], credit_markets = [], ratios = [],
    us_cycle = null, india_cycle = null, fii_dii = [],
  } = data || {};

  const indiaPrimary = india_macro.filter(d => ['nifty','banknifty','midcap'].includes(d.key));
  const indiaSub     = india_macro.filter(d => ['india_vix','usdinr'].includes(d.key));

  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex',
                  flexDirection: 'column', fontFamily: '-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      {/* ── Header ── */}
      <header style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}`,
                       padding: '10px 20px', display: 'flex', alignItems: 'center',
                       justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, backgroundColor: '#162848',
                        border: `1px solid ${C.blue}`, borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={C.blue} strokeWidth="2.5">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'white', lineHeight: 1 }}>
              SrivenCap Macro
            </div>
            <div style={{ fontSize: 10, color: C.muted }}>Cyclical investing intelligence</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastUpdate && (
            <div style={{ fontSize: 10, color: C.muted }}>
              Updated {lastUpdate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6,
                     backgroundColor: 'rgba(0,180,216,0.08)', color: C.blue,
                     border: `1px solid rgba(0,180,216,0.2)`, cursor: 'pointer' }}>
            {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
          <button
            onClick={onLogout}
            style={{ fontSize: 11, padding: '5px 12px', borderRadius: 6,
                     color: C.muted, border: `1px solid ${C.border}`,
                     backgroundColor: 'transparent', cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </header>

      {/* ── Ticker bar ── */}
      <TickerBar data={data} />

      {/* ── Main content ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex',
                    flexDirection: 'column', gap: 16 }}>

        {/* ── Row 1: Regime + India + Global Macro ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr 1fr', gap: 16 }}>

          <RegimePanel regime={regime} />

          {/* India Macro */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted,
                          textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              India Markets
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {indiaPrimary.map(item => <MacroStat key={item.key} item={item} highlight={item.key === 'nifty'} />)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {indiaSub.map(item => <MacroStat key={item.key} item={item} />)}
            </div>
          </div>

          {/* Global Macro */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted,
                          textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Global Macro
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {global_macro.map(item => <MacroStat key={item.key} item={item} highlight={item.key === 'vix'} />)}
            </div>
            {regime.yield_curve != null && (
              <div className="rounded-xl p-3"
                   style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>10Y – 2Y Yield Curve</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18, fontWeight: 700,
                                 color: regime.curve_inverted ? C.red : C.green }}>
                    {regime.yield_curve > 0 ? '+' : ''}{regime.yield_curve.toFixed(2)}%
                  </span>
                  <RegimeBadge
                    label={regime.curve_inverted ? 'INVERTED' : 'NORMAL'}
                    color={regime.curve_inverted ? 'red' : 'green'}
                  />
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                  {regime.curve_inverted
                    ? 'Inversion historically precedes recession by 12–18 months'
                    : 'Normal curve — no near-term recession signal'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: Cycle Scorecards ── */}
        {(india_cycle || us_cycle) && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted,
                          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Business Cycle Positioning
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <CycleScorecardPanel cycle={india_cycle} market="India" />
              <CycleScorecardPanel cycle={us_cycle} market="US" />
            </div>
          </div>
        )}

        {/* ── Row 3: Macro Ratios + FII/DII ── */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted,
                        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Key Macro Ratios
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            {/* Ratios grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {ratios.map(r => <MacroRatioCard key={r.key} ratio={r} />)}
            </div>
            {/* FII/DII */}
            <FIIDIIPanel fiiDii={fii_dii} />
          </div>
        </div>

        {/* ── Row 4: Global Equities ── */}
        {global_equities.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted,
                          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Global Equity Pulse
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
              {global_equities.map(item => <GlobalEquityCard key={item.key} item={item} />)}
            </div>
          </div>
        )}

        {/* ── Row 5: Commodities ── */}
        <div className="rounded-xl overflow-hidden"
             style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>Commodities</div>
            <div style={{ display: 'flex', gap: 24, fontSize: 10, color: C.muted }}>
              {['Price', '1D', '1W', '1M', '3M', 'YTD', 'Trend', 'Chart'].map(h => (
                <span key={h}>{h}</span>
              ))}
            </div>
          </div>
          {commodities.map(c => <CommodityRow key={c.key} item={c} />)}
        </div>

        {/* ── Row 6: Sector heatmap ── */}
        <SectorHeatmap sectors={sectors} />

        {/* Footer */}
        <div style={{ fontSize: 10, color: C.muted, textAlign: 'center', paddingBottom: 8 }}>
          Data via Yahoo Finance · NSE · Prices delayed 15–20 min ·
          Generated {data?.generated_at ? new Date(data.generated_at).toLocaleString('en-IN') : '—'}
        </div>
      </div>
    </div>
  );
}
