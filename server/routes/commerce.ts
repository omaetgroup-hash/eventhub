import crypto from 'node:crypto';
import { Router } from 'express';
import type { IssuedTicket, OrderRecord } from '../../src/lib/domain';
import {
  admitQueueToken,
  appendAudit,
  cancelAbandonedCheckouts,
  checkOrderRateLimit,
  checkPurchaseLimitDb,
  convertHold,
  countActiveHolds,
  detectFraud,
  expireStaleHolds,
  fulfillOrder,
  getAvailableInventoryDb,
  getEvent,
  getOrder,
  getTier,
  getVenue,
  insertAbuseEvent,
  insertEmailLog,
  insertOrder,
  insertPaymentRecord,
  isQueueActive,
  releaseHold,
  reserveInventory,
  updatePaymentRecordStatus,
  validateAndConsumePresaleCode,
} from '../db';
import { serverEnv } from '../env';
import { createCheckoutSession } from '../services/payment';
import { sendTransactionalEmail } from '../services/email';

const router = Router();

function nowIso() { return new Date().toISOString(); }
function newId(prefix: string) { return `${prefix}_${crypto.randomBytes(4).toString('hex')}`; }
function qrPayload(eventId: string, ticketId: string): string {
  const checksum = crypto.createHash('sha1').update(`${eventId}:${ticketId}:${serverEnv.qrChecksumSalt}`).digest('hex').slice(0, 8);
  return `${eventId}.${ticketId}.${checksum}`;
}

function buildTickets(order: OrderRecord): IssuedTicket[] {
  return Array.from({ length: order.quantity }, () => {
    const id = newId('tkt');
    return {
      id,
      orderId: order.id,
      tierId: order.tierId,
      eventId: order.eventId,
      holderName: order.buyerName,
      holderEmail: order.buyerEmail,
      qrPayload: qrPayload(order.eventId, id),
      status: 'valid' as const,
      issuedAt: nowIso(),
    };
  });
}

function requestIpHash(req: import('express').Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0]!.trim() : (req.ip ?? '127.0.0.1');
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

const MAX_ACTIVE_HOLDS_PER_EVENT = 500;

router.post('/orders', async (req, res) => {
  const payload = req.body as {
    eventId?: string;
    tierId?: string;
    buyerName?: string;
    buyerEmail?: string;
    quantity?: number;
    presaleCode?: string;
    queueToken?: string;
    successUrl?: string;
    cancelUrl?: string;
  };

  const { eventId, tierId, buyerName, buyerEmail, quantity, presaleCode, queueToken, successUrl, cancelUrl } = payload;

  if (!eventId || !tierId || !buyerName?.trim() || !buyerEmail?.trim() || !quantity || !successUrl || !cancelUrl) {
    res.status(400).json({ error: 'eventId, tierId, buyerName, buyerEmail, quantity, successUrl, and cancelUrl are required.' });
    return;
  }
  if (quantity < 1 || quantity > 50) {
    res.status(400).json({ error: 'Quantity must be between 1 and 50.' });
    return;
  }

  // IP + email rate limit: 5 order attempts per minute
  const rateLimitKey = `${requestIpHash(req)}:${buyerEmail.trim().toLowerCase()}`;
  if (!checkOrderRateLimit(rateLimitKey)) {
    const ipHash = requestIpHash(req);
    insertAbuseEvent({ id: newId('abuse'), eventId: eventId, pattern: 'rapid_attempts', ipHash, sessionCount: 1, action: 'blocked' });
    res.status(429).json({ error: 'Too many order attempts. Please wait before trying again.' });
    return;
  }

  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }

  // Queue gate: if a waiting room is active, require a valid queue token
  if (isQueueActive(eventId)) {
    if (!queueToken?.trim()) {
      res.status(409).json({ error: 'A waiting room is active for this event. You must join the queue and wait for a queue token before purchasing.', queueRequired: true });
      return;
    }
    const tokenAdmitted = admitQueueToken(queueToken.trim());
    if (!tokenAdmitted) {
      res.status(409).json({ error: 'Queue token is invalid or has expired. Please rejoin the queue.', queueRequired: true });
      return;
    }
  }

  // Max concurrent holds throttle per event (anti-hold-farming)
  const activeHolds = countActiveHolds(eventId);
  if (activeHolds >= MAX_ACTIVE_HOLDS_PER_EVENT) {
    res.status(409).json({ error: 'Maximum concurrent reservations reached for this event. Please try again shortly.' });
    return;
  }
  if (event.status !== 'on_sale') { res.status(409).json({ error: `Event is not currently on sale (status: ${event.status}).` }); return; }

  const tier = getTier(tierId);
  if (!tier || tier.eventId !== eventId) { res.status(404).json({ error: 'Ticket tier not found.' }); return; }

  const now = nowIso();
  if (tier.saleStartsAt && now < tier.saleStartsAt) { res.status(409).json({ error: `Sales for "${tier.name}" have not opened yet.` }); return; }
  if (tier.saleEndsAt && now > tier.saleEndsAt) { res.status(409).json({ error: `Sales for "${tier.name}" have closed.` }); return; }

  const purchaseCheck = checkPurchaseLimitDb(buyerEmail.trim(), eventId, tierId, quantity);
  if (!purchaseCheck.allowed) { res.status(409).json({ error: 'reason' in purchaseCheck ? purchaseCheck.reason : 'Purchase limit reached.' }); return; }

  if (presaleCode?.trim()) {
    const presale = validateAndConsumePresaleCode(presaleCode.trim(), eventId, tierId, now);
    if (!presale.valid) { res.status(409).json({ error: 'reason' in presale ? presale.reason : 'Presale code is invalid.' }); return; }
  }

  const hold = reserveInventory({ tierId, eventId, quantity, holderEmail: buyerEmail.trim(), ttlMinutes: 15 });
  if (!hold) {
    const available = getAvailableInventoryDb(tierId);
    res.status(409).json({ error: `Only ${available} ticket${available === 1 ? '' : 's'} remain for "${tier.name}".`, available });
    return;
  }

  const orderId = newId('ord');
  const total = tier.price * quantity;
  const venue = event.venueId ? getVenue(event.venueId) : null;

  const order: OrderRecord = {
    id: orderId,
    eventId,
    tierId,
    buyerName: buyerName.trim(),
    buyerEmail: buyerEmail.trim().toLowerCase(),
    total,
    quantity,
    status: 'pending',
    paymentProvider: serverEnv.stripeSecretKey ? 'stripe' : 'mock',
    createdAt: now,
  };
  insertOrder(order);

  detectFraud(orderId, eventId, buyerEmail.trim(), quantity, total * 100);

  try {
    const idempotencyKey = crypto.createHash('sha256').update(`${orderId}:${tierId}:${quantity}`).digest('hex');
    const session = await createCheckoutSession({
      lineItems: [{ name: tier.name, description: event.name, quantity, unitAmount: tier.price * 100, currency: 'nzd' }],
      successUrl,
      cancelUrl,
      metadata: { orderId, eventId, tierId, buyerEmail: buyerEmail.trim() },
      idempotencyKey,
    });

    const paymentId = newId('pay');
    insertPaymentRecord({
      id: paymentId,
      orderId,
      intentId: session.paymentIntentId ?? session.id,
      provider: serverEnv.stripeSecretKey ? 'stripe' : 'mock',
      amountCents: total * 100,
      currency: 'nzd',
      status: session.status === 'complete' ? 'succeeded' : 'initiated',
      idempotencyKey,
    });

    if (session.status === 'complete') {
      const tickets = buildTickets({ ...order, status: 'paid' });
      fulfillOrder(orderId, tickets);
      convertHold(hold.id, orderId);
      updatePaymentRecordStatus(orderId, 'succeeded');

      const sent = await sendTransactionalEmail('order_confirmation', order.buyerEmail, {
        orderId, buyerName: order.buyerName, buyerEmail: order.buyerEmail,
        eventName: event.name, eventDate: event.startsAt,
        venueName: venue?.name ?? 'TBC',
        tierName: tier.name, quantity, total, currency: 'NZD',
        tickets: tickets.map((t) => ({ id: t.id, qrPayload: t.qrPayload, holderName: t.holderName })),
      });
      insertEmailLog({ id: newId('email'), template: 'order_confirmation', toAddress: order.buyerEmail, orderId, provider: sent.provider, status: sent.status, error: sent.error });
      appendAudit({ actor: 'system', action: 'order.fulfilled', target: orderId, severity: 'info', note: `${quantity}x ${tier.name}` });

      res.json({ order: { ...order, status: 'paid' }, tickets, checkoutSession: session });
      return;
    }

    res.json({ order, tickets: [], checkoutSession: session });
  } catch (error) {
    releaseHold(hold.id);
    res.status(400).json({ error: error instanceof Error ? error.message : 'Checkout failed.' });
  }
});

