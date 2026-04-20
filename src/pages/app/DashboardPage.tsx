import { Link } from 'react-router-dom';
import { EventStatusBadge, OrderStatusBadge } from '../../components/ui/StatusBadge';
import { usePlatform } from '../../lib/platform';
import { useAuth } from '../../lib/auth';

export default function DashboardPage() {
  const { state, venueById } = usePlatform();
  const { user } = useAuth();

  const liveRevenue = state.events.reduce((t, e) => t + e.grossRevenue, 0);
  const activeEvents = state.events.filter((e) => e.status === 'on_sale' || e.status === 'live').length;
  const scansToday = state.checkpoints.reduce((t, c) => t + c.scanned, 0);
  const pendingOrders = state.orders.filter((o) => o.status === 'pending').length;

  return (
    <div className="app-page">
      <section className="app-hero-card">
        <div>
          <p className="app-kicker">Welcome back</p>
          <h2>{user.name}</h2>
          <p>{user.role.replace(/_/g, ' ')} · {user.scope}</p>
        </div>
        <div className="app-hero-actions">
          <Link to="/app/events" className="primary-cta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            New event
          </Link>
          <Link to="/app/settings" className="secondary-cta" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Settings
          </Link>
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Live revenue</span>
          <strong>${liveRevenue.toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Active events</span>
          <strong>{activeEvents}</strong>
        </article>
        <article className="app-stat-card">
          <span>Venues online</span>
          <strong>{state.venues.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Scans today</span>
          <strong>{scansToday.toLocaleString()}</strong>
        </article>
      </section>

      {pendingOrders > 0 && (
        <div className="app-alert">
          <strong>{pendingOrders} pending order{pendingOrders !== 1 ? 's' : ''}</strong>
          {' '}require attention.{' '}
          <Link to="/app/orders" className="app-action-link">Review →</Link>
        </div>
      )}

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Events</h3>
            <Link to="/app/events" className="app-action-link">All events →</Link>
          </div>
          <div className="app-list">
            {state.events.slice(0, 5).map((event) => {
              const venue = venueById(event.venueId);
              return (
                <div key={event.id} className="app-list-row">
                  <div>
                    <strong>
                      <Link to={`/app/events/${event.id}`} className="app-action-link">{event.name}</Link>
                    </strong>
                    <p>{event.startsAt} · {venue?.name ?? '—'}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>${event.grossRevenue.toLocaleString()}</span>
                    <EventStatusBadge status={event.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Recent orders</h3>
            <Link to="/app/orders" className="app-action-link">All orders →</Link>
          </div>
          <div className="app-list">
            {state.orders.slice(0, 5).map((order) => {
              const event = state.events.find((e) => e.id === order.eventId);
              return (
                <div key={order.id} className="app-list-row">
                  <div>
                    <strong>{order.buyerName}</strong>
                    <p>{event?.name ?? '—'} · {order.quantity}×</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>${order.total}</span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Venue network</h3>
            <Link to="/app/venues" className="app-action-link">All venues →</Link>
          </div>
          <div className="app-list">
            {state.venues.map((venue) => (
              <div key={venue.id} className="app-list-row">
                <div>
                  <strong>
                    <Link to={`/app/venues/${venue.id}`} className="app-action-link">{venue.name}</Link>
                  </strong>
                  <p>{venue.city} · {venue.zones.length} zone{venue.zones.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{venue.capacity.toLocaleString()}</strong>
                  <p>{venue.manager || 'Unassigned'}</p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header">
            <h3>Audit trail</h3>
            <Link to="/app/audit" className="app-action-link">Full log →</Link>
          </div>
          <div className="app-list">
            {state.auditLog.slice(0, 4).map((entry) => (
              <div key={entry.id} className="app-list-row">
                <div>
                  <strong>{entry.action}</strong>
                  <p>{entry.actor} · {entry.target}</p>
                </div>
                <div className="app-list-metric">
                  <strong>{entry.timestamp}</strong>
                  <p>{entry.severity}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
