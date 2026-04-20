import { useState } from 'react';
import type { UserRole } from '../lib/domain';
import { usePlatform } from '../lib/platform';
import { useAuth } from '../lib/auth';
import { apiCreateTeamInvite } from '../services/resource-api';

interface TeamInviteFormProps {
  onDone: () => void;
}

const ROLE_OPTIONS: UserRole[] = ['organizer', 'venue_manager', 'staff', 'customer'];

export default function TeamInviteForm({ onDone }: TeamInviteFormProps) {
  const { authToken } = useAuth();
  const { refreshFromServer } = usePlatform();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    role: 'staff' as UserRole,
    scope: '',
  });

  const set = (key: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => setForm((current) => ({ ...current, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!authToken) {
      setError('A secure admin session is required to invite team members.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = await apiCreateTeamInvite(authToken, {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        scope: form.scope.trim() || 'All events',
      });
      setSentTo(result.invite.email);
      await refreshFromServer();
      window.setTimeout(onDone, 900);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Unable to send team invite.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="app-form" onSubmit={submit}>
      <div className="form-field">
        <label>Full name</label>
        <input required value={form.name} onChange={set('name')} placeholder="Sam Nguyen" />
      </div>
      <div className="form-field">
        <label>Email address</label>
        <input type="email" required value={form.email} onChange={set('email')} placeholder="sam@example.com" />
      </div>
      <div className="form-row">
        <div className="form-field">
          <label>Role</label>
          <select value={form.role} onChange={set('role')}>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Scope</label>
          <input value={form.scope} onChange={set('scope')} placeholder="East Gate / Check-in" />
        </div>
      </div>
      {sentTo && <p className="app-muted-sm">Invite sent to <strong>{sentTo}</strong>.</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="app-button app-button-primary" disabled={submitting}>
          {submitting ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </form>
  );
}
