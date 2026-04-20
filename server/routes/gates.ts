import crypto from 'node:crypto';
import { Router } from 'express';
import type { CheckInScan } from '../../src/lib/domain';
import {
  appendAudit,
  checkAccessRule,
  completeReEntry,
  deleteAccessRule,
  getActiveReEntryRecord,
  getDevice,
  getEvent,
  getGateStats,
  getTier,
  getTicketByQrPayload,
  heartbeatDevice,
  listAccessRules,
  listDevices,
  listReEntryRecords,
  recordScan,
  registerDevice,
  updateTicketStatus,
  upsertAccessRule,
} from '../db';
import {
  canAccessEvent,
  requirePermission,
  requirePack,
  requireSession,
  type AuthRequest,
} from '../middleware';
import { serverEnv } from '../env';

const router = Router();

function nowIso() { return new Date().toISOString(); }
function newId(prefix: string) { return `${prefix}_${crypto.randomBytes(4).toString('hex')}`; }
function pinHash(pin: string) {
  return crypto.createHmac('sha256', serverEnv.qrChecksumSalt).update(pin).digest('hex');
}
function validateQrChecksum(payload: string): { eventId: string; ticketId: string } | null {
  const parts = payload.split('.');
  if (parts.length !== 3) return null;
  const [eventId, ticketId, checksum] = parts;
  const expected = crypto.createHash('sha1').update(`${eventId}:${ticketId}:${serverEnv.qrChecksumSalt}`).digest('hex').slice(0, 8);
  if (checksum !== expected) return null;
  return { eventId, ticketId };
}

// ─── Device registration and heartbeat ───────────────────────────────────────

router.post('/devices', requireSession, requirePack('operations'), requirePermission('check_in:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { name, gate, eventId, pin } = req.body as { name?: string; gate?: string; eventId?: string; pin?: string };
  if (!name?.trim() || !gate?.trim() || !eventId?.trim() || !pin?.trim()) {
    res.status(400).json({ error: 'name, gate, eventId, and pin are required.' });
    return;
  }
  const event = getEvent(eventId.trim());
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const id = newId('dev');
  const device = registerDevice({ id, name: name.trim(), gate: gate.trim(), eventId: eventId.trim(), operatorId: session.user.id, pinHash: pinHash(pin.trim()) });
  appendAudit({ actor: session.user.id, action: 'device.registered', target: id, severity: 'info', note: `${name} @ ${gate}` });
  res.status(201).json({ ...device, pinHash: undefined, deviceId: device.id });
});

router.post('/devices/:id/heartbeat', (req, res) => {
  const { pendingScans } = req.body as { pendingScans?: number };
  const device = heartbeatDevice(req.params.id, pendingScans ?? 0);
  if (!device) { res.status(404).json({ error: 'Device not found.' }); return; }
  res.json({ deviceId: device.id, status: device.status, lastSeen: device.lastSeen });
});

router.get('/devices', requireSession, requirePack('operations'), requirePermission('check_in:read'), (req, res) => {
  const { eventId } = req.query as { eventId?: string };
  res.json(listDevices(eventId || undefined).map((d) => ({ ...d, pinHash: undefined })));
});

router.get('/devices/:id', requireSession, requirePack('operations'), requirePermission('check_in:read'), (req, res) => {
  const device = getDevice(req.params['id'] as string);
  if (!device) { res.status(404).json({ error: 'Device not found.' }); return; }
  res.json({ ...device, pinHash: undefined });
});

// ─── Kiosk scan (pin-auth, no Bearer token) ───────────────────────────────────

