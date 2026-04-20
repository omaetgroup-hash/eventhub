import crypto from 'node:crypto';
import { Router } from 'express';
import {
  admitQueueToken,
  appendAudit,
  expireQueueEntries,
  getAvailableInventoryDb,
  getEvent,
  getQueueEntry,
  getQueueEntryByToken,
  getQueueStats,
  insertAbuseEvent,
  isQueueActive,
  joinQueue,
  listTiers,
  releaseQueueBatch,
} from '../db';
import {
  canAccessEvent,
  requireAdmin,
  requirePermission,
  requireSession,
  type AuthRequest,
} from '../middleware';

const router = Router();

function nowIso() { return new Date().toISOString(); }
function newId(prefix: string) { return `${prefix}_${crypto.randomBytes(4).toString('hex')}`; }

function ipHash(req: import('express').Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0]!.trim() : (req.ip ?? '127.0.0.1');
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

// ─── Public: join queue ───────────────────────────────────────────────────────

router.post('/:eventId/join', (req, res) => {
  const { eventId } = req.params as { eventId: string };
  const { sessionId, buyerEmail, presaleCode } = req.body as { sessionId?: string; buyerEmail?: string; presaleCode?: string };

  if (!sessionId?.trim()) { res.status(400).json({ error: 'sessionId is required.' }); return; }

  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!['on_sale', 'sold_out'].includes(event.status)) {
    res.status(409).json({ error: `Event is not accepting queue entries (status: ${event.status}).` });
    return;
  }

  // Priority: presale codes get priority = 1 (front of queue relative to standard)
  const priority = presaleCode?.trim() ? 1 : 0;

  const entry = joinQueue(eventId, sessionId.trim(), buyerEmail?.trim().toLowerCase() ?? '', 30, priority);

  // Check for suspicious rapid join attempts
  const hash = ipHash(req);
  const rapidAttempts = req.headers['x-rapid-join'];
  if (rapidAttempts) {
    insertAbuseEvent({ id: newId('abuse'), eventId, pattern: 'rapid_attempts', ipHash: hash, sessionCount: 1, action: 'logged' });
  }

  res.json({ queueId: entry.id, position: entry.position, priority: entry.priority, status: entry.status, estimatedWaitMins: Math.ceil(entry.position * 0.5), joinedAt: entry.joinedAt, expiresAt: entry.expiresAt });
});

// ─── Public: check queue position ────────────────────────────────────────────

router.get('/:eventId/status', (req, res) => {
  const { eventId } = req.params as { eventId: string };
  const { sessionId } = req.query as { sessionId?: string };

  if (!sessionId?.trim()) { res.status(400).json({ error: 'sessionId is required.' }); return; }

  const entry = getQueueEntry(eventId, sessionId.trim());
  if (!entry) {
    res.status(404).json({ error: 'Not in queue for this event.', active: isQueueActive(eventId) });
    return;
  }

  const stats = getQueueStats(eventId);
  const aheadInQueue = Math.max(0, entry.position - stats.nextPosition);
  res.json({ queueId: entry.id, position: entry.position, aheadInQueue, status: entry.status, queueToken: entry.status === 'releasing' ? entry.queueToken : undefined, estimatedWaitMins: Math.ceil(aheadInQueue * 0.5), expiresAt: entry.expiresAt });
});

// ─── Public: validate queue token before checkout ─────────────────────────────

router.get('/token/:token', (req, res) => {
  const entry = getQueueEntryByToken(req.params.token);
  if (!entry) { res.status(404).json({ error: 'Queue token not found or expired.' }); return; }
  res.json({ valid: true, eventId: entry.eventId, expiresAt: entry.expiresAt });
});

// ─── Admin: get queue stats ───────────────────────────────────────────────────

router.get('/:eventId/stats', requireSession, requirePermission('events:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const eventId = req.params['eventId'] as string;
  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const stats = getQueueStats(eventId);
  const tiers = listTiers(eventId);
  const inventory = tiers.map((t) => ({ tierId: t.id, name: t.name, available: getAvailableInventoryDb(t.id), total: t.inventory, sold: t.sold }));
  res.json({ ...stats, inventory, updatedAt: nowIso() });
});

// ─── Admin: release wave ──────────────────────────────────────────────────────

router.post('/:eventId/release', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const eventId = req.params['eventId'] as string;
  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const { count = 50, tokenTtlMinutes = 15 } = req.body as { count?: number; tokenTtlMinutes?: number };
  if (count < 1 || count > 1000) { res.status(400).json({ error: 'count must be 1–1000.' }); return; }

  const released = releaseQueueBatch(eventId, count, tokenTtlMinutes);
  appendAudit({ actor: session.user.id, action: 'queue.wave_released', target: eventId, severity: 'info', note: `${released.length} entries released` });
  res.json({ released: released.length, tokenTtlMinutes, updatedAt: nowIso() });
});

// ─── Admin: expire stale entries ──────────────────────────────────────────────

router.post('/:eventId/expire', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const eventId = req.params['eventId'] as string;
  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const expired = expireQueueEntries(eventId);
  appendAudit({ actor: session.user.id, action: 'queue.expired', target: eventId, severity: 'info', note: `${expired} entries expired` });
  res.json({ expired, updatedAt: nowIso() });
});

export default router;
