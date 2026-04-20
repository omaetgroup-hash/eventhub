import { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { CheckInScan, DenyReason, IssuedTicket, ScanResult } from '../../lib/domain';
import { usePlatform, checkTicketAccess } from '../../lib/platform';
import { useAuth } from '../../lib/auth';
import { apiScan } from '../../services/resource-api';
import { isApiPersistenceConfigured } from '../../lib/env';

type ScanState = 'idle' | 'admitted' | 'denied' | 'duplicate';

interface ScanFeedback {
  state: ScanState;
  holderName?: string;
  tierName?: string;
  eventName?: string;
  detail?: string;
  denyReason?: DenyReason;
}

type CameraState = 'idle' | 'starting' | 'ready' | 'unsupported' | 'error';

interface BarcodeDetectionResult {
  rawValue?: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<BarcodeDetectionResult[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
}

const DENY_LABELS: Record<DenyReason, string> = {
  not_found:            'Ticket not found — invalid QR code',
  already_used:         'Already scanned at this event',
  wrong_gate:           'This ticket is not valid at this gate',
  tier_not_allowed:     'This ticket type is not permitted at this entrance',
  cancelled_ticket:     'Ticket has been cancelled',
  session_expired:      'Entry session has expired',
  outside_entry_window: 'Outside entry window for this time slot',
};

export default function ScannerPage() {
  const { state, dispatch, eventById, newId, nowStr } = usePlatform();
  const { user, authToken } = useAuth();

  const [qr, setQr] = useState('');
  const [deviceId, setDeviceId] = useState(state.devices[0]?.id ?? '');
  const [gate, setGate] = useState(state.devices[0]?.gate ?? state.checkpoints[0]?.gate ?? '');
  const [eventId, setEventId] = useState(state.events.find((e) => e.status === 'live')?.id ?? state.events[0]?.id ?? '');
  const [isOffline, setIsOffline] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback>({ state: 'idle' });
  const [sessionAdmits, setSessionAdmits] = useState(0);
  const [sessionDenies, setSessionDenies] = useState(0);
  const [sessionStart] = useState(() => new Date());
  const [elapsed, setElapsed] = useState('0:00:00');
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [cameraError, setCameraError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraLoop = useRef<number | null>(null);
  const lastDetectedRef = useRef<{ payload: string; detectedAt: number } | null>(null);

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - sessionStart.getTime()) / 1000);
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setElapsed(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  // When device changes, sync gate
  useEffect(() => {
    const dev = state.devices.find((d) => d.id === deviceId);
    if (dev) {
      setGate(dev.gate);
      setIsOffline(dev.status === 'offline');
    }
  }, [deviceId, state.devices]);

  const resetAfterScan = useCallback(() => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      setFeedback({ state: 'idle' });
      setQr('');
      inputRef.current?.focus();
    }, 3200);
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraLoop.current !== null) {
      window.cancelAnimationFrame(cameraLoop.current);
      cameraLoop.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('idle');
  }, []);

  const processScanLocal = useCallback((trimmed: string, scanTime: string) => {
    const ticket = state.issuedTickets.find((t) => t.qrPayload === trimmed);
    if (!ticket) {
      dispatch({ type: 'RECORD_SCAN', scan: mkScan('unknown', '', 'denied', scanTime, 'not_found') });
      setFeedback({ state: 'denied', detail: DENY_LABELS.not_found, denyReason: 'not_found' });
      setSessionDenies((n) => n + 1);
      resetAfterScan();
      return;
    }
    if (ticket.status === 'cancelled') {
      dispatch({ type: 'RECORD_SCAN', scan: mkScan(ticket.id, ticket.tierId, 'denied', scanTime, 'cancelled_ticket') });
      const tierName = state.ticketTiers.find((t) => t.id === ticket.tierId)?.name;
      setFeedback({ state: 'denied', holderName: ticket.holderName, tierName, detail: DENY_LABELS.cancelled_ticket, denyReason: 'cancelled_ticket' });
      setSessionDenies((n) => n + 1);
      resetAfterScan();
      return;
    }
    if (ticket.eventId !== eventId && eventId) {
      const tierName = state.ticketTiers.find((t) => t.id === ticket.tierId)?.name;
      const eventName = eventById(ticket.eventId)?.name;
      dispatch({ type: 'RECORD_SCAN', scan: mkScan(ticket.id, ticket.tierId, 'denied', scanTime, 'wrong_gate') });
      setFeedback({ state: 'denied', holderName: ticket.holderName, tierName, eventName, detail: `Ticket is for ${eventName ?? 'a different event'}`, denyReason: 'wrong_gate' });
      setSessionDenies((n) => n + 1);
      resetAfterScan();
      return;
    }
    const tier = state.ticketTiers.find((t) => t.id === ticket.tierId);
    const access = checkTicketAccess(ticket.tierId, tier?.kind ?? 'general_admission', gate, ticket.eventId, state.accessRules);
    if (!access.allowed) {
      dispatch({ type: 'RECORD_SCAN', scan: mkScan(ticket.id, ticket.tierId, 'denied', scanTime, access.reason) });
      setFeedback({ state: 'denied', holderName: ticket.holderName, tierName: tier?.name, detail: DENY_LABELS[access.reason ?? 'tier_not_allowed'], denyReason: access.reason });
      setSessionDenies((n) => n + 1);
      resetAfterScan();
      return;
    }
    if (ticket.status === 'used') {
      dispatch({ type: 'RECORD_SCAN', scan: mkScan(ticket.id, ticket.tierId, 'duplicate', scanTime, 'already_used') });
      setFeedback({ state: 'duplicate', holderName: ticket.holderName, tierName: tier?.name, eventName: eventById(ticket.eventId)?.name, detail: `Previously scanned at ${ticket.scannedGate ?? 'unknown gate'} — ${ticket.scannedAt ?? ''}` });
      setSessionDenies((n) => n + 1);
      resetAfterScan();
      return;
    }
    dispatch({ type: 'RECORD_SCAN', scan: mkScan(ticket.id, ticket.tierId, 'admitted', scanTime) });
    setFeedback({ state: 'admitted', holderName: ticket.holderName, tierName: tier?.name, eventName: eventById(ticket.eventId)?.name });
    setSessionAdmits((n) => n + 1);
    resetAfterScan();
  }, [dispatch, eventById, eventId, gate, resetAfterScan, state.accessRules, state.issuedTickets, state.ticketTiers]);

  const processScan = useCallback((payload: string) => {
    const trimmed = payload.trim();
    if (!trimmed || !gate) return;

    const scanTime = nowStr();

    if (isOffline) {
      dispatch({ type: 'QUEUE_OFFLINE_SCAN', entry: { id: newId('off'), qrPayload: trimmed, gate, deviceId, eventId, scannedAt: scanTime, synced: false } });
      setFeedback({ state: 'denied', detail: 'Queued offline — will process on sync.' });
      resetAfterScan();
      return;
    }

    // API-first path — falls back to client-side if API not configured
    if (isApiPersistenceConfigured() && authToken) {
      apiScan(authToken, { qrPayload: trimmed, gate, eventId: eventId || undefined, deviceId: deviceId || undefined })
        .then((result) => {
          if (result.result === 'admitted') {
            const tierName = result.tierId ? state.ticketTiers.find((t) => t.id === result.tierId)?.name : undefined;
            setFeedback({ state: 'admitted', holderName: result.holderName, tierName, eventName: result.eventName });
            setSessionAdmits((n) => n + 1);
          } else if (result.result === 'duplicate') {
            setFeedback({ state: 'duplicate', holderName: result.holderName, detail: result.message, denyReason: result.denyReason as DenyReason | undefined });
            setSessionDenies((n) => n + 1);
          } else {
            setFeedback({ state: 'denied', holderName: result.holderName, detail: result.message ?? DENY_LABELS[result.denyReason as DenyReason ?? 'not_found'], denyReason: result.denyReason as DenyReason | undefined });
            setSessionDenies((n) => n + 1);
          }
          resetAfterScan();
        })
        .catch(() => {
          // API unreachable — fall back to local check
          processScanLocal(trimmed, scanTime);
        });
      return;
    }

    processScanLocal(trimmed, scanTime);
  }, [authToken, dispatch, eventId, gate, isOffline, newId, nowStr, processScanLocal, resetAfterScan, state.ticketTiers]);


  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unsupported');
      setCameraError('Camera access is not available in this browser.');
      return;
    }

    const detectorCtor = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!detectorCtor) {
      setCameraState('unsupported');
      setCameraError('Barcode detection is not supported here. Use the handheld scanner input instead.');
      return;
    }

    try {
      stopCamera();
      setCameraError('');
      setCameraState('starting');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new detectorCtor({
        formats: ['qr_code', 'ean_13', 'code_128', 'pdf417'],
      });

      setCameraState('ready');

      const detectLoop = async () => {
        const video = videoRef.current;
        if (!video || !streamRef.current) return;

        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const detections = await detector.detect(video);
            const payload = detections.find((item) => item.rawValue)?.rawValue?.trim();
            if (payload) {
              const detectedAt = Date.now();
              const last = lastDetectedRef.current;
              if (!last || last.payload !== payload || detectedAt - last.detectedAt > 2500) {
                lastDetectedRef.current = { payload, detectedAt };
                setQr(payload);
                processScan(payload);
              }
            }
          } catch (error) {
            setCameraState('error');
            setCameraError(error instanceof Error ? error.message : 'Camera scan failed.');
            stopCamera();
            return;
          }
        }

        cameraLoop.current = window.requestAnimationFrame(detectLoop);
      };

      cameraLoop.current = window.requestAnimationFrame(detectLoop);
    } catch (error) {
      setCameraState('error');
      setCameraError(error instanceof Error ? error.message : 'Unable to access the camera.');
      stopCamera();
    }
  }, [processScan, stopCamera]);

  useEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    stopCamera();
  }, [stopCamera]);

  function mkScan(ticketId: string, tierId: string, result: ScanResult, scannedAt: string, denyReason?: DenyReason): CheckInScan {
    return { id: newId('scan'), ticketId, tierId: tierId || undefined, eventId, gate, scannedAt, result, operatorId: user.id, deviceId, denyReason };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    processScan(qr);
  }

  function toggleOffline() {
    const next = !isOffline;
    setIsOffline(next);
    if (deviceId) {
      dispatch({ type: 'SET_DEVICE_STATUS', id: deviceId, status: next ? 'offline' : 'online', lastSeen: nowStr() });
    }
  }

  function syncNow() {
    if (deviceId) {
      dispatch({ type: 'SYNC_OFFLINE_SCANS', deviceId });
      setIsOffline(false);
    }
  }

  const device = state.devices.find((d) => d.id === deviceId);
  const pendingCount = state.offlineQueue.filter((e) => e.deviceId === deviceId && !e.synced).length;

  return (
    <div className="scanner-page">
      {/* Config strip */}
      <div className="scanner-config">
        <div className="scanner-config-inner">
          <select className="scanner-config-select" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            {state.events.filter((ev) => ev.status === 'live' || ev.status === 'on_sale').map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}</option>
            ))}
          </select>
          <select className="scanner-config-select" value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
            <option value="">No device</option>
            {state.devices.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.gate}</option>)}
          </select>
          <div className="scanner-config-gate">
            <span className="scanner-gate-label">Gate</span>
            <strong>{gate || '—'}</strong>
          </div>
          <div className="scanner-config-status">
            <span className={`scanner-dot scanner-dot-${isOffline ? 'offline' : 'online'}`} />
            <span>{isOffline ? 'OFFLINE' : 'ONLINE'}</span>
          </div>
          <div className="scanner-config-actions">
            <button className="scanner-mode-btn" onClick={toggleOffline}>
              {isOffline ? 'Go online' : 'Simulate offline'}
            </button>
            {pendingCount > 0 && (
              <button className="scanner-sync-btn" onClick={syncNow}>
                Sync {pendingCount} scan{pendingCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>
          <Link to="/app/check-in" className="scanner-config-link">Full check-in →</Link>
        </div>
      </div>

      {/* Offline banner */}
      {isOffline && (
        <div className="scanner-offline-banner">
          ⚠ Offline mode — scans are queued locally ({pendingCount} pending). Tap "Go online" then "Sync" to upload.
        </div>
      )}

      {/* Main scan area */}
      <div className={`scanner-main scanner-main-${feedback.state}`}>
        {feedback.state === 'idle' ? (
          <div className="scanner-idle">
            <div className="scanner-icon">⬛</div>
            <p className="scanner-idle-label">Ready to scan</p>
            <div className="scanner-camera-panel">
              <div className={`scanner-camera-frame scanner-camera-frame-${cameraState}`}>
                {cameraState === 'ready' ? (
                  <video ref={videoRef} className="scanner-camera-video" muted playsInline />
                ) : (
                  <div className="scanner-camera-placeholder">
                    <strong>
                      {cameraState === 'starting'
                        ? 'Starting camera...'
                        : cameraState === 'unsupported'
                          ? 'Camera unavailable'
                          : cameraState === 'error'
                            ? 'Camera error'
                            : 'Camera preview'}
                    </strong>
                    <span>{cameraError || 'Use camera scanning for faster gate entry, or type a payload below.'}</span>
                  </div>
                )}
              </div>
              <div className="scanner-camera-actions">
                {cameraState === 'ready' ? (
                  <button type="button" className="scanner-mode-btn" onClick={stopCamera}>
                    Stop camera
                  </button>
                ) : (
                  <button type="button" className="scanner-mode-btn" onClick={startCamera} disabled={cameraState === 'starting'}>
                    {cameraState === 'starting' ? 'Starting...' : 'Start camera scan'}
                  </button>
                )}
                <span className="scanner-camera-note">
                  {cameraState === 'ready'
                    ? 'Point the camera at a QR or supported barcode. Detections use the same admit rules as manual scans.'
                    : 'If this browser does not support barcode detection, the manual scanner input remains available.'}
                </span>
              </div>
            </div>
            <form className="scanner-form" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                className="scanner-input"
                value={qr}
                onChange={(e) => setQr(e.target.value)}
                placeholder="Scan or enter QR payload…"
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="scanner-submit-btn" disabled={!qr.trim() || !gate}>
                Admit
              </button>
            </form>
          </div>
        ) : (
          <div className="scanner-result-display">
            <div className={`scanner-result-icon scanner-result-icon-${feedback.state}`}>
              {feedback.state === 'admitted' ? '✓' : feedback.state === 'duplicate' ? '!' : '✕'}
            </div>
            <div className={`scanner-result-label scanner-result-label-${feedback.state}`}>
              {feedback.state === 'admitted' ? 'ADMITTED' : feedback.state === 'duplicate' ? 'DUPLICATE' : 'DENIED'}
            </div>
            {feedback.holderName && (
              <div className="scanner-result-name">{feedback.holderName}</div>
            )}
            {feedback.tierName && (
              <div className="scanner-result-tier">{feedback.tierName}</div>
            )}
            {feedback.detail && (
              <div className="scanner-result-detail">{feedback.detail}</div>
            )}
          </div>
        )}
      </div>

      {/* Session footer */}
      <div className="scanner-footer">
        <div className="scanner-counter scanner-counter-admits">
          <span className="scanner-counter-num">{sessionAdmits}</span>
          <span className="scanner-counter-label">Admitted</span>
        </div>
        <div className="scanner-session-time">{elapsed}</div>
        <div className="scanner-counter scanner-counter-denies">
          <span className="scanner-counter-num">{sessionDenies}</span>
          <span className="scanner-counter-label">Denied</span>
        </div>
      </div>
    </div>
  );
}
