import { useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { env, isServerBackedEmailConfigured, isServerBackedPaymentsConfigured } from '../../lib/env';
import { ADD_ON_PACKS, PACK_DEFINITIONS } from '../../lib/packs';
import { usePlatform } from '../../lib/platform';
import type { ProductPack, UserRole } from '../../lib/domain';
import { emailService } from '../../services/email';
import { paymentService } from '../../services/payment';

interface ChecklistItem {
  label: string;
  description: string;
  ready: boolean;
  readyNote: string;
  pendingNote: string;
}

function buildChecklist(): ChecklistItem[] {
  return [
    {
      label: 'Payment stack',
      description: 'Stripe publishable key plus a server payment API.',
      ready: isServerBackedPaymentsConfigured(),
      readyNote: `${paymentService.provider} browser client + backend API ready`,
      pendingNote: 'Set VITE_STRIPE_PUBLISHABLE_KEY and VITE_API_BASE_URL / VITE_PAYMENT_API_BASE_URL',
    },
    {
      label: 'Payment webhooks',
      description: 'Server-side webhook verification and post-payment reconciliation.',
      ready: false,
      readyNote: 'Webhook receiver configured',
      pendingNote: 'Configure webhook handling on the server that owns checkout',
    },
    {
      label: 'Email delivery',
      description: 'Transactional email routed through a backend email endpoint.',
      ready: isServerBackedEmailConfigured(),
      readyNote: `${emailService.provider} dispatch endpoint configured`,
      pendingNote: 'Set VITE_EMAIL_API_BASE_URL (or VITE_API_BASE_URL) + VITE_EMAIL_SENDER',
    },
    {
      label: 'QR integrity',
      description: 'Client-side checksum salt for demo/offline validation only.',
      ready: env.qrChecksumSalt.length >= 8,
      readyNote: 'Checksum salt set',
      pendingNote: 'Set VITE_QR_CHECKSUM_SALT or move to server-issued QR tokens',
    },
    {
      label: 'Auth provider',
      description: 'Production identity provider wired for /app access.',
      ready: env.authProvider !== 'pending',
      readyNote: env.authProvider,
      pendingNote: 'Set VITE_AUTH_PROVIDER to clerk, auth0, or custom',
    },
    {
      label: 'Persistence',
      description: 'Platform state survives refresh while backend persistence is being wired.',
      ready: env.persistenceProvider === 'browser',
      readyNote: 'Browser persistence enabled',
      pendingNote: 'Set VITE_PERSISTENCE_PROVIDER=browser or replace with real backend persistence',
    },
    {
      label: 'Audit trail',
      description: 'Core platform actions are recorded in the audit log.',
      ready: true,
      readyNote: 'Always active',
      pendingNote: '',
    },
  ];
}

export default function SettingsPage() {
  const { state, dispatch } = usePlatform();
  const { user, switchUser, can } = useAuth();
  const { orgSettings, organization } = state;
  const [settings, setSettings] = useState({ ...orgSettings });
  const [enabledPacks, setEnabledPacks] = useState<ProductPack[]>(organization.enabledPacks);
  const [saved, setSaved] = useState(false);

  const checklist = useMemo(() => buildChecklist(), []);
  const readyCount = checklist.filter((item) => item.ready).length;
  const roles: UserRole[] = ['super_admin', 'organizer', 'venue_manager', 'staff', 'customer'];
  void roles;

  const canManageEntitlements = can('settings:write');

  function togglePack(pack: ProductPack) {
    setEnabledPacks((current) =>
      current.includes(pack) ? current.filter((item) => item !== pack) : [...current, pack],
    );
  }

  function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    dispatch({ type: 'UPDATE_SETTINGS', patch: settings });
    if (canManageEntitlements) {
      dispatch({ type: 'UPDATE_ORGANIZATION', patch: { enabledPacks } });
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Platform configuration</p>
          <h2>Settings</h2>
          <p>Production readiness, pack entitlements, service boundaries, persistence mode, and role simulation.</p>
        </div>
      </section>

      <article className="app-panel">
        <div className="app-panel-header">
          <h3>Production readiness</h3>
          <span className={readyCount === checklist.length ? 'badge badge-green' : 'badge badge-amber'}>
            {readyCount} / {checklist.length} ready
          </span>
        </div>
        <div className="app-list">
          {checklist.map((item) => (
            <div key={item.label} className="app-list-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: item.ready ? 'var(--color-green, #4ade80)' : 'var(--color-amber, #fbbf24)',
                    flexShrink: 0,
                  }}
                />
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.description}</p>
                </div>
              </div>
              <span className={item.ready ? 'app-chip app-chip-ready' : 'app-chip app-chip-pending'}>
                {item.ready ? item.readyNote : item.pendingNote}
              </span>
            </div>
          ))}
        </div>
      </article>

      <article className="app-panel">
        <div className="app-panel-header">
          <div>
            <h3>Pack entitlements</h3>
            <p className="app-muted-sm">Standard is always on. Add-ons unlock only the surfaces this organization needs.</p>
          </div>
          <span className="badge badge-blue">{enabledPacks.length} enabled</span>
        </div>
        <div className="pack-settings-grid">
          <article className="pack-settings-card pack-settings-card-standard">
            <div className="pack-settings-topline">
              <span className="app-chip">Always on</span>
              <strong>{PACK_DEFINITIONS.standard.name}</strong>
            </div>
            <p>{PACK_DEFINITIONS.standard.description}</p>
            <small>{PACK_DEFINITIONS.standard.pricingPosition}</small>
          </article>
          {ADD_ON_PACKS.map((pack) => {
            const definition = PACK_DEFINITIONS[pack];
            const enabled = enabledPacks.includes(pack);
            return (
              <article key={pack} className={`pack-settings-card ${enabled ? 'pack-settings-card-enabled' : ''}`}>
                <div className="pack-settings-topline">
                  <span className={`app-chip ${enabled ? 'app-chip-ready' : 'app-chip-pending'}`}>
                    {enabled ? 'Enabled' : 'Optional'}
                  </span>
                  <strong>{definition.name}</strong>
                </div>
                <p>{definition.description}</p>
                <small>{definition.pricingPosition}</small>
                <label className="pack-toggle">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => togglePack(pack)}
                    disabled={!canManageEntitlements}
                  />
                  <span>{enabled ? 'Included for this customer' : 'Add this pack'}</span>
                </label>
              </article>
            );
          })}
        </div>
        {!canManageEntitlements && (
          <p className="app-muted-sm" style={{ marginTop: 14 }}>
            Only super admins can change pack entitlements.
          </p>
        )}
      </article>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Runtime environment</h3>
            <span>{import.meta.env.MODE}</span>
          </div>
          <div className="app-list">
            {[
              ['App', env.appName],
              ['URL', env.appUrl],
              ['Auth', env.authProvider],
              ['Persistence', env.persistenceProvider],
              ['API base', env.apiBaseUrl || 'not set'],
              ['Payment API', env.paymentApiBaseUrl || 'not set'],
              ['Payment', paymentService.isConfigured() ? paymentService.provider : `${paymentService.provider} (mock)`],
              ['Email API', env.emailApiBaseUrl || 'not set'],
              ['Email', emailService.isConfigured() ? emailService.provider : `${emailService.provider} (mock)`],
              ['QR salt', env.qrChecksumSalt ? `set (${env.qrChecksumSalt.length} chars)` : 'not set'],
            ].map(([label, value]) => (
              <div key={label} className="app-list-row">
                <div>
                  <strong>{label}</strong>
                  <p className="app-mono">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Simulate role</h3>
            <span>dev only</span>
          </div>
          <p className="app-muted-sm" style={{ marginBottom: 14 }}>
            Switch the active user to verify route guards, nav visibility, and role-aware workflows.
          </p>
          <div className="app-list">
            {state.teamMembers.slice(0, 4).map((member) => (
              <div key={member.id} className="app-list-row">
                <div>
                  <strong>{member.name}</strong>
                  <p>
                    {member.role.replace(/_/g, ' ')} · {member.scope}
                  </p>
                </div>
                <button
                  className={`app-action-btn ${member.id === user.id ? 'app-action-confirm' : ''}`}
                  onClick={() => switchUser(member)}
                  disabled={member.id === user.id}
                >
                  {member.id === user.id ? 'Active' : 'Switch'}
                </button>
              </div>
            ))}
          </div>
        </article>
      </section>

      <article className="app-panel">
        <div className="app-panel-header">
          <h3>Integration config</h3>
          {saved && <span className="badge badge-green">Saved</span>}
        </div>
        <form className="app-form" onSubmit={saveSettings} style={{ marginTop: 16 }}>
          <div className="form-row">
            <div className="form-field">
              <label>Email sender address</label>
              <input
                value={settings.emailSender}
                onChange={(e) => setSettings((current) => ({ ...current, emailSender: e.target.value }))}
                placeholder="no-reply@yourdomain.com"
              />
            </div>
            <div className="form-field">
              <label>Email dispatch endpoint</label>
              <input
                value={settings.emailProvider}
                onChange={(e) => setSettings((current) => ({ ...current, emailProvider: e.target.value }))}
                placeholder="https://api.eventhub.yourdomain.com/email"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Payment API endpoint</label>
              <input
                value={settings.paymentProvider}
                onChange={(e) => setSettings((current) => ({ ...current, paymentProvider: e.target.value }))}
                placeholder="https://api.eventhub.yourdomain.com/payments"
              />
            </div>
            <div className="form-field">
              <label>QR issuer / checksum config</label>
              <input
                type="password"
                value={settings.qrIssuerKey}
                onChange={(e) => setSettings((current) => ({ ...current, qrIssuerKey: e.target.value }))}
                placeholder="server token issuer or checksum salt"
              />
            </div>
          </div>
          <div className="form-field">
            <label>Audit webhook URL</label>
            <input
              value={settings.auditWebhook}
              onChange={(e) => setSettings((current) => ({ ...current, auditWebhook: e.target.value }))}
              placeholder="https://hooks.example.com/audit"
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="app-button app-button-primary">
              Save settings
            </button>
          </div>
        </form>
      </article>

      <section className="app-stat-grid" style={{ marginTop: 24 }}>
        <div className="app-stat">
          <span className="app-stat-value">{state.paymentRecords.length}</span>
          <span className="app-stat-label">Payment records</span>
        </div>
        <div className="app-stat">
          <span className="app-stat-value">{state.emailLogs.length}</span>
          <span className="app-stat-label">Email logs</span>
        </div>
        <div className="app-stat">
          <span className="app-stat-value">{state.auditLog.length}</span>
          <span className="app-stat-label">Audit entries</span>
        </div>
        <div className="app-stat">
          <span className="app-stat-value">
            {readyCount}
            <small>/{checklist.length}</small>
          </span>
          <span className="app-stat-label">Systems ready</span>
        </div>
      </section>
    </div>
  );
}
