import { Router } from 'express';
import {
  getAttributionReport,
  getEventPerformanceReport,
  getGateOpsReport,
  getReconciliationReport,
  getRefundReport,
  getRevenueReport,
  getSellThroughReport,
  getTaxReport,
  listAuditEnhanced,
  listEvents,
} from '../db';
import {
  canAccessEvent,
  getAccessibleEventIds,
  requireAdmin,
  requirePermission,
  requireSession,
  type AuthRequest,
} from '../middleware';

const router = Router();

function scopedEventId(session: AuthRequest['session'], eventId?: string): string | undefined {
  if (!eventId) return undefined;
  const event = listEvents({ limit: 1, offset: 0 }).events.find((e) => e.id === eventId);
  if (event && !canAccessEvent(session.user, event)) return '__denied__';
  return eventId;
}

function csv(headers: string[], rows: Record<string, unknown>[]): string {
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

// ─── Revenue ──────────────────────────────────────────────────────────────────

router.get('/revenue', requireSession, requirePermission('analytics:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId, from, to, format } = req.query as Record<string, string | undefined>;
  const eid = scopedEventId(session, eventId);
  if (eid === '__denied__') { res.status(403).json({ error: 'Event access denied.' }); return; }
  const report = getRevenueReport({ eventId: eid, from, to });
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="revenue.csv"');
    res.send(csv(['eventId', 'eventName', 'revenue', 'ticketsSold', 'orders'], report.byEvent.map((r) => ({ eventId: r.eventId, eventName: r.eventName, revenue: r.revenue, ticketsSold: r.ticketsSold, orders: r.orders }))));
    return;
  }
  res.json(report);
});

// ─── Refunds ──────────────────────────────────────────────────────────────────

router.get('/refunds', requireSession, requirePermission('analytics:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId, from, to, format } = req.query as Record<string, string | undefined>;
  const eid = scopedEventId(session, eventId);
  if (eid === '__denied__') { res.status(403).json({ error: 'Event access denied.' }); return; }
  const report = getRefundReport({ eventId: eid, from, to });
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="refunds.csv"');
    res.send(csv(['id', 'eventId', 'eventName', 'buyerEmail', 'total', 'quantity', 'createdAt'], report.orders));
    return;
  }
  res.json(report);
});

// ─── Sell-through ─────────────────────────────────────────────────────────────

router.get('/sell-through', requireSession, requirePermission('analytics:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId, format } = req.query as Record<string, string | undefined>;
  const eid = scopedEventId(session, eventId);
  if (eid === '__denied__') { res.status(403).json({ error: 'Event access denied.' }); return; }
  const rows = getSellThroughReport(eid);
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="sell-through.csv"');
    res.send(csv(['tierId', 'tierName', 'eventName', 'inventory', 'sold', 'sellThroughPct'], rows.map((r) => ({ ...r }))));
    return;
  }
  res.json(rows);
});

// ─── Event performance ────────────────────────────────────────────────────────

router.get('/events/:eventId/performance', requireSession, requirePermission('analytics:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId } = req.params as { eventId: string };
  const event = listEvents({ limit: 1, offset: 0 }).events.find((e) => e.id === eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }
  const report = getEventPerformanceReport(eventId);
  res.json(report);
});

// ─── Gate ops ─────────────────────────────────────────────────────────────────

router.get('/events/:eventId/gate-ops', requireSession, requirePermission('check_in:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId } = req.params as { eventId: string };
  const event = listEvents({ limit: 1, offset: 0 }).events.find((e) => e.id === eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }
  res.json(getGateOpsReport(eventId));
});

// ─── Attribution ──────────────────────────────────────────────────────────────

router.get('/events/:eventId/attribution', requireSession, requirePermission('analytics:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId } = req.params as { eventId: string };
  const event = listEvents({ limit: 1, offset: 0 }).events.find((e) => e.id === eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }
  res.json(getAttributionReport(eventId));
});

// ─── Reconciliation ───────────────────────────────────────────────────────────

router.get('/reconciliation', requireSession, requireAdmin, requirePermission('analytics:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId, format } = req.query as Record<string, string | undefined>;
  const eid = scopedEventId(session, eventId);
  if (eid === '__denied__') { res.status(403).json({ error: 'Event access denied.' }); return; }
  const report = getReconciliationReport(eid);
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="reconciliation.csv"');
    res.send(csv(['orderId', 'eventId', 'total', 'orderStatus', 'paymentId', 'intentId', 'amountCents', 'paymentStatus', 'provider'], report.rows));
    return;
  }
  res.json(report);
});

// ─── Tax ──────────────────────────────────────────────────────────────────────

router.get('/tax', requireSession, requireAdmin, requirePermission('analytics:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId, from, to, taxRate, format } = req.query as Record<string, string | undefined>;
  const eid = scopedEventId(session, eventId);
  if (eid === '__denied__') { res.status(403).json({ error: 'Event access denied.' }); return; }
  const report = getTaxReport({ eventId: eid, from, to, taxRate: taxRate ? Number(taxRate) : undefined });
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="tax.csv"');
    res.send(csv(['eventId', 'eventName', 'gross', 'tax'], report.byEvent));
    return;
  }
  res.json(report);
});

// ─── Audit log with enhanced filters ──────────────────────────────────────────

router.get('/audit', requireSession, requirePermission('audit:read'), (req, res) => {
  const { actor, action, target, severity, from, to, limit, offset } = req.query as Record<string, string | undefined>;
  res.json(listAuditEnhanced({ actor, action, target, severity, from, to, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined }));
});

// ─── Finance export (CSV download) ────────────────────────────────────────────

router.get('/finance-export', requireSession, requireAdmin, requirePermission('analytics:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { kind = 'orders', eventId, from, to } = req.query as Record<string, string | undefined>;
  const eid = scopedEventId(session, eventId);
  if (eid === '__denied__') { res.status(403).json({ error: 'Event access denied.' }); return; }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${kind}-export.csv"`);

  if (kind === 'orders' || kind === 'revenue') {
    const report = getRevenueReport({ eventId: eid, from, to });
    res.send(csv(['eventId', 'eventName', 'revenue', 'ticketsSold', 'orders'], report.byEvent.map((r) => ({ ...r }))));
  } else if (kind === 'refunds') {
    const report = getRefundReport({ eventId: eid, from, to });
    res.send(csv(['id', 'eventId', 'eventName', 'buyerEmail', 'total', 'quantity', 'createdAt'], report.orders));
  } else if (kind === 'tax') {
    const report = getTaxReport({ eventId: eid, from, to });
    res.send(csv(['eventId', 'eventName', 'gross', 'tax'], report.byEvent));
  } else if (kind === 'reconciliation') {
    const report = getReconciliationReport(eid);
    res.send(csv(['orderId', 'eventId', 'total', 'orderStatus', 'paymentId', 'amountCents', 'paymentStatus', 'provider'], report.rows));
  } else {
    res.send('kind,unsupported\n');
  }
});

export default router;
