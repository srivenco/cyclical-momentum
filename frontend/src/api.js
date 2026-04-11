const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('token')}`,
});

const handleResponse = async (res) => {
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location.reload();
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
};

export const login = (password) =>
  fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

export const getMacro = () =>
  fetch(`${BASE_URL}/api/macro`, { headers: getHeaders() }).then(handleResponse);

export const getSignalsToday = () =>
  fetch(`${BASE_URL}/api/signals/today`, { headers: getHeaders() }).then(handleResponse);

export const getSignalsHistory = () =>
  fetch(`${BASE_URL}/api/signals/history`, { headers: getHeaders() }).then(handleResponse);

export const getPortfolio = () =>
  fetch(`${BASE_URL}/api/portfolio`, { headers: getHeaders() }).then(handleResponse);

export const addTrade = (data) =>
  fetch(`${BASE_URL}/api/portfolio/trade`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  }).then(handleResponse);

export const recordExit = (data) =>
  fetch(`${BASE_URL}/api/portfolio/exit`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  }).then(handleResponse);

export const getHealth = () =>
  fetch(`${BASE_URL}/api/health`).then(handleResponse);
