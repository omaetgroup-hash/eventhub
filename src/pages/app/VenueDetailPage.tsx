import { useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import VenueForm from '../../forms/VenueForm';
import { EventStatusBadge } from '../../components/ui/StatusBadge';
import { usePlatform } from '../../lib/platform';

export default function VenueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { venueById, state } = usePlatform();
  const [editing, setEditing] = useState(false);

  const venue = venueById(id ?? '');
  if (!venue) return <Navigate to="/app/venues" replace />;

  const events = state.events.filter((e) => e.venueId === venue.id);
  const manager = state.teamMembers.find((m) => m.id === venue.managerId);

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">
            <Link to="/app/venues" className="app-breadcrumb">Venues</Link>
            {' / '}
            {venue.name}
          </p>
          <h2>{venue.name}</h2>
          <p>{venue.address}, {venue.city}, {venue.country}</p>
        </div>
        <button className="app-button" onClick={() => setEditing(true)}>Edit venue</button>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Details</h3>
            <span>{venue.capacity.toLocaleString()} capacity</span>
          </div>
          <div className="app-list">
            <div className="app-list-row">
              <div><strong>Manager</strong><p>{manager?.name ?? 'Unassigned'}</p></div>
              <span className="app-muted-sm">{manager?.email ?? '—'}</span>
            </div>
            <div className="app-list-row">
              <div><strong>Region</strong><p>{venue.city}, {venue.country}</p></div>
            </div>
            <div className="app-list-row">
              <div><strong>Created</strong><p>{venue.createdAt}</p></div>
            </div>
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Access zones</h3>
            <span>{venue.zones.length} zones</span>
          </div>
          <div className="app-tag-row" style={{ padding: '16px 0' }}>
            {venue.zones.map((z) => <span key={z} className="app-tag">{z}</span>)}
            {venue.zones.length === 0 && <p className="app-muted-sm">No zones defined.</p>}
          </div>
        </article>
      </section>

      <article className="app-panel">
        <div className="app-panel-header">
          <h3>Events at this venue</h3>
          <span>{events.length} event{events.length !== 1 ? 's' : ''}</span>
        </div>
        {events.length === 0 ? (
          <p className="app-muted-sm" style={{ padding: '16px 0' }}>No events scheduled here yet.</p>
        ) : (
          <div className="app-list">
            {events.map((ev) => (
              <div key={ev.id} className="app-list-row">
                <div>
                  <strong>{ev.name}</strong>
                  <p>{ev.startsAt} · {ev.category}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <EventStatusBadge status={ev.status} />
                  <Link to={`/app/events/${ev.id}`} className="app-action-link">View →</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      {editing && (
        <Modal title={`Edit — ${venue.name}`} onClose={() => setEditing(false)}>
          <VenueForm initial={venue} onDone={() => setEditing(false)} />
        </Modal>
      )}
    </div>
  );
}
