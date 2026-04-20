import crypto from 'node:crypto';
import { Router } from 'express';
import type { CheckInScan, IssuedTicket } from '../../src/lib/domain';
import {
  appendAudit,
  checkAccessRule,
  completeReEntry,
  createReEntryRecord,
  createTicket,
  getActiveReEntryRecord,
  getEvent,
  getTier,
  getTicket,
  getTicketByQrPayload,
  listScans,
  listTickets,
  recordScan,
  updateTicketStatus,
} from '../db';
import {
  canAccessEvent,
  getAccessibleEventIds,
  getAssignedGates,
  requirePack,
  requirePermission,
  requireSession,
  type AuthRequest,
} from '../middleware';
import { serverEnv } from '../env';

const router = Router();

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function generateQrPayload(eventId: string, ticketId: string): string {
  const checksum = crypto.createHash('sha1').update(`${eventId}:${ticketId}:${serverEnv.qrChecksumSalt}`).digest('hex').slice(0, 8);
  return `${eventId}.${ticketId}.${checksum}`;
}

function validateQrChecksum(payload: string): { eventId: string; ticketId: string } | null {
  const parts = payload.split('.');
  if (parts.length !== 3) return null;
  const [eventId, ticketId, checksum] = parts;
  const expected = crypto.createHash('sha1').update(`${eventId}:${ticketId}:${serverEnv.qrChecksumSalt}`).digest('hex').slice(0, 8);
  if (checksum !== expected) return null;
  return { eventId, ticketId };
}

function canOperateEvent(session: AuthRequest['session'], eventId?: string) {
  if (!eventId) return false;
  const event = getEvent(eventId);
  return Boolean(event && canAccessEvent(session.user, event));
}

router.get('/', requireSession, requirePack('standard'), requirePermission('tickets:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { orderId, eventId, holderEmail, status, limit, offset } = req.query as Record<string, string | undefined>;
  const result = listTickets({
    orderId: orderId || undefined,
    eventId: eventId || undefined,
    holderEmail: holderEmail || undefined,
    status: status || undefined,
    limit: 500,
    offset: 0,
  });
  const accessibleEventIds = getAccessibleEventIds(session.user);
  const scopedTickets = accessibleEventIds === null
    ? result.tickets
    : result.tickets.filter((ticket) => accessibleEventIds.includes(ticket.eventId));
  const safeLimit = limit ? Number(limit) : undefined;
  const safeOffset = offset ? Number(offset) : 0;
  const items = safeLimit === undefined ? scopedTickets.slice(safeOffset) : scopedTickets.slice(safeOffset, safeOffset + safeLimit);
  res.json({ tickets: items, total: scopedTickets.length });
});

router.get('/:id', requireSession, requirePack('standard'), requirePermission('tickets:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const ticket = getTicket(req.params.id as string);
  if (!ticket) { res.status(404).json({ error: 'Ticket not found.' }); return; }
  const accessibleEventIds = getAccessibleEventIds(session.user);
  if (accessibleEventIds !== null && !accessibleEventIds.includes(ticket.eventId)) {
    res.status(403).json({ error: 'Ticket access denied.' });
    return;
  }
  res.json(ticket);
});

router.post('/:id/revoke', requireSession, requirePack('standard'), requirePermission('tickets:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  if (!['super_admin', 'organizer'].includes(session.user.role)) {
    res.status(403).json({ error: 'Only organizers and admins can revoke tickets.' });
    return;
  }
  const ticket = getTicket(req.params.id as string);
  if (!ticket) { res.status(404).json({ error: 'Ticket not found.' }); return; }
  if (!canOperateEvent(session, ticket.eventId)) { res.status(403).json({ error: 'Event access denied.' }); return; }
  if (!['valid', 'transferred'].includes(ticket.status)) {
    res.status(409).json({ error: `Cannot revoke a ticket with status '${ticket.status}'.` });
    return;
  }

  const { reason } = req.body as { reason?: string };
  const updated = updateTicketStatus(ticket.id, 'cancelled');
  appendAudit({ actor: session.user.id, action: 'ticket.revoke', target: ticket.id, severity: 'warning', note: reason ?? '' });
  res.json(updated);
});

