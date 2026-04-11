import { useState, useEffect, useMemo } from 'react';
import { getSignalsHistory } from '../api';

const BOOK_LABELS = {
  F2_COMMODITY: 'Commodity',
  F3B_RATEHIKE: 'Rate Hike',
  F_RATECUT:    'Rate Cut',
  F4_DEFENSIVE: 'Defensive',
};

const BOOK_COLORS = {
  F2_COMMODITY: '#F4C430',
  F3B_RATEHIKE: '#fb923c',
  F_RATECUT:    '#22d3ee',
  F4_DEFENSIVE: '#34d399',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n, decimals = 2) {
  if (n == null) return '—';
  return typeof n === 'number' ? n.toFixed(decimals) : n;
}

function pnlColor(pnl) {
  if (pnl == null) return '#64748b';
  return pnl >= 0 ? '#34d399' : '#ef4444';
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsBar({ signals }) {
  const traded = signals.filter(s => s.exit_price != null || s.exit_date != null);
  const withPnl = traded.filter(s => s.pnl_pct != null);
  const wins = withPnl.filter(s => s.pnl_pct >= 0);
  const avgPnl = withPnl.length
    ? withPnl.reduce((a, s) => a + s.pnl_pct, 0) / withPnl.length
    : null;
  const best = withPnl.length ? Math.max(...withPnl.map(s => s.pnl_pct)) : null;
  const worst = withPnl.length ? Math.min(...withPnl.map(s => s.pnl_pct)) : null;
  const winRate = withPnl.length ? (wins.length / withPnl.length) * 100 : null;

  const stat = (label, value, color) => (
    <div className="text-center">
      <p className="text-xs" style={{ color: '#64748b' }}>{label}</p>
      <p className="text-base font-bold mt-0.5" style={{ color: color || 'white' }}>{value ?? '—'}</p>
    </div>
  );

  return (
    <div className="rounded-xl p-4 grid grid-cols-3 md:grid-cols-6 gap-4"
         style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
      {stat('Total Signals', signals.length)}
      {stat('Traded', traded.length, '#00B4D8')}
      {stat('Closed', withPnl.length, '#94a3b8')}
      {stat('Win Rate', winRate != null ? `${winRate.toFixed(0)}%` : '—', winRate >= 50 ? '#34d399' : '#ef4444')}
      {stat('Avg P&L', avgPnl != null ? `${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(1)}%` : '—', pnlColor(avgPnl))}
      {stat('Best / Worst',
        best != null ? `+${best.toFixed(1)}% / ${worst?.toFixed(1)}%` : '—',
        '#94a3b8')}
    </div>
  );
}

// ── Signal row ────────────────────────────────────────────────────────────────
function SignalRow({ signal, expanded, onToggle }) {
  const bookColor = BOOK_COLORS[signal.book] || '#64748b';
  const strengthColor = signal.signal_strength === 'STRONG' ? '#34d399'
    : signal.signal_strength === 'MODERATE' ? '#fbbf24' : '#94a3b8';
  const hasExit = signal.exit_price != null;
  const pnl = signal.pnl_pct;

  return (
    <>
      <tr
        className="cursor-pointer transition-colors"
        style={{ borderBottom: '1px solid #1E3558' }}
        onClick={onToggle}
      >
        <td className="px-3 py-3 font-semibold text-white text-sm whitespace-nowrap">
          {signal.ticker?.replace('.NS', '')}
          {signal.circuit_breaker && <span className="ml-1 text-xs">⚠️</span>}
        </td>
        <td className="px-3 py-3 text-xs" style={{ color: '#64748b' }}>
          {signal.date}
        </td>
        <td className="px-3 py-3">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: `${bookColor}22`, color: bookColor, border: `1px solid ${bookColor}44` }}>
            {BOOK_LABELS[signal.book] || signal.book}
          </span>
        </td>
        <td className="px-3 py-3 text-right text-sm text-white">
          ₹{signal.entry_price}
        </td>
        <td className="px-3 py-3 text-right text-sm" style={{ color: '#ef4444' }}>
          ₹{signal.initial_stop}
          <span className="text-xs ml-1" style={{ color: '#64748b' }}>{signal.stop_pct}%</span>
        </td>
        <td className="px-3 py-3 text-right text-sm" style={{ color: strengthColor, fontWeight: 600 }}>
          {signal.signal_strength || '—'}
        </td>
        <td className="px-3 py-3 text-right">
          {hasExit ? (
            <span className="text-sm font-bold" style={{ color: pnlColor(pnl) }}>
              {pnl != null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%` : '—'}
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(0,180,216,0.1)', color: '#00B4D8', border: '1px solid rgba(0,180,216,0.25)' }}>
              Open
            </span>
          )}
        </td>
        <td className="px-3 py-3 text-right">
          <svg viewBox="0 0 24 24" className="w-3 h-3 ml-auto transition-transform"
               style={{ color: '#475569', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
               fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr style={{ backgroundColor: '#0A1628' }}>
          <td colSpan={8} className="px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs mb-1" style={{ color: '#475569' }}>Sector</p>
                <p style={{ color: '#94a3b8' }}>{signal.sector || '—'}</p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: '#475569' }}>Vol Ratio</p>
                <p style={{ color: 'white' }}>{signal.vol_ratio}×</p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: '#475569' }}>20d Momentum</p>
                <p style={{ color: '#34d399' }}>+{fmt(signal.prior_20d_return)}%</p>
              </div>
              <div>
                <p className="text-xs mb-1" style={{ color: '#475569' }}>Stop %</p>
                <p style={{ color: '#ef4444' }}>{signal.stop_pct}%</p>
              </div>
              {hasExit && (
                <>
                  <div>
                    <p className="text-xs mb-1" style={{ color: '#475569' }}>Exit Date</p>
                    <p style={{ color: '#94a3b8' }}>{signal.exit_date || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: '#475569' }}>Exit Price</p>
                    <p style={{ color: 'white' }}>₹{signal.exit_price}</p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: '#475569' }}>Exit Reason</p>
                    <p style={{ color: signal.exit_reason === 'stop' ? '#ef4444' : '#34d399' }}>
                      {signal.exit_reason === 'stop' ? 'Stop hit' : signal.exit_reason === 'target' ? 'Target / Manual' : (signal.exit_reason || '—')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: '#475569' }}>P&L</p>
                    <p className="font-bold" style={{ color: pnlColor(pnl) }}>
                      {pnl != null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%` : '—'}
                    </p>
                  </div>
                </>
              )}
              {signal.circuit_breaker && (
                <div className="col-span-2 md:col-span-4">
                  <p className="text-xs" style={{ color: '#fbbf24' }}>
                    ⚠️ Circuit breaker was active on this signal — the book had 3+ consecutive losses at time of signal.
                  </p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SignalHistory() {
  const [raw, setRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [filterBook, setFilterBook] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  useEffect(() => {
    getSignalsHistory()
      .then(data => setRaw(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Sort newest first
  const signals = useMemo(() => {
    return [...raw].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [raw]);

  const filtered = useMemo(() => {
    return signals.filter(s => {
      if (filterBook !== 'ALL' && s.book !== filterBook) return false;
      if (filterStatus === 'TRADED' && s.exit_price == null && s.exit_date == null) return false;
      if (filterStatus === 'UNTRADED' && (s.exit_price != null || s.exit_date != null)) return false;
      return true;
    });
  }, [signals, filterBook, filterStatus]);

  // Group by date
  const grouped = useMemo(() => {
    const map = {};
    for (const s of filtered) {
      const d = s.date || 'Unknown';
      if (!map[d]) map[d] = [];
      map[d].push(s);
    }
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 rounded animate-pulse" style={{ backgroundColor: '#162848' }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
        <p className="text-sm" style={{ color: '#ef4444' }}>Failed to load signal history: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Signal History — Last 365 Days</h2>
          <p className="text-xs mt-0.5" style={{ color: '#475569' }}>
            {signals.length} signals generated · click a row to see details
          </p>
        </div>
        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterBook}
            onChange={e => setFilterBook(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg focus:outline-none"
            style={{ backgroundColor: '#162848', color: '#94a3b8', border: '1px solid #1E3558' }}
          >
            <option value="ALL">All Books</option>
            {Object.entries(BOOK_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg focus:outline-none"
            style={{ backgroundColor: '#162848', color: '#94a3b8', border: '1px solid #1E3558' }}
          >
            <option value="ALL">All Status</option>
            <option value="TRADED">Traded (have exit)</option>
            <option value="UNTRADED">Not Yet Traded</option>
          </select>
        </div>
      </div>

      {/* Summary stats */}
      {signals.length > 0 && <StatsBar signals={signals} />}

      {/* Signal table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
          <p className="text-sm font-medium text-white mb-1">No signals found</p>
          <p className="text-xs" style={{ color: '#475569' }}>
            {signals.length === 0
              ? 'The daily scan has not run yet, or no signals have been generated in the last 365 days.'
              : 'Try adjusting the filters above.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([date, daySignals]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-semibold" style={{ color: '#00B4D8' }}>{date}</span>
                <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(0,180,216,0.1)', color: '#00B4D8', border: '1px solid rgba(0,180,216,0.2)' }}>
                  {daySignals.length} signal{daySignals.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="rounded-xl overflow-hidden"
                   style={{ border: '1px solid #1E3558' }}>
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ backgroundColor: '#0D1F3C' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#162848', borderBottom: '1px solid #1E3558' }}>
                        <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: '#64748b' }}>Ticker</th>
                        <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: '#64748b' }}>Date</th>
                        <th className="px-3 py-2 text-left text-xs font-medium" style={{ color: '#64748b' }}>Book</th>
                        <th className="px-3 py-2 text-right text-xs font-medium" style={{ color: '#64748b' }}>Entry</th>
                        <th className="px-3 py-2 text-right text-xs font-medium" style={{ color: '#64748b' }}>Stop</th>
                        <th className="px-3 py-2 text-right text-xs font-medium" style={{ color: '#64748b' }}>Strength</th>
                        <th className="px-3 py-2 text-right text-xs font-medium" style={{ color: '#64748b' }}>P&L</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {daySignals.map(s => {
                        const id = `${s.ticker}-${s.date}`;
                        return (
                          <SignalRow
                            key={id}
                            signal={s}
                            expanded={expandedId === id}
                            onToggle={() => setExpandedId(expandedId === id ? null : id)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* How trades get recorded */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#00B4D8' }}>
          How to Record a Trade
        </h3>
        <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
          When you take a signal, go to the <strong style={{ color: 'white' }}>Signals</strong> tab and click{' '}
          <strong style={{ color: '#00B4D8' }}>+ Trade</strong> next to the signal. Enter your entry price,
          quantity, and stop. The trade appears in the <strong style={{ color: 'white' }}>Portfolio</strong> tab
          as an open position. When you exit, click <strong style={{ color: '#34d399' }}>Exit</strong> to record
          the exit price — P&L will appear here automatically.
        </p>
      </div>
    </div>
  );
}
