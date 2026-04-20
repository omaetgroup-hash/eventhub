import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import RoleGate from '../../components/ui/RoleGate';
import OrderForm from '../../forms/OrderForm';
import { OrderStatusBadge } from '../../components/ui/StatusBadge';
import type { OrderStatus } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';

const STATUS_OPTIONS: (OrderStatus | '')[] = ['', 'paid', 'pending', 'refunded', 'cancelled'];

export default function OrdersPage() {
  const { state, dispatch, eventById } = usePlatform();
  const [filterStatus, setFilterStatus] = useState<OrderStatus | ''>('');
  const [filterEventId, setFilterEventId] = useState('');
  const [orderModal, setOrderModal] = useState(false);

  const filtered = state.orders.filter((o) => {
    if (filterStatus && o.status !== filterStatus) return false;
    if (filterEventId && o.eventId !== filterEventId) return false;
    return true;
  });

  const totalRevenue = filtered
    .filter((o) => o.status === 'paid')
    .reduce((s, o) => s + o.total, 0);

  function updateStatus(id: string, status: OrderStatus) {
    dispatch({ type: 'UPDATE_ORDER_STATUS', id, status });
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Order management</p>
          <h2>Orders</h2>
          <p>Track paid, pending, refunded, and cancelled orders. Click any order to view issued tickets.</p>
        </div>
        <RoleGate permission="orders:write">
          <button className="app-button" onClick={() => setOrderModal(true)}>Create order</button>
        </RoleGate>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <span>Showing</span>
          <strong>{filtered.length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Paid revenue</span>
          <strong>${totalRevenue.toLocaleString()}</strong>
        </article>
        <article className="app-stat-card">
          <span>Pending</span>
          <strong>{filtered.filter((o) => o.status === 'pending').length}</strong>
        </article>
        <article className="app-stat-card">
          <span>Refunded</span>
          <strong>{filtered.filter((o) => o.status === 'refunded').length}</strong>
        </article>
      </section>

      <div className="app-filter-bar">
        <select className="app-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as OrderStatus | '')}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="app-select" value={filterEventId} onChange={(e) => setFilterEventId(e.target.value)}>
          <option value="">All events</option>
          {state.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
        </select>
      </div>

      <section className="app-table-panel">
        <div className="app-table-header app-table-header-6">
          <span>Buyer</span>
          <span>Event</span>
          <span>Qty</span>
          <span>Total</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {filtered.map((order) => {
          const event = eventById(order.eventId);
          return (
            <div key={order.id} className="app-table-row app-table-row-6">
              <div>
                <strong>
                  <Link to={`/app/orders/${order.id}`} className="app-action-link">{order.buyerName}</Link>
                </strong>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(220,232,239,0.6)' }}>{order.buyerEmail}</p>
              </div>
              <span>
                {event
                  ? <Link to={`/app/events/${event.id}`} className="app-action-link">{event.name}</Link>
                  : '—'}
              </span>
              <span>{order.quantity}</span>
              <span>${order.total}</span>
              <span><OrderStatusBadge status={order.status} /></span>
              <span className="app-row-actions">
                <Link to={`/app/orders/${order.id}`} className="app-action-btn" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                  View
                </Link>
                <RoleGate permission="orders:write">
                  {order.status === 'pending' && (
                    <button className="app-action-btn app-action-confirm" onClick={() => updateStatus(order.id, 'paid')}>Paid</button>
                  )}
                  {order.status === 'paid' && (
                    <button className="app-action-btn app-action-danger" onClick={() => updateStatus(order.id, 'refunded')}>Refund</button>
                  )}
                </RoleGate>
              </span>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="app-table-empty">No orders match the current filter.</div>}
      </section>

      {orderModal && (
        <Modal title="Create order" onClose={() => setOrderModal(false)}>
          <OrderForm onDone={() => setOrderModal(false)} />
        </Modal>
      )}
    </div>
  );
}
