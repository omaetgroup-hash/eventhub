import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { Permission } from '../lib/auth';
import type { ProductPack } from '../lib/domain';
import { hasPack } from '../lib/packs';
import { usePlatform } from '../lib/platform';

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
  permission?: Permission;
  pack?: ProductPack;
  superAdminOnly?: boolean;
};

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Management',
    items: [
      { to: '/app', label: 'Dashboard', end: true, pack: 'standard' },
      { to: '/app/events', label: 'Events', permission: 'events:read', pack: 'standard' },
      { to: '/app/venues', label: 'Venues', permission: 'venues:read', pack: 'standard' },
      { to: '/app/tickets', label: 'Tickets', permission: 'tickets:read', pack: 'standard' },
      { to: '/app/orders', label: 'Orders', permission: 'orders:read', pack: 'standard' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/app/check-in', label: 'Check-In', permission: 'check_in:read', pack: 'operations' },
      { to: '/app/gate-ops', label: 'Gate Ops', permission: 'check_in:read', pack: 'operations' },
      { to: '/app/scanner', label: 'Scanner', permission: 'check_in:write', pack: 'operations' },
      { to: '/app/access-rules', label: 'Access Rules', permission: 'check_in:write', pack: 'operations' },
      { to: '/app/kiosk', label: 'Kiosk', permission: 'check_in:write', pack: 'operations' },
    ],
  },
  {
    label: 'Onsale',
    items: [
      { to: '/app/queue-ops', label: 'Queue', permission: 'tickets:write', pack: 'operations' },
      { to: '/app/presale-codes', label: 'Presale Codes', permission: 'tickets:write', pack: 'operations' },
      { to: '/app/purchase-protection', label: 'Purchase Limits', permission: 'tickets:write', pack: 'operations' },
      { to: '/app/protection-report', label: 'Protection Report', permission: 'tickets:write', pack: 'operations' },
    ],
  },
  {
    label: 'Growth',
    items: [
      { to: '/app/campaigns', label: 'Campaigns', permission: 'marketing:read', pack: 'growth' },
      { to: '/app/discounts', label: 'Discounts', permission: 'marketing:read', pack: 'growth' },
      { to: '/app/audience', label: 'Audience', permission: 'marketing:read', pack: 'growth' },
      { to: '/app/growth-analytics', label: 'Analytics', permission: 'analytics:read', pack: 'growth' },
    ],
  },
  {
    label: 'Conference',
    items: [
      { to: '/app/agenda', label: 'Agenda', permission: 'events:read', pack: 'conference' },
      { to: '/app/exhibitors', label: 'Exhibitors', permission: 'events:read', pack: 'conference' },
      { to: '/app/engagement', label: 'Engagement', permission: 'events:read', pack: 'conference' },
    ],
  },
  {
    label: 'Monetization',
    items: [
      { to: '/app/resale', label: 'Resale', permission: 'tickets:read', pack: 'monetization' },
      { to: '/app/monetization', label: 'Premium Tools', permission: 'analytics:read', pack: 'monetization' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/app/team', label: 'Team', permission: 'team:read', pack: 'standard' },
      { to: '/app/audit', label: 'Audit', permission: 'audit:read', pack: 'standard' },
      { to: '/app/finance', label: 'Finance', permission: 'settings:read', pack: 'finance' },
      { to: '/app/integrations', label: 'Integrations', permission: 'settings:read', pack: 'enterprise' },
      { to: '/app/enterprise-analytics', label: 'Enterprise', permission: 'analytics:read', pack: 'enterprise' },
      { to: '/app/settings', label: 'Settings', permission: 'settings:read', pack: 'standard' },
      { to: '/app/admin-recovery', label: 'Recovery', superAdminOnly: true },
    ],
  },
];

export default function AppShell() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const { state } = usePlatform();
  const { organization } = state;
  const [navOpen, setNavOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate('/app/login', { replace: true });
  }

  function closeNav() { setNavOpen(false); }

  return (
    <div className={`app-shell${navOpen ? ' app-shell-nav-open' : ''}`}>
      {navOpen && (
        <div
          className="app-nav-overlay"
          onClick={closeNav}
          aria-hidden="true"
        />
      )}

      <aside className="app-sidebar" aria-label="Main navigation">
        <button
          className="app-nav-close"
          onClick={closeNav}
          aria-label="Close navigation"
        >
          ✕
        </button>

        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden="true" />
          <div>
            <p>EventHub</p>
            <span>Pack-aware workspace</span>
          </div>
        </div>

        <div className="app-org-card">
          <span className="app-chip">{organization.plan}</span>
          <strong>{organization.name}</strong>
          <p>
            {organization.region} · {organization.timezone}
          </p>
          <small>{organization.enabledPacks.length} active pack{organization.enabledPacks.length === 1 ? '' : 's'}</small>
        </div>

        <nav className="app-nav">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter((item) => {
              if (item.superAdminOnly && user.role !== 'super_admin') return false;
              const permissionAllowed = !item.permission || can(item.permission);
              const packAllowed = item.pack ? hasPack(organization.enabledPacks, item.pack) : true;
              return permissionAllowed && packAllowed;
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={group.label} className="app-nav-group">
                <p className="app-nav-group-label">{group.label}</p>
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={closeNav}
                    className={({ isActive }) => (isActive ? 'app-nav-link app-nav-link-active' : 'app-nav-link')}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="app-user-card">
          <span className="app-user-avatar" aria-hidden="true">{user.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{user.name}</strong>
            <p>{user.role.replace(/_/g, ' ')}</p>
          </div>
          <button className="app-logout-btn" onClick={handleLogout} aria-label="Sign out">
            ↩
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              className="app-hamburger"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
              aria-expanded={navOpen}
            >
              ☰
            </button>
            <div>
              <p className="app-kicker">EventHub operating system</p>
              <h1>EventHub</h1>
            </div>
          </div>
          <div className="app-topbar-meta">
            <span className="app-status-dot" aria-hidden="true" />
            <p>{user.lastActive}</p>
          </div>
        </header>

        <main className="app-content" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
