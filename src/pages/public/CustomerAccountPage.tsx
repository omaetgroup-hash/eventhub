import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePlatform } from '../../lib/platform';
import { hasApiPersistence } from '../../lib/data-store';
import { lookupAccountOrders } from '../../services/commerce';
import type { IssuedTicket, OrderRecord } from '../../lib/domain';

export default function CustomerAccountPage() {
  const { state } = usePlatform();
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [remoteOrders, setRemoteOrders] = useState<OrderRecord[]>([]);
  const [remoteTickets, setRemoteTickets] = useState<IssuedTicket[]>([]);
  const highlightedOrder = searchParams.get('order') ?? '';
  const queryEmail = (searchParams.get('email') ?? '').trim().toLowerCase();

  useEffect(() => {
    if (!hasApiPersistence() || !queryEmail) {
      setRemoteOrders([]);
      setRemoteTickets([]);
      setLookupError('');
      return;
    }

    setLoading(true);
    setLookupError('');
    lookupAccountOrders(queryEmail)
      .then((result) => {
        setRemoteOrders(result.orders);
        setRemoteTickets(result.issuedTickets);
      })
      .catch((error) => {
        setLookupError(error instanceof Error ? error.message : 'Unable to load account orders.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [queryEmail]);

  const orders = useMemo(() => {
    if (hasApiPersistence()) {
      return [...remoteOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    if (!queryEmail) return [];
    return state.orders
      .filter((order) => order.buyerEmail.toLowerCase() === queryEmail)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [queryEmail, remoteOrders, state.orders]);

  const ticketsForOrder = (orderId: string) =>
    hasApiPersistence()
      ? remoteTickets.filter((ticket) => ticket.orderId === orderId)
      : state.issuedTickets.filter((ticket) => ticket.orderId === orderId);

  function submitLookup(e: React.FormEvent) {
    e.preventDefault();
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (email.trim()) next.set('email', email.trim());
      else next.delete('email');
      next.delete('order');
      return next;
    });
  }

  return (
    <div className="pub-section pub-account-page">
      <div className="pub-section-header">
        <div>
          <h2>My tickets</h2>
          <p>Find your orders and issued QR tickets by email address.</p>
        </div>
      </div>

      <form className="pub-account-lookup" onSubmit={submitLookup}>
        <input
          type="email"
          className="pub-search-input"
          placeholder="Enter the email used at checkout"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="pub-nav-cta" type="submit">Find orders</button>
      </form>

      {loading ? (
        <div className="pub-empty-state" style={{ marginTop: 24 }}>
          <p>Loading your account…</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="pub-empty-state" style={{ marginTop: 24 }}>
          <p>
            {lookupError || (queryEmail ? 'No orders found for that email yet.' : 'Enter your checkout email to view tickets.')}
          </p>
          <Link to="/events" className="pub-link-btn">Browse events</Link>
        </div>
      ) : (
        <div className="pub-account-grid">
          <section className="pub-account-orders">
            {orders.map((order) => {
              const event = state.events.find((entry) => entry.id === order.eventId);
              const tier = state.ticketTiers.find((entry) => entry.id === order.tierId);
              const tickets = ticketsForOrder(order.id);
              return (
                <article
                  key={order.id}
                  className={`pub-account-card${highlightedOrder === order.id ? ' pub-account-card-highlight' : ''}`}
                >
                  <div className="pub-account-card-head">
                    <div>
                      <strong>{event?.name ?? order.eventId}</strong>
                      <p>{order.createdAt} · {tier?.name ?? order.tierId}</p>
                    </div>
                    <span className={`badge badge-${order.status === 'paid' ? 'green' : order.status === 'pending' ? 'amber' : 'red'}`}>
                      {order.status}
                    </span>
                  </div>

                  <div className="pub-account-summary">
                    <div><span>Quantity</span><strong>{order.quantity}</strong></div>
                    <div><span>Total</span><strong>${order.total.toLocaleString()}</strong></div>
                    <div><span>Tickets</span><strong>{tickets.length}</strong></div>
                  </div>

                  {tickets.length > 0 ? (
                    <div className="pub-account-ticket-list">
                      {tickets.map((ticket) => (
                        <div key={ticket.id} className="pub-account-ticket">
                          <div>
                            <strong>{ticket.holderName}</strong>
                            <p>{ticket.id}</p>
                          </div>
                          <div className="pub-account-qr">{ticket.qrPayload}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="app-muted-sm">Tickets will appear here once payment completes.</p>
                  )}
                </article>
              );
            })}
          </section>

          <aside className="pub-account-sidebar">
            <div className="checkout-widget">
              <div className="checkout-widget-header">
                <span className="checkout-widget-label">Account summary</span>
                <span className="checkout-widget-from">{orders.length} order{orders.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="pub-checkout-breakdown">
                <div><span>Paid orders</span><strong>{orders.filter((order) => order.status === 'paid').length}</strong></div>
                <div><span>Pending orders</span><strong>{orders.filter((order) => order.status === 'pending').length}</strong></div>
                <div><span>Issued tickets</span><strong>{(hasApiPersistence() ? remoteTickets : state.issuedTickets.filter((ticket) => orders.some((order) => order.id === ticket.orderId))).length}</strong></div>
              </div>
              <p className="checkout-widget-note">
                Need another event? Browse what is on sale and EventHub will add new purchases here automatically.
              </p>
              <Link to="/events" className="pub-buy-btn pub-buy-btn-primary" style={{ textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                Browse events →
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
