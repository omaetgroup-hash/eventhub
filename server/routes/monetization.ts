import crypto from 'node:crypto';
import { Router } from 'express';
import {
  appendAudit,
  claimUpgrade,
  deleteDynamicPricingRule,
  deleteMembershipPlan,
  deleteSponsorPlacement,
  deleteUpgradeOffer,
  evaluateDynamicPricing,
  getEvent,
  getResaleListing,
  getTicket,
  insertResaleListing,
  listDynamicPricingRules,
  listMembershipPlans,
  listResaleListings,
  listSponsorPlacements,
  listUpgradeOffers,
  recordSponsorClick,
  recordSponsorImpression,
  updateResaleStatus,
  upsertDynamicPricingRule,
  upsertMembershipPlan,
  upsertSponsorPlacement,
  upsertUpgradeOffer,
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

// ─── Resale listings ──────────────────────────────────────────────────────────

router.get('/resale', requireSession, requirePermission('analytics:read'), (req, res) => {
  const { eventId } = req.query as Record<string, string | undefined>;
  res.json(listResaleListings(eventId));
});

router.post('/resale', requireSession, (req, res) => {
  const session = (req as AuthRequest).session;
  const body = req.body as { ticketId?: string; askingPrice?: number };
  if (!body.ticketId?.trim() || body.askingPrice == null) {
    res.status(400).json({ error: 'ticketId and askingPrice are required.' });
    return;
  }

  const ticket = getTicket(body.ticketId.trim());
  if (!ticket) { res.status(404).json({ error: 'Ticket not found.' }); return; }
  if (ticket.holderEmail !== session.user.email && session.user.role !== 'super_admin' && session.user.role !== 'organizer') {
    res.status(403).json({ error: 'You do not own this ticket.' });
    return;
  }
  if (!['valid', 'timed_entry'].includes(ticket.status)) {
    res.status(409).json({ error: 'Only valid tickets can be listed for resale.' });
    return;
  }

  const listing = insertResaleListing({
    id: newId('rsl'),
    eventId: ticket.eventId,
    ticketId: ticket.id,
    sellerEmail: session.user.email,
    askingPrice: body.askingPrice,
    faceValue: 0,
    status: 'listed',
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'resale.listed', target: listing.id, severity: 'info', note: `ticket ${ticket.id}` });
  res.status(201).json(listing);
});

router.post('/resale/:id/cancel', requireSession, (req, res) => {
  const session = (req as AuthRequest).session;
  const id = req.params['id'] as string;
  const listing = getResaleListing(id);
  if (!listing) { res.status(404).json({ error: 'Listing not found.' }); return; }
  if (listing.sellerEmail !== session.user.email && session.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Not your listing.' });
    return;
  }
  if (!updateResaleStatus(id, 'cancelled')) { res.status(409).json({ error: 'Listing could not be cancelled.' }); return; }
  appendAudit({ actor: session.user.id, action: 'resale.cancelled', target: id, severity: 'info' });
  res.json({ id, status: 'cancelled' });
});

router.post('/resale/:id/complete', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const id = req.params['id'] as string;
  const listing = getResaleListing(id);
  if (!listing) { res.status(404).json({ error: 'Listing not found.' }); return; }
  updateResaleStatus(id, 'completed');
  appendAudit({ actor: session.user.id, action: 'resale.completed', target: id, severity: 'info' });
  res.json({ id, status: 'completed' });
});

// ─── Upgrade offers ───────────────────────────────────────────────────────────

router.get('/events/:eventId/upgrades', requireSession, requirePermission('events:read'), (req, res) => {
  const eventId = req.params['eventId'] as string;
  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  res.json(listUpgradeOffers(eventId));
});

router.post('/events/:eventId/upgrades', requireSession, requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const eventId = req.params['eventId'] as string;
  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const body = req.body as { name?: string; targetTierId?: string; upgradePrice?: number; inventory?: number };
  if (!body.name?.trim() || !body.targetTierId?.trim() || body.upgradePrice == null) {
    res.status(400).json({ error: 'name, targetTierId, and upgradePrice are required.' });
    return;
  }

  const offer = upsertUpgradeOffer({
    id: newId('upg'),
    eventId,
    name: body.name.trim(),
    targetTierId: body.targetTierId.trim(),
    upgradePrice: body.upgradePrice,
    inventory: body.inventory ?? 50,
    claimed: 0,
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'upgrade.created', target: offer.id, severity: 'info', note: offer.name });
  res.status(201).json(offer);
});

router.post('/events/:eventId/upgrades/:id/claim', requireSession, (req, res) => {
  const session = (req as AuthRequest).session;
  const id = req.params['id'] as string;
  const claimed = claimUpgrade(id);
  if (!claimed) { res.status(409).json({ error: 'Upgrade not available or sold out.' }); return; }
  appendAudit({ actor: session.user.id, action: 'upgrade.claimed', target: id, severity: 'info' });
  res.json({ claimed: true, upgradeId: id });
});

