import { useState, useEffect } from 'react';
import MacroRegime from './MacroRegime';
import SignalFeed from './SignalFeed';
import PortfolioSummary from './PortfolioSummary';
import EquityCurve from './EquityCurve';
import MacroDetail from './MacroDetail';
import CapitalSettings from './CapitalSettings';
import { useCapital } from '../hooks/useCapital';
import { getMacro } from '../api';

const TABS = [
  { id: 'signals',     label: 'Signals' },
  { id: 'portfolio',   label: 'Portfolio' },
  { id: 'macro',       label: 'Macro Regime' },
  { id: 'performance', label: 'Performance' },
];

export default function Dashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('signals');
  const [showCapital, setShowCapital] = useState(false);
  const { capital } = useCapital();

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

        <div className="flex items-center gap-2">
          {/* Capital indicator */}
          <button onClick={() => setShowCapital(true)}
                  className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
                  style={{ backgroundColor: capital.total ? 'rgba(0,180,216,0.1)' : 'rgba(244,196,48,0.1)',
                           color: capital.total ? '#00B4D8' : '#F4C430',
                           border: `1px solid ${capital.total ? 'rgba(0,180,216,0.3)' : 'rgba(244,196,48,0.3)'}` }}>
            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
            </svg>
            {capital.total
              ? `₹${(capital.total / 100000).toFixed(1)}L · ${capital.riskPct}% risk`
              : 'Set Capital'}
          </button>

          <button onClick={onLogout}
                  className="text-xs px-3 py-1.5 rounded transition-colors"
                  style={{ color: '#64748b', border: '1px solid #1E3558' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#ef4444'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#1E3558'; }}>
            Logout
          </button>
        </div>
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
          <div className="flex items-center gap-1 px-4 pt-3 pb-0 shrink-0"
               style={{ borderBottom: '1px solid #1E3558' }}>
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                      className="px-4 py-2 text-sm font-medium rounded-t transition-colors"
                      style={{
                        color: activeTab === tab.id ? '#00B4D8' : '#64748b',
                        backgroundColor: activeTab === tab.id ? 'rgba(0,180,216,0.08)' : 'transparent',
                        borderBottom: activeTab === tab.id ? '2px solid #00B4D8' : '2px solid transparent',
                      }}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'signals'     && <SignalFeed />}
            {activeTab === 'portfolio'   && <PortfolioSummary />}
            {activeTab === 'macro'       && <MacroDetail />}
            {activeTab === 'performance' && <EquityCurve />}
          </div>
        </main>
      </div>

      {showCapital && <CapitalSettings onClose={() => setShowCapital(false)} />}
    </div>
  );
}
