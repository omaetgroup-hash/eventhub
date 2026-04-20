import crypto from 'node:crypto';
import { Router } from 'express';
import {
  appendAudit,
  applyDiscountCode,
  computeAudienceSegments,
  deleteCampaign,
  deleteDiscount,
  deleteReferral,
  getAttributionReport,
  getEvent,
  listCampaigns,
  listDiscounts,
  listReferrals,
  upsertCampaign,
  upsertDiscount,
  upsertReferral,
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

// ─── Audience segments ────────────────────────────────────────────────────────

router.get('/audience-segments', requireSession, requirePermission('analytics:read'), (req, res) => {
  const { eventId } = req.query as Record<string, string | undefined>;
  res.json(computeAudienceSegments(eventId));
});

// ─── Attribution / source performance ────────────────────────────────────────

router.get('/events/:eventId/attribution', requireSession, requirePermission('analytics:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const eventId = req.params['eventId'] as string;
  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }
  res.json(getAttributionReport(eventId));
});

// ─── Campaigns ────────────────────────────────────────────────────────────────

router.get('/campaigns', requireSession, requirePermission('marketing:read'), (req, res) => {
  const { eventId } = req.query as Record<string, string | undefined>;
  res.json(listCampaigns(eventId));
});

router.post('/campaigns', requireSession, requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const body = req.body as {
    eventId?: string; name?: string; channel?: 'email' | 'sms'; subject?: string;
    status?: 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused';
    scheduledAt?: string; segmentId?: string; sourceTag?: string;
  };
  if (!body.name?.trim()) { res.status(400).json({ error: 'name is required.' }); return; }

  const campaign = upsertCampaign({
    id: newId('camp'),
    eventId: body.eventId ?? '',
    name: body.name.trim(),
    channel: body.channel ?? 'email',
    subject: body.subject ?? '',
    status: body.status ?? 'draft',
    scheduledAt: body.scheduledAt,
    segmentId: body.segmentId,
    sentCount: 0,
    openRate: 0,
    clickRate: 0,
    conversionRate: 0,
    sourceTag: body.sourceTag ?? '',
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'campaign.created', target: campaign.id, severity: 'info', note: campaign.name });
  res.status(201).json(campaign);
});

router.put('/campaigns/:id', requireSession, requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const id = req.params['id'] as string;
  const existing = listCampaigns().find((c) => c.id === id);
  if (!existing) { res.status(404).json({ error: 'Campaign not found.' }); return; }
  const updated = upsertCampaign({ ...existing, ...req.body, id: existing.id });
  appendAudit({ actor: session.user.id, action: 'campaign.updated', target: updated.id, severity: 'info' });
  res.json(updated);
});

router.delete('/campaigns/:id', requireSession, requireAdmin, requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const id = req.params['id'] as string;
  const deleted = deleteCampaign(id);
  if (!deleted) { res.status(404).json({ error: 'Campaign not found.' }); return; }
  appendAudit({ actor: session.user.id, action: 'campaign.deleted', target: id, severity: 'info' });
  res.status(204).send();
});

// ─── Discount codes ───────────────────────────────────────────────────────────

router.get('/discounts', requireSession, requirePermission('marketing:read'), (req, res) => {
  const { eventId } = req.query as Record<string, string | undefined>;
  res.json(listDiscounts(eventId));
});

router.post('/discounts', requireSession, requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const body = req.body as {
    eventId?: string; name?: string; code?: string;
    type?: 'percentage' | 'fixed' | 'early_bird';
    amount?: number; startsAt?: string; endsAt?: string;
  };
  if (!body.code?.trim() || !body.name?.trim()) { res.status(400).json({ error: 'name and code are required.' }); return; }

  const discount = upsertDiscount({
    id: newId('disc'),
    eventId: body.eventId ?? '',
    name: body.name.trim(),
    code: body.code.trim().toUpperCase(),
    type: body.type ?? 'percentage',
    amount: body.amount ?? 10,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    redemptions: 0,
    revenueAttributed: 0,
    active: true,
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'discount.created', target: discount.id, severity: 'info', note: discount.code });
  res.status(201).json(discount);
});

router.put('/discounts/:id', requireSession, requirePermission('marketing:write'), (req, res) => {
  const id = req.params['id'] as string;
  const existing = listDiscounts().find((d) => d.id === id);
  if (!existing) { res.status(404).json({ error: 'Discount not found.' }); return; }
  res.json(upsertDiscount({ ...existing, ...req.body, id: existing.id }));
});

router.delete('/discounts/:id', requireSession, requireAdmin, requirePermission('marketing:write'), (req, res) => {
  if (!deleteDiscount(req.params['id'] as string)) { res.status(404).json({ error: 'Discount not found.' }); return; }
  res.status(204).send();
});

// ─── Apply discount (public — used at checkout) ───────────────────────────────

router.post('/discounts/apply', (req, res) => {
  const { code, eventId, orderTotal } = req.body as { code?: string; eventId?: string; orderTotal?: number };
  if (!code?.trim() || !eventId?.trim() || orderTotal == null) {
    res.status(400).json({ error: 'code, eventId, and orderTotal are required.' });
    return;
  }
  res.json(applyDiscountCode(code.trim().toUpperCase(), eventId.trim(), orderTotal));
});

// ─── Referral links ───────────────────────────────────────────────────────────

router.get('/referrals', requireSession, requirePermission('marketing:read'), (req, res) => {
  const { eventId } = req.query as Record<string, string | undefined>;
  res.json(listReferrals(eventId));
});

router.post('/referrals', requireSession, requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const body = req.body as { eventId?: string; label?: string; code?: string; source?: string };
  if (!body.label?.trim() || !body.code?.trim()) { res.status(400).json({ error: 'label and code are required.' }); return; }

  const referral = upsertReferral({
    id: newId('ref'),
    eventId: body.eventId ?? '',
    label: body.label.trim(),
    code: body.code.trim(),
    source: body.source ?? 'direct',
    clicks: 0,
    conversions: 0,
    revenueAttributed: 0,
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'referral.created', target: referral.id, severity: 'info', note: referral.code });
  res.status(201).json(referral);
});

router.delete('/referrals/:id', requireSession, requireAdmin, requirePermission('marketing:write'), (req, res) => {
  if (!deleteReferral(req.params['id'] as string)) { res.status(404).json({ error: 'Referral not found.' }); return; }
  res.status(204).send();
});

export default router;
