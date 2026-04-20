import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePlatform } from '../../lib/platform';

function formatTime(str: string): string {
  try {
    return new Date(str.replace(' ', 'T')).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
  } catch { return str; }
}

export default function WaitingRoomPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { state, dispatch, newId, nowStr } = usePlatform();
  const [joined, setJoined] = useState(false);
  const [email, setEmail] = useState('');
  const [sessionEntry, setSessionEntry] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const event = state.events.find((e) => e.id === eventId);
  const queue = state.waitingRoom.filter((e) => e.eventId === eventId);
  const queuedCount = queue.filter((e) => e.status === 'queued').length;
  const releasingCount = queue.filter((e) => e.status === 'releasing').length;

  const myEntry = sessionEntry ? state.waitingRoom.find((e) => e.id === sessionEntry) : null;

  // Tick to show live feel (re-renders every 5s)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  function joinQueue() {
    if (!eventId) return;
    const id = newId('q');
    const position = queuedCount + 1;
    const entry = {
      id,
      eventId,
      sessionId: `sess_${id}`,
      buyerEmail: email || undefined,
      position,
      estimatedWaitMins: Math.ceil(position / 80) * 5,
      status: 'queued' as const,
      joinedAt: nowStr(),
    };
    dispatch({ type: 'JOIN_QUEUE', entry });
    setSessionEntry(id);
    setJoined(true);
  }

  if (!event) {
    return (
      <div className="pub-section" style={{ textAlign: 'center', paddingTop: 80 }}>
        <h2>Event not found</h2>
        <Link to="/events" className="pub-back-link">← Browse all events</Link>
      </div>
    );
  }

  const isReleasing = myEntry?.status === 'releasing';
  const isExpired = myEntry?.status === 'expired';

  return (
    <div className="waiting-room-page">
      <div className="waiting-room-inner">
        {/* Event header */}
        <div className="waiting-room-event">
          <Link to={`/events/${event.id}`} className="pub-back-link" style={{ marginBottom: 12, display: 'inline-block' }}>
            ← {event.name}
          </Link>
          <div className="waiting-room-event-meta">
            {event.name} · {formatTime(event.startsAt)}
          </div>
        </div>

        {/* Not joined yet */}
        {!joined && (
          <div className="waiting-room-card">
            <div className="waiting-room-icon">⏳</div>
            <h1 className="waiting-room-title">High demand</h1>
            <p className="waiting-room-subtitle">
              Tickets for this event are in high demand. Join the waiting room to secure your place in the queue.
              You will be released into checkout in order of arrival.
            </p>

            <div className="waiting-room-stats">
              <div className="waiting-room-stat">
                <strong>{queuedCount.toLocaleString()}</strong>
                <span>in queue</span>
              </div>
              <div className="waiting-room-stat">
                <strong>~{Math.ceil((queuedCount + 1) / 80) * 5} min</strong>
                <span>est. wait</span>
              </div>
            </div>

            <div className="waiting-room-form">
              <input
                className="waiting-room-input"
                type="email"
                placeholder="Your email (optional — for notifications)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="waiting-room-join-btn" onClick={joinQueue}>
                Join the queue
              </button>
            </div>

            <p className="waiting-room-note">
              Your place is held as long as this tab stays open. Refreshing this page will lose your position.
            </p>
          </div>
        )}

        {/* Joined — in queue */}
        {joined && myEntry && !isReleasing && !isExpired && (
          <div className="waiting-room-card waiting-room-card-queued">
            <div className="waiting-room-icon">🕐</div>
            <h1 className="waiting-room-title">You're in the queue</h1>

            <div className="waiting-room-position-display">
              <div className="waiting-room-position-num">#{myEntry.position}</div>
              <div className="waiting-room-position-label">your position</div>
            </div>

            <div className="waiting-room-stats">
              <div className="waiting-room-stat">
                <strong>~{myEntry.estimatedWaitMins} min</strong>
                <span>estimated wait</span>
              </div>
              <div className="waiting-room-stat">
                <strong>{queuedCount.toLocaleString()}</strong>
                <span>ahead of you</span>
              </div>
              <div className="waiting-room-stat">
                <strong>{releasingCount}</strong>
                <span>in checkout</span>
              </div>
            </div>

            {/* Visual queue bar */}
            <div className="waiting-room-progress">
              <div className="waiting-room-progress-label">
                <span>Queue</span>
                <span>Your turn</span>
              </div>
              <div className="waiting-room-progress-track">
                <div
                  className="waiting-room-progress-fill"
                  style={{ width: `${Math.max(4, Math.min(96, 100 - (myEntry.position / (queuedCount + 1)) * 100))}%` }}
                />
                <div className="waiting-room-progress-dot" style={{ left: `${Math.max(2, Math.min(96, 100 - (myEntry.position / (queuedCount + 1)) * 100))}%` }} />
              </div>
            </div>

            <p className="waiting-room-note">
              Keep this tab open. We will automatically move you to checkout when it is your turn.
              {myEntry.buyerEmail && ` We'll also notify ${myEntry.buyerEmail}.`}
            </p>
          </div>
        )}

        {/* Releasing — go to checkout */}
        {joined && isReleasing && (
          <div className="waiting-room-card waiting-room-card-go">
            <div className="waiting-room-icon waiting-room-icon-go">✓</div>
            <h1 className="waiting-room-title">It's your turn!</h1>
            <p className="waiting-room-subtitle">
              You've been released from the queue. Complete your purchase before your checkout window closes.
            </p>
            <Link to={`/events/${event.id}`} className="waiting-room-cta">
              Go to checkout →
            </Link>
            <p className="waiting-room-note" style={{ color: 'rgba(220,232,239,0.5)' }}>
              Your window expires in approximately 10 minutes.
            </p>
          </div>
        )}

        {/* Expired */}
        {joined && isExpired && (
          <div className="waiting-room-card waiting-room-card-expired">
            <div className="waiting-room-icon">⌛</div>
            <h1 className="waiting-room-title">Session expired</h1>
            <p className="waiting-room-subtitle">
              Your queue position has expired. You can rejoin the queue below.
            </p>
            <button className="waiting-room-join-btn" onClick={() => { setJoined(false); setSessionEntry(null); }}>
              Rejoin queue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
