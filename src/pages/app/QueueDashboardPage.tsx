import { useState, useMemo } from 'react';
import { usePlatform } from '../../lib/platform';

function fmtPct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export default function QueueDashboardPage() {
  const { state, dispatch, newId, nowStr } = usePlatform();
  const [selectedEventId, setSelectedEventId] = useState(
    state.events.find((e) => e.status === 'on_sale' || e.status === 'live')?.id ?? state.events[0]?.id ?? ''
  );
  const [releaseCount, setReleaseCount] = useState(10);

  const queue = useMemo(
    () => state.waitingRoom.filter((e) => e.eventId === selectedEventId),
    [state.waitingRoom, selectedEventId]
  );

  const snapshots = useMemo(
    () => state.queueSnapshots.filter((s) => s.eventId === selectedEventId).slice(0, 8),
    [state.queueSnapshots, selectedEventId]
  );

  const activeHolds = useMemo(
    () => state.inventoryHolds.filter(
      (h) => h.eventId === selectedEventId && h.status === 'active'
    ),
    [state.inventoryHolds, selectedEventId]
  );

  const queuedEntries = queue.filter((e) => e.status === 'queued');
  const releasingEntries = queue.filter((e) => e.status === 'releasing');
  const admittedToday = queue.filter((e) => e.status === 'admitted').length;
  const expiredToday = queue.filter((e) => e.status === 'expired').length;

  const latestSnap = snapshots[0];

  function releaseNext() {
    const toRelease = queuedEntries.slice(0, releaseCount);
    const t = nowStr();
    toRelease.forEach((entry) => {
      dispatch({ type: 'RELEASE_FROM_QUEUE', id: entry.id, releasedAt: t });
    });
  }

  function snapshotNow() {
    const totalHeld = activeHolds.reduce((s, h) => s + h.quantity, 0);
    dispatch({
      type: 'SNAPSHOT_QUEUE',
      snapshot: {
        eventId: selectedEventId,
        queueDepth: queuedEntries.length,
        releaseRate: releaseCount,
        attemptRate: Math.round(queuedEntries.length * 0.9),
        activeHolds: totalHeld,
        conversionRate: latestSnap ? latestSnap.conversionRate : 0.7,
      },
    });
  }

  function expireEntry(id: string) {
    dispatch({ type: 'EXPIRE_QUEUE_ENTRY', id });
  }

  function releaseHold(id: string) {
    dispatch({ type: 'RELEASE_HOLD', id });
  }

  const maxDepth = snapshots.length > 0 ? Math.max(...snapshots.map((s) => s.queueDepth), 1) : 1;

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">High-demand sales</p>
          <h2>Queue Dashboard</h2>
          <p>Monitor waiting room depth, release buyers into checkout, and track inventory holds.</p>
        </div>
        <select className="app-select" value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
          <option value="">Select event…</option>
          {state.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      </section>

      {/* Stat row */}
      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Queued</span>
          <strong>{queuedEntries.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Releasing</span>
          <strong>{releasingEntries.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Active holds</span>
          <strong>{activeHolds.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Conversion</span>
          <strong>{latestSnap ? fmtPct(latestSnap.conversionRate) : '—'}</strong>
        </article>
      </section>

      <section className="app-two-column">
        {/* Queue controls */}
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Release controls</h3>
            <button className="app-action-btn" onClick={snapshotNow}>Snapshot now</button>
          </div>

          <div className="queue-release-row">
            <div className="form-field" style={{ flex: 1 }}>
              <label>Release batch size</label>
              <input
                type="number"
                className="app-select"
                min={1}
                max={500}
                value={releaseCount}
                onChange={(e) => setReleaseCount(Number(e.target.value))}
              />
            </div>
            <button
              className="app-button app-button-primary"
              onClick={releaseNext}
              disabled={queuedEntries.length === 0}
            >
              Release {Math.min(releaseCount, queuedEntries.length)} buyers →
            </button>
          </div>

          {latestSnap && (
            <div className="queue-pressure-info">
              <div className="queue-pressure-stat">
                <span>Queue depth</span>
                <strong>{latestSnap.queueDepth.toLocaleString()}</strong>
              </div>
              <div className="queue-pressure-stat">
                <span>Release rate</span>
                <strong>{latestSnap.releaseRate}/min</strong>
              </div>
              <div className="queue-pressure-stat">
                <span>Attempt rate</span>
                <strong>{latestSnap.attemptRate}/min</strong>
              </div>
              <div className="queue-pressure-stat">
                <span>Active holds</span>
                <strong>{latestSnap.activeHolds}</strong>
              </div>
            </div>
          )}

          {/* Pressure sparkline */}
          {snapshots.length > 1 && (
            <div className="queue-sparkline">
              <p className="app-muted-sm" style={{ marginBottom: 8 }}>Queue depth over time</p>
              <div className="queue-sparkline-bars">
                {[...snapshots].reverse().map((snap) => (
                  <div key={snap.id} className="queue-sparkline-col">
                    <div
                      className="queue-sparkline-bar"
                      style={{ height: `${Math.round((snap.queueDepth / maxDepth) * 60)}px` }}
                      title={`${snap.capturedAt}: ${snap.queueDepth} queued`}
                    />
                    <span className="queue-sparkline-label">{snap.capturedAt.slice(11, 16)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>

        {/* Queue entries */}
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Queue entries</h3>
            <span>{queue.length} total · {admittedToday} admitted · {expiredToday} expired</span>
          </div>
          {queue.length === 0 ? (
            <p className="app-muted-sm" style={{ padding: '16px 0' }}>No queue entries for this event.</p>
          ) : (
            <div className="app-list">
              {queue.map((entry) => (
                <div key={entry.id} className="app-list-row">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>#{entry.position}</strong>
                      <span className={`badge badge-${entry.status === 'queued' ? 'amber' : entry.status === 'releasing' ? 'cyan' : entry.status === 'admitted' ? 'green' : 'red'}`}>
                        {entry.status}
                      </span>
                    </div>
                    <p>{entry.buyerEmail ?? entry.sessionId} · Joined {entry.joinedAt} · ~{entry.estimatedWaitMins}min wait</p>
                  </div>
                  <div className="app-row-actions">
                    {entry.status === 'queued' && (
                      <>
                        <button className="app-action-btn app-action-confirm" onClick={() => dispatch({ type: 'RELEASE_FROM_QUEUE', id: entry.id, releasedAt: nowStr() })}>
                          Release
                        </button>
                        <button className="app-action-btn app-action-danger" onClick={() => expireEntry(entry.id)}>
                          Expire
                        </button>
                      </>
                    )}
                    {entry.status === 'releasing' && (
                      <span className="app-muted-sm">In checkout</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      {/* Inventory holds */}
      <article className="app-panel">
        <div className="app-panel-header">
          <h3>Active inventory holds</h3>
          <span>{activeHolds.length} holds · {activeHolds.reduce((s, h) => s + h.quantity, 0)} tickets locked</span>
        </div>
        {activeHolds.length === 0 ? (
          <p className="app-muted-sm" style={{ padding: '16px 0' }}>No active holds for this event.</p>
        ) : (
          <div className="app-list">
            {activeHolds.map((hold) => {
              const tier = state.ticketTiers.find((t) => t.id === hold.tierId);
              const isExpiring = hold.expiresAt < nowStr();
              return (
                <div key={hold.id} className="app-list-row">
                  <div>
                    <strong>{tier?.name ?? hold.tierId}</strong>
                    <p>
                      {hold.quantity} ticket{hold.quantity !== 1 ? 's' : ''} · Session {hold.holderId}
                      {' · '}
                      <span className={isExpiring ? 'text-danger' : ''}>
                        Expires {hold.expiresAt}
                      </span>
                    </p>
                  </div>
                  <div className="app-row-actions">
                    {isExpiring && <span className="badge badge-red">expired</span>}
                    <button className="app-action-btn app-action-danger" onClick={() => releaseHold(hold.id)}>
                      Release
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <div className="app-alert" style={{ marginTop: 20 }}>
        <span>ℹ</span>
        <span>
          Releasing a buyer moves them from <strong>queued</strong> to <strong>releasing</strong> — they receive a checkout window. Holds are automatically created when a buyer begins checkout and expire if not converted to an order. Manual hold release returns inventory to the pool.
        </span>
      </div>
    </div>
  );
}
