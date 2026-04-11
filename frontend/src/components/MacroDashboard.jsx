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
  purple:  '#a78bfa',
  muted:   '#4a6080',
  dim:     '#2a4060',
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

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Spark({ data = [], positive }) {
  if (!data.length) return null;
  const w = 60, h = 24, pad = 2;
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
  ];

  return (
    <div className="flex items-center gap-0 overflow-x-auto shrink-0"
         style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}`,
                  height: 36 }}>
      {items.map((item, i) => (
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
      {/* Name + unit */}
      <div style={{ width: 120, flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>{item.name}</div>
        <div style={{ fontSize: 10, color: C.muted }}>{item.unit}</div>
      </div>

      {/* Price */}
      <div style={{ width: 90, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{price(item.price)}</div>
        <div style={{ fontSize: 11 }}>{pct(item.change_1d)}</div>
      </div>

      {/* Returns */}
      <div className="flex gap-4 flex-1" style={{ justifyContent: 'flex-end' }}>
        {[['1W', item.change_1w], ['1M', item.change_1m], ['3M', item.change_3m], ['YTD', item.ytd]].map(([label, val]) => (
          <div key={label} style={{ textAlign: 'right', minWidth: 48 }}>
            <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
            <div style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{pct(val)}</div>
          </div>
        ))}
      </div>

      {/* 200MA status */}
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

      {/* Sparkline */}
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

  // Colour intensity: ±5% maps to full green/red
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
        <div style={{ fontSize: 9, color: fg, opacity: 0.8 }}>
          vs Nifty
        </div>
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
        <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>
          NSE Sector Heatmap
        </div>
        <div className="flex items-center gap-2">
          {/* vs Nifty toggle */}
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
          {/* Period selector */}
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
    // Auto-refresh every 15 minutes
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

  const { commodities = [], global_macro = [], india_macro = [], sectors = [], regime = {} } = data || {};

  // Split india macro into key groups
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

        {/* Row 1: Regime + India + Global */}
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr 1fr', gap: 16 }}>

          {/* Regime */}
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
            {/* Yield curve context */}
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

        {/* Row 2: Commodities table */}
        <div className="rounded-xl overflow-hidden"
             style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'white' }}>
              Commodities
            </div>
            <div style={{ display: 'flex', gap: 24, fontSize: 10, color: C.muted }}>
              {['Price', '1D', '1W', '1M', '3M', 'YTD', 'Trend', 'Chart'].map(h => (
                <span key={h}>{h}</span>
              ))}
            </div>
          </div>
          {commodities.map(c => <CommodityRow key={c.key} item={c} />)}
        </div>

        {/* Row 3: Sector heatmap */}
        <SectorHeatmap sectors={sectors} />

        {/* Footer */}
        <div style={{ fontSize: 10, color: C.muted, textAlign: 'center', paddingBottom: 8 }}>
          Data via Yahoo Finance · Prices delayed 15–20 min ·
          Generated {data?.generated_at ? new Date(data.generated_at).toLocaleString('en-IN') : '—'}
        </div>
      </div>
    </div>
  );
}
