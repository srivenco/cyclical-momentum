import { useState, useEffect } from 'react';
import { getQualityWatchlist, refreshQualityCache, addTrade, getPortfolio } from '../api';
import { useCapital } from '../hooks/useCapital';

// ── Colour palette (matches existing dashboard) ───────────────────────────────
const C = {
  bg:       '#0A1628',
  card:     '#0D1F3C',
  border:   '#1E3558',
  blue:     '#00B4D8',
  green:    '#34d399',
  red:      '#ef4444',
  amber:    '#f59e0b',
  muted:    '#64748b',
  purple:   '#a78bfa',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n, dec = 1) => n == null ? '—' : `${n > 0 ? '+' : ''}${Number(n).toFixed(dec)}%`;
const fmtRaw = (n, dec = 1) => n == null ? '—' : Number(n).toFixed(dec);
const rupee = (n) => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`;

function Badge({ label, color }) {
  const map = {
    green:  { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.3)' },
    red:    { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    blue:   { bg: 'rgba(0,180,216,0.12)',  color: '#00B4D8', border: 'rgba(0,180,216,0.3)' },
    amber:  { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
    purple: { bg: 'rgba(167,139,250,0.12)',color: '#a78bfa', border: 'rgba(167,139,250,0.3)' },
  };
  const s = map[color] || map.blue;
  return (
    <span className="text-xs px-2 py-0.5 rounded font-medium"
          style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {label}
    </span>
  );
}

function SectionHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: C.muted }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// ── LTCG Progress Bar ─────────────────────────────────────────────────────────
function LtcgBar({ daysHeld, daysToLtcg, isLtcg }) {
  const pct = Math.min(100, (daysHeld / 365) * 100);
  const color = isLtcg ? C.green : pct > 70 ? C.amber : C.blue;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1" style={{ color: C.muted }}>
        <span>Day {daysHeld}</span>
        <span>{isLtcg ? '✓ LTCG Eligible' : `${daysToLtcg}d to LTCG`}</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ backgroundColor: '#1E3558' }}>
        <div className="h-1.5 rounded-full transition-all"
             style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Add-to-Portfolio Modal ────────────────────────────────────────────────────
function AddTradeModal({ signal, onClose, onAdded }) {
  const { capital } = useCapital();
  const [qty, setQty] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  // Auto-suggest quantity based on 2% capital risk
  useEffect(() => {
    if (capital.total && signal.entry_price && signal.initial_stop) {
      const risk     = signal.entry_price - signal.initial_stop;
      const riskAmt  = capital.total * (capital.riskPct / 100 || 0.02);
      const suggested = Math.floor(riskAmt / risk);
      if (suggested > 0) setQty(String(suggested));
    }
  }, [capital, signal]);

  const totalCost = qty ? (parseInt(qty) * signal.entry_price).toFixed(0) : null;
  const riskAmt   = qty ? (parseInt(qty) * (signal.entry_price - signal.initial_stop)).toFixed(0) : null;

  const handleAdd = async () => {
    if (!qty || parseInt(qty) <= 0) { setError('Enter a valid quantity'); return; }
    setAdding(true);
    try {
      await addTrade({
        ticker:       signal.ticker,
        book:         'QUALITY_MOMENTUM',
        entry_date:   new Date().toISOString().split('T')[0],
        entry_price:  signal.entry_price,
        quantity:     parseInt(qty),
        initial_stop: signal.initial_stop,
        current_stop: signal.initial_stop,
        target_price: signal.target_price,
      });
      onAdded();
      onClose();
    } catch (e) {
      setError(e.message || 'Failed to add trade');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
         style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-96 rounded-xl p-5 space-y-4"
           style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Add to Portfolio</h3>
          <button onClick={onClose} className="text-sm" style={{ color: C.muted }}>✕</button>
        </div>

        {/* Signal summary */}
        <div className="rounded-lg p-3 space-y-1.5 text-xs"
             style={{ backgroundColor: 'rgba(0,180,216,0.06)', border: `1px solid rgba(0,180,216,0.2)` }}>
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>Ticker</span>
            <span className="font-semibold text-white">{signal.ticker.replace('.NS','')}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>Entry</span>
            <span className="text-white">{rupee(signal.entry_price)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>Stop (ATR)</span>
            <span style={{ color: C.red }}>{rupee(signal.initial_stop)}
              <span className="ml-1 opacity-70">({fmt(signal.stop_pct)})</span>
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>Target (2:1)</span>
            <span style={{ color: C.green }}>{rupee(signal.target_price)}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>Quality</span>
            <span style={{ color: C.muted }}>
              ROE {fmtRaw(signal.roe)}%&nbsp;·&nbsp;D/E {fmtRaw(signal.de, 2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: C.muted }}>12m Momentum</span>
            <span style={{ color: C.green }}>{fmt(signal.ret_12m)}</span>
          </div>
        </div>

        {/* LTCG note */}
        <div className="rounded-lg p-2.5 text-xs"
             style={{ backgroundColor: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
          <p style={{ color: C.green }}>
            🕐 Hold 12+ months for LTCG (12.5%) vs STCG (20%) — 7.5% tax saving on gains
          </p>
        </div>

        {/* Quantity input */}
        <div>
          <label className="text-xs mb-1 block" style={{ color: C.muted }}>Quantity (shares)</label>
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
            style={{ backgroundColor: '#162848', border: `1px solid ${C.border}` }}
            placeholder="Enter quantity"
          />
          {qty && (
            <div className="mt-1.5 flex gap-4 text-xs" style={{ color: C.muted }}>
              <span>Cost: <span className="text-white">{rupee(totalCost)}</span></span>
              <span>Risk: <span style={{ color: C.red }}>{rupee(riskAmt)}</span></span>
            </div>
          )}
        </div>

        {error && <p className="text-xs" style={{ color: C.red }}>{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose}
                  className="flex-1 text-sm py-2 rounded-lg transition-colors"
                  style={{ border: `1px solid ${C.border}`, color: C.muted }}>
            Cancel
          </button>
          <button onClick={handleAdd} disabled={adding}
                  className="flex-1 text-sm py-2 rounded-lg font-medium transition-colors"
                  style={{ backgroundColor: adding ? '#1E3558' : C.blue, color: '#0A1628' }}>
            {adding ? 'Adding…' : 'Add Position'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Signal Card ───────────────────────────────────────────────────────────────
function SignalCard({ signal, onAdd }) {
  const strengthColor = signal.signal_strength === 'STRONG' ? C.green : C.amber;
  return (
    <div className="rounded-xl p-4 space-y-3"
         style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">
              {signal.ticker.replace('.NS', '')}
            </span>
            <Badge label={signal.signal_strength} color={signal.signal_strength === 'STRONG' ? 'green' : 'amber'} />
            <Badge label={signal.sector.replace('_', ' ')} color="blue" />
          </div>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>
            Rank #{signal.rank} in Quality-Momentum Universe
          </p>
        </div>
        <button
          onClick={() => onAdd(signal)}
          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
          style={{ backgroundColor: 'rgba(0,180,216,0.15)', color: C.blue,
                   border: `1px solid rgba(0,180,216,0.3)` }}>
          + Add Position
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        {[
          { label: 'Entry', value: rupee(signal.entry_price), color: 'text-white' },
          { label: 'Stop', value: rupee(signal.initial_stop), color: C.red },
          { label: 'Target (2:1)', value: rupee(signal.target_price), color: C.green },
          { label: '12m Return', value: fmt(signal.ret_12m), color: C.green },
          { label: '3m Return', value: fmt(signal.ret_3m), color: signal.ret_3m > 0 ? C.green : C.red },
          { label: 'Vol Ratio', value: `${signal.vol_ratio}×`, color: C.blue },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg p-2"
               style={{ backgroundColor: 'rgba(30,53,88,0.4)' }}>
            <p style={{ color: C.muted }}>{label}</p>
            <p className="font-semibold mt-0.5" style={{ color }}>{value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-4 text-xs pt-1" style={{ borderTop: `1px solid ${C.border}` }}>
        {signal.roe != null && (
          <span style={{ color: C.muted }}>
            ROE <span style={{ color: signal.roe >= 15 ? C.green : C.red }}>{fmtRaw(signal.roe)}%</span>
          </span>
        )}
        {signal.de != null && (
          <span style={{ color: C.muted }}>
            D/E <span style={{ color: signal.de <= 1 ? C.green : C.amber }}>{fmtRaw(signal.de, 2)}</span>
          </span>
        )}
        <span style={{ color: C.muted }}>
          20d <span style={{ color: C.blue }}>{fmt(signal.ret_20d)}</span>
        </span>
        {!signal.quality_confirmed && (
          <Badge label="Quality unconfirmed" color="amber" />
        )}
      </div>
    </div>
  );
}

// ── Watchlist Row ─────────────────────────────────────────────────────────────
function WatchlistRow({ item, onAdd, isSignal }) {
  return (
    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white">
            {item.ticker.replace('.NS', '')}
          </span>
          {isSignal && <Badge label="Signal" color="green" />}
        </div>
        <span className="text-xs" style={{ color: C.muted }}>
          {item.sector.replace('_', ' ')}
        </span>
      </td>
      <td className="py-2.5 px-3 text-right text-xs text-white">{rupee(item.price)}</td>
      <td className="py-2.5 px-3 text-right text-xs"
          style={{ color: item.ret_12m > 0 ? C.green : C.red }}>
        {fmt(item.ret_12m)}
      </td>
      <td className="py-2.5 px-3 text-right text-xs"
          style={{ color: item.ret_3m > 0 ? C.green : C.red }}>
        {fmt(item.ret_3m)}
      </td>
      <td className="py-2.5 px-3 text-right text-xs"
          style={{ color: item.roe >= 15 ? C.green : C.amber }}>
        {item.roe != null ? `${fmtRaw(item.roe)}%` : '—'}
      </td>
      <td className="py-2.5 px-3 text-right text-xs"
          style={{ color: item.de <= 1 ? C.green : C.amber }}>
        {item.de != null ? fmtRaw(item.de, 2) : '—'}
      </td>
      <td className="py-2.5 px-3 text-right">
        <span className="text-xs font-semibold" style={{ color: C.muted }}>#{item.rank}</span>
      </td>
      <td className="py-2.5 px-3 text-right">
        {isSignal && (
          <button onClick={() => onAdd(item)}
                  className="text-xs px-2 py-1 rounded transition-colors"
                  style={{ backgroundColor: 'rgba(0,180,216,0.1)', color: C.blue,
                           border: `1px solid rgba(0,180,216,0.2)` }}>
            + Add
          </button>
        )}
      </td>
    </tr>
  );
}

// ── Holdings Tax Tracker ──────────────────────────────────────────────────────
function TaxTracker({ trades }) {
  const qmTrades = trades.filter(t => t.book === 'QUALITY_MOMENTUM' && t.status === 'open');

  if (qmTrades.length === 0) {
    return (
      <div className="rounded-xl p-8 text-center"
           style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
        <p className="text-sm" style={{ color: C.muted }}>
          No open Quality Momentum positions. Add signals above to start tracking LTCG.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {qmTrades.map(t => {
        const daysHeld  = Math.floor(
          (Date.now() - new Date(t.entry_date).getTime()) / 86400000
        );
        const daysToLt  = Math.max(0, 365 - daysHeld);
        const isLtcg    = daysHeld >= 365;
        const taxRate   = isLtcg ? 12.5 : 20;
        const grossGain = t.pnl_pct;
        const netGain   = grossGain != null ? (grossGain * (1 - taxRate / 100)) : null;
        const current   = t.current_price || t.entry_price;

        return (
          <div key={t.id} className="rounded-xl p-4"
               style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  {t.ticker.replace('.NS', '')}
                </span>
                <Badge label={isLtcg ? 'LTCG 12.5%' : `STCG 20% → ${daysToLt}d left`}
                       color={isLtcg ? 'green' : 'amber'} />
              </div>
              <div className="text-right text-xs">
                {grossGain != null && (
                  <div className="flex gap-3">
                    <span style={{ color: C.muted }}>
                      Gross: <span style={{ color: grossGain >= 0 ? C.green : C.red }}>
                        {fmt(grossGain)}
                      </span>
                    </span>
                    <span style={{ color: C.muted }}>
                      After-tax: <span style={{ color: netGain >= 0 ? C.green : C.red }}>
                        {fmt(netGain)}
                      </span>
                    </span>
                    <span style={{ color: C.red }}>
                      Tax drag: -{fmtRaw(Math.abs(grossGain - netGain))}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            <LtcgBar daysHeld={daysHeld} daysToLtcg={daysToLt} isLtcg={isLtcg} />

            <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
              {[
                { label: 'Entry', value: rupee(t.entry_price) },
                { label: 'Current', value: rupee(current) },
                { label: 'Quantity', value: t.quantity },
                { label: 'Days Held', value: daysHeld },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p style={{ color: C.muted }}>{label}</p>
                  <p className="font-medium text-white mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function QualityMomentum() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [trades, setTrades]     = useState([]);
  const [modal, setModal]       = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState('signals');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [qd, pt] = await Promise.all([getQualityWatchlist(), getPortfolio()]);
      setData(qd);
      setTrades(pt.trades || []);
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRefreshCache = async () => {
    setRefreshing(true);
    try {
      await refreshQualityCache();
      setTimeout(load, 3000);  // reload after 3s
    } catch (e) {
      setError('Cache refresh failed');
    } finally {
      setTimeout(() => setRefreshing(false), 5000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-sm" style={{ color: C.muted }}>
          Loading quality-momentum data…
          <br />
          <span className="text-xs mt-1 block" style={{ color: C.muted }}>
            (Computing momentum for ~90 stocks, may take 30s)
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl p-6 text-center"
           style={{ backgroundColor: C.card, border: `1px solid rgba(239,68,68,0.3)` }}>
        <p className="text-sm" style={{ color: C.red }}>{error}</p>
        <button onClick={load} className="mt-3 text-xs px-4 py-2 rounded-lg"
                style={{ backgroundColor: 'rgba(0,180,216,0.1)', color: C.blue }}>
          Retry
        </button>
      </div>
    );
  }

  const { watchlist = [], signals = [], cache_fresh, cache_age, generated_at } = data || {};
  const signalTickers = new Set(signals.map(s => s.ticker));

  const SECTIONS = [
    { id: 'signals',   label: `Buy Signals (${signals.length})` },
    { id: 'watchlist', label: `Watchlist (${watchlist.length})` },
    { id: 'tax',       label: `LTCG Tracker` },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-white">Quality Momentum</h1>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>
            High-ROE compounders · 12-month momentum · 12-month hold for LTCG · Target +2–3% alpha
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Cache freshness */}
          <div className="text-xs px-3 py-1.5 rounded"
               style={{
                 backgroundColor: cache_fresh ? 'rgba(52,211,153,0.08)' : 'rgba(245,158,11,0.08)',
                 color: cache_fresh ? C.green : C.amber,
                 border: `1px solid ${cache_fresh ? 'rgba(52,211,153,0.2)' : 'rgba(245,158,11,0.2)'}`,
               }}>
            {cache_fresh
              ? `Quality data fresh`
              : `Quality data ${cache_age ?? '?'}d old`}
          </div>
          <button onClick={handleRefreshCache} disabled={refreshing}
                  className="text-xs px-3 py-1.5 rounded transition-colors"
                  style={{ backgroundColor: 'rgba(0,180,216,0.08)', color: C.blue,
                           border: `1px solid rgba(0,180,216,0.2)` }}>
            {refreshing ? 'Refreshing…' : '↻ Refresh Quality Data'}
          </button>
        </div>
      </div>

      {/* Strategy explainer */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            icon: '🔍',
            title: 'Quality Gate',
            body: 'ROE >15%, D/E <1. Filters for compounders with durable earnings and low leverage.',
            color: C.blue,
          },
          {
            icon: '📈',
            title: 'Momentum Rank',
            body: 'Top 25% by 12m return. Excludes stocks in top 10% of 3m return to avoid chasing.',
            color: C.purple,
          },
          {
            icon: '⏳',
            title: 'LTCG Patience',
            body: 'Hold 12+ months. Gains taxed at 12.5% vs 20% STCG — 7.5% tax saving compounds.',
            color: C.green,
          },
        ].map(({ icon, title, body, color }) => (
          <div key={title} className="rounded-xl p-3"
               style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span>{icon}</span>
              <span className="text-xs font-semibold" style={{ color }}>{title}</span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: C.muted }}>{body}</p>
          </div>
        ))}
      </div>

      {/* Section tabs */}
      <div className="flex gap-1" style={{ borderBottom: `1px solid ${C.border}` }}>
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
                  className="px-4 py-2 text-xs font-medium rounded-t transition-colors"
                  style={{
                    color: activeSection === s.id ? C.blue : C.muted,
                    backgroundColor: activeSection === s.id ? 'rgba(0,180,216,0.08)' : 'transparent',
                    borderBottom: activeSection === s.id ? `2px solid ${C.blue}` : '2px solid transparent',
                  }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Buy Signals ── */}
      {activeSection === 'signals' && (
        <div className="space-y-3">
          {signals.length === 0 ? (
            <div className="rounded-xl p-8 text-center"
                 style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
              <p className="text-sm font-medium text-white mb-1">No signals today</p>
              <p className="text-xs" style={{ color: C.muted }}>
                No watchlist stocks are firing a vol-crossover today. Check back tomorrow,
                or browse the Watchlist tab to see upcoming candidates.
              </p>
            </div>
          ) : (
            signals.map(s => (
              <SignalCard key={s.ticker} signal={s} onAdd={setModal} />
            ))
          )}
        </div>
      )}

      {/* ── Watchlist ── */}
      {activeSection === 'watchlist' && (
        <div className="rounded-xl overflow-hidden"
             style={{ backgroundColor: C.card, border: `1px solid ${C.border}` }}>
          <div className="p-3 text-xs" style={{ borderBottom: `1px solid ${C.border}` }}>
            <span style={{ color: C.muted }}>
              Top {watchlist.length} quality-momentum stocks ranked by 12m return.
              Green = passes filter · Amber = borderline · Only top 20 checked for entry timing.
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Stock', 'Price', '12m Ret', '3m Ret', 'ROE', 'D/E', 'Rank', ''].map(h => (
                    <th key={h} className="py-2.5 px-3 text-right first:text-left text-xs font-medium"
                        style={{ color: C.muted }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {watchlist.map(item => (
                  <WatchlistRow
                    key={item.ticker}
                    item={item}
                    isSignal={signalTickers.has(item.ticker)}
                    onAdd={setModal}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tax Tracker ── */}
      {activeSection === 'tax' && (
        <div className="space-y-3">
          <SectionHeader
            title="LTCG Tracker"
            subtitle="Open Quality Momentum positions — progress to 12-month LTCG threshold"
            right={
              <div className="text-xs px-3 py-1.5 rounded"
                   style={{ backgroundColor: 'rgba(52,211,153,0.08)', color: C.green,
                            border: '1px solid rgba(52,211,153,0.2)' }}>
                LTCG saves 7.5% per trade vs STCG
              </div>
            }
          />
          <TaxTracker trades={trades} />
        </div>
      )}

      {/* Modal */}
      {modal && (
        <AddTradeModal
          signal={modal}
          onClose={() => setModal(null)}
          onAdded={load}
        />
      )}

      {/* Footer */}
      <div className="text-xs pt-2" style={{ color: C.muted }}>
        Last computed: {generated_at ? new Date(generated_at).toLocaleString('en-IN') : '—'}
        {!cache_fresh && (
          <span className="ml-2" style={{ color: C.amber }}>
            · Quality data is stale — click Refresh to re-scrape Screener.in
          </span>
        )}
      </div>
    </div>
  );
}
