import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePlatform } from '../../lib/platform';
import { useAuth } from '../../lib/auth';
import { ScanResultBadge } from '../../components/ui/StatusBadge';

function formatRelative(ts: string): string {
  try {
    const diff = Date.now() - new Date(ts.replace(' ', 'T')).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  } catch {
    return ts;
  }
}

export default function GateOpsPage() {
  const { state, dispatch, eventById, newId, nowStr } = usePlatform();
  const { user } = useAuth();

  const [selectedEventId, setSelectedEventId] = useState(
    state.events.find((e) => e.status === 'live')?.id ?? state.events[0]?.id ?? ''
  );

  const liveEvents = state.events.filter((e) => e.status === 'live' || e.status === 'on_sale');
  const selectedEvent = eventById(selectedEventId);
  const venue = state.venues.find((v) => v.id === selectedEvent?.venueId);

  const eventCheckpoints = useMemo(
    () => state.checkpoints.filter((cp) => !selectedEventId || cp.eventId === selectedEventId || !cp.eventId),
    [state.checkpoints, selectedEventId]
  );

  const eventDevices = useMemo(
    () => state.devices.filter((d) => !selectedEventId || d.eventId === selectedEventId),
    [state.devices, selectedEventId]
  );

  const recentScans = useMemo(
    () => state.checkInScans
      .filter((s) => !selectedEventId || s.eventId === selectedEventId)
      .slice(0, 30),
    [state.checkInScans, selectedEventId]
  );

  const reEntries = useMemo(
    () => state.reEntryRecords
      .filter((r) => !selectedEventId || r.eventId === selectedEventId)
      .slice(0, 20),
    [state.reEntryRecords, selectedEventId]
  );

  const pendingOffline = useMemo(
    () => state.offlineQueue.filter((e) => !e.synced && (!selectedEventId || e.eventId === selectedEventId)),
    [state.offlineQueue, selectedEventId]
  );

  const totalAdmitted = eventCheckpoints.reduce((s, c) => s + c.admitted, 0);
  const totalDenied   = eventCheckpoints.reduce((s, c) => s + c.denied, 0);
  const totalReAdmit  = eventCheckpoints.reduce((s, c) => s + c.reAdmissions, 0);
  const offlineDevices = eventDevices.filter((d) => d.status === 'offline').length;

  function syncDevice(deviceId: string) {
    dispatch({ type: 'SYNC_OFFLINE_SCANS', deviceId });
  }

  function setDeviceOnline(deviceId: string) {
    dispatch({ type: 'SET_DEVICE_STATUS', id: deviceId, status: 'online', lastSeen: nowStr() });
  }

  function admitReEntry(id: string) {
    dispatch({ type: 'ADMIT_REENTRY', id, readmittedAt: nowStr() });
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Event day operations</p>
          <h2>Gate Ops</h2>
          <p>Gate-level throughput, device status, offline sync, and pass-out / re-entry management.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <select className="app-select" value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
            <option value="">All events</option>
            {state.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
          <Link to="/app/scanner" className="app-button app-button-primary" style={{ textDecoration: 'none' }}>
            Open scanner →
          </Link>
        </div>
      </section>

      {selectedEvent && (
        <div className="ops-event-banner">
          <div className="ops-event-banner-info">
            <strong>{selectedEvent.name}</strong>
            <span>{venue?.name} · {venue?.city}</span>
            <span>{selectedEvent.startsAt} — {selectedEvent.endsAt}</span>
          </div>
          <span className={`badge badge-${selectedEvent.status === 'live' ? 'cyan' : 'amber'}`}>
            {selectedEvent.status.replace('_', ' ')}
          </span>
        </div>
      )}

      {/* Stat row */}
      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Admitted</span>
          <strong>{totalAdmitted.toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Denied</span>
          <strong>{totalDenied}</strong>
        </article>
        <article className="app-stat-card">
          <span>Re-admissions</span>
          <strong>{totalReAdmit}</strong>
        </article>
        <article className="app-stat-card">
          <span>Offline devices</span>
          <strong className={offlineDevices > 0 ? 'text-danger' : ''}>{offlineDevices}</strong>
        </article>
      </section>

      <section className="app-two-column">
        {/* Gate cards */}
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Gate throughput</h3>
            <Link to="/app/access-rules" className="app-action-link">Access rules</Link>
          </div>
          <div className="gate-card-grid">
            {eventCheckpoints.map((cp) => {
              const gateDevices = eventDevices.filter((d) => d.gate === cp.gate);
              const onlineDevices = gateDevices.filter((d) => d.status === 'online').length;
              const total = cp.admitted + cp.denied;
              const admitPct = total > 0 ? Math.round((cp.admitted / total) * 100) : 0;
              return (
                <div key={cp.gate} className="gate-card">
                  <div className="gate-card-header">
                    <strong className="gate-card-name">{cp.gate}</strong>
                    <div className="gate-card-devices">
                      {gateDevices.map((d) => (
                        <span key={d.id} className={`device-dot device-dot-${d.status}`} title={`${d.name}: ${d.status}`} />
                      ))}
                      <span className="gate-card-device-label">
                        {onlineDevices}/{gateDevices.length} online
                      </span>
                    </div>
                  </div>
                  <div className="gate-card-stats">
                    <div className="gate-stat">
                      <span className="gate-stat-num gate-stat-green">{cp.admitted.toLocaleString()}</span>
                      <span className="gate-stat-label">admitted</span>
                    </div>
                    <div className="gate-stat">
                      <span className="gate-stat-num gate-stat-red">{cp.denied}</span>
                      <span className="gate-stat-label">denied</span>
                    </div>
                    <div className="gate-stat">
                      <span className="gate-stat-num">{cp.reAdmissions}</span>
                      <span className="gate-stat-label">re-entry</span>
                    </div>
                  </div>
                  <div className="tier-progress" style={{ marginTop: 10 }}>
                    <div className="tier-progress-bar" style={{ width: `${admitPct}%` }} />
                  </div>
                  <p style={{ fontSize: '0.74rem', color: 'rgba(220,232,239,0.44)', marginTop: 4 }}>
                    {admitPct}% admit rate
                    {cp.offlineDevices > 0 && <span className="text-danger"> · {cp.offlineDevices} offline</span>}
                  </p>
                </div>
              );
            })}
          </div>
        </article>

        {/* Device status */}
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Devices</h3>
            <span>{eventDevices.length} registered</span>
          </div>
          <div className="app-list">
            {eventDevices.map((device) => {
              const devPending = state.offlineQueue.filter((e) => e.deviceId === device.id && !e.synced).length;
              return (
                <div key={device.id} className="app-list-row">
                  <div className="device-row-info">
                    <div className={`device-status-dot device-status-dot-${device.status}`} />
                    <div>
                      <strong>{device.name}</strong>
                      <p>{device.gate} · Last seen {formatRelative(device.lastSeen)}</p>
                      {devPending > 0 && (
                        <p className="text-danger" style={{ fontSize: '0.8rem' }}>
                          {devPending} scans pending sync
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="app-row-actions">
                    {device.status === 'offline' && (
                      <>
                        <button className="app-action-btn" onClick={() => setDeviceOnline(device.id)}>
                          Mark online
                        </button>
                        {devPending > 0 && (
                          <button className="app-action-btn app-action-confirm" onClick={() => syncDevice(device.id)}>
                            Sync
                          </button>
                        )}
                      </>
                    )}
                    {device.status === 'online' && (
                      <span className="badge badge-green">online</span>
                    )}
                  </div>
                </div>
              );
            })}
            {eventDevices.length === 0 && (
              <p className="app-muted-sm" style={{ padding: '16px 0' }}>No devices registered for this event.</p>
            )}
          </div>
        </article>
      </section>

      {/* Offline sync panel */}
      {pendingOffline.length > 0 && (
        <article className="app-panel ops-offline-panel">
          <div className="app-panel-header">
            <h3>Offline scan queue</h3>
            <span className="badge badge-amber">{pendingOffline.length} pending</span>
          </div>
          <p className="app-muted-sm" style={{ marginBottom: 16 }}>
            These scans were captured offline and have not yet been processed. Review and sync each device to resolve.
          </p>
          <div className="app-list">
            {pendingOffline.slice(0, 10).map((entry) => {
              const dev = state.devices.find((d) => d.id === entry.deviceId);
              return (
                <div key={entry.id} className="app-list-row">
                  <div>
                    <strong className="app-mono" style={{ fontSize: '0.82rem' }}>{entry.qrPayload}</strong>
                    <p>{dev?.name ?? entry.deviceId} · {entry.gate} · {entry.scannedAt}</p>
                  </div>
                  <button
                    className="app-action-btn app-action-confirm"
                    onClick={() => syncDevice(entry.deviceId)}
                  >
                    Sync device
                  </button>
                </div>
              );
            })}
          </div>
        </article>
      )}

      <section className="app-two-column">
        {/* Re-entry / pass-out log */}
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Pass-out / re-entry</h3>
            <span>{reEntries.length} records</span>
          </div>
          {reEntries.length === 0 ? (
            <p className="app-muted-sm" style={{ padding: '16px 0' }}>
              No pass-outs recorded. Use the check-in scanner in re-entry mode to log pass-outs.
            </p>
          ) : (
            <div className="app-list">
              {reEntries.map((r) => (
                <div key={r.id} className="app-list-row">
                  <div>
                    <strong>{r.holderName}</strong>
                    <p>{r.gate} · Out {r.passedOutAt}
                      {r.readmittedAt ? ` · Re-entered ${r.readmittedAt}` : ' · Pending re-entry'}
                    </p>
                  </div>
                  {!r.readmittedAt ? (
                    <button className="app-action-btn app-action-confirm" onClick={() => admitReEntry(r.id)}>
                      Re-admit
                    </button>
                  ) : (
                    <span className="badge badge-green">admitted</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>

        {/* Scan timeline */}
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Scan timeline</h3>
            <span>last {recentScans.length}</span>
          </div>
          {recentScans.length === 0 ? (
            <p className="app-muted-sm" style={{ padding: '16px 0' }}>No scans recorded yet.</p>
          ) : (
            <div className="app-list">
              {recentScans.slice(0, 15).map((scan) => {
                const ev = eventById(scan.eventId);
                return (
                  <div key={scan.id} className="app-list-row">
                    <div>
                      <strong>{scan.gate}</strong>
                      <p>
                        {scan.denyReason ? `${scan.denyReason.replace(/_/g, ' ')} · ` : ''}
                        {ev?.name ?? scan.eventId} · {scan.scannedAt}
                      </p>
                    </div>
                    <ScanResultBadge result={scan.result} />
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