router.post('/:id/reissue', requireSession, requirePack('standard'), requirePermission('tickets:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  if (!['super_admin', 'organizer'].includes(session.user.role)) {
    res.status(403).json({ error: 'Only organizers and admins can reissue tickets.' });
    return;
  }
  const ticket = getTicket(req.params.id as string);
  if (!ticket) { res.status(404).json({ error: 'Ticket not found.' }); return; }
  if (!canOperateEvent(session, ticket.eventId)) { res.status(403).json({ error: 'Event access denied.' }); return; }
  if (ticket.status !== 'valid') {
    res.status(409).json({ error: `Cannot reissue a ticket with status '${ticket.status}'.` });
    return;
  }

  const newTicketId = newId('tkt');
  const newPayload = generateQrPayload(ticket.eventId, newTicketId);
  const issuedAt = nowIso();

  updateTicketStatus(ticket.id, 'cancelled');

  const newTicket: IssuedTicket = {
    id: newTicketId,
    orderId: ticket.orderId,
    tierId: ticket.tierId,
    eventId: ticket.eventId,
    holderName: ticket.holderName,
    holderEmail: ticket.holderEmail,
    qrPayload: newPayload,
    status: 'valid',
    issuedAt,
    seatNumber: ticket.seatNumber,
  };
  createTicket(newTicket);
  appendAudit({ actor: session.user.id, action: 'ticket.reissue', target: newTicketId, severity: 'warning', note: `replaced ${ticket.id}` });
  res.status(201).json(newTicket);
});

