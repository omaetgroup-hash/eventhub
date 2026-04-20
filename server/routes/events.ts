import crypto from 'node:crypto';
import { Router } from 'express';
import type { EventRecord, TicketTier } from '../../src/lib/domain';
import {
  appendAudit,
  deleteEvent,
  deleteTier,
  getEvent,
  getTier,
  getVenue,
  listEvents,
  listTiers,
  upsertEvent,
  upsertTier,
} from '../db';
import {
  canAccessEvent,
  getAccessibleEventIds,
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

function paginate<T>(items: T[], limit?: number, offset?: number) {
  const safeLimit = limit ?? 50;
  const safeOffset = offset ?? 0;
  return { total: items.length, items: items.slice(safeOffset, safeOffset + safeLimit) };
}

const ALLOWED_STATUS_TRANSITIONS: Record<EventRecord['status'], EventRecord['status'][]> = {
  draft: ['on_sale', 'cancelled'],
  on_sale: ['sold_out', 'live', 'cancelled'],
  sold_out: ['on_sale', 'live', 'cancelled'],
  live: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

function canTransitionEvent(from: EventRecord['status'], to: EventRecord['status']): boolean {
  if (from === to) return true;
  return ALLOWED_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

function validateEventDates(startsAt: string, endsAt: string): string | null {
  if (new Date(startsAt) >= new Date(endsAt)) {
    return 'endsAt must be after startsAt.';
  }
  return null;
}

router.get('/', requireSession, requirePack('standard'), requirePermission('events:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { status, venueId, organizerId, limit, offset } = req.query as Record<string, string | undefined>;
  const result = listEvents({
    status: status || undefined,
    venueId: venueId || undefined,
    organizerId: session.user.role === 'organizer' ? session.user.id : organizerId || undefined,
    limit: 500,
    offset: 0,
  });
  const accessibleEventIds = getAccessibleEventIds(session.user);
  const scopedEvents = accessibleEventIds === null
    ? result.events
    : result.events.filter((event) => accessibleEventIds.includes(event.id));
  const paged = paginate(scopedEvents, limit ? Number(limit) : undefined, offset ? Number(offset) : undefined);
  res.json({ events: paged.items, total: paged.total });
});

router.get('/:id', requireSession, requirePack('standard'), requirePermission('events:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const event = getEvent(req.params.id as string);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }
  res.json({ ...event, tiers: listTiers(event.id) });
});

router.post('/', requireSession, requirePack('standard'), requirePermission('events:write'), (req, res) => {
  const body = req.body as Partial<EventRecord>;
  if (!body.name?.trim()) { res.status(400).json({ error: 'Event name is required.' }); return; }
  if (!body.startsAt) { res.status(400).json({ error: 'startsAt is required.' }); return; }
  if (!body.endsAt) { res.status(400).json({ error: 'endsAt is required.' }); return; }

  const dateError = validateEventDates(body.startsAt, body.endsAt);
  if (dateError) { res.status(400).json({ error: dateError }); return; }

  const session = (req as AuthRequest).session;
  if (!['super_admin', 'organizer'].includes(session.user.role)) {
    res.status(403).json({ error: 'Only organizers can create events.' });
    return;
  }

  if (body.venueId) {
    const venue = getVenue(body.venueId);
    if (!venue) { res.status(400).json({ error: 'Venue not found.' }); return; }
  }

  const event: EventRecord = {
    id: body.id || newId('evt'),
    name: body.name.trim(),
    description: body.description?.trim() ?? '',
    status: body.status ?? 'draft',
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    venueId: body.venueId ?? '',
    organizerId: session.user.role === 'super_admin' ? (body.organizerId ?? session.user.id) : session.user.id,
    category: body.category?.trim() ?? '',
    ticketsSold: 0,
    grossRevenue: 0,
    createdAt: body.createdAt ?? nowIso(),
    imageUrl: body.imageUrl?.trim() || undefined,
  };

  upsertEvent(event);
  appendAudit({ actor: session.user.id, action: 'event.create', target: event.id, severity: 'info', note: event.name });
  res.status(201).json(event);
});

router.patch('/:id', requireSession, requirePack('standard'), requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const existing = getEvent(req.params.id as string);
  if (!existing) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, existing)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const body = req.body as Partial<EventRecord>;
  const nextStartsAt = body.startsAt ?? existing.startsAt;
  const nextEndsAt = body.endsAt ?? existing.endsAt;
  const dateError = validateEventDates(nextStartsAt, nextEndsAt);
  if (dateError) { res.status(400).json({ error: dateError }); return; }

  if (body.venueId && body.venueId !== existing.venueId) {
    const venue = getVenue(body.venueId);
    if (!venue) { res.status(400).json({ error: 'Venue not found.' }); return; }
  }

  const updated: EventRecord = {
    ...existing,
    name: body.name?.trim() ?? existing.name,
    description: body.description?.trim() ?? existing.description,
    status: body.status ?? existing.status,
    startsAt: nextStartsAt,
    endsAt: nextEndsAt,
    venueId: body.venueId ?? existing.venueId,
    organizerId: existing.organizerId,
    category: body.category?.trim() ?? existing.category,
    ticketsSold: existing.ticketsSold,
    grossRevenue: existing.grossRevenue,
    imageUrl: 'imageUrl' in body ? (body.imageUrl?.trim() || undefined) : existing.imageUrl,
  };

  upsertEvent(updated);
  appendAudit({ actor: session.user.id, action: 'event.update', target: updated.id, severity: 'info', note: updated.name });
  res.json(updated);
});

router.post('/:id/status', requireSession, requirePack('standard'), requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const existing = getEvent(req.params.id as string);
  if (!existing) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, existing)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const { status } = req.body as { status?: EventRecord['status'] };
  const validStatuses: EventRecord['status'][] = ['draft', 'on_sale', 'sold_out', 'live', 'completed', 'cancelled'];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    return;
  }

  if (!canTransitionEvent(existing.status, status)) {
    res.status(409).json({ error: `Cannot transition from '${existing.status}' to '${status}'.` });
    return;
  }

  const updated = { ...existing, status };
  upsertEvent(updated);
  appendAudit({ actor: session.user.id, action: 'event.status', target: updated.id, severity: 'info', note: `${existing.status} -> ${status}` });
  res.json(updated);
});

