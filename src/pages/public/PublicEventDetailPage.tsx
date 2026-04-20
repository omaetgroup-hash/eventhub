import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { usePlatform, getAvailableInventory } from '../../lib/platform';
import EventCard from '../../components/ui/EventCard';

function formatDate(str: string): string {
  try {
    return new Date(str.replace(' ', 'T')).toLocaleDateString('en-NZ', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return str;
  }
}

function formatTime(str: string): string {
  try {
    return new Date(str.replace(' ', 'T')).toLocaleTimeString('en-NZ', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const BANNER_GRADIENT: Record<string, string> = {
  Festival:     'linear-gradient(135deg, rgba(223,192,93,0.22) 0%, rgba(232,135,58,0.16) 100%)',
  Conference:   'linear-gradient(135deg, rgba(97,190,228,0.2) 0%, rgba(155,110,232,0.14) 100%)',
  'Club Night': 'linear-gradient(135deg, rgba(155,110,232,0.22) 0%, rgba(97,190,228,0.12) 100%)',
  Comedy:       'linear-gradient(135deg, rgba(112,233,182,0.18) 0%, rgba(97,190,228,0.12) 100%)',
  Gala:         'linear-gradient(135deg, rgba(223,192,93,0.2) 0%, rgba(112,233,182,0.1) 100%)',
  Concert:      'linear-gradient(135deg, rgba(232,135,58,0.2) 0%, rgba(223,192,93,0.12) 100%)',
};

export default function PublicEventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { state } = usePlatform();

  const refCode = searchParams.get('ref') ?? '';

  const event = state.events.find((e) => e.id === id);
  const venue = event ? state.venues.find((v) => v.id === event.venueId) : undefined;
  const tiers = useMemo(
    () => (event ? state.ticketTiers.filter((t) => t.eventId === event.id) : []),
    [event, state.ticketTiers]
  );
  const organizer = event ? state.teamMembers.find((m) => m.id === event.organizerId) : undefined;

  const related = useMemo(() => {
    if (!event) return [];
    return state.events
      .filter(
        (e) =>
          e.id !== event.id &&
          (e.status === 'on_sale' || e.status === 'live') &&
          (e.category === event.category || e.venueId === event.venueId)
      )
      .slice(0, 3);
  }, [event, state.events]);

  if (!event) {
    return (
      <div className="pub-section" style={{ textAlign: 'center', paddingTop: 80 }}>
        <h2>Event not found</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
          This event may have ended or been removed.
        </p>
        <Link to="/events" className="pub-back-link">← Browse all events</Link>
      </div>
    );
  }

  const heroGradient = BANNER_GRADIENT[event.category] ?? BANNER_GRADIENT.Festival;
  const isAvailable = event.status === 'on_sale' || event.status === 'live';

  // Milestone 4: real available inventory (inventory - sold - active holds)
  const tierAvailability = useMemo(() => {
    return tiers.map((t) => ({
      tier: t,
      available: getAvailableInventory(t.id, state.ticketTiers, state.inventoryHolds),
    }));
  }, [tiers, state.ticketTiers, state.inventoryHolds]);

  const availableTiers = tierAvailability.filter((ta) => ta.available > 0);
  const lowestPrice = availableTiers.length > 0 ? Math.min(...availableTiers.map((ta) => ta.tier.price)) : null;

  const queueActive = state.waitingRoom.some(
    (e) => e.eventId === event.id && (e.status === 'queued' || e.status === 'releasing')
  );
  const queueDepth = state.waitingRoom.filter(
    (e) => e.eventId === event.id && e.status === 'queued'
  ).length;

  return (
    <div className="pub-event-detail">
      {/* Hero */}
      <section className="pub-event-hero" style={{ background: heroGradient }}>
        <div className="pub-event-hero-inner">
          <Link to="/events" className="pub-back-link">← All events</Link>
          <div className="pub-event-hero-content">
            <div className="pub-event-hero-meta">
              <span className="pub-hero-category">{event.category}</span>
              {event.status === 'live' && <span className="pub-hero-live">● Live now</span>}
              {event.status === 'sold_out' && <span className="pub-hero-soldout">Sold out</span>}
            </div>
            <h1 className="pub-event-hero-title">{event.name}</h1>
            <div className="pub-event-hero-sub">
              <span>{formatDate(event.startsAt)} · {formatTime(event.startsAt)}</span>
              {venue && <span>{venue.name}, {venue.city}</span>}
              {lowestPrice !== null && isAvailable && (
                <span>From ${lowestPrice}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <div className="pub-event-layout pub-section">
        {/* Left column */}
        <div className="pub-event-body">
          {/* Description */}
          <div className="pub-event-section">
            <h2>About this event</h2>
            <p className="pub-event-description">{event.description}</p>
          </div>

          {/* Date and time */}
          <div className="pub-event-section">
            <h3>Date & time</h3>
            <div className="pub-info-card">
              <div className="pub-info-row">
                <span className="pub-info-icon">📅</span>
                <div>
                  <strong>{formatDate(event.startsAt)}</strong>
                  <p>{formatTime(event.startsAt)} — {formatTime(event.endsAt)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Venue */}
          {venue && (
            <div className="pub-event-section">
              <h3>Venue</h3>
              <Link to={`/venues/${venue.id}`} className="pub-venue-card">
                <div>
                  <strong>{venue.name}</strong>
                  <p>{venue.address}, {venue.city}</p>
                  <p className="pub-venue-capacity">Capacity {venue.capacity.toLocaleString()}</p>
                </div>
                <span className="pub-venue-arrow">→</span>
              </Link>
            </div>
          )}

          {/* Organizer */}
          {organizer && (
            <div className="pub-event-section">
              <h3>Organised by</h3>
              <Link to={`/organizers/${organizer.id}`} className="pub-organizer-chip">
                <div className="pub-organizer-avatar">
                  {organizer.name.charAt(0)}
                </div>
                <div>
                  <strong>{organizer.name}</strong>
                  <p>{organizer.role.replace(/_/g, ' ')}</p>
                </div>
                <span className="pub-venue-arrow">→</span>
              </Link>
            </div>
          )}

          {/* Related events */}
          {related.length > 0 && (
            <div className="pub-event-section">
              <h3>You might also like</h3>
              <div className="pub-related-grid">
                {related.map((rel) => (
                  <EventCard
                    key={rel.id}
                    event={rel}
                    venue={state.venues.find((v) => v.id === rel.venueId)}
                    tiers={state.ticketTiers.filter((t) => t.eventId === rel.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar — checkout widget */}
        <aside className="pub-event-sidebar">
          <div className="checkout-widget">
            <div className="checkout-widget-header">
              <span className="checkout-widget-label">Tickets</span>
              {lowestPrice !== null && (
                <span className="checkout-widget-from">From ${lowestPrice}</span>
              )}
            </div>

            {/* Waiting room banner */}
            {queueActive && (
              <div className="checkout-queue-banner">
                <span className="checkout-queue-icon">⏳</span>
                <div>
                  <strong>High demand</strong>
                  <p>{queueDepth.toLocaleString()} people queued — join to secure your place</p>
                </div>
                <Link to={`/queue/${event.id}`} className="checkout-queue-btn">
                  Join queue →
                </Link>
              </div>
            )}

            {tiers.length === 0 ? (
              <p className="checkout-widget-empty">Tickets not yet available.</p>
            ) : (
              <div className="checkout-tier-list">
                {tierAvailability.map(({ tier, available }) => {
                  const soldOut = available <= 0;
                  return (
                    <div key={tier.id} className={`checkout-tier${soldOut ? ' checkout-tier-soldout' : ''}`}>
                      <div className="checkout-tier-info">
                        <strong>{tier.name}</strong>
                        <p>{tier.description}</p>
                        {!soldOut && available <= 20 && (
                          <span className="checkout-tier-scarce">
                            Only {available} left
                          </span>
                        )}
                        {!soldOut && available <= 50 && available > 20 && (
                          <span className="checkout-tier-scarce" style={{ color: 'rgba(212,175,55,0.8)' }}>
                            {available} remaining
                          </span>
                        )}
                        {soldOut && <span className="checkout-tier-gone">Sold out</span>}
                      </div>
                      <div className="checkout-tier-price">
                        <span>${tier.price}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Promo code scaffold */}
            <div className="promo-field">
              <label className="promo-label">Promo code</label>
              <div className="promo-input-row">
                <input
                  className="promo-input"
                  type="text"
                  placeholder="Enter code"
                  readOnly
                  title="Promo codes will be available at checkout"
                />
                <button className="promo-apply-btn" disabled>Apply</button>
              </div>
              <p className="promo-hint">Promo codes are applied at checkout</p>
            </div>

            {/* Referral tracking display */}
            {refCode && (
              <div className="referral-badge">
                Referred by: <strong>{refCode}</strong>
              </div>
            )}

            {/* CTA */}
            {isAvailable && availableTiers.length > 0 ? (
              queueActive ? (
                <Link to={`/queue/${event.id}`} className="pub-buy-btn pub-buy-btn-primary" style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                  Join the queue →
                </Link>
              ) : (
                <Link
                  to={`/checkout/${event.id}${refCode ? `?ref=${encodeURIComponent(refCode)}` : ''}`}
                  className="pub-buy-btn pub-buy-btn-primary"
                  style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}
                >
                  Buy tickets →
                </Link>
              )
            ) : (
              <button className="pub-buy-btn pub-buy-btn-soldout" disabled>
                {event.status === 'sold_out' || availableTiers.length === 0 ? 'Sold out' : 'Tickets unavailable'}
              </button>
            )}

            <p className="checkout-widget-note">
              Secure checkout powered by EventHub
            </p>
          </div>

          {/* Share / referral */}
          <div className="pub-share-card">
            <strong>Share this event</strong>
            <p>Earn credit when friends buy tickets with your link.</p>
            <button className="pub-share-btn" disabled>Copy referral link</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
