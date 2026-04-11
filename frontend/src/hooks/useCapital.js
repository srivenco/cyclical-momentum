import { useState, useEffect, useCallback } from 'react';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
});

export function useCapital() {
  const [capital, setCapitalState] = useState({ total: null, riskPct: 2, alertEmail: null });
  const [loaded, setLoaded] = useState(false);

  // Load from backend on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(`${BASE_URL}/api/settings`, { headers: getHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setCapitalState({
            total: data.capital,
            riskPct: data.risk_pct ?? 2,
            alertEmail: data.alert_email,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const setCapital = useCallback(async (total, riskPct = 2, alertEmail = null) => {
    const payload = {
      capital: total ? Number(total) : null,
      risk_pct: Number(riskPct),
      alert_email: alertEmail,
    };
    try {
      const res = await fetch(`${BASE_URL}/api/settings`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setCapitalState({
          total: data.capital,
          riskPct: data.risk_pct ?? 2,
          alertEmail: data.alert_email,
        });
      }
    } catch (e) {
      // Fallback to local state
      setCapitalState({ total: Number(total), riskPct: Number(riskPct), alertEmail });
    }
  }, []);

  // Position size = (capital * riskPct%) / abs(stop%)
  const calcPositionSize = useCallback((entryPrice, stopPct) => {
    if (!capital.total || !stopPct) return null;
    const riskAmount = capital.total * (capital.riskPct / 100);
    const riskPerShare = Math.abs(stopPct / 100) * entryPrice;
    if (riskPerShare === 0) return null;
    const qty = Math.floor(riskAmount / riskPerShare);
    return { qty, value: qty * entryPrice, riskAmount };
  }, [capital]);

  return { capital, setCapital, calcPositionSize, loaded };
}
