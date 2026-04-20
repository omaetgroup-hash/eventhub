import crypto from 'node:crypto';
import {
  appendAudit,
  countUsers,
  createOrUpdateUser,
  getDb,
  updateOrganizationRecord,
  upsertEvent,
  upsertTier,
  upsertVenue,
} from '../server/db';

function randomHex(bytes = 4) {
  return crypto.randomBytes(bytes).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

const NOW = new Date();
function daysFrom(n: number) {
  return new Date(NOW.getTime() + n * 86400_000).toISOString();
}

const VENUE_CIVIC = 'venue_seed_civic';
const VENUE_TOWN_HALL = 'venue_seed_townhall';
const EVENT_FESTIVAL = 'event_seed_festival';
const EVENT_CONFERENCE = 'event_seed_conf';
const EVENT_CLUB = 'event_seed_club';
const TIER_FESTIVAL_GA = 'tier_seed_fga';
const TIER_FESTIVAL_VIP = 'tier_seed_fvip';
const TIER_CONF_STANDARD = 'tier_seed_cstd';
const TIER_CONF_WORKSHOP = 'tier_seed_cwsh';
const TIER_CLUB_DOOR = 'tier_seed_door';

function main() {
  if (countUsers() > 0) {
    console.log('Database already seeded (users exist). Use `npm run db:export` to back up first, or delete the DB to re-seed.');
    process.exit(0);
  }

  const db = getDb();

  // ─── Organisation ────────────────────────────────────────────────────────────

  updateOrganizationRecord({
    name: 'Demo Events Ltd',
    slug: 'demo-events',
    timezone: 'Pacific/Auckland',
    region: 'NZ',
    plan: 'starter',
    enabledPacks: ['standard', 'operations', 'growth', 'finance'],
  });

  // ─── Users ───────────────────────────────────────────────────────────────────

  const admin = createOrUpdateUser({
    id: 'user_seed_admin',
    name: 'Alice Admin',
    email: 'admin@eventhub.local',
    role: 'super_admin',
    scope: 'Demo Events Ltd (all organizations)',
    lastActive: nowIso(),
  });

  createOrUpdateUser({
    id: 'user_seed_manager',
    name: 'Bob Manager',
    email: 'manager@eventhub.local',
    role: 'organizer',
    scope: 'Demo Events Ltd',
    lastActive: nowIso(),
  });

  createOrUpdateUser({
    id: 'user_seed_scanner',
    name: 'Casey Scanner',
    email: 'scanner@eventhub.local',
    role: 'staff',
    scope: 'Demo Events Ltd',
    lastActive: nowIso(),
  });

  // ─── Venues ──────────────────────────────────────────────────────────────────

  upsertVenue({
    id: VENUE_CIVIC,
    name: 'Auckland Civic',
    address: '1 Queen Street',
    city: 'Auckland',
    country: 'New Zealand',
    capacity: 2400,
    zones: ['Main Floor', 'Balcony', 'VIP Terrace', 'Backstage'],
    managerId: 'user_seed_manager',
    manager: 'Bob Manager',
    createdAt: daysFrom(-60),
  });

  upsertVenue({
    id: VENUE_TOWN_HALL,
    name: 'Auckland Town Hall',
    address: '301-305 Queen Street',
    city: 'Auckland',
    country: 'New Zealand',
    capacity: 1500,
    zones: ['Concert Chamber', 'Great Hall', 'Foyer'],
    managerId: 'user_seed_manager',
    manager: 'Bob Manager',
    createdAt: daysFrom(-60),
  });

  // ─── Events ──────────────────────────────────────────────────────────────────

  upsertEvent({
    id: EVENT_FESTIVAL,
    name: 'Auckland Summer Festival 2026',
    description: 'The biggest summer music festival in New Zealand. Three stages, 40+ artists, camping available.',
    status: 'on_sale',
    startsAt: daysFrom(45),
    endsAt: daysFrom(47),
    venueId: VENUE_CIVIC,
    organizerId: 'user_seed_manager',
    category: 'Festival',
    ticketsSold: 180,
    grossRevenue: 27_000,
    createdAt: daysFrom(-30),
  });

  upsertEvent({
    id: EVENT_CONFERENCE,
    name: 'TechConf NZ 2026',
    description: 'New Zealand\'s premier technology conference. Workshops, keynotes, and networking across two days.',
    status: 'on_sale',
    startsAt: daysFrom(20),
    endsAt: daysFrom(21),
    venueId: VENUE_TOWN_HALL,
    organizerId: 'user_seed_manager',
    category: 'Conference',
    ticketsSold: 95,
    grossRevenue: 28_500,
    createdAt: daysFrom(-20),
  });

  upsertEvent({
    id: EVENT_CLUB,
    name: 'Midnight Frequency — Season Closer',
    description: 'An intimate club night to close out the season. Electronic music, limited capacity.',
    status: 'completed',
    startsAt: daysFrom(-7),
    endsAt: daysFrom(-6),
    venueId: VENUE_CIVIC,
    organizerId: 'user_seed_manager',
    category: 'Club Night',
    ticketsSold: 320,
    grossRevenue: 12_800,
    createdAt: daysFrom(-45),
  });

  // ─── Ticket tiers ─────────────────────────────────────────────────────────────

  upsertTier({ id: TIER_FESTIVAL_GA, eventId: EVENT_FESTIVAL, name: 'General Admission', kind: 'general_admission', price: 150, inventory: 1500, sold: 180, description: 'Full festival access — all stages, camping included.' });
  upsertTier({ id: TIER_FESTIVAL_VIP, eventId: EVENT_FESTIVAL, name: 'VIP Pass', kind: 'vip', price: 350, inventory: 200, sold: 0, description: 'VIP lounge, artist meet & greet, premium bar access.' });

  upsertTier({ id: TIER_CONF_STANDARD, eventId: EVENT_CONFERENCE, name: 'Standard', kind: 'general_admission', price: 299, inventory: 500, sold: 80, description: 'Full conference access and lunch.' });
  upsertTier({ id: TIER_CONF_WORKSHOP, eventId: EVENT_CONFERENCE, name: 'Workshop Add-on', kind: 'general_admission', price: 99, inventory: 100, sold: 15, description: 'Access to afternoon workshop sessions (requires Standard ticket).' });

  upsertTier({ id: TIER_CLUB_DOOR, eventId: EVENT_CLUB, name: 'Door Entry', kind: 'general_admission', price: 40, inventory: 400, sold: 320, description: 'General admission door entry.' });

  // ─── Sample orders and tickets (completed event only) ────────────────────────

  const buyers = [
    { name: 'James Tane', email: 'james.tane@example.com' },
    { name: 'Mia Ngata', email: 'mia.ngata@example.com' },
    { name: 'Samuel Park', email: 'samuel.park@example.com' },
    { name: 'Aria Fowler', email: 'aria.fowler@example.com' },
    { name: 'Lucas Hemi', email: 'lucas.hemi@example.com' },
  ];

  const insertOrder = db.prepare(`
    INSERT OR IGNORE INTO orders (id, event_id, tier_id, buyer_name, buyer_email, total, quantity, status, payment_intent_id, payment_provider, created_at)
    VALUES (@id, @event_id, @tier_id, @buyer_name, @buyer_email, @total, @quantity, @status, @payment_intent_id, @payment_provider, @created_at)
  `);
  const insertTicket = db.prepare(`
    INSERT OR IGNORE INTO issued_tickets (id, order_id, tier_id, event_id, holder_name, holder_email, qr_payload, status, issued_at, scanned_at, scanned_gate)
    VALUES (@id, @order_id, @tier_id, @event_id, @holder_name, @holder_email, @qr_payload, @status, @issued_at, @scanned_at, @scanned_gate)
  `);

  for (const buyer of buyers) {
    const orderId = `order_seed_${randomHex()}`;
    const qty = Math.ceil(Math.random() * 2);
    insertOrder.run({
      id: orderId,
      event_id: EVENT_CLUB,
      tier_id: TIER_CLUB_DOOR,
      buyer_name: buyer.name,
      buyer_email: buyer.email,
      total: qty * 40,
      quantity: qty,
      status: 'paid',
      payment_intent_id: `pi_seed_${randomHex()}`,
      payment_provider: 'mock',
      created_at: daysFrom(-8),
    });

    for (let i = 0; i < qty; i++) {
      const ticketId = `tkt_seed_${randomHex()}`;
      const checksum = crypto.createHash('sha1').update(`${EVENT_CLUB}:${ticketId}:eventhub-demo-salt`).digest('hex').slice(0, 8);
      insertTicket.run({
        id: ticketId,
        order_id: orderId,
        tier_id: TIER_CLUB_DOOR,
        event_id: EVENT_CLUB,
        holder_name: buyer.name,
        holder_email: buyer.email,
        qr_payload: `${EVENT_CLUB}.${ticketId}.${checksum}`,
        status: 'used',
        issued_at: daysFrom(-8),
        scanned_at: daysFrom(-7),
        scanned_gate: 'Main Entrance',
      });
    }
  }

  // ─── Audit ───────────────────────────────────────────────────────────────────

  appendAudit({ actor: admin.id, action: 'system.seed_completed', target: 'local', severity: 'info', note: 'seed:local' });

  console.log('Local seed complete.');
  console.log('  Admin:   admin@eventhub.local');
  console.log('  Manager: manager@eventhub.local');
  console.log('  Scanner: scanner@eventhub.local');
  console.log('  Sign in via /app/login (bootstrap not required — use email-based login).');
}

main();
process.exit(0);
