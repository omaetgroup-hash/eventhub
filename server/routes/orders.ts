import crypto from 'node:crypto';
import { Router } from 'express';
import type { IssuedTicket } from '../../src/lib/domain';
import {
  appendAudit,
  createTicket,
  getOrder,
  getOrderPaymentIntent,
  getTicket,
  listOrders,
  listTickets,
  markTicketTransferred,
  transitionOrderStatus,
} from '../db';
import { serverEnv } from '../env';
import {
  canAccessOrder,
  getAccessibleEventIds,
  requirePack,
  requirePermission,
  requireSession,
  type AuthRequest,
} from '../middleware';
import { createRefund } from '../services/payment';

const router = Router();

function paginate<T>(items: T[], limit?: number, offset?: number) {
  const safeLimit = limit ?? 50;
  const safeOffset = offset ?? 0;
  return {
    total: items.length,
    items: items.slice(safeOffset, safeOffset + safeLimit),
  };
}

router.get('/', requireSession, requirePack('standard'), requirePermission('orders:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId, tierId, buyerEmail, status, limit, offset } = req.query as Record<string, string | undefined>;
  const result = listOrders({
    eventId: eventId || undefined,
    tierId: tierId || undefined,
    buyerEmail: session.user.role === 'customer' ? session.user.email : buyerEmail || undefined,
    status: status || undefined,
    limit: 500,
    offset: 0,
  });
  const accessibleEventIds = getAccessibleEventIds(session.user);
  const scopedOrders = result.orders.filter((order) => {
    if (session.user.role === 'customer') {
      return canAccessOrder(session.user, order);
    }
    if (accessibleEventIds === null) {
      return true;
    }
    return accessibleEventIds.includes(order.eventId);
  });
  const paged = paginate(scopedOrders, limit ? Number(limit) : undefined, offset ? Number(offset) : undefined);
  res.json({ orders: paged.items, total: paged.total });
});

router.get('/:id', requireSession, requirePack('standard'), requirePermission('orders:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const order = getOrder(req.params.id as string);
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (!canAccessOrder(session.user, order)) {
    res.status(403).json({ error: 'Order access denied.' });
    return;
  }

  const { tickets } = listTickets({ orderId: order.id });
  res.json({ ...order, tickets });
});

router.patch('/:id/status', requireSession, requirePack('standard'), requirePermission('orders:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const order = getOrder(req.params.id as string);
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (!canAccessOrder(session.user, order)) {
    res.status(403).json({ error: 'Order access denied.' });
    return;
  }

  const { status } = req.body as { status?: string };
  const valid = ['paid', 'pending', 'refunded', 'cancelled'] as const;
  if (!status || !valid.includes(status as typeof valid[number])) {
    res.status(400).json({ error: `Status must be one of: ${valid.join(', ')}` });
    return;
  }

  try {
    const updated = transitionOrderStatus(order.id, status as typeof valid[number]);
    appendAudit({
      actor: session.user.id,
      action: 'order.status',
      target: order.id,
      severity: status === 'cancelled' || status === 'refunded' ? 'warning' : 'info',
      note: `${order.status} -> ${status}`,
    });
    res.json(updated);
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : 'Status update failed.' });
  }
});

router.post('/:id/refund', requireSession, requirePack('finance'), requirePermission('orders:write'), async (req, res) => {
  const session = (req as AuthRequest).session;
  const order = getOrder(req.params.id as string);
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (!canAccessOrder(session.user, order)) {
    res.status(403).json({ error: 'Order access denied.' });
    return;
  }
  if (order.status !== 'paid') {
    res.status(409).json({ error: 'Only paid orders can be refunded.' });
    return;
  }

  const { reason } = req.body as { reason?: string };
  const payment = getOrderPaymentIntent(order.id);
  if (!payment.intentId) {
    res.status(409).json({ error: 'No persisted payment intent is available for this order.' });
    return;
  }

  try {
    const refund = await createRefund(payment.intentId, undefined, reason ?? 'requested_by_customer');
    const updatedOrder = transitionOrderStatus(order.id, 'refunded');
    appendAudit({
      actor: session.user.id,
      action: 'order.refund',
      target: order.id,
      severity: 'warning',
      note: `Refund ${refund.id} - ${reason ?? 'no reason'}`,
    });
    res.json({ order: updatedOrder, refund });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Refund failed.' });
  }
});

router.get('/:id/tickets', requireSession, requirePack('standard'), requirePermission('tickets:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const order = getOrder(req.params.id as string);
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (!canAccessOrder(session.user, order)) {
    res.status(403).json({ error: 'Order access denied.' });
    return;
  }

  res.json(listTickets({ orderId: order.id }));
});

router.post('/:id/tickets/:ticketId/transfer', requireSession, requirePack('standard'), requirePermission('tickets:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const order = getOrder(req.params.id as string);
  if (!order) {
    res.status(404).json({ error: 'Order not found.' });
    return;
  }
  if (!canAccessOrder(session.user, order)) {
    res.status(403).json({ error: 'Order access denied.' });
    return;
  }

  const ticket = getTicket(req.params.ticketId as string);
  if (!ticket || ticket.orderId !== order.id) {
    res.status(404).json({ error: 'Ticket not found on this order.' });
    return;
  }
  if (ticket.status !== 'valid') {
    res.status(409).json({ error: 'Only valid tickets can be transferred.' });
    return;
  }

  const { holderName, holderEmail } = req.body as { holderName?: string; holderEmail?: string };
  if (!holderName?.trim() || !holderEmail?.trim()) {
    res.status(400).json({ error: 'holderName and holderEmail are required.' });
    return;
  }

  markTicketTransferred(ticket.id);

  const newTicketId = `tkt_${crypto.randomBytes(4).toString('hex')}`;
  const checksum = crypto.createHash('sha1').update(`${ticket.eventId}:${newTicketId}:${serverEnv.qrChecksumSalt}`).digest('hex').slice(0, 8);
  const newTicket: IssuedTicket = {
    id: newTicketId,
    orderId: ticket.orderId,
    tierId: ticket.tierId,
    eventId: ticket.eventId,
    holderName: holderName.trim(),
    holderEmail: holderEmail.trim().toLowerCase(),
    qrPayload: `${ticket.eventId}.${newTicketId}.${checksum}`,
    status: 'valid',
    issuedAt: new Date().toISOString(),
    seatNumber: ticket.seatNumber,
  };
  createTicket(newTicket);

  appendAudit({ actor: session.user.id, action: 'ticket.transfer', target: newTicket.id, severity: 'info', note: `${ticket.id} -> ${holderEmail}` });
  res.json({ transferredTicketId: ticket.id, newTicket });
});

export default router;
