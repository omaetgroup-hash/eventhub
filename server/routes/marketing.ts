import crypto from 'node:crypto';
import { Router } from 'express';
import type { Campaign, DiscountCampaign, ReferralLink } from '../../src/lib/domain';
import {
  deleteCampaign,
  deleteDiscount,
  deleteReferral,
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
  requirePack,
  requirePermission,
  requireSession,
  type AuthRequest,
} from '../middleware';

const router = Router();

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function canManageEventScopedRecord(session: AuthRequest['session'], eventId?: string) {
  if (!eventId) {
    return session.user.role === 'super_admin';
  }
  const event = getEvent(eventId);
  return Boolean(event && canAccessEvent(session.user, event));
}

router.get('/campaigns', requireSession, requirePack('growth'), requirePermission('marketing:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId } = req.query as { eventId?: string };
  const campaigns = listCampaigns(eventId || undefined).filter((campaign) => canManageEventScopedRecord(session, campaign.eventId));
  res.json(campaigns);
});

router.post('/campaigns', requireSession, requirePack('growth'), requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const body = req.body as Partial<Campaign>;
  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Campaign name is required.' });
    return;
  }
  if (!canManageEventScopedRecord(session, body.eventId)) {
    res.status(403).json({ error: 'Campaign access denied.' });
    return;
  }

  const campaign: Campaign = {
    id: body.id || newId('cmp'),
    eventId: body.eventId,
    name: body.name.trim(),
    channel: body.channel ?? 'email',
    segmentId: body.segmentId,
    status: body.status ?? 'draft',
    subject: body.subject?.trim() ?? '',
    scheduledAt: body.scheduledAt,
    sentCount: body.sentCount ?? 0,
    openRate: body.openRate ?? 0,
    clickRate: body.clickRate ?? 0,
    conversionRate: body.conversionRate ?? 0,
    sourceTag: body.sourceTag ?? '',
    createdAt: body.createdAt ?? nowIso(),
  };

  upsertCampaign(campaign);
  res.status(201).json(campaign);
});

router.patch('/campaigns/:id', requireSession, requirePack('growth'), requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const existing = listCampaigns().find((campaign) => campaign.id === req.params.id as string);
  if (!existing) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  if (!canManageEventScopedRecord(session, existing.eventId)) {
    res.status(403).json({ error: 'Campaign access denied.' });
    return;
  }

  const body = req.body as Partial<Campaign>;
  const nextEventId = body.eventId ?? existing.eventId;
  if (!canManageEventScopedRecord(session, nextEventId)) {
    res.status(403).json({ error: 'Campaign access denied.' });
    return;
  }
  const updated: Campaign = { ...existing, ...body, eventId: nextEventId, id: existing.id, createdAt: existing.createdAt };
  upsertCampaign(updated);
  res.json(updated);
});

router.delete('/campaigns/:id', requireSession, requirePack('growth'), requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const existing = listCampaigns().find((campaign) => campaign.id === req.params.id as string);
  if (!existing) {
    res.status(404).json({ error: 'Campaign not found.' });
    return;
  }
  if (!canManageEventScopedRecord(session, existing.eventId)) {
    res.status(403).json({ error: 'Campaign access denied.' });
    return;
  }

  deleteCampaign(req.params.id as string);
  res.status(204).send();
});

router.get('/discounts', requireSession, requirePack('growth'), requirePermission('marketing:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId } = req.query as { eventId?: string };
  const discounts = listDiscounts(eventId || undefined).filter((discount) => canManageEventScopedRecord(session, discount.eventId));
  res.json(discounts);
});

router.post('/discounts', requireSession, requirePack('growth'), requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const body = req.body as Partial<DiscountCampaign>;
  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Discount name is required.' });
    return;
  }
  if (!body.code?.trim()) {
    res.status(400).json({ error: 'Discount code is required.' });
    return;
  }
  if (!canManageEventScopedRecord(session, body.eventId)) {
    res.status(403).json({ error: 'Discount access denied.' });
    return;
  }

  const discount: DiscountCampaign = {
    id: body.id || newId('disc'),
    eventId: body.eventId ?? '',
    name: body.name.trim(),
    code: body.code.trim().toUpperCase(),
    type: body.type ?? 'percentage',
    amount: body.amount ?? 0,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    redemptions: body.redemptions ?? 0,
    revenueAttributed: body.revenueAttributed ?? 0,
    active: body.active ?? true,
    createdAt: body.createdAt ?? nowIso(),
  };

  upsertDiscount(discount);
  res.status(201).json(discount);
});

