import { useState } from 'react';
import RoleGate from '../../components/ui/RoleGate';
import type { ApiCredential, IntegrationConnection, IntegrationKind, IntegrationStatus, WebhookEndpoint } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';

const EMPTY_INTEGRATION = {
  kind: 'webhook' as IntegrationKind,
  name: '',
  provider: '',
  status: 'needs_config' as IntegrationStatus,
  syncMode: 'push' as IntegrationConnection['syncMode'],
  lastSyncAt: '',
  notes: '',
};

const EMPTY_WEBHOOK = {
  label: '',
  url: '',
  subscribedEvents: 'order.paid, ticket.issued',
  status: 'active' as WebhookEndpoint['status'],
};

const EMPTY_API_KEY = {
  label: '',
  scope: 'read_only' as ApiCredential['scope'],
};

export default function IntegrationsPage() {
  const { state, dispatch, newId, nowStr } = usePlatform();
  const [integrationForm, setIntegrationForm] = useState(EMPTY_INTEGRATION);
  const [webhookForm, setWebhookForm] = useState(EMPTY_WEBHOOK);
  const [apiForm, setApiForm] = useState(EMPTY_API_KEY);

  function saveIntegration() {
    const payload: IntegrationConnection = {
      id: newId('int'),
      kind: integrationForm.kind,
      name: integrationForm.name.trim(),
      provider: integrationForm.provider.trim(),
      status: integrationForm.status,
      syncMode: integrationForm.syncMode,
      lastSyncAt: integrationForm.lastSyncAt || undefined,
      notes: integrationForm.notes.trim() || undefined,
    };
    dispatch({ type: 'UPSERT_INTEGRATION', payload });
    setIntegrationForm(EMPTY_INTEGRATION);
  }

  function saveWebhook() {
    const payload: WebhookEndpoint = {
      id: newId('hook'),
      label: webhookForm.label.trim(),
      url: webhookForm.url.trim(),
      subscribedEvents: webhookForm.subscribedEvents.split(',').map((entry) => entry.trim()).filter(Boolean),
      status: webhookForm.status,
    };
    dispatch({ type: 'UPSERT_WEBHOOK', payload });
    setWebhookForm(EMPTY_WEBHOOK);
  }

  function saveApiCredential() {
    const payload: ApiCredential = {
      id: newId('cred'),
      label: apiForm.label.trim(),
      scope: apiForm.scope,
      createdAt: nowStr(),
      status: 'active',
    };
    dispatch({ type: 'UPSERT_API_CREDENTIAL', payload });
    setApiForm(EMPTY_API_KEY);
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Enterprise controls</p>
          <h2>Integrations</h2>
          <p>Manage webhook destinations, CRM/accounting connections, API access, and the external systems EventHub needs to talk to.</p>
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Connections</span>
          <strong>{state.integrationConnections.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Webhooks</span>
          <strong>{state.webhookEndpoints.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>API credentials</span>
          <strong>{state.apiCredentials.filter((credential) => credential.status === 'active').length}</strong>
        </article>
        <article className="app-stat-card">
          <span>SSO profiles</span>
          <strong>{state.ssoConfigurations.length}</strong>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Connected systems</h3>
            <span>{state.integrationConnections.length} configured</span>
          </div>
          <div className="app-list">
            {state.integrationConnections.map((connection) => (
              <div key={connection.id} className="app-list-row">
                <div>
                  <strong>{connection.name}</strong>
                  <p>{connection.provider} · {connection.kind} · {connection.syncMode}</p>
                  {connection.notes && <p className="app-muted-sm">{connection.notes}</p>}
                </div>
                <div className="app-list-metric">
                  <strong>{connection.status.replace(/_/g, ' ')}</strong>
                  <p>{connection.lastSyncAt ?? 'No sync recorded'}</p>
                </div>
                <RoleGate permission="settings:write">
                  <button className="app-action-btn app-action-danger" onClick={() => dispatch({ type: 'DELETE_INTEGRATION', id: connection.id })}>
                    Remove
                  </button>
                </RoleGate>
              </div>
            ))}
          </div>

          <RoleGate permission="settings:write">
            <div className="app-form" style={{ marginTop: 18 }}>
              <div className="form-row">
                <div className="form-field">
                  <label>Name</label>
                  <input value={integrationForm.name} onChange={(e) => setIntegrationForm((current) => ({ ...current, name: e.target.value }))} placeholder="Salesforce contact sync" />
                </div>
                <div className="form-field">
                  <label>Provider</label>
                  <input value={integrationForm.provider} onChange={(e) => setIntegrationForm((current) => ({ ...current, provider: e.target.value }))} placeholder="Salesforce" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Kind</label>
                  <select value={integrationForm.kind} onChange={(e) => setIntegrationForm((current) => ({ ...current, kind: e.target.value as IntegrationKind }))}>
                    <option value="webhook">Webhook</option>
                    <option value="crm">CRM</option>
                    <option value="accounting">Accounting</option>
                    <option value="sso">SSO</option>
                    <option value="api">API</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Status</label>
                  <select value={integrationForm.status} onChange={(e) => setIntegrationForm((current) => ({ ...current, status: e.target.value as IntegrationStatus }))}>
                    <option value="connected">Connected</option>
                    <option value="needs_config">Needs config</option>
                    <option value="degraded">Degraded</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>Sync mode</label>
                  <select value={integrationForm.syncMode} onChange={(e) => setIntegrationForm((current) => ({ ...current, syncMode: e.target.value as IntegrationConnection['syncMode'] }))}>
                    <option value="push">Push</option>
                    <option value="pull">Pull</option>
                    <option value="bidirectional">Bidirectional</option>
                  </select>
                </div>
              </div>
              <div className="form-field">
                <label>Notes</label>
                <input value={integrationForm.notes} onChange={(e) => setIntegrationForm((current) => ({ ...current, notes: e.target.value }))} placeholder="Awaiting sandbox credentials" />
              </div>
              <div className="form-actions">
                <button className="app-button app-button-primary" onClick={saveIntegration} disabled={!integrationForm.name.trim() || !integrationForm.provider.trim()}>
                  Save integration
                </button>
              </div>
            </div>
          </RoleGate>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Webhook destinations</h3>
            <span>{state.webhookEndpoints.length} endpoints</span>
          </div>
          <div className="app-list">
            {state.webhookEndpoints.map((webhook) => (
              <div key={webhook.id} className="app-list-row">
                <div>
                  <strong>{webhook.label}</strong>
                  <p className="app-mono">{webhook.url}</p>
                  <p className="app-muted-sm">{webhook.subscribedEvents.join(', ')}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{webhook.status}</strong>
                  <p>{webhook.lastDeliveryAt ?? 'No deliveries yet'}</p>
                </div>
                <RoleGate permission="settings:write">
                  <button className="app-action-btn app-action-danger" onClick={() => dispatch({ type: 'DELETE_WEBHOOK', id: webhook.id })}>
                    Delete
                  </button>
                </RoleGate>
              </div>
            ))}
          </div>

          <RoleGate permission="settings:write">
            <div className="app-form" style={{ marginTop: 18 }}>
              <div className="form-field">
                <label>Label</label>
                <input value={webhookForm.label} onChange={(e) => setWebhookForm((current) => ({ ...current, label: e.target.value }))} placeholder="Accounting export listener" />
              </div>
              <div className="form-field">
                <label>URL</label>
                <input value={webhookForm.url} onChange={(e) => setWebhookForm((current) => ({ ...current, url: e.target.value }))} placeholder="https://hooks.example.com/eventhub" className="app-mono" />
              </div>
              <div className="form-field">
                <label>Subscribed events</label>
                <input value={webhookForm.subscribedEvents} onChange={(e) => setWebhookForm((current) => ({ ...current, subscribedEvents: e.target.value }))} placeholder="order.paid, ticket.issued" />
              </div>
              <div className="form-actions">
                <button className="app-button app-button-primary" onClick={saveWebhook} disabled={!webhookForm.label.trim() || !webhookForm.url.trim()}>
                  Save webhook
                </button>
              </div>
            </div>
          </RoleGate>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>API credentials</h3>
            <span>{state.apiCredentials.length} keys issued</span>
          </div>
          <div className="app-list">
            {state.apiCredentials.map((credential) => (
              <div key={credential.id} className="app-list-row">
                <div>
                  <strong>{credential.label}</strong>
                  <p>{credential.scope.replace(/_/g, ' ')} · Created {credential.createdAt}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{credential.status}</strong>
                  <p>{credential.lastUsedAt ?? 'Never used'}</p>
                </div>
                <RoleGate permission="settings:write">
                  <button className="app-action-btn app-action-danger" onClick={() => dispatch({ type: 'REVOKE_API_CREDENTIAL', id: credential.id })} disabled={credential.status === 'revoked'}>
                    Revoke
                  </button>
                </RoleGate>
              </div>
            ))}
          </div>

          <RoleGate permission="settings:write">
            <div className="app-form" style={{ marginTop: 18 }}>
              <div className="form-row">
                <div className="form-field">
                  <label>Label</label>
                  <input value={apiForm.label} onChange={(e) => setApiForm((current) => ({ ...current, label: e.target.value }))} placeholder="Warehouse read key" />
                </div>
                <div className="form-field">
                  <label>Scope</label>
                  <select value={apiForm.scope} onChange={(e) => setApiForm((current) => ({ ...current, scope: e.target.value as ApiCredential['scope'] }))}>
                    <option value="read_only">Read only</option>
                    <option value="ops">Ops</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button className="app-button app-button-primary" onClick={saveApiCredential} disabled={!apiForm.label.trim()}>
                  Issue credential
                </button>
              </div>
            </div>
          </RoleGate>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>SSO readiness</h3>
            <span>{state.ssoConfigurations.length} profiles</span>
          </div>
          <div className="app-list">
            {state.ssoConfigurations.map((config, index) => (
              <div key={`${config.provider}-${index}`} className="app-list-row">
                <div>
                  <strong>{config.provider}</strong>
                  <p>{config.domain}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{config.status}</strong>
                  <p>{config.enforced ? 'Enforced' : 'Not enforced'}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
