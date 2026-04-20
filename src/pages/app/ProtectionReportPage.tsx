import { useState, useMemo } from 'react';
import type { FlagSeverity, FlagType, AbusePattern } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';

const FLAG_LABELS: Record<FlagType, string> = {
  bulk_purchase:       'Bulk purchase',
  bot_pattern:         'Bot pattern',
  duplicate_email:     'Duplicate email',
  suspicious_payment:  'Suspicious payment',
  known_reseller:      'Known reseller',
};

const SEVERITY_BADGE: Record<FlagSeverity, string> = {
  low:    'badge-green',
  medium: 'badge-amber',
  high:   'badge-red',
};

const ABUSE_LABELS: Record<AbusePattern, string> = {
  rapid_attempts:    'Rapid attempts',
  multiple_sessions: 'Multiple sessions',
  queue_bypass:      'Queue bypass',
  code_stuffing:     'Code stuffing',
  hold_farming:      'Hold farming',
};

const ACTION_BADGE: Record<string, string> = {
  logged:  'badge-amber',
  blocked: 'badge-red',
  flagged: 'badge-amber',
};

export default function ProtectionReportPage() {
  const { state, dispatch, nowStr } = usePlatform();
  const { user } = { user: state.teamMembers[0] };
  const [filterEventId, setFilterEventId] = useState('');
  const [showResolved, setShowResolved] = useState(false);

  const flags = useMemo(() => {
    return state.fraudFlags
      .filter((f) => (!filterEventId || f.eventId === filterEventId) && (showResolved || !f.resolved));
  }, [state.fraudFlags, filterEventId, showResolved]);

  const abuse = useMemo(() => {
    return state.abuseEvents
      .filter((e) => !filterEventId || e.eventId === filterEventId);
  }, [state.abuseEvents, filterEventId]);

  const openFlags = state.fraudFlags.filter((f) => !f.resolved).length;
  const highSeverity = state.fraudFlags.filter((f) => !f.resolved && f.severity === 'high').length;
  const blockedSessions = state.abuseEvents.filter((e) => e.action === 'blocked').length;
  const totalAbuseSessions = state.abuseEvents.reduce((s, e) => s + e.sessionCount, 0);

  function resolveFlag(id: string) {
    dispatch({ type: 'RESOLVE_FRAUD_FLAG', id, resolvedBy: user?.name ?? 'User', resolvedAt: nowStr() });
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">High-demand sales</p>
          <h2>Protection Report</h2>
          <p>Fraud flags, abuse event log, and suspicious activity detected during onsales.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select className="app-select" value={filterEventId} onChange={(e) => setFilterEventId(e.target.value)}>
            <option value="">All events</option>
            {state.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', color: 'rgba(220,232,239,0.7)', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Show resolved
          </label>
        </div>
      </section>

      {/* Stat row */}
      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Open flags</span>
          <strong className={openFlags > 0 ? 'text-danger' : ''}>{openFlags}</strong>
        </article>
        <article className="app-stat-card">
          <span>High severity</span>
          <strong className={highSeverity > 0 ? 'text-danger' : ''}>{highSeverity}</strong>
        </article>
        <article className="app-stat-card">
          <span>Blocked sessions</span>
          <strong>{blockedSessions}</strong>
        </article>
        <article className="app-stat-card">
          <span>Suspicious sessions</span>
          <strong>{totalAbuseSessions}</strong>
        </article>
      </section>

      {/* Fraud flags */}
      <article className="app-panel" style={{ marginBottom: 24 }}>
        <div className="app-panel-header">
          <h3>Fraud flags</h3>
          <span>{flags.length} showing</span>
        </div>
        {flags.length === 0 ? (
          <p className="app-muted-sm" style={{ padding: '16px 0' }}>
            {showResolved ? 'No fraud flags recorded.' : 'No open fraud flags — all clear.'}
          </p>
        ) : (
          <div className="app-list">
            {flags.map((flag) => {
              const event = state.events.find((e) => e.id === flag.eventId);
              return (
                <div key={flag.id} className={`app-list-row${flag.resolved ? ' protection-row-resolved' : ''}`}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className={`badge ${SEVERITY_BADGE[flag.severity]}`}>{flag.severity}</span>
                      <strong>{FLAG_LABELS[flag.flagType]}</strong>
                      {flag.resolved && <span className="badge badge-green">resolved</span>}
                    </div>
                    <p style={{ fontSize: '0.84rem', marginBottom: 3 }}>{flag.detail}</p>
                    <p style={{ fontSize: '0.78rem', color: 'rgba(220,232,239,0.5)' }}>
                      {flag.buyerEmail ?? flag.orderId ?? 'Unknown buyer'}
                      {' · '}
                      {event?.name ?? flag.eventId}
                      {' · '}
                      {flag.detectedAt}
                      {flag.resolvedBy && ` · Resolved by ${flag.resolvedBy}`}
                    </p>
                  </div>
                  {!flag.resolved && (
                    <button className="app-action-btn app-action-confirm" onClick={() => resolveFlag(flag.id)}>
                      Resolve
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </article>

      {/* Abuse events */}
      <article className="app-panel">
        <div className="app-panel-header">
          <h3>Abuse event log</h3>
          <span>{abuse.length} events</span>
        </div>
        {abuse.length === 0 ? (
          <p className="app-muted-sm" style={{ padding: '16px 0' }}>No abuse events recorded.</p>
        ) : (
          <div className="app-list">
            {abuse.map((evt) => {
              const event = state.events.find((e) => e.id === evt.eventId);
              return (
                <div key={evt.id} className="app-list-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className={`badge ${ACTION_BADGE[evt.action]}`}>{evt.action}</span>
                      <strong>{ABUSE_LABELS[evt.pattern]}</strong>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'rgba(220,232,239,0.55)' }}>
                      IP hash: <code className="app-mono">{evt.ipHash}</code>
                      {' · '}
                      {evt.sessionCount} session{evt.sessionCount !== 1 ? 's' : ''}
                      {' · '}
                      {event?.name ?? evt.eventId}
                      {' · '}
                      {evt.detectedAt}
                    </p>
                  </div>
                  <span className={`badge ${ACTION_BADGE[evt.action]}`} style={{ flexShrink: 0 }}>
                    {evt.action}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <div className="app-alert" style={{ marginTop: 20 }}>
        <span>ℹ</span>
        <span>
          Fraud flags are auto-raised on bulk purchases (4+), known reseller emails, and anomalous checkout timing. Abuse events are logged when session patterns match bot or farming signatures. Resolving a flag records the reviewer and timestamp.
          {' '}<strong>IP hashes are one-way</strong> — originals are never stored.
        </span>
      </div>
    </div>
  );
}
