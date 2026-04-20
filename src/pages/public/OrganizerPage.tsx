import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePlatform } from '../../lib/platform';
import EventCard from '../../components/ui/EventCard';

const ROLE_LABELS: Record<string, string> = {
  super_admin:    'Platform Administrator',
  organizer:      'Event Organiser',
  venue_manager:  'Venue Manager',
  staff:          'Event Staff',
  customer:       'Attendee',
};

const TRUST_BADGES = [
  { label: 'Verified organiser', icon: '✓' },
  { label: 'Identity confirmed', icon: '🪪' },
  { label: 'EventHub member', icon: '🏆' },
];

export default function OrganizerPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = usePlatform();

  const organizer = state.teamMembers.find((m) => m.id === id);

  const events = useMemo(
    () =>
      state.events
        .filter((e) => e.organizerId === id && (e.status === 'on_sale' || e.status === 'live' || e.status === 'completed'))
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    [id, state.events]
  );

  const upcomingEvents = events.filter((e) => e.status === 'on_sale' || e.status === 'live');
  const pastEvents = events.filter((e) => e.status === 'completed');

  const totalTickets = events.reduce((sum, e) => sum + e.ticketsSold, 0);
  const totalRevenue = events.reduce((sum, e) => sum + e.grossRevenue, 0);

  if (!organizer) {
    return (
      <div className="pub-section" style={{ textAlign: 'center', paddingTop: 80 }}>
        <h2>Organiser not found</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
          This organiser profile doesn't exist or has been removed.
        </p>
        <Link to="/events" className="pub-back-link">← Browse events</Link>
      </div>
    );
  }

  return (
    <div className="pub-organizer-page">
      {/* Hero */}
      <section className="pub-organizer-hero">
        <div className="pub-organizer-hero-inner">
          <Link to="/events" className="pub-back-link">← Events</Link>

          <div className="pub-organizer-profile">
            <div className="pub-organizer-avatar-lg">
              {organizer.name.charAt(0)}
            </div>
            <div className="pub-organizer-info">
              <p className="pub-organizer-role">{ROLE_LABELS[organizer.role] ?? organizer.role}</p>
              <h1 className="pub-organizer-name">{organizer.name}</h1>
              <p className="pub-organizer-scope">{organizer.scope}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="pub-organizer-stats">
            <div className="pub-org-stat">
              <strong>{events.length}</strong>
              <span>events</span>
            </div>
            <div className="pub-org-stat">
              <strong>{totalTickets.toLocaleString()}</strong>
              <span>tickets sold</span>
            </div>
            <div className="pub-org-stat">
              <strong>${(totalRevenue / 1000).toFixed(0)}k</strong>
              <span>gross revenue</span>
            </div>
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <section className="pub-section pub-section-tight">
        <div className="pub-trust-badges">
          {TRUST_BADGES.map((badge) => (
            <div key={badge.label} className="trust-badge">
              <span className="trust-badge-icon">{badge.icon}</span>
              <span>{badge.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming events */}
      {upcomingEvents.length > 0 && (
        <section className="pub-section">
          <div className="pub-section-header">
            <h2>Upcoming events</h2>
            <p>Events currently on sale or live</p>
          </div>
          <div className="pub-event-grid">
            {upcomingEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                venue={state.venues.find((v) => v.id === event.venueId)}
                tiers={state.ticketTiers.filter((t) => t.eventId === event.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Past events */}
      {pastEvents.length > 0 && (
        <section className="pub-section">
          <div className="pub-section-header">
            <h2>Past events</h2>
          </div>
          <div className="pub-event-grid">
            {pastEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                venue={state.venues.find((v) => v.id === event.venueId)}
                tiers={state.ticketTiers.filter((t) => t.eventId === event.id)}
              />
            ))}
          </div>
        </section>
      )}

      {upcomingEvents.length === 0 && pastEvents.length === 0 && (
        <div className="pub-section pub-empty-state">
          <p>No public events from this organiser yet.</p>
        </div>
      )}
    </div>
  );
}
