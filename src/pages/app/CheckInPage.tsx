import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ScanResultBadge, TicketStatusBadge } from '../../components/ui/StatusBadge';
import RoleGate from '../../components/ui/RoleGate';
import type { IssuedTicket, ScanResult } from '../../lib/domain';
import { usePlatform, checkTicketAccess } from '../../lib/platform';
import { useAuth } from '../../lib/auth';

interface ScanFeedback {
  result: ScanResult;
  ticket?: IssuedTicket;
  eventName?: string;
  message: string;
}

export default function CheckInPage() {
  const { state, dispatch, eventById, newId, nowStr } = usePlatform();
  const { user } = useAuth();
  const [qrInput, setQrInput] = useState('');
  const [gate, setGate] = useState(state.checkpoints[0]?.gate ?? '');
  const [customGate, setCustomGate] = useState('');
  const [deviceId, setDeviceId] = useState(state.devices[0]?.id ?? '');
  const [filterEventId, setFilterEventId] = useState('');
  const [reEntryMode, setReEntryMode] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [preview, setPreview] = useState<IssuedTicket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeGate = gate === '__custom__' ? customGate.trim() : gate;
  const liveEvent = state.events.find((e) => e.status === 'live');

  const pendingOfflineCount = state.offlineQueue.filter(
    (e) => !e.synced && e.deviceId === deviceId
  ).length;

  const recentScans = (filterEventId
    ? state.checkInScans.filter((s) => s.eventId === filterEventId)
    : state.checkInScans
  ).slice(0, 20);

  function lookupTicket(payload: string): IssuedTicket | undefined {
    return state.issuedTickets.find((t) => t.qrPayload === payload.trim());
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQrInput(val);
    const found = lookupTicket(val);
    setPreview(found ?? null);
  }

  function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const payload = qrInput.trim();
    if (!payload || !activeGate) return;

    const ticket = lookupTicket(payload);
    const scanTime = nowStr();

    if (!ticket) {
      dispatch({
        type: 'RECORD_SCAN',
        scan: { id: newId('scan'), ticketId: 'unknown', tierId: undefined, deviceId: deviceId || undefined, eventId: filterEventId || liveEvent?.id || '', gate: activeGate, scannedAt: scanTime, result: 'denied', operatorId: user.id, denyReason: 'not_found' },
      });
      setFeedback({ result: 'denied', message: 'Ticket not found. QR code is invalid or does not belong to this event.' });
      setQrInput('');
      setPreview(null);
      inputRef.current?.focus();
      return;
    }

    if (ticket.status === 'cancelled') {
      dispatch({
        type: 'RECORD_SCAN',
        scan: { id: newId('scan'), ticketId: ticket.id, tierId: ticket.tierId, deviceId: deviceId || undefined, eventId: ticket.eventId, gate: activeGate, scannedAt: scanTime, result: 'denied', operatorId: user.id, denyReason: 'cancelled_ticket' },
      });
      setFeedback({ result: 'denied', ticket, eventName: eventById(ticket.eventId)?.name, message: 'Ticket has been cancelled.' });
      setQrInput('');
      setPreview(null);
      inputRef.current?.focus();
      return;
    }

    // Re-entry mode: log pass-out instead of check-in
    if (reEntryMode) {
      dispatch({
        type: 'RECORD_REENTRY',
        record: { id: newId('reentry'), ticketId: ticket.id, holderName: ticket.holderName, eventId: ticket.eventId, gate: activeGate, passedOutAt: scanTime, operatorId: user.id },
      });
      setFeedback({ result: 'admitted', ticket, eventName: eventById(ticket.eventId)?.name, message: `Pass-out recorded for ${ticket.holderName}. They may re-enter at this gate.` });
      setQrInput('');
      setPreview(null);
      inputRef.current?.focus();
      return;
    }

    // Access rule check
    const tier = state.ticketTiers.find((t) => t.id === ticket.tierId);
    const access = checkTicketAccess(ticket.tierId, tier?.kind ?? 'general_admission', activeGate, ticket.eventId, state.accessRules);
    if (!access.allowed) {
      dispatch({
        type: 'RECORD_SCAN',
        scan: { id: newId('scan'), ticketId: ticket.id, tierId: ticket.tierId, deviceId: deviceId || undefined, eventId: ticket.eventId, gate: activeGate, scannedAt: scanTime, result: 'denied', operatorId: user.id, denyReason: access.reason ?? 'tier_not_allowed' },
      });
      setFeedback({ result: 'denied', ticket, eventName: eventById(ticket.eventId)?.name, message: `This ticket type is not permitted at ${activeGate}.` });
      setQrInput('');
      setPreview(null);
      inputRef.current?.focus();
      return;
    }

    const result: ScanResult = ticket.status === 'used' ? 'duplicate' : 'admitted';
    const event = eventById(ticket.eventId);

    dispatch({
      type: 'RECORD_SCAN',
      scan: { id: newId('scan'), ticketId: ticket.id, tierId: ticket.tierId, deviceId: deviceId || undefined, eventId: ticket.eventId, gate: activeGate, scannedAt: scanTime, result, operatorId: user.id },
    });

    const messages: Record<ScanResult, string> = {
      admitted: `Admitted to ${event?.name ?? 'event'}.`,
      duplicate: `Already scanned at ${ticket.scannedGate ?? 'unknown gate'} on ${ticket.scannedAt ?? '—'}.`,
      denied: 'Entry denied.',
    };

    setFeedback({ result, ticket, eventName: event?.name, message: messages[result] });
    setQrInput('');
    setPreview(null);
    inputRef.current?.focus();
  }

  const totalScanned = state.checkpoints.reduce((s, c) => s + c.scanned, 0);
  const totalAdmitted = state.checkpoints.reduce((s, c) => s + c.admitted, 0);
  const totalDenied = state.checkpoints.reduce((s, c) => s + c.denied, 0);

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Gate management</p>
          <h2>Check-In</h2>
          <p>Scan QR tickets at the gate. Real-time feedback for valid, duplicate, and invalid attempts.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {liveEvent && (
            <>
              <span className="badge badge-cyan">LIVE</span>
              <Link to={`/app/events/${liveEvent.id}`} className="app-action-link">{liveEvent.name}</Link>
            </>
          )}
          <Link to="/app/gate-ops" className="app-button">Gate Ops →</Link>
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Total scanned</span>
          <strong>{totalScanned.toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Admitted</span>
          <strong>{totalAdmitted.toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Denied</span>
          <strong>{totalDenied}</strong>
        </article>
        <article className="app-stat-card">
          <span>Offline devices</span>
          <strong>{state.devices.filter((d) => d.status === 'offline').length}</strong>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Scan</h3>
            <label className="checkin-reentry-toggle">
              <input type="checkbox" checked={reEntryMode} onChange={(e) => setReEntryMode(e.target.checked)} />
              <span>Re-entry / pass-out mode</span>
            </label>
          </div>

          {reEntryMode && (
            <div className="app-alert" style={{ margin: '12px 0 0' }}>
              <span>↩</span>
              <span>Pass-out mode — scanning records a pass-out and allows re-entry at this gate.</span>
            </div>
          )}

          <form onSubmit={handleScan} style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <div className="form-row">
              <div className="form-field">
                <label>Gate</label>
                <select className="app-select" value={gate} onChange={(e) => setGate(e.target.value)}>
                  {state.checkpoints.map((cp) => <option key={cp.gate} value={cp.gate}>{cp.gate}</option>)}
                  <option value="__custom__">Custom gate…</option>
                </select>
              </div>
              <div className="form-field">
                <label>Device</label>
                <select className="app-select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                  <option value="">No device</option>
                  {state.devices.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} — {d.status}</option>
                  ))}
                </select>
              </div>
              {gate === '__custom__' && (
                <div className="form-field">
                  <label>Gate name</label>
                  <input value={customGate} onChange={(e) => setCustomGate(e.target.value)} placeholder="South Entry" />
                </div>
              )}
            </div>

            {pendingOfflineCount > 0 && (
              <div className="app-alert app-alert-warn">
                <span>⚠</span>
                <span>{pendingOfflineCount} scan{pendingOfflineCount !== 1 ? 's' : ''} pending sync for this device.</span>
              </div>
            )}

            <div className="form-field">
              <label>QR payload <span className="form-hint">paste, type, or scan</span></label>
              <input
                ref={inputRef}
                className="app-input app-mono"
                value={qrInput}
                onChange={handleInputChange}
                placeholder="EVTHB-EVT001-TKT0001-A7F2"
                autoFocus
                autoComplete="off"
              />
            </div>

            {preview && (
              <div className="scan-preview">
                <div className="scan-preview-row">
                  <div>
                    <strong>{preview.holderName}</strong>
                    <p>{preview.holderEmail}</p>
                    {state.ticketTiers.find((t) => t.id === preview.tierId)?.name && (
                      <p className="app-muted-sm">{state.ticketTiers.find((t) => t.id === preview.tierId)?.name} · {eventById(preview.eventId)?.name}</p>
                    )}
                  </div>
                  <TicketStatusBadge status={preview.status} />
                </div>
                <p className="app-muted-sm app-mono">{preview.qrPayload}</p>
              </div>
            )}

            <RoleGate
              permission="check_in:write"
              fallback={<p className="app-muted-sm">You don't have permission to record scans.</p>}
            >
              <button
                type="submit"
                className={`app-button app-button-primary checkin-submit-btn checkin-submit-${preview?.status ?? 'unknown'}`}
                disabled={!qrInput.trim() || !activeGate}
              >
                {reEntryMode
                  ? preview ? `Record pass-out — ${preview.holderName}` : 'Record pass-out'
                  : preview
                    ? preview.status === 'used'
                      ? 'Duplicate — admit anyway?'
                      : `Admit ${preview.holderName}`
                    : 'Scan ticket'}
              </button>
            </RoleGate>
          </form>

          {feedback && (
            <div className={`scan-result scan-result-${feedback.result}`} style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <ScanResultBadge result={feedback.result} />
                {feedback.ticket && <strong>{feedback.ticket.holderName}</strong>}
                {feedback.eventName && <span className="app-muted-sm">· {feedback.eventName}</span>}
              </div>
              <p style={{ margin: 0, fontSize: '0.88rem' }}>{feedback.message}</p>
            </div>
          )}
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Gate throughput</h3>
          </div>
          <div className="app-list">
            {state.checkpoints.map((cp) => {
              const pct = totalScanned > 0 ? Math.round((cp.scanned / totalScanned) * 100) : 0;
              return (
                <div key={cp.gate} className="app-list-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong>{cp.gate}</strong>
                      <span>{cp.scanned.toLocaleString()} scanned</span>
                    </div>
                    <div className="tier-progress" style={{ marginTop: 8 }}>
                      <div className="tier-progress-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: '0.78rem', color: 'rgba(220,232,239,0.56)' }}>
                      <span>{cp.admitted} admitted</span>
                      <span>{cp.denied} denied</span>
                      {cp.offlineDevices > 0 && (
                        <span className="text-danger">{cp.offlineDevices} offline</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <article className="app-panel">
        <div className="app-panel-header">
          <h3>Scan log</h3>
          <select className="app-select" value={filterEventId} onChange={(e) => setFilterEventId(e.target.value)}>
            <option value="">All events</option>
            {state.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>
        {recentScans.length === 0 ? (
          <p className="app-muted-sm" style={{ padding: '16px 0' }}>No scans recorded yet. Use the scanner above.</p>
        ) : (
          <div className="app-list">
            {recentScans.map((scan) => {
              const event = eventById(scan.eventId);
              return (
                <div key={scan.id} className="app-list-row">
                  <div>
                    <strong>{scan.gate}</strong>
                    <p>{event?.name ?? scan.eventId} · {scan.scannedAt}
                      {scan.denyReason && ` · ${scan.denyReason.replace(/_/g, ' ')}`}
                    </p>
                  </div>
                  <ScanResultBadge result={scan.result} />
                </div>
              );
            })}
          </div>
        )}
      </article>
    </div>
  );
}
