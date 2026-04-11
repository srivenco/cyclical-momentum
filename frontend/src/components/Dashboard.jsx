import { useState, useEffect } from 'react';
import MacroRegime from './MacroRegime';
import SignalFeed from './SignalFeed';
import PortfolioSummary from './PortfolioSummary';
import EquityCurve from './EquityCurve';
import MacroDetail from './MacroDetail';
import SignalHistory from './SignalHistory';
import CapitalSettings from './CapitalSettings';
import QualityMomentum from './QualityMomentum';
import { useCapital } from '../hooks/useCapital';
import { getPortfolio } from '../api';

function useRiskMeter() {
  const [risk, setRisk] = useState({ totalRisk: 0, pct: 0, openCount: 0 });
  const { capital } = useCapital();

  useEffect(() => {
    getPortfolio()
      .then(data => {
        const open = (data?.trades || []).filter(t => t.status === 'open');
        const totalRisk = open.reduce((sum, t) => {
          const stop = t.current_stop || t.initial_stop;
          return sum + Math.abs(t.entry_price - stop) * t.quantity;
        }, 0);
        const pct = capital.total ? (totalRisk / capital.total) * 100 : 0;
        setRisk({ totalRisk: Math.round(totalRisk), pct: parseFloat(pct.toFixed(1)), openCount: open.length });
      })
      .catch(() => {});
  }, [capital.total]);

  return risk;
}

const TABS = [
  { id: 'signals',     label: 'Signals' },
  { id: 'quality',     label: '✦ Quality' },
  { id: 'history',     label: 'History' },
  { id: 'portfolio',   label: 'Portfolio' },
  { id: 'macro',       label: 'Macro Regime' },
  { id: 'performance', label: 'Performance' },
];

export default function Dashboard({ onLogout }) {
  const [activeTab, setActiveTab] = useState('signals');
  const [showCapital, setShowCapital] = useState(false);
  const { capital } = useCapital();
  const riskMeter = useRiskMeter();

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

          {/* Risk meter */}
          {riskMeter.openCount > 0 && (
            <div className="text-xs px-3 py-1.5 rounded flex items-center gap-1.5"
                 style={{
                   backgroundColor: riskMeter.pct > 6 ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.08)',
                   color: riskMeter.pct > 6 ? '#ef4444' : '#34d399',
                   border: `1px solid ${riskMeter.pct > 6 ? 'rgba(239,68,68,0.3)' : 'rgba(52,211,153,0.2)'}`,
                 }}>
              <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              ₹{riskMeter.totalRisk.toLocaleString('en-IN')} at risk
              {capital.total ? ` · ${riskMeter.pct}%` : ''}
            </div>
          )}

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
            {activeTab === 'quality'     && <QualityMomentum />}
            {activeTab === 'history'     && <SignalHistory />}
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
