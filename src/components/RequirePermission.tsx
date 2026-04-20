import { Navigate, Outlet } from 'react-router-dom';
import type { Permission } from '../lib/auth';
import { useAuth } from '../lib/auth';

interface RequirePermissionProps {
  permission: Permission;
}

export default function RequirePermission({ permission }: RequirePermissionProps) {
  const { can } = useAuth();

  return can(permission) ? <Outlet /> : <Navigate to="/app" replace />;
}
