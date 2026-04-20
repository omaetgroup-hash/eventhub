import { useMemo, useState } from 'react';
import RoleGate from '../../components/ui/RoleGate';
import type { ReferralLink } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';

const EMPTY_REFERRAL = {
  eventId: '',
  label: '',
  code: '',
  source: '',
};

export default function GrowthAnalyticsPage() {
  const { state, dispatch, newId, nowStr } = usePlatform();
  const [referralForm, setReferralForm] = useState(EMPTY_REFERRAL);

  const sourcePerformance = useMemo(() => {
    const buckets = new Map<string, { source: string; clicks: number; conversions: number; revenue: number }>();
    for (const link of state.referralLinks) {
      const current = buckets.get(link.source) ?? { source: link.source, clicks: 0, conversions: 0, revenue: 0 };
      current.clicks += link.clicks;
      current.conversions += link.conversions;
      current.revenue += link.revenueAttributed;
      buckets.set(link.source, current);
    }
    return Array.from(buckets.values()).sort((left, right) => right.revenue - left.revenue);
  }, [state.referralLinks]);

  function saveReferralLink() {
    const payload: ReferralLink = {
      id: newId('ref'),
      eventId: referralForm.eventId,
      label: referralForm.label.trim(),
      code: referralForm.code.trim() || referralForm.label.trim().toLowerCase().replace(/\s+/g, '-'),
      source: referralForm.source.trim(),
      clicks: 0,
      conversions: 0,
      revenueAttributed: 0,
      createdAt: nowStr(),
    };
    dispatch({ type: 'UPSERT_REFERRAL_LINK', payload });
    setReferralForm(EMPTY_REFERRAL);
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Organizer growth</p>
          <h2>Growth analytics</h2>
          <p>Track traffic, checkout conversion, referral performance, and the channels actually driving ticket revenue.</p>
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Tracked visits</span>
          <strong>{state.conversionReports.reduce((sum, report) => sum + report.visits, 0).toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Checkout starts</span>
          <strong>{state.conversionReports.reduce((sum, report) => sum + report.checkoutStarts, 0).toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Completed orders</span>
          <strong>{state.conversionReports.reduce((sum, report) => sum + report.ordersCompleted, 0).toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Attributed revenue</span>
          <strong>${state.referralLinks.reduce((sum, link) => sum + link.revenueAttributed, 0).toLocaleString()}</strong>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Conversion reports</h3>
            <span>{state.conversionReports.length} views</span>
          </div>
          <div className="app-list">
            {state.conversionReports.map((report) => (
              <div key={report.id} className="app-list-row">
                <div>
                  <strong>{report.scope === 'organization' ? 'Portfolio report' : state.events.find((event) => event.id === report.eventId)?.name ?? report.eventId}</strong>
                  <p>{report.windowLabel} · Top source: {report.topSource}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{report.visits.toLocaleString()} visits</strong>
                  <p>{report.ordersCompleted} orders · ${report.revenue.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Channel performance</h3>
            <span>{sourcePerformance.length} tracked sources</span>
          </div>
          <div className="app-list">
            {sourcePerformance.map((source) => (
              <div key={source.source} className="app-list-row">
                <div>
                  <strong>{source.source}</strong>
                  <p>{source.clicks.toLocaleString()} clicks</p>
                </div>
                <div className="app-list-metric">
                  <strong>{source.conversions}</strong>
                  <p>${source.revenue.toLocaleString()} attributed</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Referral links</h3>
            <span>{state.referralLinks.length} active links</span>
          </div>
          <div className="app-list">
            {state.referralLinks.map((link) => {
              const event = state.events.find((entry) => entry.id === link.eventId);
              return (
                <div key={link.id} className="app-list-row">
                  <div>
                    <strong>{link.label}</strong>
                    <p>{event?.name ?? link.eventId} · {link.source} · /events/{link.eventId}?ref={link.code}</p>
                  </div>
                  <div className="app-list-metric">
                    <strong>{link.conversions}</strong>
                    <p>{link.clicks.toLocaleString()} clicks · ${link.revenueAttributed.toLocaleString()}</p>
                  </div>
                  <RoleGate permission="marketing:write">
                    <button className="app-action-btn app-action-danger" onClick={() => dispatch({ type: 'DELETE_REFERRAL_LINK', id: link.id })}>
                      Delete
                    </button>
                  </RoleGate>
                </div>
              );
            })}
            {state.referralLinks.length === 0 && <div className="app-empty-state">No referral links created yet.</div>}
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Create referral link</h3>
          </div>
          <RoleGate permission="marketing:write" fallback={<p className="app-muted-sm">You need marketing write access to create referral links.</p>}>
            <div className="app-form" style={{ marginTop: 16 }}>
              <div className="form-field">
                <label>Event</label>
                <select value={referralForm.eventId} onChange={(e) => setReferralForm((current) => ({ ...current, eventId: e.target.value }))}>
                  <option value="">Select event</option>
                  {state.events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label>Label</label>
                  <input value={referralForm.label} onChange={(e) => setReferralForm((current) => ({ ...current, label: e.target.value }))} placeholder="Instagram creator drop" />
                </div>
                <div className="form-field">
                  <label>Source</label>
                  <input value={referralForm.source} onChange={(e) => setReferralForm((current) => ({ ...current, source: e.target.value }))} placeholder="instagram" />
                </div>
              </div>
              <div className="form-field">
                <label>Code <span className="form-hint">(optional slug)</span></label>
                <input value={referralForm.code} onChange={(e) => setReferralForm((current) => ({ ...current, code: e.target.value }))} placeholder="ig-creator-drop" className="app-mono" />
              </div>
              <div className="form-actions">
                <button className="app-button app-button-primary" onClick={saveReferralLink} disabled={!referralForm.eventId || !referralForm.label.trim() || !referralForm.source.trim()}>
                  Save referral
                </button>
              </div>
            </div>
          </RoleGate>
        </article>
      </section>
    </div>
  );
}
