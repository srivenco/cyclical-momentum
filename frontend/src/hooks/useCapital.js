import { useState, useCallback } from 'react';

const STORAGE_KEY = 'srivencap_capital';
const DEFAULT_RISK_PCT = 2; // 2% risk per trade by default

export function useCapital() {
  const [capital, setCapitalState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : { total: null, riskPct: DEFAULT_RISK_PCT };
  });

  const setCapital = useCallback((total, riskPct = DEFAULT_RISK_PCT) => {
    const val = { total: Number(total), riskPct: Number(riskPct) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
    setCapitalState(val);
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

  return { capital, setCapital, calcPositionSize };
}
