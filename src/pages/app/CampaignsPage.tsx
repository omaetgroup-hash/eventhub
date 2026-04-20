import { useMemo, useState } from 'react';
import RoleGate from '../../components/ui/RoleGate';
import type { Campaign, CampaignChannel, CampaignStatus } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';

const EMPTY_FORM = {
  eventId: '',
  name: '',
  channel: 'email' as CampaignChannel,
  segmentId: '',
  status: 'draft' as CampaignStatus,
  subject: '',
  scheduledAt: '',
  sourceTag: '',
};

const statusClass: Record<CampaignStatus, string> = {
  draft: 'badge-muted',
  scheduled: 'badge-amber',
  sending: 'badge-amber',
  completed: 'badge-green',
  paused: 'badge-red',
};

export default function CampaignsPage() {
  const { state, dispatch, newId, nowStr } = usePlatform();
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedEventId, setSelectedEventId] = useState('');

  const campaigns = useMemo(
    () => selectedEventId ? state.campaigns.filter((campaign) => campaign.eventId === selectedEventId) : state.campaigns,
    [selectedEventId, state.campaigns],
  );

  function openNew() {
    setForm({ ...EMPTY_FORM, eventId: selectedEventId });
    setEditingId('new');
  }

  function openEdit(campaign: Campaign) {
    setForm({
      eventId: campaign.eventId ?? '',
      name: campaign.name,
      channel: campaign.channel,
      segmentId: campaign.segmentId ?? '',
      status: campaign.status,
      subject: campaign.subject,
      scheduledAt: campaign.scheduledAt ?? '',
      sourceTag: campaign.sourceTag,
    });
    setEditingId(campaign.id);
  }

  function saveCampaign() {
    const existing = editingId && editingId !== 'new'
      ? state.campaigns.find((campaign) => campaign.id === editingId)
      : undefined;
    const payload: Campaign = {
      id: editingId === 'new' ? newId('cmp') : editingId!,
      eventId: form.eventId || undefined,
      name: form.name.trim(),
      channel: form.channel,
      segmentId: form.segmentId || undefined,
      status: form.status,
      subject: form.subject.trim(),
      scheduledAt: form.scheduledAt || undefined,
      sentCount: existing?.sentCount ?? 0,
      openRate: existing?.openRate ?? 0,
      clickRate: existing?.clickRate ?? 0,
      conversionRate: existing?.conversionRate ?? 0,
      sourceTag: form.sourceTag.trim(),
      createdAt: existing?.createdAt ?? nowStr(),
    };
    dispatch({ type: 'UPSERT_CAMPAIGN', payload });
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Organizer growth</p>
          <h2>Campaigns</h2>
          <p>Run email and SMS launches, target customer segments, and track how campaigns move buyers into checkout.</p>
        </div>
        <RoleGate permission="marketing:write">
          <button className="app-button app-button-primary" onClick={openNew}>New campaign</button>
        </RoleGate>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Live campaigns</span>
          <strong>{state.campaigns.filter((campaign) => campaign.status === 'scheduled' || campaign.status === 'sending').length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Email sends</span>
          <strong>{state.campaigns.filter((campaign) => campaign.channel === 'email').reduce((sum, campaign) => sum + campaign.sentCount, 0).toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>SMS sends</span>
          <strong>{state.campaigns.filter((campaign) => campaign.channel === 'sms').reduce((sum, campaign) => sum + campaign.sentCount, 0).toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Avg conversion</span>
          <strong>{state.campaigns.length ? `${Math.round((state.campaigns.reduce((sum, campaign) => sum + campaign.conversionRate, 0) / state.campaigns.length) * 100)}%` : '0%'}</strong>
        </article>
      </section>

      <div className="app-filter-bar" style={{ marginBottom: 24 }}>
        <select className="app-select" value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
          <option value="">All events</option>
          {state.events.map((event) => (
            <option key={event.id} value={event.id}>{event.name}</option>
          ))}
        </select>
        <span className="app-muted-sm">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</span>
      </div>

      {editingId !== null && (
        <article className="app-panel" style={{ marginBottom: 24 }}>
          <div className="app-panel-header">
            <h3>{editingId === 'new' ? 'Create campaign' : 'Edit campaign'}</h3>
          </div>
          <div className="app-form" style={{ marginTop: 16 }}>
            <div className="form-row">
              <div className="form-field">
                <label>Campaign name</label>
                <input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="Summer Series final push" />
              </div>
              <div className="form-field">
                <label>Event</label>
                <select value={form.eventId} onChange={(e) => setForm((current) => ({ ...current, eventId: e.target.value }))}>
                  <option value="">Portfolio-wide</option>
                  {state.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Channel</label>
                <select value={form.channel} onChange={(e) => setForm((current) => ({ ...current, channel: e.target.value as CampaignChannel }))}>
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <div className="form-field">
                <label>Audience segment</label>
                <select value={form.segmentId} onChange={(e) => setForm((current) => ({ ...current, segmentId: e.target.value }))}>
                  <option value="">All buyers</option>
                  {state.customerSegments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Status</label>
                <select value={form.status} onChange={(e) => setForm((current) => ({ ...current, status: e.target.value as CampaignStatus }))}>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="sending">Sending</option>
                  <option value="completed">Completed</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Message subject / opener</label>
                <input value={form.subject} onChange={(e) => setForm((current) => ({ ...current, subject: e.target.value }))} placeholder="Last release for Auckland Summer Series" />
              </div>
              <div className="form-field">
                <label>Scheduled send</label>
                <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((current) => ({ ...current, scheduledAt: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Source tag</label>
                <input value={form.sourceTag} onChange={(e) => setForm((current) => ({ ...current, sourceTag: e.target.value }))} placeholder="email-final-push" />
              </div>
            </div>

            <div className="form-actions">
              <button className="app-button app-button-primary" onClick={saveCampaign} disabled={!form.name.trim() || !form.subject.trim()}>
                Save campaign
              </button>
              <button className="app-button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</button>
            </div>
          </div>
        </article>
      )}

      <section className="app-panel">
        <div className="app-panel-header">
          <h3>Campaign roster</h3>
          <span>{campaigns.length} active records</span>
        </div>
        <div className="app-list">
          {campaigns.map((campaign) => {
            const event = campaign.eventId ? state.events.find((entry) => entry.id === campaign.eventId) : undefined;
            const segment = campaign.segmentId ? state.customerSegments.find((entry) => entry.id === campaign.segmentId) : undefined;
            return (
              <div key={campaign.id} className="app-list-row">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <strong>{campaign.name}</strong>
                    <span className={`badge ${statusClass[campaign.status]}`}>{campaign.status.replace(/_/g, ' ')}</span>
                    <span className="badge badge-muted">{campaign.channel.toUpperCase()}</span>
                  </div>
                  <p>{event?.name ?? 'Portfolio-wide'} · {segment?.name ?? 'All buyers'} · {campaign.sourceTag}</p>
                  <p className="app-muted-sm">{campaign.subject}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{campaign.sentCount.toLocaleString()}</strong>
                  <p>{Math.round(campaign.conversionRate * 100)}% conversion · {Math.round(campaign.clickRate * 100)}% CTR</p>
                </div>
                <RoleGate permission="marketing:write">
                  <div className="app-row-actions">
                    <button className="app-action-btn" onClick={() => openEdit(campaign)}>Edit</button>
                    <button className="app-action-btn app-action-danger" onClick={() => dispatch({ type: 'DELETE_CAMPAIGN', id: campaign.id })}>Delete</button>
                  </div>
                </RoleGate>
              </div>
            );
          })}
          {campaigns.length === 0 && <div className="app-empty-state">No campaigns yet for the current filter.</div>}
        </div>
      </section>
    </div>
  );
}
