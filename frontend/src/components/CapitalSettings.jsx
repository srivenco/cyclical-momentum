import { useState } from 'react';
import { useCapital } from '../hooks/useCapital';

export default function CapitalSettings({ onClose }) {
  const { capital, setCapital } = useCapital();
  const [total, setTotal] = useState(capital.total || '');
  const [riskPct, setRiskPct] = useState(capital.riskPct || 2);

  const handleSave = (e) => {
    e.preventDefault();
    if (!total || isNaN(total)) return;
    setCapital(total, riskPct);
    onClose?.();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50"
         style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
         onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="w-full max-w-sm mx-4 rounded-2xl p-6"
           style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
        <h3 className="text-base font-semibold text-white mb-1">Capital Settings</h3>
        <p className="text-xs mb-5" style={{ color: '#64748b' }}>
          Used to calculate suggested position sizes on signals
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>
              Total Capital (₹)
            </label>
            <input
              type="number"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="e.g. 500000"
              className="w-full px-4 py-2.5 rounded-lg text-white placeholder-gray-600 focus:outline-none"
              style={{ backgroundColor: '#162848', border: '1px solid #1E3558' }}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#94a3b8' }}>
              Risk per trade (% of capital)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min="0.5" max="5" step="0.5"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                className="flex-1"
              />
              <span className="text-white font-semibold w-12 text-right">{riskPct}%</span>
            </div>
            {total && (
              <p className="text-xs mt-1" style={{ color: '#64748b' }}>
                ₹{Math.round(Number(total) * riskPct / 100).toLocaleString('en-IN')} max loss per trade
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: '#162848', color: '#94a3b8' }}>
              Cancel
            </button>
            <button type="submit" disabled={!total}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: !total ? '#1E3558' : '#00B4D8' }}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
