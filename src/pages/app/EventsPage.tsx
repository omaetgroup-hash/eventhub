import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import RoleGate from '../../components/ui/RoleGate';
import EventForm from '../../forms/EventForm';
import { EventStatusBadge } from '../../components/ui/StatusBadge';
import type { EventRecord, EventStatus } from '../../lib/domain';
import { usePlatform, EVENT_STATUS_TRANSITIONS } from '../../lib/platform';
import { useAuth } from '../../lib/auth';

const STATUS_FILTERS: (EventStatus | '')[] = ['', 'draft', 'on_sale', 'sold_out', 'live', 'completed', 'cancelled'];
const CATEGORIES = ['', 'Festival', 'Conference', 'Club Night', 'Concert', 'Exhibition', 'Sport', 'Workshop', 'Other'];

export default function EventsPage() {
  const { state, dispatch, venueById } = usePlatform();
  const { user } = useAuth();
  const [modal, setModal] = useState<'create' | EventRecord | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<EventStatus | ''>('');
  const [filterCategory, setFilterCategory] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return state.events.filter((ev) => {
      if (filterStatus && ev.status !== filterStatus) return false;
      if (filterCategory && ev.category !== filterCategory) return false;
      if (q && !ev.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [state.events, search, filterStatus, filterCategory]);

  function confirmDelete(event: EventRecord) {
    if (confirm(`Delete "${event.name}"? All linked ticket tiers will also be removed.`)) {
      dispatch({ type: 'DELETE_EVENT', id: event.id });
    }
  }

  function quickTransition(event: EventRecord, to: EventStatus) {
    dispatch({ type: 'TRANSITION_EVENT_STATUS', id: event.id, to, actor: user.name });
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Event management</p>
          <h2>Events</h2>
          <p>Create, stage, and publish events with linked venues, categories, and lifecycle status.</p>
        </div>
        <RoleGate permission="events:write">
          <button className="app-button" onClick={() => setModal('create')}>New event</button>
        </RoleGate>
      </section>

      <div className="app-filter-bar">
        <input
          className="app-input"
          style={{ maxWidth: 240 }}
          placeholder="Search events…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="app-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as EventStatus | '')}>
          <option value="">All statuses</option>
          {STATUS_FILTERS.filter(Boolean).map((s) => (
            <option key={s} value={s}>{(s as string).replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select className="app-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.filter(Boolean).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <section className="app-card-grid">
        {filtered.map((event) => {
          const venue = venueById(event.venueId);
          const transitions = EVENT_STATUS_TRANSITIONS[event.status];
          return (
            <article key={event.id} className="app-card">
              <div className="app-card-topline">
                <span>{event.category}</span>
                <EventStatusBadge status={event.status} />
              </div>
              <h3>
                <Link to={`/app/events/${event.id}`} className="app-card-title-link">{event.name}</Link>
              </h3>
              <p>{event.startsAt} · {venue?.name ?? '—'}</p>
              <div className="app-card-stats">
                <div>
                  <span>Sold</span>
                  <strong>{event.ticketsSold.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Gross</span>
                  <strong>${event.grossRevenue.toLocaleString()}</strong>
                </div>
              </div>
              <div className="app-card-actions">
                <Link to={`/app/events/${event.id}`} className="app-action-link">View →</Link>
                <RoleGate permission="events:write">
                  <button className="app-action-btn" onClick={() => setModal(event)}>Edit</button>
                  {transitions.length > 0 && (
                    <button
                      className={`app-action-btn status-flow-btn-${transitions[0].variant}`}
                      onClick={() => quickTransition(event, transitions[0].to)}
                      title={transitions[0].label}
                    >
                      {transitions[0].label}
                    </button>
                  )}
                  <button className="app-action-btn app-action-danger" onClick={() => confirmDelete(event)}>Delete</button>
                </RoleGate>
              </div>
            </article>
          );
        })}

        {filtered.length === 0 && (
          <div className="app-empty-state">
            {search || filterStatus || filterCategory
              ? 'No events match the current filters.'
              : 'No events yet. Create your first event to get started.'}
          </div>
        )}
      </section>

      {modal && (
        <Modal
          title={modal === 'create' ? 'New event' : `Edit — ${(modal as EventRecord).name}`}
          onClose={() => setModal(null)}
        >
          <EventForm
            initial={modal === 'create' ? undefined : (modal as EventRecord)}
            onDone={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
