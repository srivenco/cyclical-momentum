import { useState, useEffect, useCallback } from 'react';
import { login as apiLogin } from '../api';

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check token expiry on mount
  useEffect(() => {
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 < Date.now()) {
          localStorage.removeItem('token');
          setToken(null);
        }
      } catch {
        localStorage.removeItem('token');
        setToken(null);
      }
    }
  }, [token]);

  const login = useCallback(async (password) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiLogin(password);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || 'Invalid password');
      }
      const { token: newToken } = await res.json();
      localStorage.setItem('token', newToken);
      setToken(newToken);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
  }, []);

  return {
    isAuthenticated: !!token,
    login,
    logout,
    loading,
    error,
  };
}
