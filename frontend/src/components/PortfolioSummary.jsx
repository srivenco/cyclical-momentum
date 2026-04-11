import { useState, useEffect } from 'react';
import { getPortfolio, recordExit, updateStop } from '../api';

function SummaryCard({ label, value, color }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
      <p className="text-xs mb-1" style={{ color: '#64748b' }}>{label}</p>
      <p className="text-lg font-bold" style={{ color: color || 'white' }}>{value ?? '—'}</p>
    </div>
  );
}

function ExitModal({ trade, onClose, onSubmit }) {
  const [exitPrice, setExitPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pnlPreview = exitPrice && !isNaN(exitPrice)
    ? ((Number(exitPrice) - trade.entry_price) / trade.entry_price * 100).toFixed(2)
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!exitPrice || isNaN(exitPrice)) return;
    setSubmitting(true);
    await onSubmit(trade.id, Number(exitPrice));
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50"
         style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm mx-4 rounded-2xl p-6"
           style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
        <h3 className="text-base font-semibold text-white mb-1">Record Exit</h3>
        <p className="text-sm mb-4" style={{ color: '#64748b' }}>
          {trade.ticker} | Entry ₹{trade.entry_price} × {trade.quantity}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>Exit Price</label>
            <input
              type="number"
              step="0.05"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              placeholder={`Entry: ₹${trade.entry_price}`}
              className="w-full px-4 py-2.5 rounded-lg text-white placeholder-gray-600 focus:outline-none"
              style={{ backgroundColor: '#162848', border: '1px solid #1E3558' }}
              autoFocus
            />
          </div>

          {pnlPreview !== null && (
            <p className="text-sm font-semibold"
               style={{ color: Number(pnlPreview) >= 0 ? '#34d399' : '#ef4444' }}>
              P&L: {Number(pnlPreview) >= 0 ? '+' : ''}{pnlPreview}%
            </p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: '#162848', color: '#94a3b8' }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || !exitPrice}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: !exitPrice ? '#1E3558' : '#00B4D8' }}>
              {submitting ? 'Saving…' : 'Record Exit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StopModal({ trade, onClose, onSubmit }) {
  const [newStop, setNewStop] = useState(trade.current_stop || trade.initial_stop || '');
  const [submitting, setSubmitting] = useState(false);

  const riskPct = newStop && !isNaN(newStop)
    ? ((Number(newStop) - trade.entry_price) / trade.entry_price * 100).toFixed(2)
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newStop || isNaN(newStop) || Number(newStop) >= trade.entry_price) return;
    setSubmitting(true);
    await onSubmit(trade.id, Number(newStop));
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50"
         style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm mx-4 rounded-2xl p-6"
           style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
        <h3 className="text-base font-semibold text-white mb-1">Update Trailing Stop</h3>
        <p className="text-sm mb-4" style={{ color: '#64748b' }}>
          {trade.ticker.replace('.NS','')} · Entry ₹{trade.entry_price} · Current stop ₹{trade.current_stop}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>New Stop Price</label>
            <input type="number" step="0.05" value={newStop}
                   onChange={(e) => setNewStop(e.target.value)}
                   placeholder={`Must be below ₹${trade.entry_price}`}
                   className="w-full px-4 py-2.5 rounded-lg text-white placeholder-gray-600 focus:outline-none"
                   style={{ backgroundColor: '#162848', border: '1px solid #1E3558' }} autoFocus />
            {riskPct !== null && (
              <p className="text-xs mt-1" style={{ color: Number(riskPct) < 0 ? '#ef4444' : '#fbbf24' }}>
                Risk from entry: {riskPct}%
                {Number(newStop) > trade.current_stop && (
                  <span style={{ color: '#34d399' }}> ↑ Trailing up — locking in profit</span>
                )}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: '#162848', color: '#94a3b8' }}>Cancel</button>
            <button type="submit"
                    disabled={submitting || !newStop || Number(newStop) >= trade.entry_price}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: (!newStop || Number(newStop) >= trade.entry_price) ? '#1E3558' : '#f59e0b' }}>
              {submitting ? 'Saving…' : 'Update Stop'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PortfolioSummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exitTrade, setExitTrade] = useState(null);
  const [stopTrade, setStopTrade] = useState(null);
  const [toast, setToast] = useState(null);
  const [tab, setTab] = useState('open');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchPortfolio = () => {
    setLoading(true);
    getPortfolio()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPortfolio(); }, []);

  const handleExit = async (tradeId, exitPrice) => {
    try {
      await recordExit({ trade_id: tradeId, exit_price: exitPrice });
      showToast('Exit recorded');
      setExitTrade(null);
      fetchPortfolio();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleUpdateStop = async (tradeId, newStop) => {
    try {
      await updateStop({ trade_id: tradeId, new_stop: newStop });
      showToast('Stop updated');
      setStopTrade(null);
      fetchPortfolio();
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

  const trades = data?.trades || [];
  const summary = data?.summary || {};
  const openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed').sort((a, b) => b.exit_date?.localeCompare(a.exit_date || '') || 0);

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg"
             style={{ backgroundColor: toast.type === 'error' ? '#7f1d1d' : '#064e3b', color: 'white', border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#34d399'}` }}>
          {toast.msg}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Total Deployed"
          value={summary.total_deployed ? `₹${summary.total_deployed.toLocaleString('en-IN')}` : '₹0'}
        />
        <SummaryCard
          label="Unrealised P&L"
          value={summary.unrealised_pnl != null ? `₹${summary.unrealised_pnl.toLocaleString('en-IN')}` : '—'}
          color={summary.unrealised_pnl >= 0 ? '#34d399' : '#ef4444'}
        />
        <SummaryCard
          label="Best Trade"
          value={summary.best_trade != null ? `+${summary.best_trade}%` : '—'}
          color="#34d399"
        />
        <SummaryCard
          label="Worst Trade"
          value={summary.worst_trade != null ? `${summary.worst_trade}%` : '—'}
          color="#ef4444"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1" style={{ borderBottom: '1px solid #1E3558' }}>
        {['open', 'closed'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
                  className="px-4 py-2 text-sm font-medium capitalize"
                  style={{
                    color: tab === t ? '#00B4D8' : '#64748b',
                    borderBottom: tab === t ? '2px solid #00B4D8' : '2px solid transparent',
                  }}>
            {t} ({t === 'open' ? openTrades.length : closedTrades.length})
          </button>
        ))}
      </div>

      {/* Trade table */}
      {tab === 'open' && (
        openTrades.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: '#64748b' }}>No open trades</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1E3558' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ backgroundColor: '#162848', color: '#64748b' }}>
                    <th className="px-3 py-2.5 text-left font-medium">Ticker</th>
                    <th className="px-3 py-2.5 text-left font-medium">Book</th>
                    <th className="px-3 py-2.5 text-right font-medium">Entry Date</th>
                    <th className="px-3 py-2.5 text-right font-medium">Entry ₹</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium">CMP</th>
                    <th className="px-3 py-2.5 text-right font-medium">P&L%</th>
                    <th className="px-3 py-2.5 text-right font-medium">Stop</th>
                    <th className="px-3 py-2.5 text-right font-medium">Target</th>
                    <th className="px-3 py-2.5 text-right font-medium">Days</th>
                    <th className="px-3 py-2.5 text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {openTrades.map((t, i) => {
                    const days = t.entry_date
                      ? Math.floor((new Date() - new Date(t.entry_date)) / 86400000)
                      : '—';
                    return (
                      <tr key={t.id} style={{ backgroundColor: i % 2 === 0 ? '#0D1F3C' : '#0A1628' }}>
                        <td className="px-3 py-2.5 font-semibold text-white">{t.ticker.replace('.NS', '')}</td>
                        <td className="px-3 py-2.5" style={{ color: '#94a3b8' }}>{t.book?.split('_').slice(1).join(' ')}</td>
                        <td className="px-3 py-2.5 text-right" style={{ color: '#94a3b8' }}>{t.entry_date}</td>
                        <td className="px-3 py-2.5 text-right text-white">₹{t.entry_price}</td>
                        <td className="px-3 py-2.5 text-right text-white">{t.quantity}</td>
                        <td className="px-3 py-2.5 text-right text-white">{t.current_price ? `₹${t.current_price}` : '—'}</td>
                        <td className="px-3 py-2.5 text-right font-semibold"
                            style={{ color: (t.pnl_pct || 0) >= 0 ? '#34d399' : '#ef4444' }}>
                          {t.pnl_pct != null ? `${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct}%` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right" style={{ color: '#ef4444' }}>₹{t.current_stop}</td>
                        <td className="px-3 py-2.5 text-right">
                          {t.target_price ? (
                            <div>
                              <span style={{ color: t.at_target ? '#34d399' : '#64748b' }}>₹{t.target_price}</span>
                              {t.at_target && (
                                <div className="text-xs mt-0.5 font-semibold" style={{ color: '#34d399' }}>🎯 At Target</div>
                              )}
                            </div>
                          ) : <span style={{ color: '#334155' }}>—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right" style={{ color: '#94a3b8' }}>{days}</td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex gap-1.5 justify-center">
                            <button onClick={() => setStopTrade(t)}
                                    className="px-2 py-1 rounded text-xs font-medium"
                                    style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(245,158,11,0.3)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(245,158,11,0.15)'}>
                              ✏ Stop
                            </button>
                            <button onClick={() => setExitTrade(t)}
                                    className="px-2 py-1 rounded text-xs font-medium"
                                    style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.3)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.15)'}>
                              Exit
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {tab === 'closed' && (
        closedTrades.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: '#64748b' }}>No closed trades yet</p>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1E3558' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ backgroundColor: '#162848', color: '#64748b' }}>
                    <th className="px-3 py-2.5 text-left font-medium">Ticker</th>
                    <th className="px-3 py-2.5 text-left font-medium">Book</th>
                    <th className="px-3 py-2.5 text-right font-medium">Entry</th>
                    <th className="px-3 py-2.5 text-right font-medium">Exit</th>
                    <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                    <th className="px-3 py-2.5 text-right font-medium">P&L%</th>
                    <th className="px-3 py-2.5 text-right font-medium">P&L ₹</th>
                    <th className="px-3 py-2.5 text-right font-medium">Exit Date</th>
                  </tr>
                </thead>
                <tbody>
                  {closedTrades.map((t, i) => {
                    const pnlRs = t.pnl_pct != null
                      ? ((t.pnl_pct / 100) * t.entry_price * t.quantity).toFixed(0)
                      : null;
                    return (
                      <tr key={t.id} style={{ backgroundColor: i % 2 === 0 ? '#0D1F3C' : '#0A1628' }}>
                        <td className="px-3 py-2.5 font-semibold text-white">{t.ticker.replace('.NS', '')}</td>
                        <td className="px-3 py-2.5" style={{ color: '#94a3b8' }}>{t.book?.split('_').slice(1).join(' ')}</td>
                        <td className="px-3 py-2.5 text-right text-white">₹{t.entry_price}</td>
                        <td className="px-3 py-2.5 text-right text-white">₹{t.exit_price}</td>
                        <td className="px-3 py-2.5 text-right" style={{ color: '#94a3b8' }}>{t.quantity}</td>
                        <td className="px-3 py-2.5 text-right font-semibold"
                            style={{ color: (t.pnl_pct || 0) >= 0 ? '#34d399' : '#ef4444' }}>
                          {t.pnl_pct != null ? `${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct}%` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold"
                            style={{ color: (t.pnl_pct || 0) >= 0 ? '#34d399' : '#ef4444' }}>
                          {pnlRs ? `${Number(pnlRs) >= 0 ? '+' : ''}₹${Number(pnlRs).toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right" style={{ color: '#94a3b8' }}>{t.exit_date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {exitTrade && (
        <ExitModal trade={exitTrade} onClose={() => setExitTrade(null)} onSubmit={handleExit} />
      )}
      {stopTrade && (
        <StopModal trade={stopTrade} onClose={() => setStopTrade(null)} onSubmit={handleUpdateStop} />
      )}
    </div>
  );
}
