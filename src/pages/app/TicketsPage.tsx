import { useState } from 'react';
import { Link } from 'react-router-dom';
import Modal from '../../components/ui/Modal';
import RoleGate from '../../components/ui/RoleGate';
import TicketTierForm from '../../forms/TicketTierForm';
import { TicketStatusBadge } from '../../components/ui/StatusBadge';
import type { TicketTier } from '../../lib/domain';
import { usePlatform } from '../../lib/platform';

export default function TicketsPage() {
  const { state, dispatch, eventById } = usePlatform();
  const [tierModal, setTierModal] = useState<'create' | TicketTier | null>(null);
  const [filterEventId, setFilterEventId] = useState('');
  const [activeTab, setActiveTab] = useState<'tiers' | 'issued'>('tiers');

  const filteredTiers = filterEventId
    ? state.ticketTiers.filter((t) => t.eventId === filterEventId)
    : state.ticketTiers;

  const filteredTickets = filterEventId
    ? state.issuedTickets.filter((t) => t.eventId === filterEventId)
    : state.issuedTickets;

  function confirmDeleteTier(tier: TicketTier) {
    if (confirm(`Delete tier "${tier.name}"?`)) {
      dispatch({ type: 'DELETE_TIER', id: tier.id });
    }
  }

  return (
    <div className="app-page">
      <section className="app-page-header">
        <div>
          <p className="app-kicker">Ticket tiers and issued tickets</p>
          <h2>Tickets</h2>
          <p>Manage GA, VIP, reserved, and timed-entry tiers. Track every issued ticket and its scan status.</p>
        </div>
        <RoleGate permission="tickets:write">
          <button className="app-button" onClick={() => setTierModal('create')}>Create tier</button>
        </RoleGate>
      </section>

      <div className="app-tab-bar">
        <button className={`app-tab ${activeTab === 'tiers' ? 'app-tab-active' : ''}`} onClick={() => setActiveTab('tiers')}>
          Tiers ({filteredTiers.length})
        </button>
        <button className={`app-tab ${activeTab === 'issued' ? 'app-tab-active' : ''}`} onClick={() => setActiveTab('issued')}>
          Issued tickets ({filteredTickets.length})
        </button>
        <div style={{ marginLeft: 'auto' }}>
          <select className="app-select" value={filterEventId} onChange={(e) => setFilterEventId(e.target.value)}>
            <option value="">All events</option>
            {state.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
          </select>
        </div>
      </div>

      {activeTab === 'tiers' && (
        <section className="app-panel">
          <div className="app-list">
            {filteredTiers.map((tier) => {
              const event = eventById(tier.eventId);
              const pct = tier.inventory > 0 ? Math.round((tier.sold / tier.inventory) * 100) : 0;
              const remaining = tier.inventory - tier.sold;
              return (
                <div key={tier.id} className="app-list-row tier-list-row">
                  <div style={{ flex: 1 }}>
                    <div className="tier-row-top">
                      <strong>{tier.name}</strong>
                      <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                        {tier.kind.replace(/_/g, ' ')}
                      </span>
                      {event && (
                        <Link to={`/app/events/${event.id}`} className="app-action-link" style={{ fontSize: '0.82rem' }}>
                          {event.name}
                        </Link>
                      )}
                    </div>
                    {tier.description && <p style={{ marginTop: 4 }}>{tier.description}</p>}
                    <div className="tier-progress" style={{ marginTop: 10 }}>
                      <div className="tier-progress-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="tier-row-meta">
                      <span>${tier.price} per ticket</span>
                      <span>{tier.sold.toLocaleString()} sold of {tier.inventory.toLocaleString()} ({pct}%)</span>
                      <span className={remaining === 0 ? 'text-danger' : ''}>{remaining.toLocaleString()} remaining</span>
                    </div>
                  </div>
                  <RoleGate permission="tickets:write">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="app-action-btn" onClick={() => setTierModal(tier)}>Edit</button>
                      <button className="app-action-btn app-action-danger" onClick={() => confirmDeleteTier(tier)}>Delete</button>
                    </div>
                  </RoleGate>
                </div>
              );
            })}
            {filteredTiers.length === 0 && (
              <p className="app-muted-sm" style={{ padding: '16px 0' }}>No ticket tiers found.</p>
            )}
          </div>
        </section>
      )}

      {activeTab === 'issued' && (
        <section className="ticket-card-grid">
          {filteredTickets.map((ticket) => {
            const event = eventById(ticket.eventId);
            const order = state.orders.find((o) => o.id === ticket.orderId);
            return (
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
                      <div key={i} className="ticket-qr-cell" style={{ opacity: (ticket.id.charCodeAt(i % ticket.id.length) + i) % 2 === 0 ? 1 : 0.1 }} />
                    ))}
                  </div>
                  <div className="ticket-qr-payload">
                    <span className="app-mono">{ticket.qrPayload}</span>
                  </div>
                </div>

                <div className="ticket-card-meta">
                  {event && (
                    <Link to={`/app/events/${event.id}`} className="app-action-link" style={{ fontSize: '0.78rem' }}>
                      {event.name}
                    </Link>
                  )}
                  <span>Issued {ticket.issuedAt}</span>
                  {ticket.status === 'used' && ticket.scannedGate && (
                    <span>Scanned @ {ticket.scannedGate}</span>
                  )}
                  {order && (
                    <Link to={`/app/orders/${order.id}`} className="app-action-link" style={{ fontSize: '0.78rem' }}>
                      Order →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          {filteredTickets.length === 0 && (
            <div className="app-empty-state">
              No issued tickets found. Create an order to issue tickets.
            </div>
          )}
        </section>
      )}

      {tierModal && (
        <Modal
          title={tierModal === 'create' ? 'Create ticket tier' : `Edit — ${(tierModal as TicketTier).name}`}
          onClose={() => setTierModal(null)}
        >
          <TicketTierForm
            initial={tierModal === 'create' ? undefined : (tierModal as TicketTier)}
            onDone={() => setTierModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