router.post('/:id/clone', requireSession, requirePack('standard'), requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const source = getEvent(req.params.id as string);
  if (!source) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, source)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const body = req.body as Partial<Pick<EventRecord, 'name' | 'startsAt' | 'endsAt' | 'venueId'>>;
  const clonedId = newId('evt');
  const cloned: EventRecord = {
    ...source,
    id: clonedId,
    name: body.name?.trim() ?? `${source.name} (copy)`,
    status: 'draft',
    ticketsSold: 0,
    grossRevenue: 0,
    createdAt: nowIso(),
    startsAt: body.startsAt ?? source.startsAt,
    endsAt: body.endsAt ?? source.endsAt,
    venueId: body.venueId ?? source.venueId,
  };

  if (cloned.startsAt && cloned.endsAt) {
    const dateError = validateEventDates(cloned.startsAt, cloned.endsAt);
    if (dateError) { res.status(400).json({ error: dateError }); return; }
  }

  upsertEvent(cloned);

  const sourceTiers = listTiers(source.id);
  for (const tier of sourceTiers) {
    upsertTier({ ...tier, id: newId('tier'), eventId: clonedId, sold: 0 });
  }

  appendAudit({ actor: session.user.id, action: 'event.clone', target: clonedId, severity: 'info', note: `cloned from ${source.id}` });
  res.status(201).json({ ...cloned, tiers: listTiers(clonedId) });
});

router.delete('/:id', requireSession, requirePack('standard'), requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const existing = getEvent(req.params.id as string);
  if (!existing) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, existing)) { res.status(403).json({ error: 'Event access denied.' }); return; }
  if (existing.status !== 'draft') {
    res.status(409).json({ error: 'Only draft events can be deleted.' });
    return;
  }

  deleteEvent(req.params.id as string);
  appendAudit({ actor: session.user.id, action: 'event.delete', target: req.params.id as string, severity: 'warning', note: existing.name });
  res.status(204).send();
});

