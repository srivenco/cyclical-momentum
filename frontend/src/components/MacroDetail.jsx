import { useState, useEffect } from 'react';
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { getMacro } from '../api';

// ── Gauge component ───────────────────────────────────────────────────────────
function GaugeCard({ label, value, max, min, unit, color, status, sub }) {
  const pct = max !== min ? Math.min(Math.max((value - min) / (max - min), 0), 1) : 0.5;
  const data = [{ value: pct * 100 }];

  return (
    <div className="rounded-xl p-4 flex flex-col items-center"
         style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
      <div className="w-24 h-24 relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%"
                          startAngle={180} endAngle={0} data={data}>
            <RadialBar dataKey="value" fill={color} background={{ fill: '#162848' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold" style={{ color }}>
            {value != null ? `${value > 0 && unit !== '%level' ? '+' : ''}${typeof value === 'number' ? value.toFixed(2) : value}${unit === '%level' ? '%' : unit}` : '—'}
          </span>
        </div>
      </div>
      <p className="text-xs font-semibold text-white mt-1">{label}</p>
      <span className="text-xs mt-0.5 px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${color}22`, color }}>{status}</span>
      {sub && <p className="text-xs mt-1 text-center" style={{ color: '#64748b' }}>{sub}</p>}
    </div>
  );
}

// ── Metric row ────────────────────────────────────────────────────────────────
function MetricRow({ label, value, color, note }) {
  return (
    <div className="flex items-center justify-between py-2.5"
         style={{ borderBottom: '1px solid #1E3558' }}>
      <span className="text-sm" style={{ color: '#94a3b8' }}>{label}</span>
      <div className="text-right">
        <span className="text-sm font-semibold" style={{ color: color || 'white' }}>{value}</span>
        {note && <p className="text-xs" style={{ color: '#475569' }}>{note}</p>}
      </div>
    </div>
  );
}

// ── Plain-English narrative ────────────────────────────────────────────────────
function buildNarrative(m) {
  if (!m || !m.date) return null;

  const lines = [];

  // Nifty
  if (m.nifty_regime === 'BEAR') {
    lines.push(`Nifty50 is trading ${Math.abs(m.nifty_vs_200ma).toFixed(1)}% below its 200-day moving average (₹${m.nifty_ma200?.toLocaleString('en-IN')}), confirming a bearish medium-term trend. This activates the Defensive book.`);
  } else {
    lines.push(`Nifty50 is trading ${m.nifty_vs_200ma.toFixed(1)}% above its 200-day moving average (₹${m.nifty_ma200?.toLocaleString('en-IN')}), indicating a healthy bull trend.`);
  }

  // Rates
  if (m.rate_regime === 'CUT') {
    lines.push(`US 10-year yields have fallen ${Math.abs(m.us10y_63d_change).toFixed(2)}% over the past 63 days, signalling an easing rate environment. This activates the Rate Cut book (small banks, realty, infra).`);
  } else if (m.rate_regime === 'HIKE') {
    lines.push(`US 10-year yields have risen ${m.us10y_63d_change.toFixed(2)}% over the past 63 days, signalling a tightening rate environment. This activates the Rate Hike book (utilities, FMCG).`);
  } else {
    lines.push(`US 10-year yields are broadly flat over the past 63 days (${m.us10y_63d_change > 0 ? '+' : ''}${m.us10y_63d_change?.toFixed(2)}%), placing the rate regime in neutral — neither hike nor cut books are active.`);
  }

  // Commodities
  if (m.commodity_bull) {
    lines.push(`Both crude oil and copper are above their 200-day MAs with positive momentum and elevated volume — a commodity bull signal. The Commodity book is active.`);
  } else {
    const issues = [];
    if (m.crude_trend === 'DOWN') issues.push('crude is in a downtrend');
    if (m.copper_trend === 'DOWN') issues.push('copper is in a downtrend');
    if (issues.length > 0) lines.push(`Commodity conditions are not bullish — ${issues.join(' and ')}. The Commodity book remains inactive.`);
    else lines.push(`Crude and copper are both trending up, but volume confirmation is insufficient to trigger the Commodity book yet.`);
  }

  // Summary
  const active = m.active_books || [];
  if (active.length === 0) {
    lines.push(`No books are currently active. The strategy is in cash — waiting for a regime trigger.`);
  } else {
    const bookNames = { F2_COMMODITY: 'Commodity', F3B_RATEHIKE: 'Rate Hike', F_RATECUT: 'Rate Cut', F4_DEFENSIVE: 'Defensive' };
    lines.push(`Currently scanning: ${active.map(b => bookNames[b] || b).join(', ')}. Entry signals require a volume ratio crossover, price above MA50, and 5%+ momentum over 20 days.`);
  }

  return lines;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MacroDetail() {
  const [macro, setMacro] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMacro().then(setMacro).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded animate-pulse" style={{ backgroundColor: '#162848' }} />
        ))}
      </div>
    );
  }

  if (!macro?.date) {
    return <p className="text-sm text-center py-8" style={{ color: '#64748b' }}>No macro data yet — run the daily scan first.</p>;
  }

  const narrative = buildNarrative(macro);
  const niftyColor = macro.nifty_regime === 'BULL' ? '#34d399' : '#ef4444';
  const rateColor = macro.rate_regime === 'CUT' ? '#34d399' : macro.rate_regime === 'HIKE' ? '#fb923c' : '#64748b';
  const commodityColor = macro.commodity_bull ? '#34d399' : '#64748b';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-white">Macro Regime — {macro.date}</h2>
        <p className="text-xs mt-0.5" style={{ color: '#475569' }}>Updated {new Date(macro.updated_at).toLocaleString('en-IN')}</p>
      </div>

      {/* Gauge cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <GaugeCard
          label="Nifty vs 200MA"
          value={macro.nifty_vs_200ma}
          min={-15} max={15}
          unit="%level"
          color={niftyColor}
          status={macro.nifty_regime}
          sub={`₹${macro.nifty_price?.toLocaleString('en-IN')}`}
        />
        <GaugeCard
          label="Crude Oil"
          value={macro.crude_price}
          min={50} max={120}
          unit="$"
          color={macro.crude_trend === 'UP' ? '#34d399' : '#ef4444'}
          status={macro.crude_trend}
          sub="WTI $/barrel"
        />
        <GaugeCard
          label="Copper"
          value={macro.copper_price}
          min={2.5} max={6}
          unit="$"
          color={macro.copper_trend === 'UP' ? '#34d399' : '#ef4444'}
          status={macro.copper_trend}
          sub="$/lb"
        />
        <GaugeCard
          label="US 10Y Yield"
          value={macro.us10y}
          min={0} max={8}
          unit="%"
          color={rateColor}
          status={macro.rate_regime}
          sub={`63d: ${macro.us10y_63d_change > 0 ? '+' : ''}${macro.us10y_63d_change?.toFixed(3)}%`}
        />
      </div>

      {/* Metrics table */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#00B4D8' }}>Key Levels</h3>
        <MetricRow label="Nifty50" value={`₹${macro.nifty_price?.toLocaleString('en-IN')}`} />
        <MetricRow label="Nifty 200MA" value={`₹${macro.nifty_ma200?.toLocaleString('en-IN')}`}
                   note={`${macro.nifty_vs_200ma > 0 ? '+' : ''}${macro.nifty_vs_200ma}% from MA`} color={niftyColor} />
        <MetricRow label="Crude Oil" value={`$${macro.crude_price}`} color={macro.crude_trend === 'UP' ? '#34d399' : '#ef4444'} />
        <MetricRow label="Copper" value={`$${macro.copper_price}`} color={macro.copper_trend === 'UP' ? '#34d399' : '#ef4444'} />
        <MetricRow label="US 10Y Yield" value={`${macro.us10y?.toFixed(2)}%`}
                   note={`63d change: ${macro.us10y_63d_change > 0 ? '+' : ''}${macro.us10y_63d_change?.toFixed(3)}%`} color={rateColor} />
        <MetricRow label="Commodity Bull" value={macro.commodity_bull ? 'YES' : 'NO'} color={commodityColor} />
        <MetricRow label="Rate Regime" value={macro.rate_regime} color={rateColor} />
        <MetricRow label="Nifty Regime" value={macro.nifty_regime} color={niftyColor} />
      </div>

      {/* Book status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { book: 'F2_COMMODITY', label: 'Commodity Book', color: '#F4C430', threshold: '3x vol' },
          { book: 'F3B_RATEHIKE', label: 'Rate Hike Book', color: '#fb923c', threshold: '2x vol' },
          { book: 'F_RATECUT',    label: 'Rate Cut Book',  color: '#22d3ee', threshold: '2x vol' },
          { book: 'F4_DEFENSIVE', label: 'Defensive Book', color: '#34d399', threshold: '2x vol' },
        ].map(({ book, label, color, threshold }) => {
          const active = macro.active_books?.includes(book);
          return (
            <div key={book} className="rounded-xl p-3 text-center"
                 style={{ backgroundColor: active ? `${color}18` : '#0D1F3C',
                          border: `1px solid ${active ? color + '44' : '#1E3558'}` }}>
              <div className="w-2 h-2 rounded-full mx-auto mb-2"
                   style={{ backgroundColor: active ? color : '#334155' }} />
              <p className="text-xs font-semibold" style={{ color: active ? color : '#475569' }}>{label}</p>
              <p className="text-xs mt-0.5" style={{ color: active ? color + 'aa' : '#334155' }}>
                {active ? `ACTIVE · ${threshold}` : 'INACTIVE'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Plain-English narrative */}
      <div className="rounded-xl p-5 space-y-3" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#00B4D8' }}>
          Market Scenario — Plain English
        </h3>
        {narrative?.map((line, i) => (
          <p key={i} className="text-sm leading-relaxed" style={{ color: '#cbd5e1' }}>{line}</p>
        ))}
      </div>
    </div>
  );
}