router.post('/kiosk-scan', (req, res) => {
  const { deviceId, pin, qrPayload, eventId, gate } = req.body as {
    deviceId?: string; pin?: string; qrPayload?: string; eventId?: string; gate?: string;
  };

  if (!deviceId?.trim() || !pin?.trim() || !qrPayload?.trim()) {
    res.status(400).json({ error: 'deviceId, pin, and qrPayload are required.' });
    return;
  }

  const device = getDevice(deviceId.trim());
  if (!device || device.pinHash !== pinHash(pin.trim())) {
    res.status(401).json({ error: 'Invalid device credentials.' });
    return;
  }

  heartbeatDevice(device.id, 0);

  const effectiveGate = gate?.trim() || device.gate;
  const effectiveEventId = eventId?.trim() || device.eventId;
  const scannedAt = nowIso();
  const scanId = newId('scan');

  const { id: deviceId_, operatorId: deviceOperatorId } = device;
  function deny(denyReason: CheckInScan['denyReason'], message: string) {
    recordScan({ id: scanId, ticketId: 'unknown', eventId: effectiveEventId, gate: effectiveGate, deviceId: deviceId_, scannedAt, result: 'denied', operatorId: deviceOperatorId, denyReason });
    return res.json({ result: 'denied', denyReason, message, scanId, scannedAt });
  }

  const parsed = validateQrChecksum(qrPayload.trim());
  if (!parsed) { deny('not_found', 'Invalid QR code.'); return; }

  const ticket = getTicketByQrPayload(qrPayload.trim());
  if (!ticket) { deny('not_found', 'Ticket not found.'); return; }
  if (ticket.eventId !== effectiveEventId) { deny('wrong_gate', 'Ticket is for a different event.'); return; }

  const tier = getTier(ticket.tierId);

  if (tier) {
    const ruleCheck = checkAccessRule(ticket.eventId, effectiveGate, ticket.tierId, tier.kind);
    if (!ruleCheck.allowed) {
      recordScan({ id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: effectiveGate, deviceId: device.id, scannedAt, result: 'denied', operatorId: device.operatorId, denyReason: 'tier_not_allowed' });
      return res.json({ result: 'denied', denyReason: 'tier_not_allowed', message: 'reason' in ruleCheck ? ruleCheck.reason : 'Ticket tier is not allowed at this gate.', ticketId: ticket.id, holderName: ticket.holderName, scanId, scannedAt });
    }
  }

  if (['cancelled', 'refunded'].includes(ticket.status)) {
    recordScan({ id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: effectiveGate, deviceId: device.id, scannedAt, result: 'denied', operatorId: device.operatorId, denyReason: 'cancelled_ticket' });
    return res.json({ result: 'denied', denyReason: 'cancelled_ticket', message: `Ticket has been ${ticket.status}.`, ticketId: ticket.id, holderName: ticket.holderName, scanId, scannedAt });
  }

  if (ticket.status === 'transferred') {
    recordScan({ id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: effectiveGate, deviceId: device.id, scannedAt, result: 'denied', operatorId: device.operatorId, denyReason: 'cancelled_ticket' });
    return res.json({ result: 'denied', denyReason: 'cancelled_ticket', message: 'Ticket has been transferred. New holder must present their ticket.', ticketId: ticket.id, holderName: ticket.holderName, scanId, scannedAt });
  }

  if (ticket.status === 'used') {
    const exitRecord = getActiveReEntryRecord(ticket.id);
    if (exitRecord) {
      completeReEntry(exitRecord.id);
      recordScan({ id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: effectiveGate, deviceId: device.id, scannedAt, result: 'admitted', operatorId: device.operatorId });
      const event = getEvent(ticket.eventId);
      return res.json({ result: 'admitted', reEntry: true, ticketId: ticket.id, holderName: ticket.holderName, tier: tier?.name, eventName: event?.name, badge: { name: ticket.holderName, tier: tier?.name ?? '', kind: tier?.kind ?? '', seat: ticket.seatNumber ?? '', eventName: event?.name ?? '' }, scanId, scannedAt });
    }
    recordScan({ id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: effectiveGate, deviceId: device.id, scannedAt, result: 'duplicate', operatorId: device.operatorId, denyReason: 'already_used' });
    return res.json({ result: 'duplicate', denyReason: 'already_used', message: `Already scanned at ${ticket.scannedGate ?? 'unknown gate'}.`, ticketId: ticket.id, holderName: ticket.holderName, scanId, scannedAt });
  }

  updateTicketStatus(ticket.id, 'used', scannedAt, effectiveGate);
  recordScan({ id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: effectiveGate, deviceId: device.id, scannedAt, result: 'admitted', operatorId: device.operatorId });
  const event = getEvent(ticket.eventId);
  res.json({ result: 'admitted', reEntry: false, ticketId: ticket.id, holderName: ticket.holderName, tier: tier?.name, eventName: event?.name, badge: { name: ticket.holderName, tier: tier?.name ?? '', kind: tier?.kind ?? '', seat: ticket.seatNumber ?? '', eventName: event?.name ?? '' }, scanId, scannedAt });
});

// ─── Gate status (checkpoint health) ──────────────────────────────────────────

router.get('/status', requireSession, requirePack('operations'), requirePermission('check_in:read'), (req, res) => {
  const { eventId } = req.query as { eventId?: string };
  if (!eventId) { res.status(400).json({ error: 'eventId is required.' }); return; }
  const gates = getGateStats(eventId);
  const reEntries = listReEntryRecords(eventId);
  const pendingReEntry = reEntries.filter((r) => !r.readmittedAt).length;
  res.json({ gates, pendingReEntry, updatedAt: nowIso() });
});

// ─── Access rules ─────────────────────────────────────────────────────────────

router.get('/:eventId/access-rules', requireSession, requirePack('operations'), requirePermission('check_in:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const eventId = req.params['eventId'] as string;
  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }
  res.json(listAccessRules(eventId));
});

router.post('/:eventId/access-rules', requireSession, requirePack('operations'), requirePermission('check_in:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const eventId = req.params['eventId'] as string;
  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }

  const { gate, label, allowedTierIds, allowedKinds, requiresAccreditation, notes } = req.body as {
    gate?: string; label?: string; allowedTierIds?: string[]; allowedKinds?: string[]; requiresAccreditation?: boolean; notes?: string;
  };
  if (!gate?.trim()) { res.status(400).json({ error: 'gate is required.' }); return; }

  const rule = upsertAccessRule({ id: newId('rule'), eventId, gate: gate.trim(), label: label?.trim() ?? '', allowedTierIds: allowedTierIds ?? [], allowedKinds: allowedKinds ?? [], requiresAccreditation: Boolean(requiresAccreditation), notes: notes?.trim() ?? '', createdAt: nowIso() });
  appendAudit({ actor: session.user.id, action: 'access_rule.created', target: rule.id, severity: 'info', note: `${gate} - ${label}` });
  res.status(201).json(rule);
});

router.delete('/:eventId/access-rules/:ruleId', requireSession, requirePack('operations'), requirePermission('check_in:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const eventId = req.params['eventId'] as string;
  const event = getEvent(eventId);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!canAccessEvent(session.user, event)) { res.status(403).json({ error: 'Event access denied.' }); return; }
  const ruleId = req.params['ruleId'] as string;
  const deleted = deleteAccessRule(ruleId);
  if (!deleted) { res.status(404).json({ error: 'Access rule not found.' }); return; }
  appendAudit({ actor: session.user.id, action: 'access_rule.deleted', target: ruleId, severity: 'info' });
  res.status(204).send();
});

export default router;
