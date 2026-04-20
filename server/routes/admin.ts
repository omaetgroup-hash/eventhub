import { Router } from 'express';
import {
  appendAudit,
  clearAuthAttemptsForEmail,
  deleteSessionsForUser,
  getUserById,
  listAbuseEvents,
  listAllUsers,
  listEmailLogs,
  listFraudFlags,
  resolveAbuseEvent,
  resolveFraudFlag,
} from '../db';
import { runBackup } from '../backup';
import {
  requireAdmin,
  requirePermission,
  requireSession,
  requireSuperAdmin,
  type AuthRequest,
} from '../middleware';

const router = Router();

// ─── Fraud flags ──────────────────────────────────────────────────────────────

router.get('/fraud-flags', requireSession, requireAdmin, requirePermission('audit:read'), (req, res) => {
  const { eventId, resolved } = req.query as { eventId?: string; resolved?: string };
  const flags = listFraudFlags({
    eventId: eventId || undefined,
    resolved: resolved !== undefined ? resolved === 'true' : undefined,
  });
  res.json({ flags, total: flags.length });
});

router.post('/fraud-flags/:id/resolve', requireSession, requireAdmin, requirePermission('audit:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const resolved = resolveFraudFlag(req.params['id'] as string, session.user.id);
  if (!resolved) { res.status(404).json({ error: 'Fraud flag not found.' }); return; }
  appendAudit({ actor: session.user.id, action: 'fraud_flag.resolved', target: req.params['id'] as string, severity: 'info' });
  res.json({ status: 'resolved' });
});

// ─── Abuse events ─────────────────────────────────────────────────────────────

router.get('/abuse-events', requireSession, requireAdmin, requirePermission('audit:read'), (req, res) => {
  const { eventId, resolved } = req.query as { eventId?: string; resolved?: string };
  const events = listAbuseEvents({
    eventId: eventId || undefined,
    resolved: resolved !== undefined ? resolved === 'true' : undefined,
  });
  res.json({ events, total: events.length });
});

router.post('/abuse-events/:id/resolve', requireSession, requireAdmin, requirePermission('audit:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const resolved = resolveAbuseEvent(req.params['id'] as string);
  if (!resolved) { res.status(404).json({ error: 'Abuse event not found.' }); return; }
  appendAudit({ actor: session.user.id, action: 'abuse_event.resolved', target: req.params['id'] as string, severity: 'info' });
  res.json({ status: 'resolved' });
});

// ─── Ops ───────────────────────────────────────────────────────────────────────

router.post('/ops/backup', requireSession, requireSuperAdmin, async (req, res) => {
  const session = (req as AuthRequest).session;
  const dest = await runBackup();
  appendAudit({ actor: session.user.id, action: 'ops.backup_created', target: dest, severity: 'warning' });
  res.status(201).json({ status: 'created', destination: dest });
});

router.get('/ops/email-logs', requireSession, requireAdmin, requirePermission('audit:read'), (req, res) => {
  const orderId = typeof req.query['orderId'] === 'string' ? req.query['orderId'] : undefined;
  const logs = listEmailLogs(orderId);
  res.json({ logs, total: logs.length });
});

// ─── User recovery ────────────────────────────────────────────────────────────

router.get('/users', requireSession, requireSuperAdmin, (_req, res) => {
  const users = listAllUsers();
  res.json({ users, total: users.length });
});

router.post('/users/:userId/unlock', requireSession, requireSuperAdmin, (req, res) => {
  const session = (req as AuthRequest).session;
  const user = getUserById(req.params['userId'] as string);
  if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
  clearAuthAttemptsForEmail(user.email);
  appendAudit({ actor: session.user.id, action: 'admin.user_unlocked', target: user.email, severity: 'warning' });
  res.json({ status: 'unlocked', email: user.email });
});

router.post('/users/:userId/revoke-sessions', requireSession, requireSuperAdmin, (req, res) => {
  const session = (req as AuthRequest).session;
  const user = getUserById(req.params['userId'] as string);
  if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
  deleteSessionsForUser(user.id);
  appendAudit({ actor: session.user.id, action: 'admin.sessions_revoked', target: user.email, severity: 'warning' });
  res.json({ status: 'revoked', email: user.email });
});

export default router;