router.patch('/discounts/:id', requireSession, requirePack('growth'), requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const existing = listDiscounts().find((discount) => discount.id === req.params.id as string);
  if (!existing) {
    res.status(404).json({ error: 'Discount not found.' });
    return;
  }
  if (!canManageEventScopedRecord(session, existing.eventId)) {
    res.status(403).json({ error: 'Discount access denied.' });
    return;
  }

  const body = req.body as Partial<DiscountCampaign>;
  const nextEventId = body.eventId ?? existing.eventId;
  if (!canManageEventScopedRecord(session, nextEventId)) {
    res.status(403).json({ error: 'Discount access denied.' });
    return;
  }
  const updated: DiscountCampaign = { ...existing, ...body, eventId: nextEventId, id: existing.id, createdAt: existing.createdAt };
  upsertDiscount(updated);
  res.json(updated);
});

router.delete('/discounts/:id', requireSession, requirePack('growth'), requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const existing = listDiscounts().find((discount) => discount.id === req.params.id as string);
  if (!existing) {
    res.status(404).json({ error: 'Discount not found.' });
    return;
  }
  if (!canManageEventScopedRecord(session, existing.eventId)) {
    res.status(403).json({ error: 'Discount access denied.' });
    return;
  }

  deleteDiscount(req.params.id as string);
  res.status(204).send();
});

router.get('/referrals', requireSession, requirePack('growth'), requirePermission('marketing:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId } = req.query as { eventId?: string };
  const referrals = listReferrals(eventId || undefined).filter((referral) => canManageEventScopedRecord(session, referral.eventId));
  res.json(referrals);
});

router.post('/referrals', requireSession, requirePack('growth'), requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const body = req.body as Partial<ReferralLink>;
  if (!body.label?.trim()) {
    res.status(400).json({ error: 'Label is required.' });
    return;
  }
  if (!body.code?.trim()) {
    res.status(400).json({ error: 'Code is required.' });
    return;
  }
  if (!canManageEventScopedRecord(session, body.eventId)) {
    res.status(403).json({ error: 'Referral access denied.' });
    return;
  }

  const referral: ReferralLink = {
    id: body.id || newId('ref'),
    eventId: body.eventId ?? '',
    label: body.label.trim(),
    code: body.code.trim(),
    source: body.source?.trim() ?? '',
    clicks: body.clicks ?? 0,
    conversions: body.conversions ?? 0,
    revenueAttributed: body.revenueAttributed ?? 0,
    createdAt: body.createdAt ?? nowIso(),
  };

  upsertReferral(referral);
  res.status(201).json(referral);
});

router.patch('/referrals/:id', requireSession, requirePack('growth'), requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const existing = listReferrals().find((referral) => referral.id === req.params.id as string);
  if (!existing) {
    res.status(404).json({ error: 'Referral not found.' });
    return;
  }
  if (!canManageEventScopedRecord(session, existing.eventId)) {
    res.status(403).json({ error: 'Referral access denied.' });
    return;
  }

  const body = req.body as Partial<ReferralLink>;
  const nextEventId = body.eventId ?? existing.eventId;
  if (!canManageEventScopedRecord(session, nextEventId)) {
    res.status(403).json({ error: 'Referral access denied.' });
    return;
  }
  const updated: ReferralLink = { ...existing, ...body, eventId: nextEventId, id: existing.id, createdAt: existing.createdAt };
  upsertReferral(updated);
  res.json(updated);
});

router.delete('/referrals/:id', requireSession, requirePack('growth'), requirePermission('marketing:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const existing = listReferrals().find((referral) => referral.id === req.params.id as string);
  if (!existing) {
    res.status(404).json({ error: 'Referral not found.' });
    return;
  }
  if (!canManageEventScopedRecord(session, existing.eventId)) {
    res.status(403).json({ error: 'Referral access denied.' });
    return;
  }

  deleteReferral(req.params.id as string);
  res.status(204).send();
});

export default router;
