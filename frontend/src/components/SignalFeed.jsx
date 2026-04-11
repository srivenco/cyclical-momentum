import { useState, useEffect } from 'react';
import { getSignalsToday, getSignalsHistory, addTrade } from '../api';

const BOOK_STYLES = {
  F2_COMMODITY: { row: 'rgba(244,196,48,0.06)', badge: { bg: 'rgba(244,196,48,0.15)', text: '#F4C430', border: 'rgba(244,196,48,0.3)' } },
  F3B_RATEHIKE: { row: 'rgba(251,146,60,0.06)', badge: { bg: 'rgba(251,146,60,0.15)', text: '#fb923c', border: 'rgba(251,146,60,0.3)' } },
  F_RATECUT:    { row: 'rgba(34,211,238,0.06)', badge: { bg: 'rgba(34,211,238,0.15)', text: '#22d3ee', border: 'rgba(34,211,238,0.3)' } },
  F4_DEFENSIVE: { row: 'rgba(52,211,153,0.06)', badge: { bg: 'rgba(52,211,153,0.15)', text: '#34d399', border: 'rgba(52,211,153,0.3)' } },
};

const BOOK_LABELS = {
  F2_COMMODITY: 'Commodity',
  F3B_RATEHIKE: 'Rate Hike',
  F_RATECUT: 'Rate Cut',
  F4_DEFENSIVE: 'Defensive',
};

const STRENGTH_COLORS = {
  STRONG: '#34d399',
  MODERATE: '#fbbf24',
  NORMAL: '#94a3b8',
};

function Badge({ book }) {
  const s = BOOK_STYLES[book]?.badge || { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8', border: 'rgba(148,163,184,0.2)' };
  return (
    <span className="text-xs px-2 py-0.5 rounded font-medium"
          style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {BOOK_LABELS[book] || book}
    </span>
  );
}

function TradeModal({ signal, onClose, onSubmit }) {
  const [qty, setQty] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!qty || isNaN(qty) || Number(qty) <= 0) return;
    setSubmitting(true);
    await onSubmit(signal, Number(qty));
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50"
         style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm mx-4 rounded-2xl p-6"
           style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
        <h3 className="text-base font-semibold text-white mb-1">Mark as Traded</h3>
        <p className="text-sm mb-4" style={{ color: '#64748b' }}>
          {signal.ticker} — Entry ₹{signal.entry_price} | Stop ₹{signal.initial_stop}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Quantity</label>
            <input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="e.g. 50"
              className="w-full px-4 py-2.5 rounded-lg text-white placeholder-gray-600 focus:outline-none"
              style={{ backgroundColor: '#162848', border: '1px solid #1E3558' }}
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: '#162848', color: '#94a3b8' }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || !qty}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: !qty ? '#1E3558' : '#00B4D8' }}>
              {submitting ? 'Saving…' : 'Record Trade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SignalFeed() {
  const [today, setToday] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalSignal, setModalSignal] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    Promise.all([getSignalsToday(), getSignalsHistory()])
      .then(([t, h]) => {
        setToday(t);
        setHistory(Array.isArray(h) ? h : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleTrade = async (signal, qty) => {
    try {
      await addTrade({
        ticker: signal.ticker,
        book: signal.book,
        entry_date: signal.date,
        entry_price: signal.entry_price,
        quantity: qty,
        initial_stop: signal.initial_stop,
        current_stop: signal.initial_stop,
      });
      showToast(`${signal.ticker} added to portfolio`);
      setModalSignal(null);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 rounded animate-pulse" style={{ backgroundColor: '#162848' }} />
        ))}
      </div>
    );
  }

  const todaySignals = today?.signals || [];
  const recentHistory = history.filter(s => s.date !== today?.date).slice(-50)
    .sort((a, b) => b.date.localeCompare(a.date));
  const last7 = recentHistory.slice(0, 30);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg"
             style={{ backgroundColor: toast.type === 'error' ? '#7f1d1d' : '#064e3b', color: 'white', border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#34d399'}` }}>
          {toast.msg}
        </div>
      )}

      {/* Today's signals */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">
            Today's Signals
            {todaySignals.length > 0 && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs"
                    style={{ backgroundColor: 'rgba(0,180,216,0.15)', color: '#00B4D8' }}>
                {todaySignals.length}
              </span>
            )}
          </h2>
          {today?.generated_at && (
            <span className="text-xs" style={{ color: '#334155' }}>
              Scanned {new Date(today.generated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>

        {todaySignals.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
            <p className="text-sm font-medium text-white mb-1">No signals today</p>
            <p className="text-xs" style={{ color: '#64748b' }}>
              Checked {today?.total_checked || 0} stocks across{' '}
              {today?.active_books?.join(', ') || 'active books'}
            </p>
            <p className="text-xs mt-3" style={{ color: '#334155' }}>Next scan: Tomorrow 6:30am IST</p>
          </div>
        ) : (
          <SignalTable signals={todaySignals} onTrade={(s) => setModalSignal(s)} showAction />
        )}
      </section>

      {/* Last 7 days history */}
      {last7.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-white mb-3">Recent Signals (Last 7 Days)</h2>
          <SignalTable signals={last7} onTrade={(s) => setModalSignal(s)} showAction={false} />
        </section>
      )}

      {modalSignal && (
        <TradeModal
          signal={modalSignal}
          onClose={() => setModalSignal(null)}
          onSubmit={handleTrade}
        />
      )}
    </div>
  );
}

