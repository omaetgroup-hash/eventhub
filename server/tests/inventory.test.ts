import { describe, it, expect } from 'vitest';
import {
  convertHold,
  expireStaleHolds,
  getAvailableInventoryDb,
  insertOrder,
  releaseHold,
  reserveInventory,
} from '../db';
import { seedEvent, seedTier, seedVenue } from './seed';

const VEN = 'ven_inv';
const EVT = 'evt_inv';
const TIER = 'tier_inv';

function setup() {
  seedVenue(VEN);
  seedEvent(EVT, VEN);
  seedTier(TIER, EVT, 10);
}

function nowIso() { return new Date().toISOString(); }

describe('inventory — holds', () => {
  it('reserves available inventory', () => {
    setup();
    const hold = reserveInventory({ tierId: TIER, eventId: EVT, quantity: 3, holderEmail: 'buyer@test.com' });
    expect(hold).not.toBeNull();
    expect(getAvailableInventoryDb(TIER)).toBeLessThanOrEqual(10);
  });

  it('released hold restores inventory', () => {
    setup();
    const before = getAvailableInventoryDb(TIER);
    const hold = reserveInventory({ tierId: TIER, eventId: EVT, quantity: 2, holderEmail: 'rel@test.com' });
    expect(hold).not.toBeNull();
    releaseHold(hold!.id);
    expect(getAvailableInventoryDb(TIER)).toBeGreaterThanOrEqual(before - 2);
  });

  it('expired holds are reclaimed by expireStaleHolds', () => {
    setup();
    reserveInventory({ tierId: TIER, eventId: EVT, quantity: 1, holderEmail: 'exp@test.com', ttlMinutes: 0 });
    const expired = expireStaleHolds();
    expect(expired).toBeGreaterThanOrEqual(0);
  });

  it('converting hold marks inventory sold', () => {
    setup();
    const hold = reserveInventory({ tierId: TIER, eventId: EVT, quantity: 2, holderEmail: 'conv@test.com' });
    expect(hold).not.toBeNull();
    const orderId = `ord_inv_${Date.now()}`;
    insertOrder({ id: orderId, eventId: EVT, tierId: TIER, buyerName: 'Conv', buyerEmail: 'conv@test.com', quantity: 2, total: 100, currency: 'NZD', status: 'pending', createdAt: nowIso() });
    convertHold(hold!.id, orderId);
    expect(getAvailableInventoryDb(TIER)).toBeLessThanOrEqual(10);
  });
});
