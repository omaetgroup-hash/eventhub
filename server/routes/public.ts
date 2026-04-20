import { Router } from 'express';
import { getAvailableInventoryDb, getEvent, getVenue, isQueueActive, listEvents, listTiers, listVenues } from '../db';

const router = Router();

const PUBLIC_STATUSES = new Set(['on_sale', 'sold_out', 'live']);

router.get('/events', (req, res) => {
  const { q, category, city, price, limit, offset } = req.query as Record<string, string>;
  const lim = Math.min(Number(limit) || 50, 200);
  const off = Number(offset) || 0;

  const { events } = listEvents({ limit: 1000, offset: 0 });
  let list = events.filter((e) => PUBLIC_STATUSES.has(e.status));

  if (q) {
    const lq = q.toLowerCase();
    list = list.filter((e) =>
      e.name.toLowerCase().includes(lq) ||
      (e.description ?? '').toLowerCase().includes(lq) ||
      (e.category ?? '').toLowerCase().includes(lq)
    );
  }

  if (category) list = list.filter((e) => e.category === category);

  if (city) {
    const venues = listVenues();
    const venueIds = new Set(venues.filter((v) => v.city === city).map((v) => v.id));
    list = list.filter((e) => e.venueId && venueIds.has(e.venueId));
  }

  if (price) {
    const [minStr, maxStr] = price.split('-');
    const min = Number(minStr);
    const max = Number(maxStr);
    list = list.filter((e) => {
      const tiers = listTiers(e.id);
      if (tiers.length === 0) return true;
      const lowest = Math.min(...tiers.map((t) => t.price));
      return lowest >= min && lowest <= max;
    });
  }

  const total = list.length;
  const page = list.slice(off, off + lim);

  const enriched = page.map((e) => ({
    ...e,
    venue: e.venueId ? getVenue(e.venueId) : null,
    tiers: listTiers(e.id),
  }));

  res.json({ events: enriched, total, limit: lim, offset: off });
});

router.get('/events/:id', (req, res) => {
  const event = getEvent(req.params.id);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!PUBLIC_STATUSES.has(event.status)) { res.status(404).json({ error: 'Event not found.' }); return; }

  const venue = event.venueId ? getVenue(event.venueId) : null;
  const tiers = listTiers(event.id);
  res.json({ event, venue, tiers });
});

router.get('/venues/:id', (req, res) => {
  const venue = getVenue(req.params.id);
  if (!venue) { res.status(404).json({ error: 'Venue not found.' }); return; }
  res.json({ venue });
});

// Real-time inventory for high-demand sale pages
router.get('/events/:id/inventory', (req, res) => {
  const event = getEvent(req.params.id);
  if (!event) { res.status(404).json({ error: 'Event not found.' }); return; }
  if (!PUBLIC_STATUSES.has(event.status)) { res.status(404).json({ error: 'Event not found.' }); return; }

  const tiers = listTiers(event.id);
  const queueActive = isQueueActive(event.id);
  const inventory = tiers.map((t) => ({
    tierId: t.id,
    name: t.name,
    kind: t.kind,
    price: t.price,
    available: getAvailableInventoryDb(t.id),
    total: t.inventory,
    sold: t.sold,
    saleStartsAt: t.saleStartsAt,
    saleEndsAt: t.saleEndsAt,
  }));
  res.json({ eventId: event.id, queueActive, inventory, updatedAt: new Date().toISOString() });
});

export default router;
