import { usePlatform } from '../../lib/platform';

export default function FinancePage() {
  const { state } = usePlatform();

  const totalExportAmount = state.financeExports.reduce((sum, exportJob) => sum + exportJob.amount, 0);
  const unresolvedVariance = state.reconciliationRuns
    .filter((run) => run.status !== 'completed')
    .reduce((sum, run) => sum + Math.abs(run.varianceAmount), 0);

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Enterprise controls</p>
          <h2>Finance and reconciliation</h2>
          <p>Prepare accounting exports, track reconciliation runs, and surface tax configuration for finance and compliance teams.</p>
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Exports ready</span>
          <strong>{state.financeExports.filter((exportJob) => exportJob.status === 'ready').length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Tracked export value</span>
          <strong>${totalExportAmount.toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Reconciliation runs</span>
          <strong>{state.reconciliationRuns.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Outstanding variance</span>
          <strong>${unresolvedVariance.toLocaleString()}</strong>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Accounting exports</h3>
            <span>{state.financeExports.length} jobs</span>
          </div>
          <div className="app-list">
            {state.financeExports.map((exportJob) => (
              <div key={exportJob.id} className="app-list-row">
                <div>
                  <strong>{exportJob.kind.replace(/_/g, ' ')}</strong>
                  <p>{exportJob.provider} · {exportJob.periodLabel}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{exportJob.status}</strong>
                  <p>{exportJob.rowCount} rows · ${exportJob.amount.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Reconciliation</h3>
            <span>{state.reconciliationRuns.length} runs</span>
          </div>
          <div className="app-list">
            {state.reconciliationRuns.map((run) => (
              <div key={run.id} className="app-list-row">
                <div>
                  <strong>{run.provider}</strong>
                  <p>{run.periodLabel}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{run.status}</strong>
                  <p>{run.matchedCount} matched · {run.unmatchedCount} unmatched · ${Math.abs(run.varianceAmount).toLocaleString()} variance</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Tax profiles</h3>
            <span>{state.taxProfiles.length} regions</span>
          </div>
          <div className="app-list">
            {state.taxProfiles.map((profile) => (
              <div key={profile.id} className="app-list-row">
                <div>
                  <strong>{profile.region}</strong>
                  <p>{profile.registrationNumber}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{profile.defaultRate}%</strong>
                  <p>{profile.filingCadence} · {profile.pricesIncludeTax ? 'Tax inclusive' : 'Tax exclusive'}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Finance readiness</h3>
          </div>
          <div className="app-list">
            <div className="app-list-row">
              <div>
                <strong>Accounting export scaffold</strong>
                <p>CSV/API export surface is modeled and ready to connect to Xero, NetSuite, or a custom ERP sync.</p>
              </div>
              <div className="app-list-metric">
                <strong>Ready</strong>
                <p>Provider creds pending</p>
              </div>
            </div>
            <div className="app-list-row">
              <div>
                <strong>Reconciliation workflow</strong>
                <p>Run-level status and unmatched variance are available for finance review and close processes.</p>
              </div>
              <div className="app-list-metric">
                <strong>Scaffolded</strong>
                <p>Needs live processor feed</p>
              </div>
            </div>
            <div className="app-list-row">
              <div>
                <strong>Tax handling</strong>
                <p>Regional tax defaults and filing cadence are modeled for NZ/AU rollout.</p>
              </div>
              <div className="app-list-metric">
                <strong>Ready</strong>
                <p>More regions later</p>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
