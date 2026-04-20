import { usePlatform } from '../../lib/platform';

export default function EnterpriseAnalyticsPage() {
  const { state } = usePlatform();

  const totalManagedRevenue = state.managedOrganizations.reduce((sum, organization) => sum + organization.revenue, 0);
  const totalManagedEvents = state.managedOrganizations.reduce((sum, organization) => sum + organization.activeEvents, 0);

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Enterprise controls</p>
          <h2>Enterprise analytics</h2>
          <p>See the platform as a portfolio: multi-org revenue, compliance status, and operational reporting across managed accounts.</p>
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Managed orgs</span>
          <strong>{state.managedOrganizations.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Portfolio revenue</span>
          <strong>${totalManagedRevenue.toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Active events</span>
          <strong>{totalManagedEvents}</strong>
        </article>
        <article className="app-stat-card">
          <span>Team footprint</span>
          <strong>{state.managedOrganizations.reduce((sum, organization) => sum + organization.teamCount, 0)}</strong>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Managed organizations</h3>
            <span>{state.managedOrganizations.length} accounts</span>
          </div>
          <div className="app-list">
            {state.managedOrganizations.map((organization) => (
              <div key={organization.id} className="app-list-row">
                <div>
                  <strong>{organization.name}</strong>
                  <p>{organization.region} · {organization.teamCount} team members</p>
                </div>
                <div className="app-list-metric">
                  <strong>${organization.revenue.toLocaleString()}</strong>
                  <p>{organization.activeEvents} active events · {organization.complianceStatus}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Operational reporting</h3>
          </div>
          <div className="app-list">
            <div className="app-list-row">
              <div>
                <strong>Gate network</strong>
                <p>Aggregate scanner and checkpoint coverage across live venues.</p>
              </div>
              <div className="app-list-metric">
                <strong>{state.checkpoints.length}</strong>
                <p>{state.devices.length} registered devices</p>
              </div>
            </div>
            <div className="app-list-row">
              <div>
                <strong>Open fraud flags</strong>
                <p>Suspicious purchase and abuse events still awaiting review.</p>
              </div>
              <div className="app-list-metric">
                <strong>{state.fraudFlags.filter((flag) => !flag.resolved).length}</strong>
                <p>{state.abuseEvents.filter((event) => event.action !== 'logged').length} escalated abuse events</p>
              </div>
            </div>
            <div className="app-list-row">
              <div>
                <strong>Portfolio conversion</strong>
                <p>Summed public demand against completed checkout across current reports.</p>
              </div>
              <div className="app-list-metric">
                <strong>{Math.round((state.conversionReports.reduce((sum, report) => sum + report.ordersCompleted, 0) / Math.max(1, state.conversionReports.reduce((sum, report) => sum + report.visits, 0))) * 10000) / 100}%</strong>
                <p>{state.conversionReports.length} reporting windows</p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section className="app-panel">
        <div className="app-panel-header">
          <h3>Enterprise readiness notes</h3>
        </div>
        <div className="app-list">
          <div className="app-list-row">
            <div>
              <strong>Multi-org reporting</strong>
              <p>Organization-level summaries are now modeled so the platform can roll up revenue, event activity, and compliance across accounts.</p>
            </div>
            <div className="app-list-metric">
              <strong>Ready</strong>
              <p>Live warehouse sync pending</p>
            </div>
          </div>
          <div className="app-list-row">
            <div>
              <strong>SSO and compliance</strong>
              <p>SSO configuration and compliance status are part of the platform state, ready for provider onboarding and enforcement flows.</p>
            </div>
            <div className="app-list-metric">
              <strong>Scaffolded</strong>
              <p>Provider credentials required</p>
            </div>
          </div>
          <div className="app-list-row">
            <div>
              <strong>API and webhooks</strong>
              <p>Enterprise data egress now has explicit routes, credentials, and webhook registration surfaces instead of living only in settings notes.</p>
            </div>
            <div className="app-list-metric">
              <strong>Ready</strong>
              <p>Need backend transport layer</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
