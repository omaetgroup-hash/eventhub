import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import VenueForm from '../../forms/VenueForm';
import type { Venue } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';

export default function VenuesPage() {
  const { state, dispatch } = usePlatform();
  const [modal, setModal] = useState<'create' | Venue | null>(null);

  function confirmDelete(venue: Venue) {
    if (confirm(`Delete "${venue.name}"? This cannot be undone.`)) {
      dispatch({ type: 'DELETE_VENUE', id: venue.id });
    }
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Venue management</p>
          <h2>Venues</h2>
          <p>Register venues, define capacities, assign managers, and prepare access zones for ticketing.</p>
        </div>
        <button className="app-button" onClick={() => setModal('create')}>Add venue</button>
      </section>

      <section className="app-card-grid">
        {state.venues.map((venue) => (
          <article key={venue.id} className="app-card">
            <div className="app-card-topline">
              <span>{venue.city}</span>
              <strong>{venue.capacity.toLocaleString()} cap</strong>
            </div>
            <h3>{venue.name}</h3>
            <p className="app-muted-sm">{venue.address}</p>
            <p>Managed by {venue.manager || 'Unassigned'}</p>
            <div className="app-tag-row">
              {venue.zones.map((zone) => (
                <span key={zone} className="app-tag">{zone}</span>
              ))}
            </div>
            <div className="app-card-actions">
              <Link to={`/app/venues/${venue.id}`} className="app-action-link">View detail →</Link>
              <button className="app-action-btn" onClick={() => setModal(venue)}>Edit</button>
              <button className="app-action-btn app-action-danger" onClick={() => confirmDelete(venue)}>Delete</button>
            </div>
          </article>
        ))}

        {state.venues.length === 0 && (
          <div className="app-empty-state">
            <p>No venues yet. Add your first venue to get started.</p>
          </div>
        )}
      </section>

      {modal && (
        <Modal
          title={modal === 'create' ? 'Add venue' : `Edit — ${(modal as Venue).name}`}
          onClose={() => setModal(null)}
        >
          <VenueForm
            initial={modal === 'create' ? undefined : (modal as Venue)}
            onDone={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
