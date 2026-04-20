import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function RequireAuth() {
  const { isAuthenticated, isHydrating } = useAuth();
  if (isHydrating) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#060b16', color: 'rgba(220,232,239,0.8)' }}>
        Restoring secure session…
      </div>
    );
  }
  return isAuthenticated ? <Outlet /> : <Navigate to="/app/login" replace />;
}
