import { useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { OrderStatusBadge, TicketStatusBadge } from '../../components/ui/StatusBadge';
import RoleGate from '../../components/ui/RoleGate';
import type { OrderStatus } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';
import { useAuth } from '../../lib/auth';
import { isApiPersistenceConfigured } from '../../lib/env';
import { apiRefundOrder, apiUpdateOrderStatus } from '../../services/resource-api';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { orderById, eventById, ticketsByOrder, dispatch, state } = usePlatform();
  const { authToken } = useAuth();
  const [actionError, setActionError] = useState('');
  const [actionPending, setActionPending] = useState(false);

  const order = orderById(id ?? '');
  if (!order) return <Navigate to="/app/orders" replace />;

  const event = eventById(order.eventId);
  const venue = event ? state.venues.find((v) => v.id === event.venueId) : undefined;
  const tier = state.ticketTiers.find((t) => t.id === order.tierId);
  const tickets = ticketsByOrder(order.id);

  async function updateStatus(status: OrderStatus) {
    setActionError('');
    setActionPending(true);
    try {
      if (isApiPersistenceConfigured() && authToken) {
        await apiUpdateOrderStatus(authToken, order!.id, status);
      }
      dispatch({ type: 'UPDATE_ORDER_STATUS', id: order!.id, status });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionPending(false);
    }
  }

  async function handleRefund() {
    setActionError('');
    setActionPending(true);
    try {
      if (isApiPersistenceConfigured() && authToken) {
        await apiRefundOrder(authToken, order!.id);
      }
      dispatch({ type: 'UPDATE_ORDER_STATUS', id: order!.id, status: 'refunded' });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Refund failed.');
    } finally {
      setActionPending(false);
    }
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">
            <Link to="/app/orders" className="app-breadcrumb">Orders</Link>
            {' / '}
            {order.id}
          </p>
          <h2>{order.buyerName}</h2>
          <p>{order.buyerEmail} · {order.createdAt}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <OrderStatusBadge status={order.status} />
          <RoleGate permission="orders:write">
            <div style={{ display: 'flex', gap: 8 }}>
              {order.status === 'pending' && (
                <button className="app-action-btn app-action-confirm" onClick={() => updateStatus('paid')} disabled={actionPending}>
                  Mark paid
                </button>
              )}
              {order.status === 'paid' && (
                <button className="app-action-btn app-action-danger" onClick={handleRefund} disabled={actionPending}>
                  Refund
                </button>
              )}
              {(order.status === 'pending' || order.status === 'paid') && (
                <button className="app-action-btn app-action-danger" onClick={() => updateStatus('cancelled')} disabled={actionPending}>
                  Cancel
                </button>
              )}
            </div>
          </RoleGate>
        </div>
        {actionError && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{actionError}</p>}
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Total</span>
          <strong>${order.total.toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Tickets</span>
          <strong>{order.quantity}</strong>
        </article>
        <article className="app-stat-card">
          <span>Price per ticket</span>
          <strong>${tier?.price ?? '—'}</strong>
        </article>
        <article className="app-stat-card">
          <span>Scanned</span>
          <strong>{tickets.filter((t) => t.status === 'used').length} / {tickets.length}</strong>
        </article>
      </section>

      <section className="app-two-column">
        <article className="app-panel">
          <div className="app-panel-header"><h3>Buyer</h3></div>
          <div className="app-list">
            <div className="app-list-row">
              <div><strong>Name</strong><p>{order.buyerName}</p></div>
            </div>
            <div className="app-list-row">
              <div><strong>Email</strong><p>{order.buyerEmail}</p></div>
            </div>
            <div className="app-list-row">
              <div><strong>Order placed</strong><p>{order.createdAt}</p></div>
            </div>
            <div className="app-list-row">
              <div><strong>Order ID</strong><p className="app-mono">{order.id}</p></div>
            </div>
          </div>
        </article>

        <article className="app-panel">
          <div className="app-panel-header"><h3>Event &amp; tier</h3></div>
          <div className="app-list">
            <div className="app-list-row">
              <div>
                <strong>Event</strong>
                <p>{event?.name ?? '—'}</p>
              </div>
              {event && <Link to={`/app/events/${event.id}`} className="app-action-link">View →</Link>}
            </div>
            <div className="app-list-row">
              <div><strong>Date</strong><p>{event?.startsAt ?? '—'}</p></div>
            </div>
            <div className="app-list-row">
              <div><strong>Venue</strong><p>{venue?.name ?? '—'}</p></div>
            </div>
            <div className="app-list-row">
              <div>
                <strong>Tier</strong>
                <p>{tier?.name ?? '—'} · {tier?.kind.replace(/_/g, ' ') ?? '—'}</p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <article className="app-panel">
        <div className="app-panel-header">
          <h3>Issued tickets</h3>
          <span>{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
        </div>

        {tickets.length === 0 ? (
          <p className="app-muted-sm" style={{ padding: '16px 0' }}>No tickets issued for this order.</p>
        ) : (
          <div className="ticket-card-grid">
            {tickets.map((ticket) => (
              <div key={ticket.id} className={`ticket-card ticket-card-${ticket.status}`}>
                <div className="ticket-card-header">
                  <div>
                    <strong>{ticket.holderName}</strong>
                    <p>{ticket.holderEmail}</p>
                  </div>
                  <TicketStatusBadge status={ticket.status} />
                </div>

                <div className="ticket-qr-block">
                  <div className="ticket-qr-grid">
                    {Array.from({ length: 25 }).map((_, i) => (
                      <div
                        key={i}
                        className="ticket-qr-cell"
                        style={{ opacity: Math.random() > 0.45 ? 1 : 0 }}
                      />
                    ))}
                  </div>
                  <div className="ticket-qr-payload">
                    <span className="app-mono">{ticket.qrPayload}</span>
                  </div>
                </div>

                <div className="ticket-card-meta">
                  <span>Issued {ticket.issuedAt}</span>
                  {ticket.status === 'used' && ticket.scannedAt && (
                    <span>Scanned at {ticket.scannedGate} · {ticket.scannedAt}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