router.post('/scan', requireSession, requirePack('operations'), requirePermission('check_in:write'), (req, res) => {
  const { qrPayload, gate, eventId, deviceId } = req.body as {
    qrPayload?: string;
    gate?: string;
    eventId?: string;
    deviceId?: string;
  };

  if (!qrPayload?.trim() || !gate?.trim()) {
    res.status(400).json({ error: 'qrPayload and gate are required.' });
    return;
  }

  const session = (req as AuthRequest).session;
  const scannedAt = nowIso();
  const scanId = newId('scan');

  function deny(denyReason: CheckInScan['denyReason'], message: string, deniedEventId?: string) {
    const scan: CheckInScan = {
      id: scanId,
      ticketId: 'unknown',
      eventId: deniedEventId ?? eventId ?? '',
      gate: gate!,
      deviceId: deviceId || undefined,
      scannedAt,
      result: 'denied',
      operatorId: session.user.id,
      denyReason,
    };
    recordScan(scan);
    return res.json({ result: 'denied', denyReason, message, scanId, scannedAt });
  }

  const parsed = validateQrChecksum(qrPayload.trim());
  if (!parsed) { deny('not_found', 'Ticket not found - invalid QR code.'); return; }

  const ticket = getTicketByQrPayload(qrPayload.trim());
  if (!ticket) { deny('not_found', 'Ticket not found - not issued by this system.'); return; }
  if (!canOperateEvent(session, ticket.eventId)) {
    res.status(403).json({ error: 'Scan access denied for this event.' });
    return;
  }

  const tier = getTier(ticket.tierId);

  // VIP tickets bypass gate assignment restrictions
  const isVip = tier?.kind === 'vip';
  if (!isVip) {
    const allowedGates = getAssignedGates(session.user, ticket.eventId);
    if (allowedGates !== null && !allowedGates.includes(gate!)) {
      deny('wrong_gate', allowedGates.length === 0 ? 'No gate assignment found for this event.' : `Not assigned to gate "${gate}".`, ticket.eventId);
      return;
    }
  }

  if (ticket.status === 'cancelled' || ticket.status === 'refunded') {
    const scan: CheckInScan = { id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: gate!, deviceId: deviceId || undefined, scannedAt, result: 'denied', operatorId: session.user.id, denyReason: 'cancelled_ticket' };
    recordScan(scan);
    res.json({ result: 'denied', denyReason: 'cancelled_ticket', message: `Ticket has been ${ticket.status}.`, ticketId: ticket.id, holderName: ticket.holderName, scanId, scannedAt });
    return;
  }

  if (ticket.status === 'transferred') {
    const scan: CheckInScan = { id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: gate!, deviceId: deviceId || undefined, scannedAt, result: 'denied', operatorId: session.user.id, denyReason: 'cancelled_ticket' };
    recordScan(scan);
    res.json({ result: 'denied', denyReason: 'cancelled_ticket', message: 'This ticket has been transferred. The new ticket holder should present their updated ticket.', ticketId: ticket.id, holderName: ticket.holderName, scanId, scannedAt });
    return;
  }

  if (eventId && ticket.eventId !== eventId) {
    const targetEvent = getEvent(ticket.eventId);
    const scan: CheckInScan = { id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: gate!, deviceId: deviceId || undefined, scannedAt, result: 'denied', operatorId: session.user.id, denyReason: 'wrong_gate' };
    recordScan(scan);
    res.json({ result: 'denied', denyReason: 'wrong_gate', message: `Ticket is for ${targetEvent?.name ?? 'a different event'}.`, ticketId: ticket.id, holderName: ticket.holderName, scanId, scannedAt });
    return;
  }

  // Timed entry window check
  if (tier?.kind === 'timed_entry') {
    const now = scannedAt;
    if (tier.saleStartsAt && now < tier.saleStartsAt) {
      const scan: CheckInScan = { id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: gate!, deviceId: deviceId || undefined, scannedAt, result: 'denied', operatorId: session.user.id, denyReason: 'outside_entry_window' };
      recordScan(scan);
      res.json({ result: 'denied', denyReason: 'outside_entry_window', message: 'Entry window has not opened yet.', ticketId: ticket.id, holderName: ticket.holderName, scanId, scannedAt });
      return;
    }
    if (tier.saleEndsAt && now > tier.saleEndsAt) {
      const scan: CheckInScan = { id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: gate!, deviceId: deviceId || undefined, scannedAt, result: 'denied', operatorId: session.user.id, denyReason: 'outside_entry_window' };
      recordScan(scan);
      res.json({ result: 'denied', denyReason: 'outside_entry_window', message: 'Entry window for this time slot has closed.', ticketId: ticket.id, holderName: ticket.holderName, scanId, scannedAt });
      return;
    }
  }

  // Access rule enforcement — check if this tier/kind is allowed at this gate
  if (tier) {
    const ruleCheck = checkAccessRule(ticket.eventId, gate!, ticket.tierId, tier.kind);
    if (!ruleCheck.allowed) {
      const scan: CheckInScan = { id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: gate!, deviceId: deviceId || undefined, scannedAt, result: 'denied', operatorId: session.user.id, denyReason: 'tier_not_allowed' };
      recordScan(scan);
      res.json({ result: 'denied', denyReason: 'tier_not_allowed', message: 'reason' in ruleCheck ? ruleCheck.reason : 'Ticket tier is not allowed at this gate.', ticketId: ticket.id, holderName: ticket.holderName, scanId, scannedAt });
      return;
    }
  }

  if (ticket.status === 'used') {
    // Re-entry: check if the holder has a pending exit record
    const exitRecord = getActiveReEntryRecord(ticket.id);
    if (exitRecord) {
      completeReEntry(exitRecord.id);
      const scan: CheckInScan = { id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: gate!, deviceId: deviceId || undefined, scannedAt, result: 'admitted', operatorId: session.user.id };
      recordScan(scan);
      appendAudit({ actor: session.user.id, action: 'scan.readmitted', target: ticket.id, severity: 'info', note: `${gate} - ${ticket.holderName} (re-entry)` });
      const eventRecord = getEvent(ticket.eventId);
      res.json({ result: 'admitted', reEntry: true, ticketId: ticket.id, holderName: ticket.holderName, holderEmail: ticket.holderEmail, tierId: ticket.tierId, tierKind: tier?.kind, seatNumber: ticket.seatNumber, eventName: eventRecord?.name, scanId, scannedAt });
      return;
    }
    const scan: CheckInScan = { id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: gate!, deviceId: deviceId || undefined, scannedAt, result: 'duplicate', operatorId: session.user.id, denyReason: 'already_used' };
    recordScan(scan);
    res.json({ result: 'duplicate', denyReason: 'already_used', message: `Previously scanned at ${ticket.scannedGate ?? 'unknown gate'}.`, ticketId: ticket.id, holderName: ticket.holderName, scanId, scannedAt });
    return;
  }

  updateTicketStatus(ticket.id, 'used', scannedAt, gate!);
  const scan: CheckInScan = { id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate: gate!, deviceId: deviceId || undefined, scannedAt, result: 'admitted', operatorId: session.user.id };
  recordScan(scan);
  appendAudit({ actor: session.user.id, action: 'scan.admitted', target: ticket.id, severity: 'info', note: `${gate} - ${ticket.holderName}` });

  const eventRecord = getEvent(ticket.eventId);
  res.json({
    result: 'admitted',
    reEntry: false,
    ticketId: ticket.id,
    holderName: ticket.holderName,
    holderEmail: ticket.holderEmail,
    tierId: ticket.tierId,
    tierKind: tier?.kind,
    seatNumber: ticket.seatNumber,
    eventName: eventRecord?.name,
    // Badge printing data
    badge: { name: ticket.holderName, tier: tier?.name ?? '', kind: tier?.kind ?? '', seat: ticket.seatNumber ?? '', eventName: eventRecord?.name ?? '' },
    scanId,
    scannedAt,
  });
});