router.get('/:id/tiers', requireSession, requirePack('standard'), requirePermission('events:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const event = getEvent(req.params.id as string);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }
  res.json(listTiers(event.id));
});

router.post('/:id/tiers', requireSession, requirePack('standard'), requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const event = getEvent(req.params.id as string);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const body = req.body as Partial<TicketTier>;
  if (!body.name?.trim()) { res.status(400).json({ error: 'Tier name is required.' }); return; }
  if (typeof body.price !== 'number' || body.price < 0) { res.status(400).json({ error: 'price must be a non-negative number.' }); return; }
  if (typeof body.inventory !== 'number' || body.inventory < 0) { res.status(400).json({ error: 'inventory must be a non-negative number.' }); return; }

  if (event.venueId) {
    const venue = getVenue(event.venueId);
    if (venue && venue.capacity > 0) {
      const existingTiers = listTiers(event.id);
      const currentTotal = existingTiers.reduce((sum, t) => sum + t.inventory, 0);
      if (currentTotal + body.inventory > venue.capacity) {
        res.status(409).json({ error: `Total tier inventory (${currentTotal + body.inventory}) would exceed venue capacity (${venue.capacity}).` });
        return;
      }
    }
  }

  const tier: TicketTier = {
    id: body.id || newId('tier'),
    eventId: event.id,
    name: body.name.trim(),
    kind: body.kind ?? 'general_admission',
    price: body.price,
    inventory: body.inventory,
    sold: 0,
    description: body.description?.trim() ?? '',
    saleStartsAt: body.saleStartsAt,
    saleEndsAt: body.saleEndsAt,
  };

  upsertTier(tier);
  appendAudit({ actor: session.user.id, action: 'tier.create', target: tier.id, severity: 'info', note: `${tier.name} for event ${event.id}` });
  res.status(201).json(tier);
});

router.patch('/:id/tiers/:tierId', requireSession, requirePack('standard'), requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const event = getEvent(req.params.id as string);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const tier = getTier(req.params.tierId as string);
  if (!tier || tier.eventId !== (req.params.id as string)) { res.status(404).json({ error: 'Tier not found.' }); return; }

  const body = req.body as Partial<TicketTier>;
  const nextInventory = body.inventory ?? tier.inventory;
  if (nextInventory < tier.sold) {
    res.status(409).json({ error: 'Inventory cannot be less than tickets already sold.' });
    return;
  }

  if (body.inventory !== undefined && event.venueId) {
    const venue = getVenue(event.venueId);
    if (venue && venue.capacity > 0) {
      const allTiers = listTiers(event.id);
      const otherTotal = allTiers.filter((t) => t.id !== tier.id).reduce((sum, t) => sum + t.inventory, 0);
      if (otherTotal + nextInventory > venue.capacity) {
        res.status(409).json({ error: `Total tier inventory (${otherTotal + nextInventory}) would exceed venue capacity (${venue.capacity}).` });
        return;
      }
    }
  }

  const updated: TicketTier = {
    ...tier,
    name: body.name?.trim() ?? tier.name,
    kind: body.kind ?? tier.kind,
    price: body.price ?? tier.price,
    inventory: nextInventory,
    sold: tier.sold,
    description: body.description?.trim() ?? tier.description,
    saleStartsAt: body.saleStartsAt ?? tier.saleStartsAt,
    saleEndsAt: body.saleEndsAt ?? tier.saleEndsAt,
  };

  upsertTier(updated);
  appendAudit({ actor: session.user.id, action: 'tier.update', target: updated.id, severity: 'info', note: updated.name });
  res.json(updated);
});

router.delete('/:id/tiers/:tierId', requireSession, requirePack('standard'), requirePermission('events:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const event = getEvent(req.params.id as string);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const tier = getTier(req.params.tierId as string);
  if (!tier || tier.eventId !== (req.params.id as string)) { res.status(404).json({ error: 'Tier not found.' }); return; }
  if (tier.sold > 0) { res.status(409).json({ error: 'Cannot delete a tier with tickets sold.' }); return; }

  deleteTier(req.params.tierId as string);
  appendAudit({ actor: session.user.id, action: 'tier.delete', target: tier.id, severity: 'warning', note: tier.name });
  res.status(204).send();
});

export default router;
