import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { getPortfolio, getNiftyBenchmark } from '../api';

function StatCard({ label, value, color }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
      <p className="text-xs mb-1" style={{ color: '#64748b' }}>{label}</p>
      <p className="text-base font-bold" style={{ color: color || 'white' }}>{value ?? '—'}</p>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg px-3 py-2 text-xs space-y-1" style={{ backgroundColor: '#162848', border: '1px solid #1E3558' }}>
        <p style={{ color: '#94a3b8' }}>{label}</p>
        {payload.map((p) => (
          <p key={p.dataKey} className="font-bold" style={{ color: p.color }}>
            {p.name}: {p.value >= 0 ? '+' : ''}{p.value?.toFixed(2)}%
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function EquityCurve() {
  const [data, setData] = useState(null);
  const [nifty, setNifty] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getPortfolio(),
      getNiftyBenchmark().catch(() => []),
    ])
      .then(([d, n]) => { setData(d); setNifty(Array.isArray(n) ? n : []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-48 rounded animate-pulse" style={{ backgroundColor: '#162848' }} />
        <div className="h-32 rounded animate-pulse" style={{ backgroundColor: '#162848' }} />
      </div>
    );
  }

  const trades = data?.trades || [];
  const closedTrades = trades
    .filter(t => t.status === 'closed' && t.exit_date && t.pnl_pct != null)
    .sort((a, b) => a.exit_date.localeCompare(b.exit_date));

  // Build equity curve (cumulative return, equal weight per trade)
  let cumulative = 0;
  const equityData = closedTrades.map((t) => {
    cumulative += t.pnl_pct;
    // Find closest Nifty pct on this exit date
    const niftyMatch = nifty.find(n => n.date === t.exit_date) || nifty.findLast?.(n => n.date <= t.exit_date);
    return {
      date: t.exit_date,
      label: t.exit_date.slice(5),
      strategy: parseFloat(cumulative.toFixed(2)),
      nifty: niftyMatch ? parseFloat(niftyMatch.pct.toFixed(2)) : null,
      ticker: t.ticker.replace('.NS', ''),
    };
  });

  // Nifty-only series for when we have no closed trades — show Nifty standalone
  const niftyOnlyData = nifty.filter((_, i) => i % 5 === 0).map(n => ({
    label: n.date.slice(5),
    nifty: n.pct,
  }));

  // Monthly P&L
  const monthlyMap = {};
  closedTrades.forEach((t) => {
    const month = t.exit_date?.slice(0, 7); // YYYY-MM
    if (!month) return;
    monthlyMap[month] = (monthlyMap[month] || 0) + (t.pnl_pct || 0);
  });
  const monthlyData = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnl]) => ({ month: month.slice(5), fullMonth: month, pnl: parseFloat(pnl.toFixed(2)) }));

  // Stats
  const totalTrades = closedTrades.length;
  const wins = closedTrades.filter(t => t.pnl_pct > 0).length;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(0) : null;
  const avgReturn = totalTrades > 0
    ? (closedTrades.reduce((s, t) => s + t.pnl_pct, 0) / totalTrades).toFixed(2)
    : null;
  const avgDays = closedTrades.length > 0
    ? Math.round(closedTrades.reduce((s, t) => {
        if (!t.entry_date || !t.exit_date) return s;
        return s + Math.floor((new Date(t.exit_date) - new Date(t.entry_date)) / 86400000);
      }, 0) / closedTrades.length)
    : null;
  const bestTrade = closedTrades.length > 0 ? Math.max(...closedTrades.map(t => t.pnl_pct)) : null;
  const worstTrade = closedTrades.length > 0 ? Math.min(...closedTrades.map(t => t.pnl_pct)) : null;

  if (closedTrades.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">
          <p className="text-sm font-medium text-white mb-1">No closed trades yet</p>
          <p className="text-xs" style={{ color: '#64748b' }}>Strategy P&L will appear once you record exits</p>
        </div>
        {niftyOnlyData.length > 0 && (
          <div className="rounded-xl p-4" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
            <h3 className="text-sm font-semibold text-white mb-1">Nifty50 — 1 Year</h3>
            <p className="text-xs mb-4" style={{ color: '#475569' }}>
              Benchmark return: <span style={{ color: niftyOnlyData[niftyOnlyData.length-1]?.nifty >= 0 ? '#34d399' : '#ef4444', fontWeight: 600 }}>
                {niftyOnlyData[niftyOnlyData.length-1]?.nifty >= 0 ? '+' : ''}{niftyOnlyData[niftyOnlyData.length-1]?.nifty?.toFixed(1)}%
              </span>
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={niftyOnlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E3558" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} interval={20} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `${v}%`} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0} stroke="#334155" />
                <Line type="monotone" dataKey="nifty" name="Nifty50" stroke="#475569"
                      strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Trades" value={totalTrades} />
        <StatCard label="Win Rate" value={winRate ? `${winRate}%` : '—'} color="#34d399" />
        <StatCard label="Avg Return" value={avgReturn ? `${Number(avgReturn) >= 0 ? '+' : ''}${avgReturn}%` : '—'}
                  color={Number(avgReturn) >= 0 ? '#34d399' : '#ef4444'} />
        <StatCard label="Avg Hold Days" value={avgDays} />
        <StatCard label="Best Trade" value={bestTrade != null ? `+${bestTrade}%` : '—'} color="#34d399" />
        <StatCard label="Worst Trade" value={worstTrade != null ? `${worstTrade}%` : '—'} color="#ef4444" />
      </div>

      {/* Equity Curve vs Nifty */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-white">Cumulative Return vs Nifty50</h3>
          {equityData.length > 0 && (
            <div className="flex items-center gap-4 text-xs">
              <span style={{ color: '#00B4D8' }}>
                Strategy: {equityData[equityData.length-1]?.strategy >= 0 ? '+' : ''}{equityData[equityData.length-1]?.strategy?.toFixed(1)}%
              </span>
              {equityData[equityData.length-1]?.nifty != null && (
                <span style={{ color: '#475569' }}>
                  Nifty: {equityData[equityData.length-1]?.nifty >= 0 ? '+' : ''}{equityData[equityData.length-1]?.nifty?.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>
        <p className="text-xs mb-4" style={{ color: '#475569' }}>
          Nifty anchored to strategy start date · each point = trade exit
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={equityData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E3558" />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#334155" />
            <Line type="monotone" dataKey="strategy" name="Strategy"
                  stroke="#00B4D8" strokeWidth={2}
                  dot={{ fill: '#00B4D8', r: 3 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="nifty" name="Nifty50"
                  stroke="#475569" strokeWidth={1.5} strokeDasharray="4 2"
                  dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly P&L */}
      {monthlyData.length > 0 && (
        <div className="rounded-xl p-4" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
          <h3 className="text-sm font-semibold text-white mb-4">Monthly P&L</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E3558" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#334155" />
              <Bar dataKey="pnl" radius={[3, 3, 0, 0]}
                   fill="#00B4D8"
                   label={false}
                   // Color bars by positive/negative
                   isAnimationActive={false}>
                {monthlyData.map((entry, index) => (
                  <rect key={index} fill={entry.pnl >= 0 ? '#34d399' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
