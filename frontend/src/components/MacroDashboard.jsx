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

// Historical sector performance per phase (sourced from cyclical investing research)
const HISTORICAL_SECTORS = {
  // US phases
  'RECOVERY': [
    { name: 'Small Caps',    perf: '+28%', note: 'Lead cycle re-rating' },
    { name: 'Tech',          perf: '+25%', note: 'Growth re-priced' },
    { name: 'Financials',    perf: '+22%', note: 'Spread compression' },
    { name: 'Consumer Disc', perf: '+18%', note: 'Spending bounces' },
  ],
  'EXPANSION': [
    { name: 'Financials',    perf: '+18%', note: 'Lending volume up' },
    { name: 'Industrials',   perf: '+15%', note: 'CapEx cycle peaks' },
    { name: 'Consumer Disc', perf: '+14%', note: 'Wages & confidence' },
    { name: 'Materials',     perf: '+12%', note: 'Commodity demand' },
  ],
  'LATE CYCLE': [
    { name: 'Energy',        perf: '+22%', note: 'Demand peaks late' },
    { name: 'Materials',     perf: '+15%', note: 'Real assets bid' },
    { name: 'Healthcare',    perf: '+8%',  note: 'Defensive rotation' },
    { name: 'Utilities',     perf: '+4%',  note: 'Early safe-haven' },
  ],
  'SLOWDOWN': [
    { name: 'Healthcare',    perf: '+5%',  note: 'Non-cyclical revenue' },
    { name: 'Utilities',     perf: '+3%',  note: 'Rate-cut beneficiary' },
    { name: 'Staples',       perf: '+2%',  note: 'Pricing power holds' },
    { name: 'Quality Tech',  perf: '0-5%', note: 'Earnings resilience' },
  ],
  'RECESSION': [
    { name: 'Gold',          perf: '+12%', note: 'Safe haven & real rates' },
    { name: 'Long Bonds',    perf: '+8%',  note: 'TLT outperforms' },
    { name: 'Utilities',     perf: '+1%',  note: 'Dividend floor' },
    { name: 'Cash',          perf: '—',    note: 'Capital preservation' },
  ],
  // India phases
  'BULL': [
    { name: 'Realty',        perf: '+45%', note: 'Leverage + sentiment' },
    { name: 'Banks',         perf: '+35%', note: 'Credit cycle boom' },
    { name: 'Auto',          perf: '+28%', note: 'Discretionary spend' },
    { name: 'Consumer Disc', perf: '+25%', note: 'Premiumisation' },
  ],
  'CAUTIOUS': [
    { name: 'IT',            perf: '+15%', note: 'USD earnings hedge' },
    { name: 'FMCG',          perf: '+12%', note: 'Staples + pricing' },
    { name: 'Quality LargeCap', perf: '+8%', note: 'Low-beta outperform' },
    { name: 'Healthcare',    perf: '+6%',  note: 'Defensive + exports' },
  ],
  'CORRECTION': [
    { name: 'Gold ETFs',     perf: '+15%', note: 'INR hedge' },
    { name: 'IT (exports)',  perf: '+10%', note: 'Weak rupee tailwind' },
    { name: 'Pharma (exp)',  perf: '+8%',  note: 'USD export revenue' },
    { name: 'Cash',          perf: '—',    note: 'Reduce beta' },
  ],
  'BEAR': [
    { name: 'Gold',          perf: '+20%', note: 'Crisis safe haven' },
    { name: 'IT',            perf: '+5%',  note: 'Relative outperform' },
    { name: 'Pharma',        perf: '+3%',  note: 'Defensive revenue' },
    { name: 'Cash / FD',     perf: '—',    note: 'Risk-off posture' },
  ],
  'RATE CUT CYCLE': [
    { name: 'Realty',        perf: '+35%', note: 'Rate sensitivity highest' },
    { name: 'NBFCs',         perf: '+30%', note: 'CoF falls fastest' },
    { name: 'Banks',         perf: '+25%', note: 'NIM expansion lagged' },
    { name: 'Auto',          perf: '+20%', note: 'EMI-driven demand' },
  ],
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

  const currentIdx  = phaseOrder.indexOf(cycle.phase);
  const nextPhase   = phaseOrder[(currentIdx + 1) % phaseOrder.length];
  const nextColor   = WHEEL_COLOR[nextPhase] || C.muted;
  const historicalSectors = HISTORICAL_SECTORS[cycle.phase] || [];

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
      <div style={{ padding: '12px 16px' }}>
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
