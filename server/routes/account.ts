import { Router } from 'express';
import {
  appendAudit,
  getEvent,
  getOrder,
  getTier,
  getVenue,
  insertEmailLog,
  listAccountOrders,
} from '../db';
import { sendTransactionalEmail } from '../services/email';

const router = Router();

function nowIso() { return new Date().toISOString(); }
function newEmailId() { return `email_${Math.random().toString(36).slice(2, 10)}`; }

// Simple in-memory rate limiter: max 5 lookups per email per 15 minutes
const lookupBucket = new Map<string, { count: number; windowStart: number }>();
const LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const LOOKUP_LIMIT = 5;

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const bucket = lookupBucket.get(email);
  if (!bucket || now - bucket.windowStart > LOOKUP_WINDOW_MS) {
    lookupBucket.set(email, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= LOOKUP_LIMIT) return false;
  bucket.count++;
  return true;
}

router.get('/orders', (req, res) => {
  const email = String(req.query.email ?? '').trim().toLowerCase();
  if (!email) { res.status(400).json({ error: 'Email query parameter is required.' }); return; }

  if (!checkRateLimit(email)) {
    res.status(429).json({ error: 'Too many lookups for this email. Please wait before trying again.' });
    return;
  }

  const result = listAccountOrders(email);
  res.json(result);
});

router.post('/orders/:orderId/resend', async (req, res) => {
  const { orderId } = req.params as { orderId: string };
  const email = String(req.query.email ?? '').trim().toLowerCase();
  if (!email) { res.status(400).json({ error: 'Email query parameter is required.' }); return; }

  const order = getOrder(orderId);
  if (!order) { res.status(404).json({ error: 'Order not found.' }); return; }
  if (order.buyerEmail.toLowerCase() !== email) { res.status(403).json({ error: 'This order does not belong to that email.' }); return; }
  if (order.status !== 'paid') { res.status(409).json({ error: 'Only paid orders can have confirmation emails resent.' }); return; }

  const event = getEvent(order.eventId);
  const tier = getTier(order.tierId);
  const venue = event?.venueId ? getVenue(event.venueId) : null;

  const result = listAccountOrders(email);
  const tickets = result.issuedTickets.filter((t) => t.orderId === orderId);

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
  insertEmailLog({ id: newEmailId(), template: 'order_confirmation', toAddress: order.buyerEmail, orderId, provider: sent.provider, status: sent.status, error: sent.error });
  appendAudit({ actor: email, action: 'account.resend_confirmation', target: orderId, severity: 'info' });

  res.json({ status: sent.status, provider: sent.provider });
});

export default router;
