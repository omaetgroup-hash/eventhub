import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  completeReEntry,
  createReEntryRecord,
  createTicket,
  fulfillOrder,
  getActiveReEntryRecord,
  getTicket,
  insertOrder,
  listScans,
  recordScan,
  updateTicketStatus,
} from '../db';
import { seedEvent, seedTier, seedVenue } from './seed';

const SALT = process.env['QR_CHECKSUM_SALT'] ?? 'test-salt';

function qrFor(eventId: string, ticketId: string) {
  const checksum = crypto.createHash('sha1').update(`${eventId}:${ticketId}:${SALT}`).digest('hex').slice(0, 8);
  return `${eventId}.${ticketId}.${checksum}`;
}

function nowIso() { return new Date().toISOString(); }
function uid() { return crypto.randomBytes(4).toString('hex'); }

const VEN = 'ven_scan';
const EVT = 'evt_scan';
const TIER = 'tier_scan';

function makeTicket() {
  seedVenue(VEN);
  seedEvent(EVT, VEN, 'live');
  seedTier(TIER, EVT, 50);
  const ticketId = `tkt_${uid()}`;
  createTicket({ id: ticketId, orderId: `ord_${uid()}`, tierId: TIER, eventId: EVT, holderName: 'Alice', holderEmail: 'alice@test.com', qrPayload: qrFor(EVT, ticketId), status: 'valid', issuedAt: nowIso() });
  return ticketId;
}

describe('scan — status transitions', () => {
  it('valid ticket admitted and marked used', () => {
    const ticketId = makeTicket();
    updateTicketStatus(ticketId, 'used', nowIso(), 'Gate A');
    const ticket = getTicket(ticketId);
    expect(ticket?.status).toBe('used');
    expect(ticket?.scannedGate).toBe('Gate A');
  });

  it('scan record written for admission', () => {
    const ticketId = makeTicket();
    const scanId = `scan_${uid()}`;
    recordScan({ id: scanId, ticketId, tierId: TIER, eventId: EVT, gate: 'Gate A', scannedAt: nowIso(), result: 'admitted', operatorId: 'admin' });
    const scans = listScans({ eventId: EVT });
    expect(scans.some((s) => s.id === scanId)).toBe(true);
  });
});

describe('scan — re-entry flow', () => {
  it('exit creates re-entry record; completeReEntry clears it', () => {
    const ticketId = makeTicket();
    updateTicketStatus(ticketId, 'used', nowIso(), 'Gate A');
    const reId = `re_${uid()}`;
    const rec = createReEntryRecord({ id: reId, ticketId, holderName: 'Alice', eventId: EVT, gate: 'Gate A', passedOutAt: nowIso(), operatorId: 'admin' });
    expect(getActiveReEntryRecord(ticketId)).not.toBeNull();
    completeReEntry(rec.id);
    expect(getActiveReEntryRecord(ticketId)).toBeNull();
  });
});

describe('scan — fulfillOrder issues tickets', () => {
  it('fulfilled order produces tickets with valid status', () => {
    seedVenue('ven_fo');
    seedEvent('evt_fo', 'ven_fo');
    seedTier('tier_fo', 'evt_fo');
    const orderId = `ord_fo_${uid()}`;
    insertOrder({ id: orderId, eventId: 'evt_fo', tierId: 'tier_fo', buyerName: 'Bob', buyerEmail: 'bob@test.com', quantity: 2, total: 100, currency: 'NZD', status: 'pending', createdAt: nowIso() });

    const t1 = `tkt_fo_${uid()}`;
    const t2 = `tkt_fo_${uid()}`;
    const tickets = [
      { id: t1, orderId, tierId: 'tier_fo', eventId: 'evt_fo', holderName: 'Bob', holderEmail: 'bob@test.com', qrPayload: qrFor('evt_fo', t1), status: 'valid' as const, issuedAt: nowIso() },
      { id: t2, orderId, tierId: 'tier_fo', eventId: 'evt_fo', holderName: 'Bob', holderEmail: 'bob@test.com', qrPayload: qrFor('evt_fo', t2), status: 'valid' as const, issuedAt: nowIso() },
    ];
    fulfillOrder(orderId, tickets);
    expect(getTicket(t1)?.status).toBe('valid');
    expect(getTicket(t2)?.status).toBe('valid');
  });
});
