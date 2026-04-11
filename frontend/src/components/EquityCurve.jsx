import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { getPortfolio } from '../api';

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
    const val = payload[0].value;
    return (
      <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: '#162848', border: '1px solid #1E3558' }}>
        <p style={{ color: '#94a3b8' }}>{label}</p>
        <p className="font-bold" style={{ color: val >= 0 ? '#34d399' : '#ef4444' }}>
          {val >= 0 ? '+' : ''}{val.toFixed(2)}%
        </p>
      </div>
    );
  }
  return null;
};

export default function EquityCurve() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPortfolio()
      .then(setData)
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
    return {
      date: t.exit_date,
      label: t.exit_date.slice(5), // MM-DD
      cumReturn: parseFloat(cumulative.toFixed(2)),
      ticker: t.ticker.replace('.NS', ''),
    };
  });

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
      <div className="text-center py-16">
        <p className="text-sm font-medium text-white mb-2">No closed trades yet</p>
        <p className="text-xs" style={{ color: '#64748b' }}>
          Performance data will appear here once you record exits
        </p>
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

      {/* Equity Curve */}
      <div className="rounded-xl p-4" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
        <h3 className="text-sm font-semibold text-white mb-4">Cumulative Return</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={equityData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E3558" />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#334155" />
            <Line
              type="monotone"
              dataKey="cumReturn"
              stroke="#00B4D8"
              strokeWidth={2}
              dot={{ fill: '#00B4D8', r: 3 }}
              activeDot={{ r: 5 }}
            />
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
