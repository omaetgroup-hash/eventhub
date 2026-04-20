import { useState, useMemo, useRef } from 'react';
import type { CheckInScan, IssuedTicket } from '../../lib/domain';
import { usePlatform, checkTicketAccess } from '../../lib/platform';
import { useAuth } from '../../lib/auth';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';

type KioskState = 'lookup' | 'result' | 'scanning' | 'admitted' | 'denied';

export default function KioskPage() {
  const { state, dispatch, eventById, newId, nowStr } = usePlatform();
  const { user } = useAuth();

  const [kioskState, setKioskState] = useState<KioskState>('lookup');
  const [query, setQuery] = useState('');
  const [selectedEventId, setSelectedEventId] = useState(
    state.events.find((e) => e.status === 'live' || e.status === 'on_sale')?.id ?? ''
  );
  const [gate] = useState(state.checkpoints[0]?.gate ?? 'Kiosk Entry');
  const [qrInput, setQrInput] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<IssuedTicket | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [badgePrint, setBadgePrint] = useState(false);
  const qrRef = useRef<HTMLInputElement>(null);

  const foundTickets = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];
    const lq = query.toLowerCase();
    return state.issuedTickets.filter(
      (t) =>
        (!selectedEventId || t.eventId === selectedEventId) &&
        (t.holderName.toLowerCase().includes(lq) || t.holderEmail.toLowerCase().includes(lq))
    ).slice(0, 8);
  }, [query, state.issuedTickets, selectedEventId]);

  function selectTicket(ticket: IssuedTicket) {
    setSelectedTicket(ticket);
    setKioskState('result');
  }

  function goToScan() {
    setQrInput('');
    setScanFeedback(null);
    setKioskState('scanning');
    setTimeout(() => qrRef.current?.focus(), 100);
  }

  function reset() {
    setKioskState('lookup');
    setQuery('');
    setSelectedTicket(null);
    setScanFeedback(null);
    setBadgePrint(false);
    setQrInput('');
  }

  function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const payload = qrInput.trim();
    if (!payload) return;

    const ticket = state.issuedTickets.find((t) => t.qrPayload === payload);
    const scanTime = nowStr();

    if (!ticket) {
      setScanFeedback({ ok: false, message: 'Ticket not found. Please check the QR code or look up by name.' });
      return;
    }

    if (ticket.status === 'cancelled') {
      setScanFeedback({ ok: false, message: 'This ticket has been cancelled.' });
      return;
    }

    const tier = state.ticketTiers.find((t) => t.id === ticket.tierId);
    const access = checkTicketAccess(ticket.tierId, tier?.kind ?? 'general_admission', gate, ticket.eventId, state.accessRules);

    if (!access.allowed) {
      setScanFeedback({ ok: false, message: 'This ticket is not valid at this entrance.' });
      dispatch({ type: 'RECORD_SCAN', scan: mkScan(ticket, 'denied', scanTime) });
      setKioskState('denied');
      return;
    }

    if (ticket.status === 'used') {
      setScanFeedback({ ok: false, message: `Already scanned at ${ticket.scannedGate ?? 'another gate'}.` });
      dispatch({ type: 'RECORD_SCAN', scan: mkScan(ticket, 'duplicate', scanTime) });
      setKioskState('denied');
      return;
    }

    dispatch({ type: 'RECORD_SCAN', scan: mkScan(ticket, 'admitted', scanTime) });
    setSelectedTicket(ticket);
    setKioskState('admitted');
    setTimeout(() => {
      dispatch({ type: 'APPEND_AUDIT', entry: { actor: 'Kiosk', action: 'kiosk.checkin', target: `${ticket.holderName} — ${eventById(ticket.eventId)?.name ?? ticket.eventId}`, severity: 'info' } });
    }, 0);
  }

  function mkScan(ticket: IssuedTicket, result: CheckInScan['result'], scannedAt: string): CheckInScan {
    return { id: newId('scan'), ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate, scannedAt, result, operatorId: 'kiosk', deviceId: 'kiosk' };
  }

  const tierName = selectedTicket ? state.ticketTiers.find((t) => t.id === selectedTicket.tierId)?.name : null;
  const eventName = selectedTicket ? eventById(selectedTicket.eventId)?.name : null;

  return (
    <div className="kiosk-page">
      {/* Header strip */}
      <div className="kiosk-header">
        <div className="kiosk-header-inner">
          <select className="kiosk-event-select" value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
            <option value="">All events</option>
            {state.events.filter((ev) => ev.status === 'live' || ev.status === 'on_sale').map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
          <span className="kiosk-gate-label">Gate: <strong>{gate}</strong></span>
          <button className="kiosk-reset-btn" onClick={reset}>Reset</button>
        </div>
      </div>

      {/* Main kiosk area */}
      <div className="kiosk-main">

        {/* Lookup state */}
        {kioskState === 'lookup' && (
          <div className="kiosk-panel">
            <h1 className="kiosk-title">Welcome</h1>
            <p className="kiosk-subtitle">Find your ticket by name or email, or scan your QR code below.</p>

            <div className="kiosk-search-row">
              <input
                className="kiosk-search-input"
                type="text"
                placeholder="Your name or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>

            {foundTickets.length > 0 && (
              <div className="kiosk-results">
                {foundTickets.map((ticket) => {
                  const ev = eventById(ticket.eventId);
                  const tier = state.ticketTiers.find((t) => t.id === ticket.tierId);
                  return (
                    <button key={ticket.id} className="kiosk-ticket-row" onClick={() => selectTicket(ticket)}>
                      <div>
                        <strong>{ticket.holderName}</strong>
                        <p>{ev?.name ?? ticket.eventId} — {tier?.name ?? ticket.tierId}</p>
                      </div>
                      <TicketStatusBadge status={ticket.status} />
                    </button>
                  );
                })}
              </div>
            )}

            {query.length >= 2 && foundTickets.length === 0 && (
              <p className="kiosk-no-results">No tickets found for "{query}"</p>
            )}

            <div className="kiosk-divider"><span>or</span></div>
            <button className="kiosk-scan-btn" onClick={goToScan}>
              Scan QR code →
            </button>
          </div>
        )}

        {/* Ticket result state */}
        {kioskState === 'result' && selectedTicket && (
          <div className="kiosk-panel">
            <h2 className="kiosk-result-name">{selectedTicket.holderName}</h2>
            <p className="kiosk-result-meta">{eventName} · {tierName}</p>
            <div className="kiosk-ticket-badge">
              <TicketStatusBadge status={selectedTicket.status} />
            </div>

            {selectedTicket.status === 'valid' ? (
              <div className="kiosk-qr-display">
                <div className="ticket-qr-grid" style={{ width: 140, margin: '0 auto 12px' }}>
                  {Array.from({ length: 25 }, (_, i) => (
                    <div key={i} className="ticket-qr-cell" style={{ opacity: Math.random() > 0.4 ? 1 : 0.15 }} />
                  ))}
                </div>
                <p className="ticket-qr-payload">{selectedTicket.qrPayload}</p>
              </div>
            ) : (
              <div className="kiosk-already-used">
                {selectedTicket.status === 'used'
                  ? `Already admitted at ${selectedTicket.scannedGate ?? 'gate'} on ${selectedTicket.scannedAt ?? '—'}`
                  : `Ticket status: ${selectedTicket.status}`}
              </div>
            )}

            <div className="kiosk-action-row">
              {selectedTicket.status === 'valid' && (
                <button className="kiosk-primary-btn" onClick={goToScan}>
                  Scan to check in →
                </button>
              )}
              <button className="kiosk-secondary-btn" onClick={() => setBadgePrint(true)}>
                Print badge
              </button>
              <button className="kiosk-back-btn" onClick={reset}>Back</button>
            </div>

            {/* Badge print scaffold */}
            {badgePrint && (
              <div className="kiosk-badge-preview">
                <div className="badge-preview-inner">
                  <div className="badge-preview-header">EventHub — {eventName}</div>
                  <div className="badge-preview-name">{selectedTicket.holderName}</div>
                  <div className="badge-preview-tier">{tierName}</div>
                  <div className="badge-preview-id">{selectedTicket.id}</div>
                </div>
                <button className="kiosk-print-btn" disabled>🖨 Print badge (printer not connected)</button>
              </div>
            )}
          </div>
        )}

        {/* Scan input state */}
        {kioskState === 'scanning' && (
          <div className="kiosk-panel">
            <h2 className="kiosk-title">Scan QR code</h2>
            <p className="kiosk-subtitle">Point your camera or scanner at the QR code on your ticket.</p>
            <form onSubmit={handleScan} className="kiosk-scan-form">
              <input
                ref={qrRef}
                className="kiosk-qr-input"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
                placeholder="EVTHB-…"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="kiosk-primary-btn" disabled={!qrInput.trim()}>
                Check in
              </button>
            </form>
            {scanFeedback && (
              <div className={`kiosk-feedback kiosk-feedback-${scanFeedback.ok ? 'ok' : 'err'}`}>
                {scanFeedback.message}
              </div>
            )}
            <button className="kiosk-back-btn" onClick={reset}>Back to lookup</button>
          </div>
        )}

        {/* Admitted state */}
        {kioskState === 'admitted' && selectedTicket && (
          <div className="kiosk-panel kiosk-panel-admitted">
            <div className="kiosk-big-check">✓</div>
            <h1 className="kiosk-admitted-name">{selectedTicket.holderName}</h1>
            <p className="kiosk-admitted-meta">{eventName} · {tierName}</p>
            <p className="kiosk-admitted-sub">Enjoy the event!</p>
            <button className="kiosk-secondary-btn" style={{ marginTop: 32 }} onClick={reset}>Done</button>
          </div>
        )}

        {/* Denied state */}
        {kioskState === 'denied' && (
          <div className="kiosk-panel kiosk-panel-denied">
            <div className="kiosk-big-x">✕</div>
            <h2 className="kiosk-denied-title">Entry not permitted</h2>
            <p className="kiosk-denied-msg">{scanFeedback?.message}</p>
            <p className="kiosk-denied-sub">Please see a staff member for assistance.</p>
            <button className="kiosk-secondary-btn" style={{ marginTop: 24 }} onClick={reset}>Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}
