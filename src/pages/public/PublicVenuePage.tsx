import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePlatform } from '../../lib/platform';
import EventCard from '../../components/ui/EventCard';

export default function PublicVenuePage() {
  const { id } = useParams<{ id: string }>();
  const { state } = usePlatform();

  const venue = state.venues.find((v) => v.id === id);

  const events = useMemo(
    () =>
      state.events
        .filter(
          (e) =>
            e.venueId === id &&
            (e.status === 'on_sale' || e.status === 'live' || e.status === 'sold_out')
        )
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [id, state.events]
  );

  const pastEvents = useMemo(
    () =>
      state.events
        .filter((e) => e.venueId === id && e.status === 'completed')
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
        .slice(0, 3),
    [id, state.events]
  );

  if (!venue) {
    return (
      <div className="pub-section" style={{ textAlign: 'center', paddingTop: 80 }}>
        <h2>Venue not found</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
          This venue page doesn't exist or has been removed.
        </p>
        <Link to="/events" className="pub-back-link">← Browse events</Link>
      </div>
    );
  }

  return (
    <div className="pub-venue-page">
      {/* Venue hero */}
      <section className="pub-venue-hero">
        <div className="pub-venue-hero-inner">
          <Link to="/events" className="pub-back-link">← Events</Link>

          <div className="pub-venue-hero-content">
            <p className="pub-hero-kicker">{venue.city}, {venue.country}</p>
            <h1 className="pub-venue-hero-title">{venue.name}</h1>
            <div className="pub-venue-hero-sub">
              <span>{venue.address}</span>
              <span>Capacity {venue.capacity.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="pub-venue-layout pub-section">
        {/* Left: events */}
        <div className="pub-venue-body">
          {events.length > 0 ? (
            <div className="pub-event-section">
              <h2>Events at {venue.name}</h2>
              <div className="pub-event-grid" style={{ marginTop: 24 }}>
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    venue={venue}
                    tiers={state.ticketTiers.filter((t) => t.eventId === event.id)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="pub-empty-state">
              <p>No upcoming events at this venue.</p>
              <Link to="/events" className="pub-link-btn">Browse all events</Link>
            </div>
          )}

          {pastEvents.length > 0 && (
            <div className="pub-event-section" style={{ marginTop: 48 }}>
              <h3>Recently held here</h3>
              <div className="pub-event-grid" style={{ marginTop: 20 }}>
                {pastEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    venue={venue}
                    tiers={state.ticketTiers.filter((t) => t.eventId === event.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: venue details */}
        <aside className="pub-venue-sidebar">
          <div className="pub-venue-detail-card">
            <h3>Venue details</h3>
            <div className="pub-info-row">
              <span className="pub-info-icon">📍</span>
              <div>
                <strong>Address</strong>
                <p>{venue.address}, {venue.city}</p>
              </div>
            </div>
            <div className="pub-info-row">
              <span className="pub-info-icon">👥</span>
              <div>
                <strong>Capacity</strong>
                <p>{venue.capacity.toLocaleString()} guests</p>
              </div>
            </div>
            <div className="pub-info-row">
              <span className="pub-info-icon">🗺</span>
              <div>
                <strong>Zones</strong>
                <p>{venue.zones.join(', ')}</p>
              </div>
            </div>
            <div className="pub-info-row">
              <span className="pub-info-icon">🏢</span>
              <div>
                <strong>Managed by</strong>
                <p>{venue.manager}</p>
              </div>
            </div>
          </div>

          <div className="pub-venue-city-card">
            <strong>More in {venue.city}</strong>
            <Link
              to={`/events?city=${encodeURIComponent(venue.city)}`}
              className="pub-link-btn"
              style={{ marginTop: 12, display: 'inline-block' }}
            >
              Browse {venue.city} events →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
