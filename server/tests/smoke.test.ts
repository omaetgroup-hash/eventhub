import { describe, it, expect } from 'vitest';
import {
  appendAudit,
  applyDiscountCode,
  computeAudienceSegments,
  getRevenueReport,
  getSellThroughReport,
  listAuditEnhanced,
  listEvents,
  upsertDiscount,
} from '../db';
import { seedEvent, seedVenue } from './seed';

function nowIso() { return new Date().toISOString(); }

describe('smoke — basic data layer', () => {
  it('upserted event appears in listEvents', () => {
    seedVenue('ven_sm');
    seedEvent('evt_sm', 'ven_sm');
    const { events } = listEvents({ limit: 100 });
    expect(events.some((e) => e.id === 'evt_sm')).toBe(true);
  });

  it('audit log records and retrieves entries', () => {
    appendAudit({ actor: 'admin@test.com', action: 'smoke.test', target: 'test', severity: 'info' });
    const enhanced = listAuditEnhanced({ action: 'smoke.test', limit: 10 });
    expect(enhanced.entries.length).toBeGreaterThan(0);
  });
});

describe('smoke — reports', () => {
  it('revenue report returns byEvent array', () => {
    const report = getRevenueReport({});
    expect(Array.isArray(report.byEvent)).toBe(true);
  });

  it('sell-through report returns array', () => {
    const rows = getSellThroughReport();
    expect(Array.isArray(rows)).toBe(true);
  });

  it('audience segments return totalBuyers count', () => {
    const result = computeAudienceSegments();
    expect(result).toHaveProperty('totalBuyers');
    expect(typeof result.totalBuyers).toBe('number');
  });
});

describe('smoke — discount code application', () => {
  it('unknown code returns invalid', () => {
    const result = applyDiscountCode('BADCODE', 'evt_sm', 100);
    expect(result.valid).toBe(false);
  });

  it('valid percentage discount applied correctly', () => {
    upsertDiscount({
      id: 'disc_smoke',
      eventId: 'evt_disc_smoke',
      name: '10% Off',
      code: 'SAVE10',
      type: 'percentage',
      amount: 10,
      redemptions: 0,
      revenueAttributed: 0,
      active: true,
      createdAt: nowIso(),
    });
    const result = applyDiscountCode('SAVE10', 'evt_disc_smoke', 200);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.discountAmount).toBe(20);
      expect(result.finalTotal).toBe(180);
    }
  });
});
