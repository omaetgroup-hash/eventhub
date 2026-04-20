import crypto from 'node:crypto';
import { Router } from 'express';
import type { Venue } from '../../src/lib/domain';
import { appendAudit, deleteVenue, getVenue, listEvents, listVenues, upsertVenue } from '../db';
import {
  canAccessVenue,
  getAccessibleVenueIds,
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

router.get('/', requireSession, requirePack('standard'), requirePermission('venues:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const accessibleVenueIds = getAccessibleVenueIds(session.user);
  const venues = listVenues();
  res.json(
    accessibleVenueIds === null
      ? venues
      : venues.filter((venue) => accessibleVenueIds.includes(venue.id)),
  );
});

router.get('/:id', requireSession, requirePack('standard'), requirePermission('venues:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const venue = getVenue(req.params.id as string);
  if (!venue) {
    res.status(404).json({ error: 'Venue not found.' });
    return;
  }
  if (!canAccessVenue(session.user, venue)) {
    res.status(403).json({ error: 'Venue access denied.' });
    return;
  }
  res.json(venue);
});

router.post('/', requireSession, requirePack('standard'), requirePermission('venues:write'), (req, res) => {
  const body = req.body as Partial<Venue>;
  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Venue name is required.' });
    return;
  }
  if (!body.address?.trim()) {
    res.status(400).json({ error: 'Address is required.' });
    return;
  }

  const session = (req as AuthRequest).session;
  if (!['super_admin', 'venue_manager'].includes(session.user.role)) {
    res.status(403).json({ error: 'Only venue managers can create venues.' });
    return;
  }

  const venue: Venue = {
    id: body.id || newId('ven'),
    name: body.name.trim(),
    address: body.address.trim(),
    city: body.city?.trim() ?? '',
    country: body.country?.trim() ?? 'NZ',
    capacity: body.capacity ?? 0,
    zones: body.zones ?? [],
    managerId: session.user.role === 'super_admin' ? (body.managerId ?? session.user.id) : session.user.id,
    manager: session.user.role === 'super_admin' ? (body.manager?.trim() ?? session.user.name) : session.user.name,
    createdAt: body.createdAt ?? nowIso(),
  };

  upsertVenue(venue);
  appendAudit({ actor: session.user.id, action: 'venue.create', target: venue.id, severity: 'info', note: venue.name });
  res.status(201).json(venue);
});

router.patch('/:id', requireSession, requirePack('standard'), requirePermission('venues:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const existing = getVenue(req.params.id as string);
  if (!existing) {
    res.status(404).json({ error: 'Venue not found.' });
    return;
  }
  if (!canAccessVenue(session.user, existing)) {
    res.status(403).json({ error: 'Venue access denied.' });
    return;
  }

  const body = req.body as Partial<Venue>;
  const updated: Venue = {
    ...existing,
    name: body.name?.trim() ?? existing.name,
    address: body.address?.trim() ?? existing.address,
    city: body.city?.trim() ?? existing.city,
    country: body.country?.trim() ?? existing.country,
    capacity: body.capacity ?? existing.capacity,
    zones: body.zones ?? existing.zones,
    managerId: session.user.role === 'super_admin' ? (body.managerId ?? existing.managerId) : existing.managerId,
    manager: session.user.role === 'super_admin' ? (body.manager?.trim() ?? existing.manager) : existing.manager,
  };

  upsertVenue(updated);
  appendAudit({ actor: session.user.id, action: 'venue.update', target: updated.id, severity: 'info', note: updated.name });
  res.json(updated);
});

router.delete('/:id', requireSession, requirePack('standard'), requirePermission('venues:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const existing = getVenue(req.params.id as string);
  if (!existing) {
    res.status(404).json({ error: 'Venue not found.' });
    return;
  }
  if (!canAccessVenue(session.user, existing)) {
    res.status(403).json({ error: 'Venue access denied.' });
    return;
  }

  const { events } = listEvents({ venueId: req.params.id as string, limit: 1, offset: 0 });
  if (events.length > 0) {
    res.status(409).json({ error: 'Cannot delete a venue that has events. Remove or reassign the events first.' });
    return;
  }

  deleteVenue(req.params.id as string);
  appendAudit({ actor: session.user.id, action: 'venue.delete', target: req.params.id as string, severity: 'warning', note: existing.name });
  res.status(204).send();
});

export default router;