router.post('/orders/:orderId/fulfill', async (req, res) => {
  const { orderId } = req.params as { orderId: string };
  const { intentId } = req.body as { intentId?: string };

  const order = getOrder(orderId);
  if (!order) { res.status(404).json({ error: 'Order not found.' }); return; }
  if (order.status === 'paid') { res.json({ status: 'already_fulfilled' }); return; }
  if (order.status !== 'pending') { res.status(409).json({ error: `Cannot fulfill an order with status '${order.status}'.` }); return; }

  if (intentId) {
    updatePaymentRecordStatus(orderId, 'succeeded', JSON.stringify({ intentId }));
  }

  const tickets = buildTickets({ ...order, status: 'paid' });
  fulfillOrder(orderId, tickets);

  const event = getEvent(order.eventId);
  const tier = getTier(order.tierId);
  const venue = event?.venueId ? getVenue(event.venueId) : null;

  const sent = await sendTransactionalEmail('order_confirmation', order.buyerEmail, {
    orderId,
    buyerName: order.buyerName,
    buyerEmail: order.buyerEmail,
    eventName: event?.name ?? orderId,
    eventDate: event?.startsAt ?? '',
    venueName: venue?.name ?? 'TBC',
    tierName: tier?.name ?? '',
    quantity: order.quantity,
    total: order.total,
    currency: 'NZD',
    tickets: tickets.map((t) => ({ id: t.id, qrPayload: t.qrPayload, holderName: t.holderName })),
  });
  insertEmailLog({ id: newId('email'), template: 'order_confirmation', toAddress: order.buyerEmail, orderId, provider: sent.provider, status: sent.status, error: sent.error });
  appendAudit({ actor: 'webhook', action: 'order.fulfilled', target: orderId, severity: 'info', note: `via webhook` });

  res.json({ status: 'fulfilled', orderId, ticketsIssued: tickets.length });
});

router.post('/cleanup', (_req, res) => {
  const expired = expireStaleHolds();
  const cancelled = cancelAbandonedCheckouts(60);
  appendAudit({ actor: 'system', action: 'commerce.cleanup', target: '', severity: 'info', note: `${expired} holds expired, ${cancelled} orders cancelled` });
  res.json({ expiredHolds: expired, cancelledOrders: cancelled });
});

export default router;
