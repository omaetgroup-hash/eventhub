import { upsertEvent, upsertTier, upsertVenue } from '../db';

function nowIso() { return new Date().toISOString(); }

export function seedVenue(id: string) {
  return upsertVenue({ id, name: `Venue ${id}`, address: '1 Test St', city: 'Auckland', country: 'NZ', capacity: 500, zones: [], managerId: '', manager: '', createdAt: nowIso() });
}

export function seedEvent(id: string, venueId: string, status: string = 'on_sale') {
  return upsertEvent({ id, name: `Event ${id}`, description: '', status: status as any, startsAt: '2026-06-01T10:00:00Z', endsAt: '2026-06-01T22:00:00Z', venueId, organizerId: 'admin@test.com', category: 'Music', ticketsSold: 0, grossRevenue: 0, createdAt: nowIso() });
}

export function seedTier(id: string, eventId: string, inventory: number = 50) {
  return upsertTier({ id, eventId, name: `Tier ${id}`, kind: 'general_admission', price: 50, inventory, sold: 0, description: '' });
}
