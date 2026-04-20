import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TeamMember, UserRole } from './domain';
import { clearPersistedState, loadPersistedState, savePersistedState } from './persistence';
import { isApiAuthConfigured } from './env';
import { fetchSession, logoutAllSessions, logoutSession, requestLoginCode, verifyLoginCode, type AuthCodeRequestResult } from '../services/auth-api';

export type Permission =
  | 'events:read' | 'events:write'
  | 'venues:read' | 'venues:write'
  | 'tickets:read' | 'tickets:write'
  | 'orders:read' | 'orders:write'
  | 'marketing:read' | 'marketing:write'
  | 'analytics:read'
  | 'team:read' | 'team:write'
  | 'check_in:read' | 'check_in:write'
  | 'audit:read'
  | 'settings:read' | 'settings:write'
  | '*';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: ['*'],
  organizer: [
    'events:read', 'events:write',
    'tickets:read', 'tickets:write',
    'orders:read',
    'venues:read',
    'marketing:read', 'marketing:write',
    'analytics:read',
    'team:read',
    'check_in:read',
    'audit:read',
    'settings:read',
  ],
  venue_manager: [
    'venues:read', 'venues:write',
    'events:read',
    'tickets:read',
    'analytics:read',
    'check_in:read', 'check_in:write',
    'team:read',
    'settings:read',
  ],
  staff: [
    'events:read',
    'check_in:read', 'check_in:write',
    'orders:read',
    'analytics:read',
  ],
  customer: ['orders:read'],
};

const GUEST: TeamMember = { id: '', name: '', email: '', role: 'customer', scope: '', lastActive: '' };

interface PersistedAuthState {
  token: string;
  user: TeamMember;
}

interface AuthContextValue {
  user: TeamMember;
  isAuthenticated: boolean;
  isHydrating: boolean;
  authToken: string | null;
  authMode: 'api' | 'browser';
  can: (permission: Permission) => boolean;
  login: (member: TeamMember) => void;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  switchUser: (member: TeamMember) => void;
  requestCode: (email: string) => Promise<AuthCodeRequestResult>;
  verifyCode: (email: string, code: string) => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const authMode = isApiAuthConfigured() ? 'api' : 'browser';
  const persisted = loadPersistedState<PersistedAuthState | null>('auth', null);
  const [user, setUser] = useState<TeamMember>(persisted?.user ?? GUEST);
  const [authToken, setAuthToken] = useState<string | null>(persisted?.token ?? null);
  const [isHydrating, setIsHydrating] = useState(authMode === 'api');

  useEffect(() => {
    if (authMode !== 'api') {
      setIsHydrating(false);
      return;
    }

    if (!persisted?.token) {
      setIsHydrating(false);
      return;
    }

    fetchSession(persisted.token)
      .then((session) => {
        setUser(session.user);
        setAuthToken(session.token);
        savePersistedState('auth', { token: session.token, user: session.user });
      })
      .catch(() => {
        setUser(GUEST);
        setAuthToken(null);
        clearPersistedState('auth');
      })
      .finally(() => {
        setIsHydrating(false);
      });
  }, [authMode]);

  const isAuthenticated = Boolean(authToken || (authMode === 'browser' && user.id));

  const can = useMemo(() => {
    return (permission: Permission): boolean => {
      if (!isAuthenticated) return false;
      const perms = ROLE_PERMISSIONS[user.role];
      return perms.includes('*') || perms.includes(permission);
    };
  }, [isAuthenticated, user.role]);

  function login(member: TeamMember) {
    setUser(member);
    setAuthToken('browser-session');
    savePersistedState('auth', { token: 'browser-session', user: member });
  }

  async function logout() {
    if (authMode === 'api' && authToken) {
      try {
        await logoutSession(authToken);
      } catch {
        // Best-effort logout; local session is still cleared below.
      }
    }

    setUser(GUEST);
    setAuthToken(null);
    clearPersistedState('auth');
  }

  async function logoutAll() {
    if (authMode === 'api' && authToken) {
      try {
        await logoutAllSessions(authToken);
      } catch {
        // Best-effort logout-all; local session is still cleared below.
      }
    }
    setUser(GUEST);
    setAuthToken(null);
    clearPersistedState('auth');
  }

  function switchUser(member: TeamMember) {
    setUser(member);
    setAuthToken('browser-session');
    savePersistedState('auth', { token: 'browser-session', user: member });
  }

  async function requestCode(email: string) {
    return requestLoginCode(email);
  }

  async function verifyCode(email: string, code: string) {
    const session = await verifyLoginCode(email, code);
    setUser(session.user);
    setAuthToken(session.token);
    savePersistedState('auth', { token: session.token, user: session.user });
  }

  async function refreshSession() {
    if (authMode !== 'api' || !authToken) return;
    const session = await fetchSession(authToken);
    setUser(session.user);
    setAuthToken(session.token);
    savePersistedState('auth', { token: session.token, user: session.user });
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isHydrating,
        authToken,
        authMode,
        can,
        login,
        logout,
        logoutAll,
        switchUser,
        requestCode,
        verifyCode,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useCanAccess(permission: Permission): boolean {
  return useAuth().can(permission);
}
