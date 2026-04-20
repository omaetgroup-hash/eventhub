import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  scope: string;
  lastActive: string;
}

async function apiFetch(path: string, options?: RequestInit) {
  const token = sessionStorage.getItem('eventhub_token') ?? localStorage.getItem('eventhub_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...options, headers: { ...headers, ...((options?.headers ?? {}) as Record<string, string>) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export default function AdminRecoveryPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionState, setActionState] = useState<Record<string, string>>({});

  const loadUsers = useCallback(() => {
    setLoading(true);
    setError('');
    apiFetch('/admin/users')
      .then((data: { users: UserRow[] }) => setUsers(data.users))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  if (user.role !== 'super_admin') {
    return (
      <div className="app-page">
        <div className="app-empty-state">Admin Recovery requires super admin access.</div>
      </div>
    );
  }

  async function handleAction(userId: string, action: 'unlock' | 'revoke-sessions') {
    setActionState((s) => ({ ...s, [`${userId}_${action}`]: 'loading' }));
    try {
      await apiFetch(`/admin/users/${userId}/${action}`, { method: 'POST' });
      setActionState((s) => ({ ...s, [`${userId}_${action}`]: 'done' }));
      setTimeout(() => setActionState((s) => { const next = { ...s }; delete next[`${userId}_${action}`]; return next; }), 3000);
    } catch (err) {
      setActionState((s) => ({ ...s, [`${userId}_${action}`]: 'error' }));
      setTimeout(() => setActionState((s) => { const next = { ...s }; delete next[`${userId}_${action}`]; return next; }), 4000);
    }
  }

  async function handleBackup() {
    setActionState((s) => ({ ...s, backup: 'loading' }));
    try {
      await apiFetch('/admin/ops/backup', { method: 'POST' });
      setActionState((s) => ({ ...s, backup: 'done' }));
      setTimeout(() => setActionState((s) => { const next = { ...s }; delete next['backup']; return next; }), 3000);
    } catch (err) {
      setActionState((s) => ({ ...s, backup: 'error' }));
      setTimeout(() => setActionState((s) => { const next = { ...s }; delete next['backup']; return next; }), 4000);
    }
  }

  function actionLabel(userId: string, action: 'unlock' | 'revoke-sessions', defaultLabel: string) {
    const state = actionState[`${userId}_${action}`];
    if (state === 'loading') return 'Working…';
    if (state === 'done') return '✓ Done';
    if (state === 'error') return '✗ Failed';
    return defaultLabel;
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Support tools</p>
          <h2>Admin Recovery</h2>
          <p>Unlock locked-out users, revoke sessions, and trigger manual backups.</p>
        </div>
        <div>
          <button
            className="app-button"
            onClick={handleBackup}
            disabled={actionState['backup'] === 'loading'}
            aria-label="Trigger manual backup"
          >
            {actionState['backup'] === 'loading' ? 'Backing up…' : actionState['backup'] === 'done' ? '✓ Backed up' : 'Run backup'}
          </button>
        </div>
      </section>

      {loading && <div className="app-loading-state">Loading users…</div>}
      {error && <div className="app-error-state">{error} <button className="app-action-link" onClick={loadUsers}>Retry</button></div>}

      {!loading && !error && (
        <article className="app-table-panel">
          <div className="app-table-header recovery-table-header">
            <span>User</span>
            <span>Role</span>
            <span>Scope</span>
            <span>Recovery actions</span>
          </div>
          {users.length === 0 && (
            <div className="app-empty-state">No users found.</div>
          )}
          {users.map((u) => (
            <div key={u.id} className="app-table-row recovery-table-row">
              <div>
                <strong>{u.name}</strong>
                <span className="app-muted-sm">{u.email}</span>
              </div>
              <span>{u.role.replace(/_/g, ' ')}</span>
              <span className="recovery-scope">{u.scope}</span>
              <div className="recovery-actions">
                <button
                  className="app-action-btn"
                  onClick={() => handleAction(u.id, 'unlock')}
                  disabled={!!actionState[`${u.id}_unlock`]}
                  title="Clear auth lockout and pending codes"
                  aria-label={`Unlock ${u.name}`}
                >
                  {actionLabel(u.id, 'unlock', 'Unlock')}
                </button>
                <button
                  className="app-action-btn app-action-danger"
                  onClick={() => handleAction(u.id, 'revoke-sessions')}
                  disabled={!!actionState[`${u.id}_revoke-sessions`]}
                  title="Expire all active sessions — user must sign in again"
                  aria-label={`Revoke sessions for ${u.name}`}
                >
                  {actionLabel(u.id, 'revoke-sessions', 'Revoke sessions')}
                </button>
              </div>
            </div>
          ))}
        </article>
      )}
    </div>
  );
}
