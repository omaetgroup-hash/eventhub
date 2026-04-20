import { useState } from 'react';
import Modal from '../../components/ui/Modal';
import TeamInviteForm from '../../forms/TeamInviteForm';
import { RoleBadge } from '../../components/ui/StatusBadge';
import type { UserRole } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';
import { useAuth } from '../../lib/auth';

export default function TeamPage() {
  const { state, dispatch } = usePlatform();
  const { user } = useAuth();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [filterRole, setFilterRole] = useState<UserRole | ''>('');

  const ROLES: UserRole[] = ['super_admin', 'organizer', 'venue_manager', 'staff', 'customer'];

  const filtered = filterRole
    ? state.teamMembers.filter((m) => m.role === filterRole)
    : state.teamMembers;

  function updateRole(id: string, role: UserRole) {
    dispatch({ type: 'UPDATE_MEMBER_ROLE', id, role });
  }

  const isSuperAdmin = user.role === 'super_admin';

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Team and roles</p>
          <h2>Team</h2>
          <p>Manage role-based access for super admins, organizers, venue managers, staff, and customers.</p>
        </div>
        {isSuperAdmin && (
          <button className="app-button" onClick={() => setInviteOpen(true)}>Invite member</button>
        )}
      </section>

      <section className="app-stat-grid">
        {ROLES.map((role) => (
          <article key={role} className="app-stat-card">
            <span>{role.replace(/_/g, ' ')}</span>
            <strong>{state.teamMembers.filter((m) => m.role === role).length}</strong>
          </article>
        ))}
      </section>

      <div className="app-filter-bar">
        <select className="app-select" value={filterRole} onChange={(e) => setFilterRole(e.target.value as UserRole | '')}>
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      <section className="app-table-panel">
        <div className="app-table-header app-table-header-5">
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Scope</span>
          <span>Active</span>
        </div>
        {filtered.map((member) => (
          <div key={member.id} className="app-table-row app-table-row-5">
            <strong>{member.name}{member.id === user.id && <span className="badge badge-muted" style={{ marginLeft: 8 }}>you</span>}</strong>
            <span>{member.email}</span>
            <span>
              {isSuperAdmin && member.id !== user.id ? (
                <select
                  className="app-select app-select-inline"
                  value={member.role}
                  onChange={(e) => updateRole(member.id, e.target.value as UserRole)}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              ) : (
                <RoleBadge role={member.role} />
              )}
            </span>
            <span>{member.scope}</span>
            <span>{member.lastActive}</span>
          </div>
        ))}
        {filtered.length === 0 && <div className="app-table-empty">No members match the current filter.</div>}
      </section>

      {inviteOpen && (
        <Modal title="Invite team member" onClose={() => setInviteOpen(false)}>
          <TeamInviteForm onDone={() => setInviteOpen(false)} />
        </Modal>
      )}
    </div>
  );
}
