import { useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import RoleGate from '../../components/ui/RoleGate';
import EventForm from '../../forms/EventForm';
import TicketTierForm from '../../forms/TicketTierForm';
import OrderForm from '../../forms/OrderForm';
import { EventStatusBadge, OrderStatusBadge } from '../../components/ui/StatusBadge';
import type { EventStatus, TicketTier } from '../../lib/domain';
import { usePlatform, EVENT_STATUS_TRANSITIONS } from '../../lib/platform';
import { useAuth } from '../../lib/auth';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { eventById, venueById, tiersByEvent, ordersByEvent, dispatch, state } = usePlatform();
  const { user } = useAuth();
  const [editEvent, setEditEvent] = useState(false);
  const [tierModal, setTierModal] = useState<'create' | TicketTier | null>(null);
  const [orderModal, setOrderModal] = useState(false);

  const event = eventById(id ?? '');
  if (!event) return <Navigate to="/app/events" replace />;

  const venue = venueById(event.venueId);
  const tiers = tiersByEvent(event.id);
  const orders = ordersByEvent(event.id);
  const organizer = state.teamMembers.find((m) => m.id === event.organizerId);
  const transitions = EVENT_STATUS_TRANSITIONS[event.status];

  const totalInventory = tiers.reduce((s, t) => s + t.inventory, 0);
  const totalSold = tiers.reduce((s, t) => s + t.sold, 0);
  const fillPct = totalInventory > 0 ? Math.round((totalSold / totalInventory) * 100) : 0;

  function transition(to: EventStatus) {
    dispatch({ type: 'TRANSITION_EVENT_STATUS', id: event!.id, to, actor: user.name });
  }

  function confirmDeleteTier(tier: TicketTier) {
    if (confirm(`Delete tier "${tier.name}"?`)) {
      dispatch({ type: 'DELETE_TIER', id: tier.id });
    }
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">
            <Link to="/app/events" className="app-breadcrumb">Events</Link>
            {' / '}
            {event.name}
          </p>
          <h2>{event.name}</h2>
          <p>{event.startsAt}{event.endsAt ? ` → ${event.endsAt}` : ''} · {venue?.name ?? '—'}</p>
        </div>
        <div className="page-header-actions">
          <EventStatusBadge status={event.status} />
          <RoleGate permission="events:write">
            <button className="app-button" onClick={() => setEditEvent(true)}>Edit</button>
          </RoleGate>
        </div>
      </section>

      {transitions.length > 0 && (
        <RoleGate permission="events:write">
          <div className="status-flow-bar">
            <span className="status-flow-label">Status actions</span>
            <div className="status-flow-actions">
              {transitions.map((t) => (
                <button
                  key={t.to}
                  className={`app-action-btn status-flow-btn status-flow-btn-${t.variant}`}
                  onClick={() => transition(t.to)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </RoleGate>
      )}

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Tickets sold</span>
          <strong>{event.ticketsSold.toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Gross revenue</span>
          <strong>${event.grossRevenue.toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Fill rate</span>
          <strong>{fillPct}%</strong>
        </article>
        <article className="app-stat-card">
          <span>Orders</span>
          <strong>{orders.length}</strong>
        </article>
      </section>

      {event.description && (
        <article className="app-panel">
          <div className="app-panel-header"><h3>Description</h3></div>
          <p style={{ marginTop: 14, lineHeight: 1.75, color: 'rgba(220,232,239,0.82)' }}>{event.description}</p>
        </article>
      )}

      <article className="app-panel">
        <div className="app-panel-header">
          <h3>Ticket tiers</h3>
          <RoleGate permission="tickets:write">
            <button className="app-button" onClick={() => setTierModal('create')}>Add tier</button>
          </RoleGate>
        </div>
        {tiers.length === 0 ? (
          <p className="app-muted-sm" style={{ padding: '16px 0' }}>No tiers yet. Add a ticket tier to begin selling.</p>
        ) : (
          <div className="app-list">
            {tiers.map((tier) => {
              const pct = tier.inventory > 0 ? Math.round((tier.sold / tier.inventory) * 100) : 0;
              return (
                <div key={tier.id} className="app-list-row">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <strong>{tier.name}</strong>
                      <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                        {tier.kind.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p>${tier.price} per ticket</p>
                    <div className="tier-progress">
                      <div className="tier-progress-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <p style={{ fontSize: '0.78rem', marginTop: 4 }}>{tier.sold} / {tier.inventory} sold ({pct}%)</p>
                  </div>
                  <RoleGate permission="tickets:write">
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="app-action-btn" onClick={() => setTierModal(tier)}>Edit</button>
                      <button className="app-action-btn app-action-danger" onClick={() => confirmDeleteTier(tier)}>Delete</button>
                    </div>
                  </RoleGate>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <article className="app-panel">
        <div className="app-panel-header">
          <h3>Orders</h3>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link to="/app/orders" className="app-action-link">All orders →</Link>
            <RoleGate permission="orders:write">
              {(event.status === 'on_sale' || event.status === 'live') && (
                <button className="app-button" onClick={() => setOrderModal(true)}>Create order</button>
              )}
            </RoleGate>
          </div>
        </div>
        {orders.length === 0 ? (
          <p className="app-muted-sm" style={{ padding: '16px 0' }}>No orders for this event yet.</p>
        ) : (
          <div className="app-list">
            {orders.slice(0, 8).map((order) => (
              <div key={order.id} className="app-list-row">
                <div>
                  <strong>
                    <Link to={`/app/orders/${order.id}`} className="app-action-link">{order.buyerName}</Link>
                  </strong>
                  <p>{order.buyerEmail} · {order.quantity}× · {order.createdAt}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span>${order.total}</span>
                  <OrderStatusBadge status={order.status} />
                </div>
              </div>
            ))}
            {orders.length > 8 && (
              <div className="app-list-row">
                <Link to="/app/orders" className="app-action-link">View all {orders.length} orders →</Link>
              </div>
            )}
          </div>
        )}
      </article>

      <article className="app-panel">
        <div className="app-panel-header"><h3>Event info</h3></div>
        <div className="app-list">
          <div className="app-list-row">
            <div><strong>Venue</strong><p>{venue?.name ?? '—'}</p></div>
            {venue && <Link to={`/app/venues/${venue.id}`} className="app-action-link">View venue →</Link>}
          </div>
          <div className="app-list-row">
            <div><strong>Organizer</strong><p>{organizer?.name ?? 'Unassigned'}</p></div>
          </div>
          <div className="app-list-row">
            <div><strong>Category</strong><p>{event.category}</p></div>
          </div>
          <div className="app-list-row">
            <div><strong>Created</strong><p>{event.createdAt}</p></div>
          </div>
        </div>
      </article>

      {editEvent && (
        <Modal title={`Edit — ${event.name}`} onClose={() => setEditEvent(false)}>
          <EventForm initial={event} onDone={() => setEditEvent(false)} />
        </Modal>
      )}

      {tierModal && (
        <Modal
          title={tierModal === 'create' ? 'Add ticket tier' : `Edit — ${(tierModal as TicketTier).name}`}
          onClose={() => setTierModal(null)}
        >
          <TicketTierForm
            initial={tierModal === 'create' ? undefined : (tierModal as TicketTier)}
            defaultEventId={event.id}
            onDone={() => setTierModal(null)}
          />
        </Modal>
      )}

      {orderModal && (
        <Modal title="Create order" onClose={() => setOrderModal(false)}>
          <OrderForm defaultEventId={event.id} onDone={() => setOrderModal(false)} />
        </Modal>
      )}
    </div>
  );
}