function SignalTable({ signals, onTrade, showAction }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1E3558' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ backgroundColor: '#162848', color: '#64748b' }}>
              <th className="px-3 py-2.5 text-left font-medium">Ticker</th>
              <th className="px-3 py-2.5 text-left font-medium">Book</th>
              <th className="px-3 py-2.5 text-left font-medium">Sector</th>
              <th className="px-3 py-2.5 text-right font-medium">Entry</th>
              <th className="px-3 py-2.5 text-right font-medium">Stop</th>
              <th className="px-3 py-2.5 text-right font-medium">Stop%</th>
              <th className="px-3 py-2.5 text-right font-medium">Vol Ratio</th>
              <th className="px-3 py-2.5 text-right font-medium">Momentum</th>
              <th className="px-3 py-2.5 text-center font-medium">Strength</th>
              {showAction && <th className="px-3 py-2.5 text-center font-medium">Action</th>}
            </tr>
          </thead>
          <tbody>
            {signals.map((s, i) => {
              const rowBg = BOOK_STYLES[s.book]?.row || 'transparent';
              return (
                <tr key={`${s.ticker}-${s.date}-${i}`}
                    style={{ backgroundColor: i % 2 === 0 ? '#0D1F3C' : '#0A1628' }}>
                  <td className="px-3 py-2.5 font-semibold text-white" style={{ backgroundColor: rowBg }}>
                    {s.ticker.replace('.NS', '')}
                    {s.circuit_breaker && (
                      <span className="ml-1 text-xs" style={{ color: '#fb923c' }} title="Circuit breaker active">⚠</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5" style={{ backgroundColor: rowBg }}>
                    <Badge book={s.book} />
                  </td>
                  <td className="px-3 py-2.5" style={{ color: '#94a3b8', backgroundColor: rowBg }}>{s.sector}</td>
                  <td className="px-3 py-2.5 text-right text-white" style={{ backgroundColor: rowBg }}>₹{s.entry_price}</td>
                  <td className="px-3 py-2.5 text-right" style={{ color: '#ef4444', backgroundColor: rowBg }}>₹{s.initial_stop}</td>
                  <td className="px-3 py-2.5 text-right" style={{ color: '#ef4444', backgroundColor: rowBg }}>{s.stop_pct}%</td>
                  <td className="px-3 py-2.5 text-right text-white" style={{ backgroundColor: rowBg }}>{s.vol_ratio}x</td>
                  <td className="px-3 py-2.5 text-right" style={{ color: '#34d399', backgroundColor: rowBg }}>+{s.prior_20d_return}%</td>
                  <td className="px-3 py-2.5 text-center" style={{ backgroundColor: rowBg }}>
                    <span className="font-semibold" style={{ color: STRENGTH_COLORS[s.signal_strength] }}>
                      {s.signal_strength}
                    </span>
                  </td>
                  {showAction && (
                    <td className="px-3 py-2.5 text-center" style={{ backgroundColor: rowBg }}>
                      <button
                        onClick={() => onTrade(s)}
                        className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
                        style={{ backgroundColor: 'rgba(0,180,216,0.15)', color: '#00B4D8', border: '1px solid rgba(0,180,216,0.3)' }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,180,216,0.3)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,180,216,0.15)'}
                      >
                        + Trade
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
