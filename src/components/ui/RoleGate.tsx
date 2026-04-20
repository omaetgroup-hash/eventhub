import type { ReactNode } from 'react';
import { useAuth } from '../../lib/auth';

// Permission type must stay in sync with auth.tsx — kept loose here to avoid re-export coupling
type Permission = Parameters<ReturnType<typeof useAuth>['can']>[0];

interface RoleGateProps {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}

export default function RoleGate({ permission, children, fallback = null }: RoleGateProps) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : <>{fallback}</>;
}
