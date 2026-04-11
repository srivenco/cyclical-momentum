import { useEffect, useState } from 'react';
import { getMacro } from '../api';

const BOOK_LABELS = {
  F2_COMMODITY: 'Commodity',
  F3B_RATEHIKE: 'Rate Hike',
  F_RATECUT: 'Rate Cut',
  F4_DEFENSIVE: 'Defensive',
};

const BOOK_COLORS = {
  F2_COMMODITY: { bg: 'rgba(244,196,48,0.15)', text: '#F4C430', border: 'rgba(244,196,48,0.3)' },
  F3B_RATEHIKE: { bg: 'rgba(251,146,60,0.15)', text: '#fb923c', border: 'rgba(251,146,60,0.3)' },
  F_RATECUT: { bg: 'rgba(34,211,238,0.15)', text: '#22d3ee', border: 'rgba(34,211,238,0.3)' },
  F4_DEFENSIVE: { bg: 'rgba(52,211,153,0.15)', text: '#34d399', border: 'rgba(52,211,153,0.3)' },
};

function Dot({ color }) {
  return (
    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
  );
}

function RegimeRow({ label, value, dotColor, sub }) {
  return (
    <div className="py-2.5 border-b" style={{ borderColor: '#1E3558' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: '#64748b' }}>{label}</span>
        <div className="flex items-center gap-1.5">
          <Dot color={dotColor} />
          <span className="text-xs font-semibold text-white">{value}</span>
        </div>
      </div>
      {sub && <p className="text-xs mt-0.5 text-right" style={{ color: '#94a3b8' }}>{sub}</p>}
    </div>
  );
}

export default function MacroRegime() {
  const [macro, setMacro] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMacro = async () => {
    try {
      const data = await getMacro();
      setMacro(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMacro();
    const interval = setInterval(fetchMacro, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-8 rounded animate-pulse" style={{ backgroundColor: '#162848' }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-xs" style={{ color: '#ef4444' }}>
        Failed to load macro data
      </div>
    );
  }

  const niftyColor = macro.nifty_regime === 'BULL' ? '#34d399' : '#ef4444';
  const commodityColor = macro.commodity_bull ? '#34d399' : '#64748b';
  const rateColor = macro.rate_regime === 'CUT' ? '#34d399' : macro.rate_regime === 'HIKE' ? '#fb923c' : '#64748b';

  const updatedAt = macro.updated_at
    ? new Date(macro.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#00B4D8' }}>
        Macro Regime
      </h2>

      <RegimeRow
        label="Nifty vs 200MA"
        value={macro.nifty_regime}
        dotColor={niftyColor}
        sub={`${macro.nifty_vs_200ma > 0 ? '+' : ''}${macro.nifty_vs_200ma}% | ₹${(macro.nifty_price || 0).toLocaleString('en-IN')}`}
      />

      <RegimeRow
        label="Commodity Cycle"
        value={macro.commodity_bull ? 'BULL' : 'INACTIVE'}
        dotColor={commodityColor}
        sub={`Crude ${macro.crude_trend} | Copper ${macro.copper_trend}`}
      />

      <RegimeRow
        label="Rate Regime"
        value={macro.rate_regime}
        dotColor={rateColor}
        sub={`US10Y 63d: ${macro.us10y_63d_change > 0 ? '+' : ''}${macro.us10y_63d_change?.toFixed(2)}% | ${macro.us10y?.toFixed(2)}%`}
      />

      {/* Active Books */}
      <div className="pt-3">
        <p className="text-xs mb-2" style={{ color: '#64748b' }}>Active Books</p>
        {macro.active_books?.length > 0 ? (
          <div className="space-y-1.5">
            {macro.active_books.map((book) => {
              const c = BOOK_COLORS[book] || { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8', border: 'rgba(148,163,184,0.2)' };
              return (
                <span
                  key={book}
                  className="inline-block w-full text-center text-xs font-medium px-2 py-1 rounded"
                  style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                >
                  {BOOK_LABELS[book] || book}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-xs" style={{ color: '#64748b' }}>No active books</p>
        )}
      </div>

      {/* Inactive books */}
      {macro.inactive_books?.length > 0 && (
        <div className="pt-3">
          <p className="text-xs mb-2" style={{ color: '#475569' }}>Inactive</p>
          <div className="space-y-1">
            {macro.inactive_books.map((book) => (
              <span key={book} className="inline-block w-full text-center text-xs px-2 py-1 rounded"
                    style={{ backgroundColor: 'rgba(71,85,105,0.2)', color: '#475569', border: '1px solid rgba(71,85,105,0.3)' }}>
                {BOOK_LABELS[book] || book}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs mt-4 text-center" style={{ color: '#334155' }}>
        Updated {updatedAt}
      </p>
    </div>
  );
}
