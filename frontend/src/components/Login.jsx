import { useState } from 'react';

export default function Login({ onLogin, loading, error }) {
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onLogin(password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-900"
         style={{ backgroundColor: '#0A1628' }}>
      <div className="w-full max-w-sm mx-4">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
               style={{ backgroundColor: '#162848', border: '2px solid #00B4D8' }}>
            <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="#00B4D8" strokeWidth="2">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Cyclical Momentum</h1>
          <p className="text-sm mt-1" style={{ color: '#64748b' }}>Strategy Dashboard</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8" style={{ backgroundColor: '#0D1F3C', border: '1px solid #1E3558' }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: '#94a3b8' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter access password"
                required
                className="w-full px-4 py-3 rounded-lg text-white placeholder-gray-500 focus:outline-none transition-colors"
                style={{
                  backgroundColor: '#162848',
                  border: '1px solid #1E3558',
                  borderColor: error ? '#ef4444' : '#1E3558',
                }}
                onFocus={(e) => e.target.style.borderColor = '#00B4D8'}
                onBlur={(e) => e.target.style.borderColor = error ? '#ef4444' : '#1E3558'}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg"
                   style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 px-4 rounded-lg font-semibold text-white transition-all"
              style={{
                backgroundColor: loading || !password ? '#1E3558' : '#00B4D8',
                cursor: loading || !password ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Authenticating…
                </span>
              ) : 'Access Dashboard'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: '#334155' }}>
          SrivenCap — Internal Use Only
        </p>
      </div>
    </div>
  );
}