router.delete('/events/:eventId/upgrades/:id', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  if (!deleteUpgradeOffer(req.params['id'] as string)) { res.status(404).json({ error: 'Upgrade offer not found.' }); return; }
  res.status(204).send();
});

// ─── Membership plans ─────────────────────────────────────────────────────────

router.get('/memberships', requireSession, requirePermission('analytics:read'), (_req, res) => {
  res.json(listMembershipPlans());
});

router.post('/memberships', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const body = req.body as { name?: string; price?: number; billingCycle?: string; benefits?: string[] };
  if (!body.name?.trim() || body.price == null) { res.status(400).json({ error: 'name and price are required.' }); return; }

  const plan = upsertMembershipPlan({
    id: newId('memb'),
    name: body.name.trim(),
    price: body.price,
    billingCycle: body.billingCycle ?? 'monthly',
    benefits: body.benefits ?? [],
    activeMembers: 0,
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'membership.created', target: plan.id, severity: 'info', note: plan.name });
  res.status(201).json(plan);
});

router.delete('/memberships/:id', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  if (!deleteMembershipPlan(req.params['id'] as string)) { res.status(404).json({ error: 'Membership plan not found.' }); return; }
  res.status(204).send();
});

// ─── Dynamic pricing rules ────────────────────────────────────────────────────

router.get('/events/:eventId/pricing-rules', requireSession, requirePermission('events:read'), (req, res) => {
  const eventId = req.params['eventId'] as string;
  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  res.json(listDynamicPricingRules(eventId));
});

router.post('/events/:eventId/pricing-rules', requireSession, requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const eventId = req.params['eventId'] as string;
  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const body = req.body as { tierId?: string; trigger?: string; adjustmentType?: string; adjustmentValue?: number };
  if (!body.tierId?.trim() || !body.trigger?.trim() || body.adjustmentValue == null) {
    res.status(400).json({ error: 'tierId, trigger, and adjustmentValue are required.' });
    return;
  }

  const rule = upsertDynamicPricingRule({
    id: newId('dpr'),
    eventId,
    tierId: body.tierId.trim(),
    trigger: body.trigger.trim(),
    adjustmentType: (body.adjustmentType as 'percent' | 'fixed') ?? 'percent',
    adjustmentValue: body.adjustmentValue,
    status: 'active',
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'pricing_rule.created', target: rule.id, severity: 'info' });
  res.status(201).json(rule);
});

router.get('/events/:eventId/pricing-rules/evaluate', requireSession, requirePermission('events:read'), (req, res) => {
  const eventId = req.params['eventId'] as string;
  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  res.json(evaluateDynamicPricing(eventId));
});

router.delete('/events/:eventId/pricing-rules/:id', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  if (!deleteDynamicPricingRule(req.params['id'] as string)) { res.status(404).json({ error: 'Pricing rule not found.' }); return; }
  res.status(204).send();
});

// ─── Sponsor placements ───────────────────────────────────────────────────────

router.get('/sponsor-placements', requireSession, requirePermission('analytics:read'), (req, res) => {
  const { eventId } = req.query as Record<string, string | undefined>;
  res.json(listSponsorPlacements(eventId));
});

router.post('/sponsor-placements', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const body = req.body as { eventId?: string; name?: string; placement?: string; sponsor?: string };
  if (!body.name?.trim() || !body.placement?.trim() || !body.sponsor?.trim()) {
    res.status(400).json({ error: 'name, placement, and sponsor are required.' });
    return;
  }

  const placement = upsertSponsorPlacement({
    id: newId('splc'),
    eventId: body.eventId,
    name: body.name.trim(),
    placement: body.placement.trim(),
    sponsor: body.sponsor.trim(),
    impressions: 0,
    clicks: 0,
    createdAt: nowIso(),
  });
  appendAudit({ actor: session.user.id, action: 'sponsor_placement.created', target: placement.id, severity: 'info', note: placement.sponsor });
  res.status(201).json(placement);
});

router.post('/sponsor-placements/:id/impression', (req, res) => {
  recordSponsorImpression(req.params['id'] as string);
  res.json({ ok: true });
});

router.post('/sponsor-placements/:id/click', (req, res) => {
  recordSponsorClick(req.params['id'] as string);
  res.json({ ok: true });
});

router.delete('/sponsor-placements/:id', requireSession, requireAdmin, requirePermission('events:write'), (req, res) => {
  if (!deleteSponsorPlacement(req.params['id'] as string)) { res.status(404).json({ error: 'Sponsor placement not found.' }); return; }
  res.status(204).send();
});

export default router;
