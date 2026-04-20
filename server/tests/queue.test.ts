import { describe, it, expect } from 'vitest';
import {
  admitQueueToken,
  expireQueueEntries,
  getQueueEntry,
  getQueueEntryByToken,
  getQueueStats,
  isQueueActive,
  joinQueue,
  releaseQueueBatch,
} from '../db';
import { seedEvent, seedVenue } from './seed';

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function setupEvent() {
  const eid = `evt_q_${uid()}`;
  seedVenue('ven_q');
  seedEvent(eid, 'ven_q');
  return eid;
}

describe('queue — join and status', () => {
  it('joining queue returns position >= 1', () => {
    const eventId = setupEvent();
    const entry = joinQueue(eventId, `sess_${uid()}`, 'buyer@test.com', 30, 0);
    expect(entry.position).toBeGreaterThanOrEqual(1);
    expect(entry.status).toBe('queued');
  });

  it('subsequent joins have increasing positions', () => {
    const eventId = setupEvent();
    const e1 = joinQueue(eventId, `sess_${uid()}`, 'a@test.com', 30, 0);
    const e2 = joinQueue(eventId, `sess_${uid()}`, 'b@test.com', 30, 0);
    expect(e2.position).toBeGreaterThan(e1.position);
  });

  it('presale code gets priority 1', () => {
    const eventId = setupEvent();
    const priority = joinQueue(eventId, `sess_${uid()}`, 'pre@test.com', 30, 1);
    expect(priority.priority).toBe(1);
  });

  it('getQueueEntry retrieves by session', () => {
    const eventId = setupEvent();
    const sessId = `sess_${uid()}`;
    joinQueue(eventId, sessId, 'find@test.com', 30, 0);
    const entry = getQueueEntry(eventId, sessId);
    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('queued');
  });
});

describe('queue — wave release', () => {
  it('release changes status to releasing and adds token', () => {
    const eventId = setupEvent();
    joinQueue(eventId, `sess_${uid()}`, 'r1@test.com', 30, 0);
    joinQueue(eventId, `sess_${uid()}`, 'r2@test.com', 30, 0);
    const released = releaseQueueBatch(eventId, 1, 15);
    expect(released.length).toBe(1);
    expect(released[0]!.status).toBe('releasing');
    expect(released[0]!.queueToken).toBeTruthy();
  });

  it('token is validated then consumed', () => {
    const eventId = setupEvent();
    joinQueue(eventId, `sess_${uid()}`, 'tok@test.com', 30, 0);
    const [released] = releaseQueueBatch(eventId, 1, 15);
    const token = released!.queueToken!;
    expect(getQueueEntryByToken(token)).not.toBeNull();
    expect(admitQueueToken(token)).toBe(true);
    expect(admitQueueToken(token)).toBe(false);
  });
});

describe('queue — isQueueActive', () => {
  it('queue active after entries joined', () => {
    const eventId = setupEvent();
    joinQueue(eventId, `sess_${uid()}`, 'active@test.com', 30, 0);
    expect(isQueueActive(eventId)).toBe(true);
  });
});

describe('queue — stats', () => {
  it('stats reflect joined and released counts', () => {
    const eventId = setupEvent();
    joinQueue(eventId, `sess_${uid()}`, 's1@test.com', 30, 0);
    joinQueue(eventId, `sess_${uid()}`, 's2@test.com', 30, 0);
    releaseQueueBatch(eventId, 1, 15);
    const stats = getQueueStats(eventId);
    expect(stats.queued).toBe(1);
    expect(stats.releasing).toBe(1);
  });
});
