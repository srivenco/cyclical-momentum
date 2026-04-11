import { useState, useEffect } from 'react';
import MacroRegime from './MacroRegime';
import SignalFeed from './SignalFeed';
import PortfolioSummary from './PortfolioSummary';
import EquityCurve from './EquityCurve';
import { getMacro } from '../api';

const TABS = [
  { id: 'signals', label: 'Signals' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'regime', label: 'Regime Detail' },
  { id: 'performance', label: 'Performance' },
];

export default function Dashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('signals');

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0A1628' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 shrink-0"
              style={{ backgroundColor: '#0D1F3C', borderBottom: '1px solid #1E3558' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg"
               style={{ backgroundColor: '#162848', border: '1px solid #00B4D8' }}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#00B4D8" strokeWidth="2.5">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">Cyclical Momentum</h1>
            <p className="text-xs" style={{ color: '#64748b' }}>SrivenCap Strategy Dashboard</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="text-xs px-3 py-1.5 rounded transition-colors"
          style={{ color: '#64748b', border: '1px solid #1E3558' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#1E3558'; }}
        >
          Logout
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 overflow-y-auto"
               style={{ backgroundColor: '#0D1F3C', borderRight: '1px solid #1E3558' }}>
          <MacroRegime />
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-4 pt-3 pb-0 shrink-0"
               style={{ borderBottom: '1px solid #1E3558' }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2 text-sm font-medium rounded-t transition-colors"
                style={{
                  color: activeTab === tab.id ? '#00B4D8' : '#64748b',
                  backgroundColor: activeTab === tab.id ? 'rgba(0,180,216,0.08)' : 'transparent',
                  borderBottom: activeTab === tab.id ? '2px solid #00B4D8' : '2px solid transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'signals' && <SignalFeed />}
            {activeTab === 'portfolio' && <PortfolioSummary />}
            {activeTab === 'regime' && <RegimeDetail />}
            {activeTab === 'performance' && <EquityCurve />}
          </div>
        </main>
      </div>
    </div>
  );
}

function RegimeDetail() {
  const [macro, setMacro] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMacro()
      .then(setMacro)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-8 rounded animate-pulse" style={{ backgroundColor: '#162848' }} />
        ))}
      </div>
    );
  }

  if (!macro) {
    return <p style={{ color: '#64748b' }}>No macro data available. Run the scheduler first.</p>;
  }

  const rows = [
    ['Date', macro.date],
    ['Nifty Price', `₹${(macro.nifty_price || 0).toLocaleString('en-IN')}`],
    ['Nifty 200MA', `₹${(macro.nifty_ma200 || 0).toLocaleString('en-IN')}`],
    ['Nifty vs 200MA', `${macro.nifty_vs_200ma > 0 ? '+' : ''}${macro.nifty_vs_200ma}%`],
    ['Crude Oil', `$${macro.crude_price}`],
    ['Crude Trend', macro.crude_trend],
    ['Copper', `$${macro.copper_price}`],
    ['Copper Trend', macro.copper_trend],
    ['US 10Y Yield', `${macro.us10y?.toFixed(2)}%`],
    ['US10Y 63d Change', `${macro.us10y_63d_change > 0 ? '+' : ''}${macro.us10y_63d_change?.toFixed(3)}%`],
    ['Rate Regime', macro.rate_regime],
    ['Commodity Bull', macro.commodity_bull ? 'YES' : 'NO'],
    ['Nifty Regime', macro.nifty_regime],
  ];

  return (
    <div>
      <h2 className="text-sm font-semibold text-white mb-4">Macro Regime — Full Detail</h2>
      <div className="rounded-xl overflow-hidden max-w-lg" style={{ border: '1px solid #1E3558' }}>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([label, value], i) => (
              <tr key={label} style={{ backgroundColor: i % 2 === 0 ? '#0D1F3C' : '#0A1628' }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: '#94a3b8', width: '45%' }}>{label}</td>
                <td className="px-4 py-2.5 text-white">{value ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-3" style={{ color: '#334155' }}>
        Last updated: {macro.updated_at ? new Date(macro.updated_at).toLocaleString('en-IN') : '—'}
      </p>
    </div>
  );
}