// Batch resync of offline scans
router.post('/scan/batch', requireSession, requirePack('operations'), requirePermission('check_in:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const items = req.body as Array<{ qrPayload?: string; gate?: string; scannedAt?: string; deviceId?: string; eventId?: string }>;
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Request body must be a non-empty array of scan entries.' });
    return;
  }
  if (items.length > 500) {
    res.status(400).json({ error: 'Batch size cannot exceed 500 scans.' });
    return;
  }

  // Sort chronologically to process in the right order
  const sorted = [...items].sort((a, b) => (a.scannedAt ?? '').localeCompare(b.scannedAt ?? ''));
  const results: Array<{ index: number; result: string; denyReason?: string; conflict?: string; ticketId?: string; scanId: string }> = [];

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]!;
    const scanId = newId('scan');
    const scannedAt = item.scannedAt ?? nowIso();
    const gate = item.gate ?? 'offline';
    const deviceId = item.deviceId;

    if (!item.qrPayload) {
      results.push({ index: i, result: 'error', denyReason: 'not_found', scanId });
      continue;
    }

    const parsed = validateQrChecksum(item.qrPayload);
    if (!parsed) {
      results.push({ index: i, result: 'denied', denyReason: 'not_found', scanId });
      continue;
    }

    const ticket = getTicketByQrPayload(item.qrPayload);
    if (!ticket) {
      results.push({ index: i, result: 'denied', denyReason: 'not_found', scanId });
      continue;
    }

    let result: string;
    let denyReason: string | undefined;
    let conflict: string | undefined;

    if (ticket.status === 'used') {
      // Check if this was caused by a race with another offline device's entry in this same batch
      const priorBatchAdmit = results.find((r) => r.ticketId === ticket.id && r.result === 'admitted');
      if (priorBatchAdmit) {
        result = 'duplicate'; denyReason = 'already_used'; conflict = 'batch_conflict';
      } else {
        result = 'duplicate'; denyReason = 'already_used'; conflict = 'server_conflict';
      }
    } else if (['cancelled', 'refunded', 'transferred'].includes(ticket.status)) {
      result = 'denied'; denyReason = 'cancelled_ticket';
    } else {
      updateTicketStatus(ticket.id, 'used', scannedAt, gate);
      result = 'admitted';
    }

    const scan: CheckInScan = { id: scanId, ticketId: ticket.id, tierId: ticket.tierId, eventId: ticket.eventId, gate, deviceId, scannedAt, result: result as CheckInScan['result'], operatorId: session.user.id, denyReason: denyReason as CheckInScan['denyReason'] | undefined };
    recordScan(scan);
    results.push({ index: i, result, denyReason, conflict, ticketId: ticket.id, scanId });
  }

  const admitted = results.filter((r) => r.result === 'admitted').length;
  const conflicts = results.filter((r) => r.conflict).length;
  appendAudit({ actor: session.user.id, action: 'scan.batch_sync', target: '', severity: 'info', note: `${sorted.length} offline scans: ${admitted} admitted, ${conflicts} conflicts` });
  res.json({ processed: sorted.length, admitted, conflicts, results });
});

// Mark a holder as having exited (enables re-entry on next scan)
router.post('/:id/exit', requireSession, requirePack('operations'), requirePermission('check_in:write'), (req, res) => {
  const session = (req as AuthRequest).session;
  const ticket = getTicket(req.params.id as string);
  if (!ticket) { res.status(404).json({ error: 'Ticket not found.' }); return; }
  if (!canOperateEvent(session, ticket.eventId)) { res.status(403).json({ error: 'Event access denied.' }); return; }
  if (ticket.status !== 'used') {
    res.status(409).json({ error: `Only admitted (used) tickets can be exited. Current status: ${ticket.status}.` });
    return;
  }

  const existing = getActiveReEntryRecord(ticket.id);
  if (existing) { res.json({ status: 'already_exited', recordId: existing.id }); return; }

  const { gate } = req.body as { gate?: string };
  const record = createReEntryRecord({ id: newId('exit'), ticketId: ticket.id, holderName: ticket.holderName, eventId: ticket.eventId, gate: gate ?? ticket.scannedGate ?? 'unknown', passedOutAt: nowIso(), operatorId: session.user.id });
  appendAudit({ actor: session.user.id, action: 'ticket.exited', target: ticket.id, severity: 'info', note: `${record.gate} - ${ticket.holderName}` });
  res.json({ status: 'exited', record });
});

router.get('/scan/history', requireSession, requirePack('operations'), requirePermission('check_in:read'), (req, res) => {
  const session = (req as AuthRequest).session;
  const { eventId, gate, result, limit } = req.query as Record<string, string | undefined>;
  const scans = listScans({
    eventId: eventId || undefined,
    gate: gate || undefined,
    result: result || undefined,
    limit: 500,
  });
  const accessibleEventIds = getAccessibleEventIds(session.user);
  const scopedScans = accessibleEventIds === null ? scans : scans.filter((scan) => accessibleEventIds.includes(scan.eventId));
  const safeLimit = limit ? Number(limit) : undefined;
  res.json(safeLimit === undefined ? scopedScans : scopedScans.slice(0, safeLimit));
});

export default router;
