import { describe, it, expect } from 'vitest';
import {
  cancelOrderTickets,
  fulfillOrder,
  getOrder,
  getTicket,
  insertOrder,
  transitionOrderStatus,
} from '../db';
import { seedEvent, seedTier, seedVenue } from './seed';

function nowIso() { return new Date().toISOString(); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function seedOrder() {
  seedVenue('ven_ref');
  seedEvent('evt_ref', 'ven_ref');
  seedTier('tier_ref', 'evt_ref', 20);
  const orderId = `ord_${uid()}`;
  const ticketId = `tkt_${uid()}`;
  insertOrder({ id: orderId, eventId: 'evt_ref', tierId: 'tier_ref', buyerName: 'Carol', buyerEmail: 'carol@test.com', quantity: 1, total: 50, currency: 'NZD', status: 'pending', createdAt: nowIso() });
  fulfillOrder(orderId, [{ id: ticketId, orderId, tierId: 'tier_ref', eventId: 'evt_ref', holderName: 'Carol', holderEmail: 'carol@test.com', qrPayload: `evt_ref.${ticketId}.00000000`, status: 'valid', issuedAt: nowIso() }]);
  return { orderId, ticketId };
}

describe('refund — order status transitions', () => {
  it('pending → refunded', () => {
    const { orderId } = seedOrder();
    transitionOrderStatus(orderId, 'refunded');
    expect(getOrder(orderId)?.status).toBe('refunded');
  });

  it('pending → paid → refunded', () => {
    const { orderId } = seedOrder();
    transitionOrderStatus(orderId, 'paid');
    transitionOrderStatus(orderId, 'refunded');
    expect(getOrder(orderId)?.status).toBe('refunded');
  });

  it('cancelled → cannot transition to paid (throws)', () => {
    const { orderId } = seedOrder();
    transitionOrderStatus(orderId, 'cancelled');
    expect(() => transitionOrderStatus(orderId, 'paid')).toThrow();
    expect(getOrder(orderId)?.status).toBe('cancelled');
  });
});

describe('refund — ticket revocation', () => {
  it('cancelOrderTickets marks tickets cancelled', () => {
    const { orderId, ticketId } = seedOrder();
    cancelOrderTickets(orderId);
    expect(getTicket(ticketId)?.status).toBe('cancelled');
  });
});
