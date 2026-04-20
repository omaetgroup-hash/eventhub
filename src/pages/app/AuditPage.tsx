import { useState } from 'react';
import { usePlatform } from '../../lib/platform';

type Severity = 'info' | 'warning' | 'critical' | '';

const SEVERITY_CLASS: Record<string, string> = {
  info: 'badge-green',
  warning: 'badge-amber',
  critical: 'badge-red',
};

export default function AuditPage() {
  const { state } = usePlatform();
  const [filterSeverity, setFilterSeverity] = useState<Severity>('');
  const [filterActor, setFilterActor] = useState('');

  const filtered = state.auditLog.filter((entry) => {
    if (filterSeverity && entry.severity !== filterSeverity) return false;
    if (filterActor && !entry.actor.toLowerCase().includes(filterActor.toLowerCase())) return false;
    return true;
  });

  const counts = {
    info: state.auditLog.filter((e) => e.severity === 'info').length,
    warning: state.auditLog.filter((e) => e.severity === 'warning').length,
    critical: state.auditLog.filter((e) => e.severity === 'critical').length,
  };

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Compliance and operations log</p>
          <h2>Audit Trail</h2>
          <p>Every role-sensitive action generates a record. All platform mutations are captured in real time.</p>
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Total entries</span>
          <strong>{state.auditLog.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Info</span>
          <strong>{counts.info}</strong>
        </article>
        <article className="app-stat-card">
          <span>Warning</span>
          <strong>{counts.warning}</strong>
        </article>
        <article className="app-stat-card">
          <span>Critical</span>
          <strong>{counts.critical}</strong>
        </article>
      </section>

      <div className="app-filter-bar">
        <select className="app-select" value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value as Severity)}>
          <option value="">All severities</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <input
          className="app-input"
          style={{ maxWidth: 220 }}
          placeholder="Filter by actor…"
          value={filterActor}
          onChange={(e) => setFilterActor(e.target.value)}
        />
      </div>

      <section className="app-list app-panel">
        {filtered.length === 0 && (
          <p className="app-muted-sm" style={{ padding: '16px 0' }}>No audit entries match the current filter.</p>
        )}
        {filtered.map((entry) => (
          <div key={entry.id} className="app-list-row">
            <div>
              <strong>{entry.action}</strong>
              <p>{entry.actor} · {entry.target}</p>
            </div>
            <div className="app-list-metric" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <strong>{entry.timestamp}</strong>
              <span className={`badge ${SEVERITY_CLASS[entry.severity]}`}>{entry.severity}</span>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
