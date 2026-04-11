import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import Dashboard from './components/Dashboard';

export default function App() {
  const { isAuthenticated, login, logout, loading, error } = useAuth();

  if (!isAuthenticated) {
    return <Login onLogin={login} loading={loading} error={error} />;
  }

  return <Dashboard onLogout={logout} />;
}
