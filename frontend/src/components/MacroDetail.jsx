import { useState, useEffect } from 'react';
import { getMacro } from '../api';

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, primary, secondary, sub, color, badge }) {
  return (
    <div className="rounded-xl p-4"
         style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
      <p className="text-xs mb-2" style={{ color: '#64748b' }}>{label}</p>
      <p className="text-2xl font-bold leading-none" style={{ color }}>
        {primary}
      </p>
      {secondary && (
        <p className="text-sm font-medium mt-1" style={{ color }}>
          {secondary}
        </p>
      )}
      {badge && (
        <span className="inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${color}22`, color }}>
          {badge}
        </span>
      )}
      {sub && (
        <p className="text-xs mt-1" style={{ color: '#475569' }}>{sub}</p>
      )}
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

// ── Trend bar ─────────────────────────────────────────────────────────────────
// Visual indicator: fills a bar proportionally, clipped to [min, max]
function TrendBar({ value, min, max, color }) {
  const pct = max !== min ? Math.min(Math.max((value - min) / (max - min), 0), 1) * 100 : 50;
  return (
    <div className="w-full h-1 rounded-full mt-2" style={{ backgroundColor: '#162848' }}>
      <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ── Plain-English narrative ────────────────────────────────────────────────────
function buildNarrative(m) {
  if (!m || !m.date) return null;
  const lines = [];

  if (m.nifty_regime === 'BEAR') {
    lines.push(`Nifty50 is trading ${Math.abs(m.nifty_vs_200ma).toFixed(1)}% below its 200-day moving average (₹${m.nifty_ma200?.toLocaleString('en-IN')}), confirming a bearish medium-term trend. This activates the Defensive book.`);
  } else {
    lines.push(`Nifty50 is trading ${m.nifty_vs_200ma?.toFixed(1)}% above its 200-day moving average (₹${m.nifty_ma200?.toLocaleString('en-IN')}), indicating a healthy bull trend.`);
  }

  if (m.rate_regime === 'CUT') {
    lines.push(`US 10-year yields have fallen ${Math.abs(m.us10y_63d_change).toFixed(2)}% over the past 63 days, signalling an easing rate environment. This activates the Rate Cut book (small banks, realty, infra).`);
  } else if (m.rate_regime === 'HIKE') {
    lines.push(`US 10-year yields have risen ${m.us10y_63d_change?.toFixed(2)}% over the past 63 days, signalling a tightening rate environment. This activates the Rate Hike book (utilities, FMCG).`);
  } else {
    lines.push(`US 10-year yields are broadly flat over the past 63 days (${m.us10y_63d_change > 0 ? '+' : ''}${m.us10y_63d_change?.toFixed(2)}%), placing the rate regime in neutral — neither hike nor cut books are active.`);
  }

  if (m.commodity_bull) {
    lines.push(`Both crude oil and copper are above their 200-day MAs with positive momentum and elevated volume — a commodity bull signal. The Commodity book is active.`);
  } else {
    const issues = [];
    if (m.crude_trend === 'DOWN') issues.push('crude is in a downtrend');
    if (m.copper_trend === 'DOWN') issues.push('copper is in a downtrend');
    if (issues.length > 0) {
      lines.push(`Commodity conditions are not bullish — ${issues.join(' and ')}. The Commodity book remains inactive.`);
    } else {
      lines.push(`Crude and copper are both trending up, but volume confirmation is insufficient to trigger the Commodity book yet.`);
    }
  }

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
  const crudeColor = macro.crude_trend === 'UP' ? '#34d399' : '#ef4444';
  const copperColor = macro.copper_trend === 'UP' ? '#34d399' : '#ef4444';

  const niftyDelta = macro.nifty_vs_200ma;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-white">Macro Regime — {macro.date}</h2>
        {macro.updated_at && (
          <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
            Updated {new Date(macro.updated_at).toLocaleString('en-IN')}
          </p>
        )}
      </div>

      {/* Stat cards — 2×2 on mobile, 4 across on md+ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Nifty 50"
          primary={`₹${macro.nifty_price?.toLocaleString('en-IN')}`}
          secondary={`${niftyDelta > 0 ? '+' : ''}${niftyDelta?.toFixed(2)}% vs 200MA`}
          sub={`200MA: ₹${macro.nifty_ma200?.toLocaleString('en-IN')}`}
          color={niftyColor}
          badge={macro.nifty_regime}
        />
        <StatCard
          label="Crude Oil (WTI)"
          primary={`$${macro.crude_price?.toFixed(1)}`}
          secondary={`Trend: ${macro.crude_trend}`}
          sub="$/barrel"
          color={crudeColor}
          badge={macro.crude_trend}
        />
        <StatCard
          label="Copper"
          primary={`$${macro.copper_price?.toFixed(2)}`}
          secondary={`Trend: ${macro.copper_trend}`}
          sub="$/lb"
          color={copperColor}
          badge={macro.copper_trend}
        />
        <StatCard
          label="US 10Y Yield"
          primary={`${macro.us10y?.toFixed(2)}%`}
          secondary={`${macro.us10y_63d_change > 0 ? '+' : ''}${macro.us10y_63d_change?.toFixed(3)}% (63d)`}
          sub="63-day change"
          color={rateColor}
          badge={macro.rate_regime}
        />
      </div>

      {/* Trend bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-xl p-4" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#00B4D8' }}>
            Nifty vs 200MA
          </h3>
          <div className="flex justify-between text-xs mb-1" style={{ color: '#475569' }}>
            <span>−15%</span>
            <span style={{ color: niftyColor, fontWeight: 600 }}>
              {niftyDelta > 0 ? '+' : ''}{niftyDelta?.toFixed(2)}%
            </span>
            <span>+15%</span>
          </div>
          <TrendBar value={niftyDelta} min={-15} max={15} color={niftyColor} />
          <p className="text-xs mt-2" style={{ color: '#64748b' }}>
            Regime: <span style={{ color: niftyColor, fontWeight: 600 }}>{macro.nifty_regime}</span>
            {' '}— threshold is 0% (price vs 200-day SMA)
          </p>
        </div>

        <div className="rounded-xl p-4" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#00B4D8' }}>
            US 10Y Rate Change (63d)
          </h3>
          <div className="flex justify-between text-xs mb-1" style={{ color: '#475569' }}>
            <span>−0.5%</span>
            <span style={{ color: rateColor, fontWeight: 600 }}>
              {macro.us10y_63d_change > 0 ? '+' : ''}{macro.us10y_63d_change?.toFixed(3)}%
            </span>
            <span>+0.5%</span>
          </div>
          <TrendBar value={macro.us10y_63d_change} min={-0.5} max={0.5} color={rateColor} />
          <p className="text-xs mt-2" style={{ color: '#64748b' }}>
            Regime: <span style={{ color: rateColor, fontWeight: 600 }}>{macro.rate_regime}</span>
            {' '}— HIKE {'>'} +0.20%, CUT {'<'} −0.20%
          </p>
        </div>
      </div>

      {/* Book status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { book: 'F2_COMMODITY', label: 'Commodity', color: '#F4C430', threshold: '3× vol' },
          { book: 'F3B_RATEHIKE', label: 'Rate Hike',  color: '#fb923c', threshold: '2× vol' },
          { book: 'F_RATECUT',    label: 'Rate Cut',   color: '#22d3ee', threshold: '2× vol' },
          { book: 'F4_DEFENSIVE', label: 'Defensive',  color: '#34d399', threshold: '2× vol' },
        ].map(({ book, label, color, threshold }) => {
          const active = macro.active_books?.includes(book);
          return (
            <div key={book} className="rounded-xl p-3 flex flex-col gap-1.5"
                 style={{
                   backgroundColor: active ? `${color}12` : '#0D1F3C',
                   border: `1px solid ${active ? color + '55' : '#1E3558'}`,
                 }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shrink-0"
                     style={{ backgroundColor: active ? color : '#334155' }} />
                <p className="text-xs font-semibold" style={{ color: active ? color : '#475569' }}>
                  {label}
                </p>
              </div>
              <p className="text-xs" style={{ color: active ? color + 'cc' : '#334155' }}>
                {active ? `ACTIVE · ${threshold}` : 'INACTIVE'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Key metrics table */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#00B4D8' }}>
          Key Levels
        </h3>
        <MetricRow label="Nifty50" value={`₹${macro.nifty_price?.toLocaleString('en-IN')}`} />
        <MetricRow label="Nifty 200MA"
                   value={`₹${macro.nifty_ma200?.toLocaleString('en-IN')}`}
                   note={`${niftyDelta > 0 ? '+' : ''}${niftyDelta?.toFixed(2)}% from MA`}
                   color={niftyColor} />
        <MetricRow label="Crude Oil" value={`$${macro.crude_price?.toFixed(1)}`}
                   color={crudeColor}
                   note={`Trend: ${macro.crude_trend}`} />
        <MetricRow label="Copper" value={`$${macro.copper_price?.toFixed(2)}`}
                   color={copperColor}
                   note={`Trend: ${macro.copper_trend}`} />
        <MetricRow label="US 10Y Yield" value={`${macro.us10y?.toFixed(2)}%`}
                   note={`63d change: ${macro.us10y_63d_change > 0 ? '+' : ''}${macro.us10y_63d_change?.toFixed(3)}%`}
                   color={rateColor} />
        <MetricRow label="Commodity Bull" value={macro.commodity_bull ? 'YES' : 'NO'} color={commodityColor} />
        <MetricRow label="Rate Regime" value={macro.rate_regime} color={rateColor} />
        <MetricRow label="Nifty Regime" value={macro.nifty_regime} color={niftyColor} />
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
