import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import type {
  AuditLogEntry,
  Campaign,
  CheckInScan,
  DiscountCampaign,
  EventRecord,
  IssuedTicket,
  Organization,
  OrderRecord,
  ReferralLink,
  StaffAssignment,
  TeamMember,
  TicketTier,
  Venue,
} from '../src/lib/domain';
import type { AppDatabase } from '../src/lib/schema';
import { serverEnv } from './env';

const databaseDir = path.dirname(serverEnv.databasePath);
fs.mkdirSync(databaseDir, { recursive: true });

const db = new Database(serverEnv.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function getDb(): Database.Database { return db; }

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    run_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_snapshot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    scope TEXT NOT NULL,
    last_active TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_codes (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_attempts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    kind TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    attempted_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS team_invites (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    scope TEXT NOT NULL,
    invited_by TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    accepted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    region TEXT NOT NULL DEFAULT 'NZ',
    plan TEXT NOT NULL DEFAULT 'starter',
    enabled_packs TEXT NOT NULL DEFAULT '["standard"]',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS venues (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    country TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 0,
    zones TEXT NOT NULL DEFAULT '[]',
    manager_id TEXT NOT NULL DEFAULT '',
    manager TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    venue_id TEXT NOT NULL DEFAULT '',
    organizer_id TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    tickets_sold INTEGER NOT NULL DEFAULT 0,
    gross_revenue REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ticket_tiers (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'general_admission',
    price REAL NOT NULL DEFAULT 0,
    inventory INTEGER NOT NULL DEFAULT 0,
    sold INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    sale_starts_at TEXT,
    sale_ends_at TEXT
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    tier_id TEXT NOT NULL,
    buyer_name TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    total REAL NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_intent_id TEXT,
    payment_provider TEXT NOT NULL DEFAULT 'mock',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS issued_tickets (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    tier_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    holder_name TEXT NOT NULL,
    holder_email TEXT NOT NULL,
    qr_payload TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'valid',
    issued_at TEXT NOT NULL,
    scanned_at TEXT,
    scanned_gate TEXT
  );

  CREATE TABLE IF NOT EXISTS scan_records (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    tier_id TEXT,
    event_id TEXT NOT NULL,
    gate TEXT NOT NULL,
    device_id TEXT,
    scanned_at TEXT NOT NULL,
    result TEXT NOT NULL,
    operator_id TEXT NOT NULL,
    deny_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL DEFAULT 'info',
    note TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'email',
    segment_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    subject TEXT NOT NULL DEFAULT '',
    scheduled_at TEXT,
    sent_count INTEGER NOT NULL DEFAULT 0,
    open_rate REAL NOT NULL DEFAULT 0,
    click_rate REAL NOT NULL DEFAULT 0,
    conversion_rate REAL NOT NULL DEFAULT 0,
    source_tag TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS discounts (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'percentage',
    amount REAL NOT NULL DEFAULT 0,
    starts_at TEXT,
    ends_at TEXT,
    redemptions INTEGER NOT NULL DEFAULT 0,
    revenue_attributed REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS referral_links (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL DEFAULT '',
    label TEXT NOT NULL,
    code TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    clicks INTEGER NOT NULL DEFAULT 0,
    conversions INTEGER NOT NULL DEFAULT 0,
    revenue_attributed REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS staff_assignments (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    gate TEXT,
    assigned_by TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory_holds (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    tier_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    holder_email TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    converted_to_order_id TEXT
  );

  CREATE TABLE IF NOT EXISTS payment_records (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    intent_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'mock',
    amount_cents INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'nzd',
    status TEXT NOT NULL DEFAULT 'initiated',
    idempotency_key TEXT,
    raw_response TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_logs (
    id TEXT PRIMARY KEY,
    template TEXT NOT NULL,
    to_address TEXT NOT NULL,
    order_id TEXT,
    provider TEXT NOT NULL DEFAULT 'mock',
    status TEXT NOT NULL DEFAULT 'sent',
    error TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    sent_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fraud_flags (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    order_id TEXT,
    buyer_email TEXT,
    flag_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'low',
    detail TEXT NOT NULL DEFAULT '',
    detected_at TEXT NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_by TEXT,
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gate TEXT NOT NULL,
    event_id TEXT NOT NULL,
    operator_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'online',
    pin_hash TEXT NOT NULL DEFAULT '',
    last_seen TEXT NOT NULL,
    pending_scans INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS access_rules (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    gate TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    allowed_tier_ids TEXT NOT NULL DEFAULT '[]',
    allowed_kinds TEXT NOT NULL DEFAULT '[]',
    requires_accreditation INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS re_entry_records (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    holder_name TEXT NOT NULL,
    event_id TEXT NOT NULL,
    gate TEXT NOT NULL,
    passed_out_at TEXT NOT NULL,
    readmitted_at TEXT,
    operator_id TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS waiting_room (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    buyer_email TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'queued',
    queue_token TEXT,
    joined_at TEXT NOT NULL,
    released_at TEXT,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS abuse_events (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    pattern TEXT NOT NULL,
    ip_hash TEXT NOT NULL DEFAULT '',
    session_count INTEGER NOT NULL DEFAULT 1,
    detected_at TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'logged',
    resolved INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS conference_sessions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    title TEXT NOT NULL,
    track TEXT NOT NULL DEFAULT '',
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    speaker_ids TEXT NOT NULL DEFAULT '[]',
    room TEXT NOT NULL DEFAULT '',
    capacity INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS speakers (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    organization TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    topic_tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exhibitors (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    hall TEXT NOT NULL DEFAULT '',
    booth_code TEXT NOT NULL DEFAULT '',
    lead_count INTEGER NOT NULL DEFAULT 0,
    meeting_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sponsors (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'supporting',
    booth_id TEXT,
    website TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    attendee_name TEXT NOT NULL,
    counterpart TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT 'onsite',
    sent_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS surveys (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    title TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'attendees',
    completion_rate REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    question TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    options TEXT NOT NULL DEFAULT '[]',
    responses INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resale_listings (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    ticket_id TEXT NOT NULL,
    seller_email TEXT NOT NULL,
    asking_price REAL NOT NULL DEFAULT 0,
    face_value REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'listed',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS upgrade_offers (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    target_tier_id TEXT NOT NULL,
    upgrade_price REAL NOT NULL DEFAULT 0,
    inventory INTEGER NOT NULL DEFAULT 0,
    claimed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS membership_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
    benefits TEXT NOT NULL DEFAULT '[]',
    active_members INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dynamic_pricing_rules (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    tier_id TEXT NOT NULL,
    trigger TEXT NOT NULL DEFAULT 'inventory',
    adjustment_type TEXT NOT NULL DEFAULT 'increase_percent',
    adjustment_value REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sponsor_placements (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    name TEXT NOT NULL,
    placement TEXT NOT NULL DEFAULT 'homepage',
    sponsor TEXT NOT NULL DEFAULT '',
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_staff_assignments_staff ON staff_assignments(staff_id);
  CREATE INDEX IF NOT EXISTS idx_staff_assignments_event ON staff_assignments(event_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_holds_tier ON inventory_holds(tier_id, status, expires_at);
  CREATE INDEX IF NOT EXISTS idx_payment_records_order ON payment_records(order_id);
  CREATE INDEX IF NOT EXISTS idx_payment_records_intent ON payment_records(intent_id);
  CREATE INDEX IF NOT EXISTS idx_email_logs_order ON email_logs(order_id);
  CREATE INDEX IF NOT EXISTS idx_fraud_flags_event ON fraud_flags(event_id);
  CREATE INDEX IF NOT EXISTS idx_devices_event ON devices(event_id);
  CREATE INDEX IF NOT EXISTS idx_access_rules_event_gate ON access_rules(event_id, gate);
  CREATE INDEX IF NOT EXISTS idx_re_entry_ticket ON re_entry_records(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_waiting_room_event ON waiting_room(event_id, status);
  CREATE INDEX IF NOT EXISTS idx_waiting_room_session ON waiting_room(session_id);
  CREATE INDEX IF NOT EXISTS idx_abuse_events_event ON abuse_events(event_id);
`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

// ─── Migrations ──────────────────────────────────────────────────────────────

function hasMigration(name: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(name));
}

function markMigration(name: string): void {
  db.prepare('INSERT OR IGNORE INTO migrations (name, run_at) VALUES (?, ?)').run(name, nowIso());
}

function hasColumn(table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function runMigrations(snapshot: AppDatabase): void {
  if (!hasMigration('seed_organizations_v1')) {
    db.prepare('INSERT OR IGNORE INTO organizations (id, name, slug, timezone, region, plan, enabled_packs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      snapshot.organization.id, snapshot.organization.name, snapshot.organization.slug,
      snapshot.organization.timezone ?? 'UTC', snapshot.organization.region ?? 'NZ',
      snapshot.organization.plan ?? 'starter', JSON.stringify(snapshot.organization.enabledPacks ?? ['standard']), nowIso(),
    );
    markMigration('seed_organizations_v1');
  }

  if (!hasMigration('organizations_enabled_packs_v1')) {
    if (!hasColumn('organizations', 'enabled_packs')) {
      db.prepare(`ALTER TABLE organizations ADD COLUMN enabled_packs TEXT NOT NULL DEFAULT '["standard"]'`).run();
    }
    markMigration('organizations_enabled_packs_v1');
  }

  if (!hasMigration('seed_venues_v1')) {
    const stmt = db.prepare('INSERT OR IGNORE INTO venues (id, name, address, city, country, capacity, zones, manager_id, manager, created_at) VALUES (@id, @name, @address, @city, @country, @capacity, @zones, @manager_id, @manager, @created_at)');
    for (const v of snapshot.venues) {
      stmt.run({ id: v.id, name: v.name, address: v.address, city: v.city, country: v.country, capacity: v.capacity, zones: JSON.stringify(v.zones ?? []), manager_id: v.managerId ?? '', manager: v.manager ?? '', created_at: v.createdAt });
    }
    markMigration('seed_venues_v1');
  }

  if (!hasMigration('seed_events_v1')) {
    const stmt = db.prepare('INSERT OR IGNORE INTO events (id, name, description, status, starts_at, ends_at, venue_id, organizer_id, category, tickets_sold, gross_revenue, created_at) VALUES (@id, @name, @description, @status, @starts_at, @ends_at, @venue_id, @organizer_id, @category, @tickets_sold, @gross_revenue, @created_at)');
    for (const e of snapshot.events) {
      stmt.run({ id: e.id, name: e.name, description: e.description ?? '', status: e.status, starts_at: e.startsAt, ends_at: e.endsAt, venue_id: e.venueId, organizer_id: e.organizerId, category: e.category ?? '', tickets_sold: e.ticketsSold ?? 0, gross_revenue: e.grossRevenue ?? 0, created_at: e.createdAt });
    }
    markMigration('seed_events_v1');
  }

  if (!hasMigration('seed_tiers_v1')) {
    const stmt = db.prepare('INSERT OR IGNORE INTO ticket_tiers (id, event_id, name, kind, price, inventory, sold, description, sale_starts_at, sale_ends_at) VALUES (@id, @event_id, @name, @kind, @price, @inventory, @sold, @description, @sale_starts_at, @sale_ends_at)');
    for (const t of snapshot.ticketTiers) {
      stmt.run({ id: t.id, event_id: t.eventId, name: t.name, kind: t.kind ?? 'general_admission', price: t.price, inventory: t.inventory, sold: t.sold ?? 0, description: t.description ?? '', sale_starts_at: t.saleStartsAt ?? null, sale_ends_at: t.saleEndsAt ?? null });
    }
    markMigration('seed_tiers_v1');
  }

  if (!hasMigration('seed_orders_v1')) {
    const stmtO = db.prepare('INSERT OR IGNORE INTO orders (id, event_id, tier_id, buyer_name, buyer_email, total, quantity, status, payment_intent_id, payment_provider, created_at) VALUES (@id, @event_id, @tier_id, @buyer_name, @buyer_email, @total, @quantity, @status, @payment_intent_id, @payment_provider, @created_at)');
    const stmtT = db.prepare('INSERT OR IGNORE INTO issued_tickets (id, order_id, tier_id, event_id, holder_name, holder_email, qr_payload, status, issued_at, scanned_at, scanned_gate) VALUES (@id, @order_id, @tier_id, @event_id, @holder_name, @holder_email, @qr_payload, @status, @issued_at, @scanned_at, @scanned_gate)');
    for (const o of snapshot.orders) {
      const paymentRecord = snapshot.paymentRecords.find((record) => record.orderId === o.id);
      stmtO.run({
        id: o.id,
        event_id: o.eventId,
        tier_id: o.tierId,
        buyer_name: o.buyerName,
        buyer_email: o.buyerEmail,
        total: o.total,
        quantity: o.quantity,
        status: o.status,
        payment_intent_id: o.paymentIntentId ?? paymentRecord?.intentId ?? null,
        payment_provider: o.paymentProvider ?? paymentRecord?.provider ?? 'mock',
        created_at: o.createdAt,
      });
    }
    for (const t of snapshot.issuedTickets) {
      stmtT.run({ id: t.id, order_id: t.orderId, tier_id: t.tierId, event_id: t.eventId, holder_name: t.holderName, holder_email: t.holderEmail, qr_payload: t.qrPayload, status: t.status, issued_at: t.issuedAt, scanned_at: t.scannedAt ?? null, scanned_gate: t.scannedGate ?? null });
    }
    markMigration('seed_orders_v1');
  }

  if (!hasMigration('orders_payment_fields_v1')) {
    if (!hasColumn('orders', 'payment_intent_id')) {
      db.prepare('ALTER TABLE orders ADD COLUMN payment_intent_id TEXT').run();
    }
    if (!hasColumn('orders', 'payment_provider')) {
      db.prepare("ALTER TABLE orders ADD COLUMN payment_provider TEXT NOT NULL DEFAULT 'mock'").run();
    }
    markMigration('orders_payment_fields_v1');
  }

  if (!hasMigration('seed_scans_v1')) {
    const stmt = db.prepare('INSERT OR IGNORE INTO scan_records (id, ticket_id, tier_id, event_id, gate, device_id, scanned_at, result, operator_id, deny_reason) VALUES (@id, @ticket_id, @tier_id, @event_id, @gate, @device_id, @scanned_at, @result, @operator_id, @deny_reason)');
    for (const s of snapshot.checkInScans) {
      stmt.run({ id: s.id, ticket_id: s.ticketId, tier_id: s.tierId ?? null, event_id: s.eventId, gate: s.gate, device_id: s.deviceId ?? null, scanned_at: s.scannedAt, result: s.result, operator_id: s.operatorId, deny_reason: s.denyReason ?? null });
    }
    markMigration('seed_scans_v1');
  }

  if (!hasMigration('seed_audit_v1')) {
    const stmt = db.prepare('INSERT OR IGNORE INTO audit_log (id, timestamp, actor, action, target, severity, note) VALUES (@id, @timestamp, @actor, @action, @target, @severity, @note)');
    for (const a of snapshot.auditLog) {
      stmt.run({ id: a.id, timestamp: a.timestamp, actor: a.actor, action: a.action, target: a.target ?? '', severity: a.severity ?? 'info', note: a.note ?? '' });
    }
    markMigration('seed_audit_v1');
  }

  if (!hasMigration('events_image_url_v1')) {
    if (!hasColumn('events', 'image_url')) {
      db.prepare('ALTER TABLE events ADD COLUMN image_url TEXT').run();
    }
    markMigration('events_image_url_v1');
  }

  if (!hasMigration('issued_tickets_seat_number_v1')) {
    if (!hasColumn('issued_tickets', 'seat_number')) {
      db.prepare('ALTER TABLE issued_tickets ADD COLUMN seat_number TEXT').run();
    }
    markMigration('issued_tickets_seat_number_v1');
  }

  if (!hasMigration('seed_marketing_v1')) {
    const stmtC = db.prepare('INSERT OR IGNORE INTO campaigns (id, event_id, name, channel, segment_id, status, subject, scheduled_at, sent_count, open_rate, click_rate, conversion_rate, source_tag, created_at) VALUES (@id, @event_id, @name, @channel, @segment_id, @status, @subject, @scheduled_at, @sent_count, @open_rate, @click_rate, @conversion_rate, @source_tag, @created_at)');
    const stmtD = db.prepare('INSERT OR IGNORE INTO discounts (id, event_id, name, code, type, amount, starts_at, ends_at, redemptions, revenue_attributed, active, created_at) VALUES (@id, @event_id, @name, @code, @type, @amount, @starts_at, @ends_at, @redemptions, @revenue_attributed, @active, @created_at)');
    const stmtR = db.prepare('INSERT OR IGNORE INTO referral_links (id, event_id, label, code, source, clicks, conversions, revenue_attributed, created_at) VALUES (@id, @event_id, @label, @code, @source, @clicks, @conversions, @revenue_attributed, @created_at)');
    for (const c of snapshot.campaigns) {
      stmtC.run({ id: c.id, event_id: c.eventId ?? null, name: c.name, channel: c.channel ?? 'email', segment_id: c.segmentId ?? null, status: c.status ?? 'draft', subject: c.subject ?? '', scheduled_at: c.scheduledAt ?? null, sent_count: c.sentCount ?? 0, open_rate: c.openRate ?? 0, click_rate: c.clickRate ?? 0, conversion_rate: c.conversionRate ?? 0, source_tag: c.sourceTag ?? '', created_at: c.createdAt });
    }
    for (const d of snapshot.discountCampaigns) {
      stmtD.run({ id: d.id, event_id: d.eventId ?? '', name: d.name, code: d.code, type: d.type ?? 'percentage', amount: d.amount ?? 0, starts_at: d.startsAt ?? null, ends_at: d.endsAt ?? null, redemptions: d.redemptions ?? 0, revenue_attributed: d.revenueAttributed ?? 0, active: d.active ? 1 : 0, created_at: d.createdAt });
    }
    for (const r of snapshot.referralLinks) {
      stmtR.run({ id: r.id, event_id: r.eventId ?? '', label: r.label, code: r.code, source: r.source ?? '', clicks: r.clicks ?? 0, conversions: r.conversions ?? 0, revenue_attributed: r.revenueAttributed ?? 0, created_at: r.createdAt });
    }
    markMigration('seed_marketing_v1');
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

function upsertUsers(users: TeamMember[]): void {
  const stmt = db.prepare('INSERT INTO users (id, name, email, role, scope, last_active) VALUES (@id, @name, @email, @role, @scope, @last_active) ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, role=excluded.role, scope=excluded.scope, last_active=excluded.last_active');
  for (const u of users) {
    stmt.run({ id: u.id, name: u.name, email: u.email.toLowerCase(), role: u.role, scope: u.scope, last_active: u.lastActive });
  }
}

function createInitialSnapshot(): AppDatabase {
  const orgId = randomId('org');
  return {
    schemaVersion: 1,
    updatedAt: nowIso(),
    organization: {
      id: orgId,
      name: 'New EventHub Organization',
      slug: 'eventhub',
      timezone: 'Pacific/Auckland',
      region: 'NZ',
      plan: 'starter',
      enabledPacks: ['standard'],
    },
    orgSettings: {
      orgId,
      emailSender: '',
      paymentProvider: 'mock',
      emailProvider: 'mock',
      qrIssuerKey: '',
      auditWebhook: '',
    },
    teamMembers: [],
    venues: [],
    events: [],
    ticketTiers: [],
    orders: [],
    issuedTickets: [],
    checkInScans: [],
    checkpoints: [],
    auditLog: [],
    paymentRecords: [],
    emailLogs: [],
    campaigns: [],
    discountCampaigns: [],
    referralLinks: [],
    checkoutQuestions: [],
    customerSegments: [],
    conversionReports: [],
    integrationConnections: [],
    webhookEndpoints: [],
    apiCredentials: [],
    financeExports: [],
    reconciliationRuns: [],
    taxProfiles: [],
    managedOrganizations: [],
    ssoConfigurations: [],
    sessions: [],
    speakers: [],
    sponsors: [],
    exhibitorBooths: [],
    matchmakingProfiles: [],
    appointments: [],
    livePolls: [],
    surveys: [],
    announcements: [],
    resaleListings: [],
    upgradeOffers: [],
    membershipPlans: [],
    sponsorPlacements: [],
    dynamicPricingRules: [],
    devices: [],
    accessRules: [],
    offlineQueue: [],
    reEntryRecords: [],
    waitingRoom: [],
    inventoryHolds: [],
    purchaseLimits: [],
    presaleCodes: [],
    priorityGroups: [],
    fraudFlags: [],
    abuseEvents: [],
    queueSnapshots: [],
  };
}

function ensureBootstrapped(): void {
  const existing = db.prepare('SELECT json FROM app_snapshot WHERE id = 1').get() as { json: string } | undefined;
  let snapshot: AppDatabase;
  if (!existing) {
    snapshot = createInitialSnapshot();
    db.prepare('INSERT INTO app_snapshot (id, json, updated_at) VALUES (1, ?, ?)').run(JSON.stringify(snapshot), nowIso());
  } else {
    snapshot = JSON.parse(existing.json) as AppDatabase;
  }
  upsertUsers(snapshot.teamMembers);
  runMigrations(snapshot);
}

ensureBootstrapped();

// ─── Row mappers ─────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function rowToUser(r: Row): TeamMember {
  return {
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    role: r.role as TeamMember['role'],
    scope: r.scope as string,
    lastActive: r.last_active as string,
  };
}

function rowToOrganization(r: Row): Organization {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    timezone: r.timezone as string,
    region: r.region as string,
    plan: r.plan as Organization['plan'],
    enabledPacks: JSON.parse((r.enabled_packs as string | undefined) ?? '["standard"]') as Organization['enabledPacks'],
  };
}

function rowToVenue(r: Row): Venue {
  return { id: r.id as string, name: r.name as string, address: r.address as string, city: r.city as string, country: r.country as string, capacity: r.capacity as number, zones: JSON.parse(r.zones as string) as string[], managerId: r.manager_id as string, manager: r.manager as string, createdAt: r.created_at as string };
}

function rowToEvent(r: Row): EventRecord {
  return { id: r.id as string, name: r.name as string, description: r.description as string, status: r.status as EventRecord['status'], startsAt: r.starts_at as string, endsAt: r.ends_at as string, venueId: r.venue_id as string, organizerId: r.organizer_id as string, category: r.category as string, ticketsSold: r.tickets_sold as number, grossRevenue: r.gross_revenue as number, createdAt: r.created_at as string, imageUrl: (r.image_url as string | null) ?? undefined };
}

function rowToTier(r: Row): TicketTier {
  return { id: r.id as string, eventId: r.event_id as string, name: r.name as string, kind: r.kind as TicketTier['kind'], price: r.price as number, inventory: r.inventory as number, sold: r.sold as number, description: r.description as string, saleStartsAt: (r.sale_starts_at as string | null) ?? undefined, saleEndsAt: (r.sale_ends_at as string | null) ?? undefined };
}

function rowToOrder(r: Row): OrderRecord {
  return {
    id: r.id as string,
    eventId: r.event_id as string,
    tierId: r.tier_id as string,
    buyerName: r.buyer_name as string,
    buyerEmail: r.buyer_email as string,
    total: r.total as number,
    quantity: r.quantity as number,
    status: r.status as OrderRecord['status'],
    paymentIntentId: (r.payment_intent_id as string | null) ?? undefined,
    paymentProvider: (r.payment_provider as string | null) ?? undefined,
    createdAt: r.created_at as string,
  };
}

function rowToTicket(r: Row): IssuedTicket {
  return { id: r.id as string, orderId: r.order_id as string, tierId: r.tier_id as string, eventId: r.event_id as string, holderName: r.holder_name as string, holderEmail: r.holder_email as string, qrPayload: r.qr_payload as string, status: r.status as IssuedTicket['status'], issuedAt: r.issued_at as string, scannedAt: (r.scanned_at as string | null) ?? undefined, scannedGate: (r.scanned_gate as string | null) ?? undefined, seatNumber: (r.seat_number as string | null) ?? undefined };
}

function rowToScan(r: Row): CheckInScan {
  return { id: r.id as string, ticketId: r.ticket_id as string, tierId: (r.tier_id as string | null) ?? undefined, eventId: r.event_id as string, gate: r.gate as string, deviceId: (r.device_id as string | null) ?? undefined, scannedAt: r.scanned_at as string, result: r.result as CheckInScan['result'], operatorId: r.operator_id as string, denyReason: (r.deny_reason as CheckInScan['denyReason'] | null) ?? undefined };
}

function rowToAudit(r: Row): AuditLogEntry {
  return { id: r.id as string, timestamp: r.timestamp as string, actor: r.actor as string, action: r.action as string, target: r.target as string, severity: r.severity as AuditLogEntry['severity'], note: r.note as string };
}

function rowToCampaign(r: Row): Campaign {
  return { id: r.id as string, eventId: (r.event_id as string | null) ?? undefined, name: r.name as string, channel: r.channel as Campaign['channel'], segmentId: (r.segment_id as string | null) ?? undefined, status: r.status as Campaign['status'], subject: r.subject as string, scheduledAt: (r.scheduled_at as string | null) ?? undefined, sentCount: r.sent_count as number, openRate: r.open_rate as number, clickRate: r.click_rate as number, conversionRate: r.conversion_rate as number, sourceTag: r.source_tag as string, createdAt: r.created_at as string };
}

function rowToDiscount(r: Row): DiscountCampaign {
  return { id: r.id as string, eventId: r.event_id as string, name: r.name as string, code: r.code as string, type: r.type as DiscountCampaign['type'], amount: r.amount as number, startsAt: (r.starts_at as string | null) ?? undefined, endsAt: (r.ends_at as string | null) ?? undefined, redemptions: r.redemptions as number, revenueAttributed: r.revenue_attributed as number, active: Boolean(r.active), createdAt: r.created_at as string };
}

function rowToReferral(r: Row): ReferralLink {
  return { id: r.id as string, eventId: r.event_id as string, label: r.label as string, code: r.code as string, source: r.source as string, clicks: r.clicks as number, conversions: r.conversions as number, revenueAttributed: r.revenue_attributed as number, createdAt: r.created_at as string };
}

// ─── Snapshot (merged) ───────────────────────────────────────────────────────

export function getSnapshot(): AppDatabase {
  const row = db.prepare('SELECT json FROM app_snapshot WHERE id = 1').get() as { json: string };
  const base = JSON.parse(row.json) as AppDatabase;
  const organizationRow = db.prepare('SELECT * FROM organizations ORDER BY created_at ASC LIMIT 1').get() as Row | undefined;
  const users = (db.prepare('SELECT id, name, email, role, scope, last_active FROM users ORDER BY name').all() as Row[]).map(rowToUser);
  return {
    ...base,
    organization: organizationRow ? rowToOrganization(organizationRow) : base.organization,
    teamMembers: users,
    venues: (db.prepare('SELECT * FROM venues ORDER BY name').all() as Row[]).map(rowToVenue),
    events: (db.prepare('SELECT * FROM events ORDER BY starts_at DESC').all() as Row[]).map(rowToEvent),
    ticketTiers: (db.prepare('SELECT * FROM ticket_tiers ORDER BY price').all() as Row[]).map(rowToTier),
    orders: (db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all() as Row[]).map(rowToOrder),
    issuedTickets: (db.prepare('SELECT * FROM issued_tickets ORDER BY issued_at DESC').all() as Row[]).map(rowToTicket),
    checkInScans: (db.prepare('SELECT * FROM scan_records ORDER BY scanned_at DESC LIMIT 500').all() as Row[]).map(rowToScan),
    auditLog: (db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 500').all() as Row[]).map(rowToAudit),
    campaigns: (db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all() as Row[]).map(rowToCampaign),
    discountCampaigns: (db.prepare('SELECT * FROM discounts ORDER BY created_at DESC').all() as Row[]).map(rowToDiscount),
    referralLinks: (db.prepare('SELECT * FROM referral_links ORDER BY created_at DESC').all() as Row[]).map(rowToReferral),
  };
}

export function saveSnapshot(snapshot: AppDatabase): AppDatabase {
  const next = { ...snapshot, updatedAt: nowIso() };

  const tx = db.transaction(() => {
    upsertUsers(next.teamMembers);

    db.prepare('INSERT INTO organizations (id, name, slug, timezone, region, plan, enabled_packs, created_at) VALUES (@id,@name,@slug,@timezone,@region,@plan,@enabled_packs,@created_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name,slug=excluded.slug,timezone=excluded.timezone,region=excluded.region,plan=excluded.plan,enabled_packs=excluded.enabled_packs').run({
      id: next.organization.id,
      name: next.organization.name,
      slug: next.organization.slug,
      timezone: next.organization.timezone,
      region: next.organization.region,
      plan: next.organization.plan,
      enabled_packs: JSON.stringify(next.organization.enabledPacks ?? ['standard']),
      created_at: nowIso(),
    });

    const uV = db.prepare('INSERT INTO venues (id, name, address, city, country, capacity, zones, manager_id, manager, created_at) VALUES (@id,@name,@address,@city,@country,@capacity,@zones,@manager_id,@manager,@created_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,city=excluded.city,country=excluded.country,capacity=excluded.capacity,zones=excluded.zones,manager_id=excluded.manager_id,manager=excluded.manager');
    for (const v of next.venues) uV.run({ id: v.id, name: v.name, address: v.address, city: v.city, country: v.country, capacity: v.capacity, zones: JSON.stringify(v.zones ?? []), manager_id: v.managerId ?? '', manager: v.manager ?? '', created_at: v.createdAt });

    const uE = db.prepare('INSERT INTO events (id, name, description, status, starts_at, ends_at, venue_id, organizer_id, category, tickets_sold, gross_revenue, image_url, created_at) VALUES (@id,@name,@description,@status,@starts_at,@ends_at,@venue_id,@organizer_id,@category,@tickets_sold,@gross_revenue,@image_url,@created_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at,venue_id=excluded.venue_id,organizer_id=excluded.organizer_id,category=excluded.category,tickets_sold=excluded.tickets_sold,gross_revenue=excluded.gross_revenue,image_url=excluded.image_url');
    for (const e of next.events) uE.run({ id: e.id, name: e.name, description: e.description ?? '', status: e.status, starts_at: e.startsAt, ends_at: e.endsAt, venue_id: e.venueId, organizer_id: e.organizerId, category: e.category ?? '', tickets_sold: e.ticketsSold ?? 0, gross_revenue: e.grossRevenue ?? 0, image_url: e.imageUrl ?? null, created_at: e.createdAt });

    const uT = db.prepare('INSERT INTO ticket_tiers (id, event_id, name, kind, price, inventory, sold, description, sale_starts_at, sale_ends_at) VALUES (@id,@event_id,@name,@kind,@price,@inventory,@sold,@description,@sale_starts_at,@sale_ends_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,price=excluded.price,inventory=excluded.inventory,sold=excluded.sold,description=excluded.description,sale_starts_at=excluded.sale_starts_at,sale_ends_at=excluded.sale_ends_at');
    for (const t of next.ticketTiers) uT.run({ id: t.id, event_id: t.eventId, name: t.name, kind: t.kind ?? 'general_admission', price: t.price, inventory: t.inventory, sold: t.sold ?? 0, description: t.description ?? '', sale_starts_at: t.saleStartsAt ?? null, sale_ends_at: t.saleEndsAt ?? null });

    const uO = db.prepare('INSERT INTO orders (id, event_id, tier_id, buyer_name, buyer_email, total, quantity, status, payment_intent_id, payment_provider, created_at) VALUES (@id,@event_id,@tier_id,@buyer_name,@buyer_email,@total,@quantity,@status,@payment_intent_id,@payment_provider,@created_at) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payment_intent_id=excluded.payment_intent_id,payment_provider=excluded.payment_provider');
    for (const o of next.orders) {
      const paymentRecord = next.paymentRecords.find((record) => record.orderId === o.id);
      uO.run({
        id: o.id,
        event_id: o.eventId,
        tier_id: o.tierId,
        buyer_name: o.buyerName,
        buyer_email: o.buyerEmail,
        total: o.total,
        quantity: o.quantity,
        status: o.status,
        payment_intent_id: o.paymentIntentId ?? paymentRecord?.intentId ?? null,
        payment_provider: o.paymentProvider ?? paymentRecord?.provider ?? 'mock',
        created_at: o.createdAt,
      });
    }

    const uTk = db.prepare('INSERT INTO issued_tickets (id, order_id, tier_id, event_id, holder_name, holder_email, qr_payload, status, issued_at, scanned_at, scanned_gate, seat_number) VALUES (@id,@order_id,@tier_id,@event_id,@holder_name,@holder_email,@qr_payload,@status,@issued_at,@scanned_at,@scanned_gate,@seat_number) ON CONFLICT(id) DO UPDATE SET status=excluded.status,holder_name=excluded.holder_name,holder_email=excluded.holder_email,scanned_at=excluded.scanned_at,scanned_gate=excluded.scanned_gate,seat_number=excluded.seat_number');
    for (const t of next.issuedTickets) uTk.run({ id: t.id, order_id: t.orderId, tier_id: t.tierId, event_id: t.eventId, holder_name: t.holderName, holder_email: t.holderEmail, qr_payload: t.qrPayload, status: t.status, issued_at: t.issuedAt, scanned_at: t.scannedAt ?? null, scanned_gate: t.scannedGate ?? null, seat_number: t.seatNumber ?? null });

    const uS = db.prepare('INSERT OR IGNORE INTO scan_records (id, ticket_id, tier_id, event_id, gate, device_id, scanned_at, result, operator_id, deny_reason) VALUES (@id,@ticket_id,@tier_id,@event_id,@gate,@device_id,@scanned_at,@result,@operator_id,@deny_reason)');
    for (const s of next.checkInScans) uS.run({ id: s.id, ticket_id: s.ticketId, tier_id: s.tierId ?? null, event_id: s.eventId, gate: s.gate, device_id: s.deviceId ?? null, scanned_at: s.scannedAt, result: s.result, operator_id: s.operatorId, deny_reason: s.denyReason ?? null });

    const uA = db.prepare('INSERT OR IGNORE INTO audit_log (id, timestamp, actor, action, target, severity, note) VALUES (@id,@timestamp,@actor,@action,@target,@severity,@note)');
    for (const a of next.auditLog) uA.run({ id: a.id, timestamp: a.timestamp, actor: a.actor, action: a.action, target: a.target ?? '', severity: a.severity ?? 'info', note: a.note ?? '' });

    const uC = db.prepare('INSERT INTO campaigns (id, event_id, name, channel, segment_id, status, subject, scheduled_at, sent_count, open_rate, click_rate, conversion_rate, source_tag, created_at) VALUES (@id,@event_id,@name,@channel,@segment_id,@status,@subject,@scheduled_at,@sent_count,@open_rate,@click_rate,@conversion_rate,@source_tag,@created_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,subject=excluded.subject,scheduled_at=excluded.scheduled_at,sent_count=excluded.sent_count,open_rate=excluded.open_rate,click_rate=excluded.click_rate,conversion_rate=excluded.conversion_rate');
    for (const c of next.campaigns) uC.run({ id: c.id, event_id: c.eventId ?? null, name: c.name, channel: c.channel ?? 'email', segment_id: c.segmentId ?? null, status: c.status ?? 'draft', subject: c.subject ?? '', scheduled_at: c.scheduledAt ?? null, sent_count: c.sentCount ?? 0, open_rate: c.openRate ?? 0, click_rate: c.clickRate ?? 0, conversion_rate: c.conversionRate ?? 0, source_tag: c.sourceTag ?? '', created_at: c.createdAt });

    const uD = db.prepare('INSERT INTO discounts (id, event_id, name, code, type, amount, starts_at, ends_at, redemptions, revenue_attributed, active, created_at) VALUES (@id,@event_id,@name,@code,@type,@amount,@starts_at,@ends_at,@redemptions,@revenue_attributed,@active,@created_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,amount=excluded.amount,starts_at=excluded.starts_at,ends_at=excluded.ends_at,redemptions=excluded.redemptions,revenue_attributed=excluded.revenue_attributed,active=excluded.active');
    for (const d of next.discountCampaigns) uD.run({ id: d.id, event_id: d.eventId ?? '', name: d.name, code: d.code, type: d.type ?? 'percentage', amount: d.amount ?? 0, starts_at: d.startsAt ?? null, ends_at: d.endsAt ?? null, redemptions: d.redemptions ?? 0, revenue_attributed: d.revenueAttributed ?? 0, active: d.active ? 1 : 0, created_at: d.createdAt });

    const uR = db.prepare('INSERT INTO referral_links (id, event_id, label, code, source, clicks, conversions, revenue_attributed, created_at) VALUES (@id,@event_id,@label,@code,@source,@clicks,@conversions,@revenue_attributed,@created_at) ON CONFLICT(id) DO UPDATE SET label=excluded.label,clicks=excluded.clicks,conversions=excluded.conversions,revenue_attributed=excluded.revenue_attributed');
    for (const r of next.referralLinks) uR.run({ id: r.id, event_id: r.eventId ?? '', label: r.label, code: r.code, source: r.source ?? '', clicks: r.clicks ?? 0, conversions: r.conversions ?? 0, revenue_attributed: r.revenueAttributed ?? 0, created_at: r.createdAt });

    const stripped = { ...next, venues: [], events: [], ticketTiers: [], orders: [], issuedTickets: [], checkInScans: [], auditLog: [], campaigns: [], discountCampaigns: [], referralLinks: [] };
    db.prepare('INSERT INTO app_snapshot (id, json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at').run(JSON.stringify(stripped), next.updatedAt);
  });

  tx();
  return next;
}

export function getPublicSnapshot(): AppDatabase {
  const snapshot = getSnapshot();
  return {
    ...snapshot,
    teamMembers: snapshot.teamMembers.map((m) => ({ ...m, email: '' })),
    orders: [], issuedTickets: [], auditLog: [], paymentRecords: [], emailLogs: [],
    integrationConnections: [], webhookEndpoints: [], apiCredentials: [], financeExports: [],
    reconciliationRuns: [], taxProfiles: [], managedOrganizations: [], ssoConfigurations: [],
    devices: [], accessRules: [], offlineQueue: [], reEntryRecords: [],
    fraudFlags: [], abuseEvents: [], queueSnapshots: [],
  };
}

export function getOrganization(): Organization {
  const row = db.prepare('SELECT * FROM organizations ORDER BY created_at ASC LIMIT 1').get() as Row | undefined;
  return row ? rowToOrganization(row) : getSnapshot().organization;
}

export interface AuthRequestState {
  nextAllowedAt: string | null;
  recentEmailRequests: number;
  recentIpRequests: number;
}

export interface AuthFailureState {
  lockedUntil: string | null;
  recentFailures: number;
}

export interface TeamInviteRecord {
  id: string;
  email: string;
  name: string;
  role: TeamMember['role'];
  scope: string;
  invitedBy: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
}

function rowToInvite(r: Row): TeamInviteRecord {
  return {
    id: r.id as string,
    email: r.email as string,
    name: r.name as string,
    role: r.role as TeamMember['role'],
    scope: r.scope as string,
    invitedBy: r.invited_by as string,
    token: r.token as string,
    status: r.status as TeamInviteRecord['status'],
    createdAt: r.created_at as string,
    expiresAt: r.expires_at as string,
    acceptedAt: (r.accepted_at as string | null) ?? undefined,
  };
}

export function getUserById(id: string): TeamMember | null {
  const row = db.prepare('SELECT id, name, email, role, scope, last_active FROM users WHERE id = ?').get(id) as Row | undefined;
  return row ? rowToUser(row) : null;
}

export function countUsers(): number {
  return (db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count;
}

export function countSuperAdmins(): number {
  return (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin'").get() as { count: number }).count;
}

export function listAllUsers(): TeamMember[] {
  return (db.prepare('SELECT id, name, email, role, scope, last_active FROM users ORDER BY role, name').all() as Row[]).map(rowToUser);
}

export function clearAuthAttemptsForEmail(email: string): void {
  const e = email.toLowerCase();
  db.prepare('DELETE FROM auth_attempts WHERE email = ?').run(e);
  db.prepare('DELETE FROM auth_codes WHERE email = ?').run(e);
}

export function updateOrganizationRecord(patch: Partial<Organization>): Organization {
  const existing = getOrganization();
  const next: Organization = {
    ...existing,
    ...patch,
    enabledPacks: patch.enabledPacks ?? existing.enabledPacks,
  };
  db.prepare('INSERT INTO organizations (id, name, slug, timezone, region, plan, enabled_packs, created_at) VALUES (@id,@name,@slug,@timezone,@region,@plan,@enabled_packs,@created_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, timezone=excluded.timezone, region=excluded.region, plan=excluded.plan, enabled_packs=excluded.enabled_packs').run({
    id: next.id,
    name: next.name,
    slug: next.slug,
    timezone: next.timezone,
    region: next.region,
    plan: next.plan,
    enabled_packs: JSON.stringify(next.enabledPacks ?? ['standard']),
    created_at: nowIso(),
  });
  return next;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function findUserByEmail(email: string): TeamMember | null {
  const r = db.prepare('SELECT id, name, email, role, scope, last_active FROM users WHERE email = ?').get(email.toLowerCase()) as Row | undefined;
  if (!r) return null;
  return rowToUser(r);
}

export function createOrUpdateUser(user: TeamMember): TeamMember {
  upsertUsers([user]);
  return user;
}

export function getAuthRequestState(email: string, ipAddress: string): AuthRequestState {
  const emailLower = email.toLowerCase();
  const cooldownSince = new Date(Date.now() - serverEnv.authRequestCooldownSeconds * 1000).toISOString();
  const recentWindow = new Date(Date.now() - serverEnv.authRequestWindowMinutes * 60_000).toISOString();
  const latest = db.prepare('SELECT MAX(created_at) AS created_at FROM auth_codes WHERE email = ?').get(emailLower) as { created_at?: string | null };
  const recentEmailRequests = (db.prepare('SELECT COUNT(*) AS count FROM auth_codes WHERE email = ? AND created_at >= ?').get(emailLower, recentWindow) as { count: number }).count;
  const recentIpRequests = (db.prepare("SELECT COUNT(*) AS count FROM auth_attempts WHERE kind = 'request' AND ip_address = ? AND attempted_at >= ?").get(ipAddress, recentWindow) as { count: number }).count;
  const nextAllowedAt = latest.created_at && latest.created_at >= cooldownSince
    ? new Date(new Date(latest.created_at).getTime() + serverEnv.authRequestCooldownSeconds * 1000).toISOString()
    : null;
  return { nextAllowedAt, recentEmailRequests, recentIpRequests };
}

export function getAuthFailureState(email: string, ipAddress: string): AuthFailureState {
  const emailLower = email.toLowerCase();
  const recentWindow = new Date(Date.now() - serverEnv.authVerifyWindowMinutes * 60_000).toISOString();
  const failures = db.prepare("SELECT attempted_at FROM auth_attempts WHERE email = ? AND ip_address = ? AND kind = 'verify' AND success = 0 AND attempted_at >= ? ORDER BY attempted_at DESC").all(emailLower, ipAddress, recentWindow) as Array<{ attempted_at: string }>;
  if (failures.length < serverEnv.authVerifyFailureLimit) {
    return { lockedUntil: null, recentFailures: failures.length };
  }
  const latestFailure = failures[0]?.attempted_at;
  const lockedUntil = latestFailure ? new Date(new Date(latestFailure).getTime() + serverEnv.authLockoutMinutes * 60_000).toISOString() : null;
  if (lockedUntil && lockedUntil > nowIso()) {
    return { lockedUntil, recentFailures: failures.length };
  }
  return { lockedUntil: null, recentFailures: failures.length };
}

export function recordAuthAttempt(email: string, ipAddress: string, kind: 'request' | 'verify', success: boolean): void {
  db.prepare('INSERT INTO auth_attempts (id, email, ip_address, kind, success, attempted_at) VALUES (?, ?, ?, ?, ?, ?)').run(randomId('auth'), email.toLowerCase(), ipAddress, kind, success ? 1 : 0, nowIso());
}

export function invalidateOutstandingAuthCodes(email: string): void {
  db.prepare('UPDATE auth_codes SET consumed_at = COALESCE(consumed_at, ?) WHERE email = ?').run(nowIso(), email.toLowerCase());
}

export function createAuthCode(email: string, code: string, expiresAt: string): void {
  db.prepare('INSERT INTO auth_codes (id, email, code, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, NULL)').run(`code_${Math.random().toString(36).slice(2, 10)}`, email.toLowerCase(), code, nowIso(), expiresAt);
}

export function consumeAuthCode(email: string, code: string): boolean {
  const now = nowIso();
  const r = db.prepare('SELECT id FROM auth_codes WHERE email = ? AND code = ? AND consumed_at IS NULL AND expires_at >= ? ORDER BY created_at DESC LIMIT 1').get(email.toLowerCase(), code, now) as { id: string } | undefined;
  if (!r) return false;
  db.prepare('UPDATE auth_codes SET consumed_at = ? WHERE id = ?').run(now, r.id);
  return true;
}

export function createSession(userId: string, token: string, expiresAt: string): void {
  const now = nowIso();
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(token, userId, now, expiresAt, now);
}

export function getSession(token: string): { token: string; expiresAt: string; user: TeamMember } | null {
  const r = db.prepare('SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role, u.scope, u.last_active FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at >= ?').get(token, nowIso()) as Row | undefined;
  if (!r) return null;
  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token = ?').run(nowIso(), token);
  return { token: r.token as string, expiresAt: r.expires_at as string, user: { id: r.id as string, name: r.name as string, email: r.email as string, role: r.role as TeamMember['role'], scope: r.scope as string, lastActive: r.last_active as string } };
}

export function deleteSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function deleteSessionsForUser(userId: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function listTeamInvites(): TeamInviteRecord[] {
  return (db.prepare('SELECT * FROM team_invites ORDER BY created_at DESC').all() as Row[]).map(rowToInvite);
}

export function getTeamInviteByToken(token: string): TeamInviteRecord | null {
  const row = db.prepare('SELECT * FROM team_invites WHERE token = ?').get(token) as Row | undefined;
  if (!row) return null;
  const invite = rowToInvite(row);
  if (invite.status === 'pending' && invite.expiresAt < nowIso()) {
    db.prepare("UPDATE team_invites SET status = 'expired' WHERE id = ?").run(invite.id);
    return { ...invite, status: 'expired' };
  }
  return invite;
}

export function createTeamInvite(input: Omit<TeamInviteRecord, 'id' | 'createdAt' | 'acceptedAt' | 'status'>): TeamInviteRecord {
  const invite: TeamInviteRecord = {
    id: randomId('invite'),
    createdAt: nowIso(),
    status: 'pending',
    ...input,
  };
  db.prepare('INSERT INTO team_invites (id, email, name, role, scope, invited_by, token, status, created_at, expires_at, accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)').run(
    invite.id,
    invite.email.toLowerCase(),
    invite.name,
    invite.role,
    invite.scope,
    invite.invitedBy,
    invite.token,
    invite.status,
    invite.createdAt,
    invite.expiresAt,
  );
  return invite;
}

export function acceptTeamInvite(token: string): TeamInviteRecord | null {
  const invite = getTeamInviteByToken(token);
  if (!invite || invite.status !== 'pending') return invite;
  const acceptedAt = nowIso();
  db.prepare("UPDATE team_invites SET status = 'accepted', accepted_at = ? WHERE id = ?").run(acceptedAt, invite.id);
  return { ...invite, status: 'accepted', acceptedAt };
}

export function bootstrapFirstAdmin(input: { organizationName: string; organizationSlug: string; name: string; email: string; timezone: string; region: string }): TeamMember {
  if (countUsers() > 0 || countSuperAdmins() > 0) {
    throw new Error('Bootstrap is no longer available.');
  }
  const organization = updateOrganizationRecord({
    name: input.organizationName.trim(),
    slug: input.organizationSlug.trim().toLowerCase(),
    timezone: input.timezone.trim(),
    region: input.region.trim(),
    plan: 'starter',
    enabledPacks: ['standard'],
  });
  const user: TeamMember = {
    id: randomId('user'),
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: 'super_admin',
    scope: `${organization.name} (all organizations)`,
    lastActive: nowIso(),
  };
  createOrUpdateUser(user);
  return user;
}

export function listAccountOrders(email: string): Pick<AppDatabase, 'orders' | 'issuedTickets' | 'paymentRecords'> {
  const normalized = email.toLowerCase();
  const orders = (db.prepare('SELECT * FROM orders WHERE LOWER(buyer_email) = ? ORDER BY created_at DESC').all(normalized) as Row[]).map(rowToOrder);
  const orderIds = orders.map((o) => o.id);
  const tickets = orderIds.length > 0
    ? (db.prepare(`SELECT * FROM issued_tickets WHERE order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY issued_at DESC`).all(...orderIds) as Row[]).map(rowToTicket)
    : [];
  const base = JSON.parse((db.prepare('SELECT json FROM app_snapshot WHERE id = 1').get() as { json: string }).json) as AppDatabase;
  return { orders, issuedTickets: tickets, paymentRecords: base.paymentRecords.filter((p) => orderIds.includes(p.orderId)) };
}

// ─── Venues ──────────────────────────────────────────────────────────────────

export function listVenues(): Venue[] {
  return (db.prepare('SELECT * FROM venues ORDER BY name').all() as Row[]).map(rowToVenue);
}

export function getVenue(id: string): Venue | null {
  const r = db.prepare('SELECT * FROM venues WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToVenue(r) : null;
}

export function upsertVenue(venue: Venue): Venue {
  db.prepare('INSERT INTO venues (id, name, address, city, country, capacity, zones, manager_id, manager, created_at) VALUES (@id,@name,@address,@city,@country,@capacity,@zones,@manager_id,@manager,@created_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name,address=excluded.address,city=excluded.city,country=excluded.country,capacity=excluded.capacity,zones=excluded.zones,manager_id=excluded.manager_id,manager=excluded.manager').run({ id: venue.id, name: venue.name, address: venue.address, city: venue.city, country: venue.country, capacity: venue.capacity, zones: JSON.stringify(venue.zones ?? []), manager_id: venue.managerId ?? '', manager: venue.manager ?? '', created_at: venue.createdAt });
  return venue;
}

export function deleteVenue(id: string): boolean {
  return db.prepare('DELETE FROM venues WHERE id = ?').run(id).changes > 0;
}

// ─── Events ──────────────────────────────────────────────────────────────────

export interface EventFilters { status?: string; venueId?: string; organizerId?: string; limit?: number; offset?: number }

export function listEvents(filters: EventFilters = {}): { events: EventRecord[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) { where.push('status = ?'); params.push(filters.status); }
  if (filters.venueId) { where.push('venue_id = ?'); params.push(filters.venueId); }
  if (filters.organizerId) { where.push('organizer_id = ?'); params.push(filters.organizerId); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as n FROM events ${clause}`).get(...params) as { n: number }).n;
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  return { events: (db.prepare(`SELECT * FROM events ${clause} ORDER BY starts_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Row[]).map(rowToEvent), total };
}

export function getEvent(id: string): EventRecord | null {
  const r = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToEvent(r) : null;
}

export function upsertEvent(event: EventRecord): EventRecord {
  db.prepare('INSERT INTO events (id, name, description, status, starts_at, ends_at, venue_id, organizer_id, category, tickets_sold, gross_revenue, image_url, created_at) VALUES (@id,@name,@description,@status,@starts_at,@ends_at,@venue_id,@organizer_id,@category,@tickets_sold,@gross_revenue,@image_url,@created_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,status=excluded.status,starts_at=excluded.starts_at,ends_at=excluded.ends_at,venue_id=excluded.venue_id,organizer_id=excluded.organizer_id,category=excluded.category,tickets_sold=excluded.tickets_sold,gross_revenue=excluded.gross_revenue,image_url=excluded.image_url').run({ id: event.id, name: event.name, description: event.description ?? '', status: event.status, starts_at: event.startsAt, ends_at: event.endsAt, venue_id: event.venueId, organizer_id: event.organizerId, category: event.category ?? '', tickets_sold: event.ticketsSold ?? 0, gross_revenue: event.grossRevenue ?? 0, image_url: event.imageUrl ?? null, created_at: event.createdAt });
  return event;
}

export function deleteEvent(id: string): boolean {
  return db.prepare('DELETE FROM events WHERE id = ?').run(id).changes > 0;
}

// ─── Ticket Tiers ─────────────────────────────────────────────────────────────

export function listTiers(eventId: string): TicketTier[] {
  return (db.prepare('SELECT * FROM ticket_tiers WHERE event_id = ? ORDER BY price').all(eventId) as Row[]).map(rowToTier);
}

export function getTier(id: string): TicketTier | null {
  const r = db.prepare('SELECT * FROM ticket_tiers WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToTier(r) : null;
}

export function upsertTier(tier: TicketTier): TicketTier {
  db.prepare('INSERT INTO ticket_tiers (id, event_id, name, kind, price, inventory, sold, description, sale_starts_at, sale_ends_at) VALUES (@id,@event_id,@name,@kind,@price,@inventory,@sold,@description,@sale_starts_at,@sale_ends_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,price=excluded.price,inventory=excluded.inventory,sold=excluded.sold,description=excluded.description,sale_starts_at=excluded.sale_starts_at,sale_ends_at=excluded.sale_ends_at').run({ id: tier.id, event_id: tier.eventId, name: tier.name, kind: tier.kind ?? 'general_admission', price: tier.price, inventory: tier.inventory, sold: tier.sold ?? 0, description: tier.description ?? '', sale_starts_at: tier.saleStartsAt ?? null, sale_ends_at: tier.saleEndsAt ?? null });
  return tier;
}

export function deleteTier(id: string): boolean {
  return db.prepare('DELETE FROM ticket_tiers WHERE id = ?').run(id).changes > 0;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface OrderFilters { eventId?: string; tierId?: string; buyerEmail?: string; status?: string; limit?: number; offset?: number }

export function listOrders(filters: OrderFilters = {}): { orders: OrderRecord[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.eventId) { where.push('event_id = ?'); params.push(filters.eventId); }
  if (filters.tierId) { where.push('tier_id = ?'); params.push(filters.tierId); }
  if (filters.buyerEmail) { where.push('LOWER(buyer_email) = ?'); params.push(filters.buyerEmail.toLowerCase()); }
  if (filters.status) { where.push('status = ?'); params.push(filters.status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as n FROM orders ${clause}`).get(...params) as { n: number }).n;
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  return { orders: (db.prepare(`SELECT * FROM orders ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Row[]).map(rowToOrder), total };
}

export function getOrder(id: string): OrderRecord | null {
  const r = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToOrder(r) : null;
}

function canTransitionOrderStatus(current: OrderRecord['status'], next: OrderRecord['status']): boolean {
  if (current === next) return true;
  switch (current) {
    case 'pending':
      return next === 'paid' || next === 'cancelled';
    case 'paid':
      return next === 'refunded' || next === 'cancelled';
    case 'cancelled':
    case 'refunded':
      return false;
    default:
      return false;
  }
}

export function transitionOrderStatus(id: string, status: OrderRecord['status']): OrderRecord | null {
  const existing = getOrder(id);
  if (!existing) return null;
  if (!canTransitionOrderStatus(existing.status, status)) {
    throw new Error(`Invalid order status transition: ${existing.status} → ${status}`);
  }
  if (existing.status === status) return existing;

  const tx = db.transaction(() => {
    if (status === 'cancelled' || status === 'refunded') {
      const ticketStatus = status === 'refunded' ? 'refunded' : 'cancelled';
      db.prepare(`UPDATE issued_tickets SET status = ? WHERE order_id = ? AND status NOT IN ('used', 'transferred')`).run(ticketStatus, id);
      if (existing.status === 'paid') {
        db.prepare('UPDATE ticket_tiers SET sold = MAX(sold - ?, 0) WHERE id = ?').run(existing.quantity, existing.tierId);
        db.prepare('UPDATE events SET tickets_sold = MAX(tickets_sold - ?, 0), gross_revenue = MAX(gross_revenue - ?, 0) WHERE id = ?').run(existing.quantity, existing.total, existing.eventId);
      }
    }

    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
  });

  tx();
  return getOrder(id);
}

export function getOrderPaymentIntent(id: string): { intentId?: string; provider?: string } {
  const order = getOrder(id);
  if (order?.paymentIntentId) {
    return { intentId: order.paymentIntentId, provider: order.paymentProvider };
  }

  const base = JSON.parse((db.prepare('SELECT json FROM app_snapshot WHERE id = 1').get() as { json: string }).json) as AppDatabase;
  const payment = base.paymentRecords.find((record) => record.orderId === id);
  return payment ? { intentId: payment.intentId, provider: payment.provider } : {};
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export interface TicketFilters { orderId?: string; eventId?: string; holderEmail?: string; status?: string; limit?: number; offset?: number }

export function listTickets(filters: TicketFilters = {}): { tickets: IssuedTicket[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.orderId) { where.push('order_id = ?'); params.push(filters.orderId); }
  if (filters.eventId) { where.push('event_id = ?'); params.push(filters.eventId); }
  if (filters.holderEmail) { where.push('LOWER(holder_email) = ?'); params.push(filters.holderEmail.toLowerCase()); }
  if (filters.status) { where.push('status = ?'); params.push(filters.status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as n FROM issued_tickets ${clause}`).get(...params) as { n: number }).n;
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  return { tickets: (db.prepare(`SELECT * FROM issued_tickets ${clause} ORDER BY issued_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Row[]).map(rowToTicket), total };
}

export function getTicket(id: string): IssuedTicket | null {
  const r = db.prepare('SELECT * FROM issued_tickets WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToTicket(r) : null;
}

export function getTicketByQrPayload(qrPayload: string): IssuedTicket | null {
  const r = db.prepare('SELECT * FROM issued_tickets WHERE qr_payload = ?').get(qrPayload) as Row | undefined;
  return r ? rowToTicket(r) : null;
}

export function updateTicketStatus(id: string, status: IssuedTicket['status'], scannedAt?: string, scannedGate?: string): IssuedTicket | null {
  db.prepare('UPDATE issued_tickets SET status = ?, scanned_at = COALESCE(?, scanned_at), scanned_gate = COALESCE(?, scanned_gate) WHERE id = ?').run(status, scannedAt ?? null, scannedGate ?? null, id);
  return getTicket(id);
}

export function transferTicket(id: string, holderName: string, holderEmail: string): IssuedTicket | null {
  db.prepare("UPDATE issued_tickets SET holder_name = ?, holder_email = ? WHERE id = ? AND status = 'valid'").run(holderName.trim(), holderEmail.trim().toLowerCase(), id);
  return getTicket(id);
}

export function markTicketTransferred(id: string): IssuedTicket | null {
  db.prepare("UPDATE issued_tickets SET status = 'transferred' WHERE id = ? AND status = 'valid'").run(id);
  return getTicket(id);
}

export function createTicket(ticket: IssuedTicket): IssuedTicket {
  db.prepare('INSERT INTO issued_tickets (id, order_id, tier_id, event_id, holder_name, holder_email, qr_payload, status, issued_at, scanned_at, scanned_gate, seat_number) VALUES (@id,@order_id,@tier_id,@event_id,@holder_name,@holder_email,@qr_payload,@status,@issued_at,@scanned_at,@scanned_gate,@seat_number)').run({ id: ticket.id, order_id: ticket.orderId, tier_id: ticket.tierId, event_id: ticket.eventId, holder_name: ticket.holderName, holder_email: ticket.holderEmail, qr_payload: ticket.qrPayload, status: ticket.status, issued_at: ticket.issuedAt, scanned_at: ticket.scannedAt ?? null, scanned_gate: ticket.scannedGate ?? null, seat_number: ticket.seatNumber ?? null });
  return ticket;
}

export function cancelOrderTickets(orderId: string): void {
  db.prepare("UPDATE issued_tickets SET status = 'cancelled' WHERE order_id = ?").run(orderId);
}

// ─── Scans ────────────────────────────────────────────────────────────────────

export function recordScan(scan: CheckInScan): void {
  db.prepare('INSERT OR IGNORE INTO scan_records (id, ticket_id, tier_id, event_id, gate, device_id, scanned_at, result, operator_id, deny_reason) VALUES (@id,@ticket_id,@tier_id,@event_id,@gate,@device_id,@scanned_at,@result,@operator_id,@deny_reason)').run({ id: scan.id, ticket_id: scan.ticketId, tier_id: scan.tierId ?? null, event_id: scan.eventId, gate: scan.gate, device_id: scan.deviceId ?? null, scanned_at: scan.scannedAt, result: scan.result, operator_id: scan.operatorId, deny_reason: scan.denyReason ?? null });
}

export interface ScanFilters { eventId?: string; gate?: string; result?: string; limit?: number }

export function listScans(filters: ScanFilters = {}): CheckInScan[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.eventId) { where.push('event_id = ?'); params.push(filters.eventId); }
  if (filters.gate) { where.push('gate = ?'); params.push(filters.gate); }
  if (filters.result) { where.push('result = ?'); params.push(filters.result); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = filters.limit ?? 100;
  return (db.prepare(`SELECT * FROM scan_records ${clause} ORDER BY scanned_at DESC LIMIT ?`).all(...params, limit) as Row[]).map(rowToScan);
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export function appendAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
  const id = randomId('aud');
  const timestamp = nowIso();
  db.prepare('INSERT INTO audit_log (id, timestamp, actor, action, target, severity, note) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, timestamp, entry.actor, entry.action, entry.target ?? '', entry.severity ?? 'info', entry.note ?? '');
  return { id, timestamp, ...entry };
}

export interface AuditFilters { actor?: string; action?: string; severity?: string; limit?: number; offset?: number }

export function listAudit(filters: AuditFilters = {}): { entries: AuditLogEntry[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.actor) { where.push('actor = ?'); params.push(filters.actor); }
  if (filters.action) { where.push('action LIKE ?'); params.push(`%${filters.action}%`); }
  if (filters.severity) { where.push('severity = ?'); params.push(filters.severity); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as n FROM audit_log ${clause}`).get(...params) as { n: number }).n;
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  return { entries: (db.prepare(`SELECT * FROM audit_log ${clause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Row[]).map(rowToAudit), total };
}

// ─── Campaigns ───────────────────────────────────────────────────────────────

export function listCampaigns(eventId?: string): Campaign[] {
  if (eventId) return (db.prepare('SELECT * FROM campaigns WHERE event_id = ? ORDER BY created_at DESC').all(eventId) as Row[]).map(rowToCampaign);
  return (db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all() as Row[]).map(rowToCampaign);
}

export function upsertCampaign(c: Campaign): Campaign {
  db.prepare('INSERT INTO campaigns (id, event_id, name, channel, segment_id, status, subject, scheduled_at, sent_count, open_rate, click_rate, conversion_rate, source_tag, created_at) VALUES (@id,@event_id,@name,@channel,@segment_id,@status,@subject,@scheduled_at,@sent_count,@open_rate,@click_rate,@conversion_rate,@source_tag,@created_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,subject=excluded.subject,scheduled_at=excluded.scheduled_at,sent_count=excluded.sent_count,open_rate=excluded.open_rate,click_rate=excluded.click_rate,conversion_rate=excluded.conversion_rate').run({ id: c.id, event_id: c.eventId ?? null, name: c.name, channel: c.channel ?? 'email', segment_id: c.segmentId ?? null, status: c.status ?? 'draft', subject: c.subject ?? '', scheduled_at: c.scheduledAt ?? null, sent_count: c.sentCount ?? 0, open_rate: c.openRate ?? 0, click_rate: c.clickRate ?? 0, conversion_rate: c.conversionRate ?? 0, source_tag: c.sourceTag ?? '', created_at: c.createdAt });
  return c;
}

export function deleteCampaign(id: string): boolean {
  return db.prepare('DELETE FROM campaigns WHERE id = ?').run(id).changes > 0;
}

// ─── Discounts ───────────────────────────────────────────────────────────────

export function listDiscounts(eventId?: string): DiscountCampaign[] {
  if (eventId) return (db.prepare('SELECT * FROM discounts WHERE event_id = ? ORDER BY created_at DESC').all(eventId) as Row[]).map(rowToDiscount);
  return (db.prepare('SELECT * FROM discounts ORDER BY created_at DESC').all() as Row[]).map(rowToDiscount);
}

export function upsertDiscount(d: DiscountCampaign): DiscountCampaign {
  db.prepare('INSERT INTO discounts (id, event_id, name, code, type, amount, starts_at, ends_at, redemptions, revenue_attributed, active, created_at) VALUES (@id,@event_id,@name,@code,@type,@amount,@starts_at,@ends_at,@redemptions,@revenue_attributed,@active,@created_at) ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,amount=excluded.amount,starts_at=excluded.starts_at,ends_at=excluded.ends_at,redemptions=excluded.redemptions,revenue_attributed=excluded.revenue_attributed,active=excluded.active').run({ id: d.id, event_id: d.eventId ?? '', name: d.name, code: d.code, type: d.type ?? 'percentage', amount: d.amount ?? 0, starts_at: d.startsAt ?? null, ends_at: d.endsAt ?? null, redemptions: d.redemptions ?? 0, revenue_attributed: d.revenueAttributed ?? 0, active: d.active ? 1 : 0, created_at: d.createdAt });
  return d;
}

export function deleteDiscount(id: string): boolean {
  return db.prepare('DELETE FROM discounts WHERE id = ?').run(id).changes > 0;
}

// ─── Referrals ───────────────────────────────────────────────────────────────

export function listReferrals(eventId?: string): ReferralLink[] {
  if (eventId) return (db.prepare('SELECT * FROM referral_links WHERE event_id = ? ORDER BY created_at DESC').all(eventId) as Row[]).map(rowToReferral);
  return (db.prepare('SELECT * FROM referral_links ORDER BY created_at DESC').all() as Row[]).map(rowToReferral);
}

export function upsertReferral(r: ReferralLink): ReferralLink {
  db.prepare('INSERT INTO referral_links (id, event_id, label, code, source, clicks, conversions, revenue_attributed, created_at) VALUES (@id,@event_id,@label,@code,@source,@clicks,@conversions,@revenue_attributed,@created_at) ON CONFLICT(id) DO UPDATE SET label=excluded.label,clicks=excluded.clicks,conversions=excluded.conversions,revenue_attributed=excluded.revenue_attributed').run({ id: r.id, event_id: r.eventId ?? '', label: r.label, code: r.code, source: r.source ?? '', clicks: r.clicks ?? 0, conversions: r.conversions ?? 0, revenue_attributed: r.revenueAttributed ?? 0, created_at: r.createdAt });
  return r;
}

export function deleteReferral(id: string): boolean {
  return db.prepare('DELETE FROM referral_links WHERE id = ?').run(id).changes > 0;
}

// ─── Staff Assignments ────────────────────────────────────────────────────────

function rowToAssignment(r: Row): StaffAssignment {
  return {
    id: r.id as string,
    staffId: r.staff_id as string,
    eventId: r.event_id as string,
    gate: (r.gate as string | null) ?? undefined,
    assignedBy: r.assigned_by as string,
    createdAt: r.created_at as string,
  };
}

export function listStaffAssignments(filters: { staffId?: string; eventId?: string } = {}): StaffAssignment[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.staffId) { where.push('staff_id = ?'); params.push(filters.staffId); }
  if (filters.eventId) { where.push('event_id = ?'); params.push(filters.eventId); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return (db.prepare(`SELECT * FROM staff_assignments ${clause} ORDER BY created_at DESC`).all(...params) as Row[]).map(rowToAssignment);
}

export function createStaffAssignment(assignment: Omit<StaffAssignment, 'id' | 'createdAt'>): StaffAssignment {
  const id = randomId('asgn');
  const createdAt = nowIso();
  db.prepare('INSERT INTO staff_assignments (id, staff_id, event_id, gate, assigned_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, assignment.staffId, assignment.eventId, assignment.gate ?? null, assignment.assignedBy, createdAt);
  return { id, createdAt, ...assignment };
}

export function deleteStaffAssignment(id: string): boolean {
  return db.prepare('DELETE FROM staff_assignments WHERE id = ?').run(id).changes > 0;
}

export function getStaffAssignedEventIds(staffId: string): string[] {
  return (db.prepare('SELECT DISTINCT event_id FROM staff_assignments WHERE staff_id = ?').all(staffId) as Row[]).map((r) => r.event_id as string);
}

// Returns null if staff has unrestricted gate access for this event, or string[] of allowed gates (empty = no access)
export function getStaffAssignedGates(staffId: string, eventId: string): string[] | null {
  const rows = db.prepare('SELECT gate FROM staff_assignments WHERE staff_id = ? AND event_id = ?').all(staffId, eventId) as Array<{ gate: string | null }>;
  if (rows.length === 0) return [];
  if (rows.some((r) => r.gate === null)) return null;
  return rows.map((r) => r.gate!);
}

// ─── Inventory Holds ─────────────────────────────────────────────────────────

export interface InventoryHoldRecord {
  id: string;
  eventId: string;
  tierId: string;
  quantity: number;
  holderEmail: string;
  status: 'active' | 'released' | 'converted' | 'expired';
  createdAt: string;
  expiresAt: string;
  convertedToOrderId?: string;
}

function rowToHold(r: Row): InventoryHoldRecord {
  return {
    id: r.id as string,
    eventId: r.event_id as string,
    tierId: r.tier_id as string,
    quantity: r.quantity as number,
    holderEmail: r.holder_email as string,
    status: r.status as InventoryHoldRecord['status'],
    createdAt: r.created_at as string,
    expiresAt: r.expires_at as string,
    convertedToOrderId: (r.converted_to_order_id as string | null) ?? undefined,
  };
}

export function getAvailableInventoryDb(tierId: string): number {
  const tier = getTier(tierId);
  if (!tier) return 0;
  const now = nowIso();
  const held = (db.prepare("SELECT COALESCE(SUM(quantity),0) AS held FROM inventory_holds WHERE tier_id = ? AND status = 'active' AND expires_at > ?").get(tierId, now) as { held: number }).held;
  return Math.max(0, tier.inventory - tier.sold - held);
}

export function reserveInventory(input: { tierId: string; eventId: string; quantity: number; holderEmail: string; ttlMinutes?: number }): InventoryHoldRecord | null {
  const ttl = input.ttlMinutes ?? 15;
  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
  const holdId = randomId('hold');
  const now = nowIso();

  let result: InventoryHoldRecord | null = null;
  const tx = db.transaction(() => {
    const tier = getTier(input.tierId);
    if (!tier) return;
    const held = (db.prepare("SELECT COALESCE(SUM(quantity),0) AS held FROM inventory_holds WHERE tier_id = ? AND status = 'active' AND expires_at > ?").get(input.tierId, now) as { held: number }).held;
    const available = Math.max(0, tier.inventory - tier.sold - held);
    if (available < input.quantity) return;
    db.prepare('INSERT INTO inventory_holds (id, event_id, tier_id, quantity, holder_email, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(holdId, input.eventId, input.tierId, input.quantity, input.holderEmail.toLowerCase(), 'active', now, expiresAt);
    result = rowToHold(db.prepare('SELECT * FROM inventory_holds WHERE id = ?').get(holdId) as Row);
  });
  tx();
  return result;
}

export function releaseHold(holdId: string): void {
  db.prepare("UPDATE inventory_holds SET status = 'released' WHERE id = ? AND status = 'active'").run(holdId);
}

export function convertHold(holdId: string, orderId: string): void {
  db.prepare("UPDATE inventory_holds SET status = 'converted', converted_to_order_id = ? WHERE id = ?").run(orderId, holdId);
}

export function expireStaleHolds(): number {
  const result = db.prepare("UPDATE inventory_holds SET status = 'expired' WHERE status = 'active' AND expires_at < ?").run(nowIso());
  return result.changes;
}

// ─── Order creation (direct DB, no snapshot) ──────────────────────────────────

export function insertOrder(order: OrderRecord): OrderRecord {
  db.prepare('INSERT INTO orders (id, event_id, tier_id, buyer_name, buyer_email, total, quantity, status, payment_intent_id, payment_provider, created_at) VALUES (@id,@event_id,@tier_id,@buyer_name,@buyer_email,@total,@quantity,@status,@payment_intent_id,@payment_provider,@created_at)').run({
    id: order.id,
    event_id: order.eventId,
    tier_id: order.tierId,
    buyer_name: order.buyerName,
    buyer_email: order.buyerEmail,
    total: order.total,
    quantity: order.quantity,
    status: order.status,
    payment_intent_id: order.paymentIntentId ?? null,
    payment_provider: order.paymentProvider ?? 'mock',
    created_at: order.createdAt,
  });
  return order;
}

export function fulfillOrder(orderId: string, tickets: IssuedTicket[]): void {
  const tx = db.transaction(() => {
    const order = getOrder(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    db.prepare("UPDATE orders SET status = 'paid' WHERE id = ? AND status = 'pending'").run(orderId);
    const stmtT = db.prepare('INSERT OR IGNORE INTO issued_tickets (id, order_id, tier_id, event_id, holder_name, holder_email, qr_payload, status, issued_at, seat_number) VALUES (@id,@order_id,@tier_id,@event_id,@holder_name,@holder_email,@qr_payload,@status,@issued_at,@seat_number)');
    for (const t of tickets) {
      stmtT.run({ id: t.id, order_id: t.orderId, tier_id: t.tierId, event_id: t.eventId, holder_name: t.holderName, holder_email: t.holderEmail, qr_payload: t.qrPayload, status: 'valid', issued_at: t.issuedAt, seat_number: t.seatNumber ?? null });
    }
    db.prepare('UPDATE ticket_tiers SET sold = sold + ? WHERE id = ?').run(order.quantity, order.tierId);
    db.prepare('UPDATE events SET tickets_sold = tickets_sold + ?, gross_revenue = gross_revenue + ? WHERE id = ?').run(order.quantity, order.total, order.eventId);
  });
  tx();
}

// ─── Payment Records ──────────────────────────────────────────────────────────

export interface PaymentRecordRow {
  id: string;
  orderId: string;
  intentId: string;
  provider: string;
  amountCents: number;
  currency: string;
  status: 'initiated' | 'succeeded' | 'failed' | 'refunded';
  idempotencyKey?: string;
  rawResponse?: string;
  createdAt: string;
  updatedAt: string;
}

function rowToPaymentRecord(r: Row): PaymentRecordRow {
  return {
    id: r.id as string,
    orderId: r.order_id as string,
    intentId: r.intent_id as string,
    provider: r.provider as string,
    amountCents: r.amount_cents as number,
    currency: r.currency as string,
    status: r.status as PaymentRecordRow['status'],
    idempotencyKey: (r.idempotency_key as string | null) ?? undefined,
    rawResponse: (r.raw_response as string | null) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function insertPaymentRecord(record: Omit<PaymentRecordRow, 'createdAt' | 'updatedAt'>): PaymentRecordRow {
  const now = nowIso();
  db.prepare('INSERT INTO payment_records (id, order_id, intent_id, provider, amount_cents, currency, status, idempotency_key, raw_response, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(record.id, record.orderId, record.intentId, record.provider, record.amountCents, record.currency, record.status, record.idempotencyKey ?? null, record.rawResponse ?? null, now, now);
  return { ...record, createdAt: now, updatedAt: now };
}

export function updatePaymentRecordStatus(orderId: string, status: PaymentRecordRow['status'], rawResponse?: string): void {
  db.prepare('UPDATE payment_records SET status = ?, raw_response = COALESCE(?, raw_response), updated_at = ? WHERE order_id = ?').run(status, rawResponse ?? null, nowIso(), orderId);
}

export function getPaymentRecordByIntentId(intentId: string): PaymentRecordRow | null {
  const r = db.prepare('SELECT * FROM payment_records WHERE intent_id = ? ORDER BY created_at DESC LIMIT 1').get(intentId) as Row | undefined;
  return r ? rowToPaymentRecord(r) : null;
}

export function getPaymentRecordByOrderId(orderId: string): PaymentRecordRow | null {
  const r = db.prepare('SELECT * FROM payment_records WHERE order_id = ? ORDER BY created_at DESC LIMIT 1').get(orderId) as Row | undefined;
  return r ? rowToPaymentRecord(r) : null;
}

// ─── Email Logs ───────────────────────────────────────────────────────────────

export interface EmailLogRow {
  id: string;
  template: string;
  toAddress: string;
  orderId?: string;
  provider: string;
  status: 'sent' | 'failed';
  error?: string;
  retryCount: number;
  sentAt: string;
}

export function insertEmailLog(log: Omit<EmailLogRow, 'sentAt' | 'retryCount'>): void {
  db.prepare('INSERT INTO email_logs (id, template, to_address, order_id, provider, status, error, retry_count, sent_at) VALUES (?,?,?,?,?,?,?,?,?)').run(log.id, log.template, log.toAddress, log.orderId ?? null, log.provider, log.status, log.error ?? null, 0, nowIso());
}

export function listEmailLogs(orderId?: string): EmailLogRow[] {
  const rows = orderId
    ? (db.prepare('SELECT * FROM email_logs WHERE order_id = ? ORDER BY sent_at DESC').all(orderId) as Row[])
    : (db.prepare('SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT 200').all() as Row[]);
  return rows.map((r) => ({
    id: r.id as string,
    template: r.template as string,
    toAddress: r.to_address as string,
    orderId: (r.order_id as string | null) ?? undefined,
    provider: r.provider as string,
    status: r.status as EmailLogRow['status'],
    error: (r.error as string | null) ?? undefined,
    retryCount: r.retry_count as number,
    sentAt: r.sent_at as string,
  }));
}

// ─── Fraud Flags ──────────────────────────────────────────────────────────────

export interface FraudFlagRow {
  id: string;
  eventId: string;
  orderId?: string;
  buyerEmail?: string;
  flagType: string;
  severity: 'low' | 'medium' | 'high';
  detail: string;
  detectedAt: string;
  resolved: boolean;
}

export function insertFraudFlag(flag: Omit<FraudFlagRow, 'detectedAt' | 'resolved'>): FraudFlagRow {
  const now = nowIso();
  db.prepare('INSERT INTO fraud_flags (id, event_id, order_id, buyer_email, flag_type, severity, detail, detected_at, resolved) VALUES (?,?,?,?,?,?,?,?,0)').run(flag.id, flag.eventId, flag.orderId ?? null, flag.buyerEmail ?? null, flag.flagType, flag.severity, flag.detail, now);
  return { ...flag, detectedAt: now, resolved: false };
}

export function listFraudFlags(filters: { eventId?: string; resolved?: boolean } = {}): FraudFlagRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.eventId) { where.push('event_id = ?'); params.push(filters.eventId); }
  if (filters.resolved !== undefined) { where.push('resolved = ?'); params.push(filters.resolved ? 1 : 0); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return (db.prepare(`SELECT * FROM fraud_flags ${clause} ORDER BY detected_at DESC LIMIT 200`).all(...params) as Row[]).map((r) => ({
    id: r.id as string,
    eventId: r.event_id as string,
    orderId: (r.order_id as string | null) ?? undefined,
    buyerEmail: (r.buyer_email as string | null) ?? undefined,
    flagType: r.flag_type as string,
    severity: r.severity as FraudFlagRow['severity'],
    detail: r.detail as string,
    detectedAt: r.detected_at as string,
    resolved: Boolean(r.resolved),
  }));
}

// ─── Presale (DB-authoritative consume) ───────────────────────────────────────

export function validateAndConsumePresaleCode(code: string, eventId: string, tierId: string, now: string): { valid: true } | { valid: false; reason: string } {
  const snapshot = getSnapshot();
  const record = snapshot.presaleCodes.find((c) => c.eventId === eventId && c.code.toLowerCase() === code.toLowerCase());
  if (!record) return { valid: false, reason: 'Invalid presale code.' };
  if (record.status !== 'active') return { valid: false, reason: 'Presale code is inactive.' };
  if (record.allowedTierIds.length > 0 && !record.allowedTierIds.includes(tierId)) return { valid: false, reason: 'Presale code does not apply to this tier.' };
  if (record.validFrom && record.validFrom > now) return { valid: false, reason: 'Presale code is not active yet.' };
  if (record.validUntil && record.validUntil < now) return { valid: false, reason: 'Presale code has expired.' };
  if (record.maxUses > 0 && record.usedCount >= record.maxUses) return { valid: false, reason: 'Presale code usage limit reached.' };
  const nextCodes = snapshot.presaleCodes.map((c) =>
    c.id === record.id
      ? { ...c, usedCount: c.usedCount + 1, status: c.maxUses > 0 && c.usedCount + 1 >= c.maxUses ? 'exhausted' as const : c.status }
      : c,
  );
  const stripped = { ...snapshot, presaleCodes: nextCodes };
  db.prepare('INSERT INTO app_snapshot (id, json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at').run(JSON.stringify(stripped), nowIso());
  return { valid: true };
}

export function checkPurchaseLimitDb(buyerEmail: string, eventId: string, tierId: string, quantity: number): { allowed: true } | { allowed: false; reason: string } {
  const snapshot = getSnapshot();
  const rule = snapshot.purchaseLimits.find((r) => r.eventId === eventId && r.tierId === tierId) ?? snapshot.purchaseLimits.find((r) => r.eventId === eventId && !r.tierId);
  if (!rule) return { allowed: true };
  if (quantity > rule.maxPerOrder) return { allowed: false, reason: `Maximum ${rule.maxPerOrder} tickets per order.` };
  const alreadyBought = (db.prepare("SELECT COALESCE(SUM(quantity),0) AS total FROM orders WHERE event_id = ? AND tier_id = ? AND LOWER(buyer_email) = ? AND status != 'cancelled'").get(eventId, tierId, buyerEmail.toLowerCase()) as { total: number }).total;
  if (alreadyBought + quantity > rule.maxPerBuyer) return { allowed: false, reason: `Buyer limit of ${rule.maxPerBuyer} reached for this tier.` };
  return { allowed: true };
}

export function cancelAbandonedCheckouts(pendingAfterMinutes = 60): number {
  const cutoff = new Date(Date.now() - pendingAfterMinutes * 60_000).toISOString();
  const pending = db.prepare("SELECT * FROM orders WHERE status = 'pending' AND created_at < ?").all(cutoff) as Row[];
  if (pending.length === 0) return 0;
  const tx = db.transaction(() => {
    for (const row of pending) {
      const orderId = row.id as string;
      db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(orderId);
      db.prepare("UPDATE issued_tickets SET status = 'cancelled' WHERE order_id = ? AND status = 'valid'").run(orderId);
    }
  });
  tx();
  return pending.length;
}

export function detectFraud(orderId: string, eventId: string, buyerEmail: string, quantity: number, amountCents: number): FraudFlagRow[] {
  const flags: FraudFlagRow[] = [];
  const now = nowIso();
  const windowStart = new Date(Date.now() - 60 * 60_000).toISOString();

  const recentOrders = (db.prepare("SELECT COUNT(*) AS cnt FROM orders WHERE LOWER(buyer_email) = ? AND event_id = ? AND created_at > ? AND status != 'cancelled'").get(buyerEmail.toLowerCase(), eventId, windowStart) as { cnt: number }).cnt;
  if (recentOrders > 3) {
    flags.push(insertFraudFlag({ id: randomId('flag'), eventId, orderId, buyerEmail, flagType: 'bulk_purchase', severity: recentOrders > 10 ? 'high' : 'medium', detail: `${recentOrders} orders from same email in 1 hour` }));
  }

  if (quantity >= 10) {
    flags.push(insertFraudFlag({ id: randomId('flag'), eventId, orderId, buyerEmail, flagType: 'bulk_purchase', severity: quantity >= 20 ? 'high' : 'medium', detail: `Single order quantity: ${quantity}` }));
  }

  if (amountCents >= 100_000) {
    flags.push(insertFraudFlag({ id: randomId('flag'), eventId, orderId, buyerEmail, flagType: 'suspicious_payment', severity: 'medium', detail: `High value order: $${(amountCents / 100).toFixed(2)}` }));
  }

  const plusCount = (buyerEmail.split('@')[0] ?? '').split('+').length - 1;
  if (plusCount > 0) {
    flags.push(insertFraudFlag({ id: randomId('flag'), eventId, orderId, buyerEmail, flagType: 'bot_pattern', severity: 'low', detail: `Email contains ${plusCount} plus-addressing indicator(s)` }));
  }

  return flags;
}

export function resolveFraudFlag(id: string, resolvedBy: string): boolean {
  return db.prepare("UPDATE fraud_flags SET resolved = 1, resolved_by = ?, resolved_at = ? WHERE id = ?").run(resolvedBy, nowIso(), id).changes > 0;
}

// ─── Devices ──────────────────────────────────────────────────────────────────

export interface DeviceRow {
  id: string;
  name: string;
  gate: string;
  eventId: string;
  operatorId: string;
  status: 'online' | 'offline' | 'syncing';
  pinHash: string;
  lastSeen: string;
  pendingScans: number;
  createdAt: string;
}

function rowToDevice(r: Row): DeviceRow {
  return { id: r.id as string, name: r.name as string, gate: r.gate as string, eventId: r.event_id as string, operatorId: r.operator_id as string, status: r.status as DeviceRow['status'], pinHash: r.pin_hash as string, lastSeen: r.last_seen as string, pendingScans: r.pending_scans as number, createdAt: r.created_at as string };
}

export function registerDevice(device: Omit<DeviceRow, 'createdAt' | 'lastSeen' | 'pendingScans' | 'status'>): DeviceRow {
  const now = nowIso();
  db.prepare('INSERT INTO devices (id, name, gate, event_id, operator_id, status, pin_hash, last_seen, pending_scans, created_at) VALUES (?,?,?,?,?,?,?,?,0,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, gate=excluded.gate, event_id=excluded.event_id, operator_id=excluded.operator_id, pin_hash=excluded.pin_hash, last_seen=excluded.last_seen, status=\'online\'').run(device.id, device.name, device.gate, device.eventId, device.operatorId, 'online', device.pinHash, now, now);
  return { ...device, status: 'online', pendingScans: 0, lastSeen: now, createdAt: now };
}

export function heartbeatDevice(id: string, pendingScans = 0): DeviceRow | null {
  const now = nowIso();
  db.prepare("UPDATE devices SET last_seen = ?, status = 'online', pending_scans = ? WHERE id = ?").run(now, pendingScans, id);
  const r = db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToDevice(r) : null;
}

export function getDevice(id: string): DeviceRow | null {
  const r = db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as Row | undefined;
  return r ? rowToDevice(r) : null;
}

export function getDeviceByPin(eventId: string, gate: string, pinHash: string): DeviceRow | null {
  const r = db.prepare('SELECT * FROM devices WHERE event_id = ? AND gate = ? AND pin_hash = ?').get(eventId, gate, pinHash) as Row | undefined;
  return r ? rowToDevice(r) : null;
}

export function listDevices(eventId?: string): DeviceRow[] {
  const rows = eventId
    ? db.prepare('SELECT * FROM devices WHERE event_id = ? ORDER BY gate, name').all(eventId) as Row[]
    : db.prepare('SELECT * FROM devices ORDER BY event_id, gate, name').all() as Row[];
  // Mark devices offline if last_seen > 5 minutes ago
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  db.prepare("UPDATE devices SET status = 'offline' WHERE last_seen < ? AND status = 'online'").run(cutoff);
  return rows.map(rowToDevice);
}

export function getGateStats(eventId: string): Array<{ gate: string; scanned: number; admitted: number; denied: number; duplicates: number; onlineDevices: number }> {
  const gates = db.prepare("SELECT DISTINCT gate FROM scan_records WHERE event_id = ? ORDER BY gate").all(eventId) as Array<{ gate: string }>;
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  db.prepare("UPDATE devices SET status = 'offline' WHERE last_seen < ? AND status = 'online'").run(cutoff);
  return gates.map(({ gate }) => {
    const stats = db.prepare("SELECT COUNT(*) as scanned, SUM(CASE WHEN result='admitted' THEN 1 ELSE 0 END) as admitted, SUM(CASE WHEN result='denied' THEN 1 ELSE 0 END) as denied, SUM(CASE WHEN result='duplicate' THEN 1 ELSE 0 END) as duplicates FROM scan_records WHERE event_id = ? AND gate = ?").get(eventId, gate) as { scanned: number; admitted: number; denied: number; duplicates: number };
    const onlineDevices = (db.prepare("SELECT COUNT(*) as n FROM devices WHERE event_id = ? AND gate = ? AND status = 'online'").get(eventId, gate) as { n: number }).n;
    return { gate, scanned: stats.scanned, admitted: stats.admitted ?? 0, denied: stats.denied ?? 0, duplicates: stats.duplicates ?? 0, onlineDevices };
  });
}

// ─── Access Rules ─────────────────────────────────────────────────────────────

export interface AccessRuleRow {
  id: string;
  eventId: string;
  gate: string;
  label: string;
  allowedTierIds: string[];
  allowedKinds: string[];
  requiresAccreditation: boolean;
  notes: string;
  createdAt: string;
}

function rowToAccessRule(r: Row): AccessRuleRow {
  return { id: r.id as string, eventId: r.event_id as string, gate: r.gate as string, label: r.label as string, allowedTierIds: JSON.parse(r.allowed_tier_ids as string), allowedKinds: JSON.parse(r.allowed_kinds as string), requiresAccreditation: Boolean(r.requires_accreditation), notes: r.notes as string, createdAt: r.created_at as string };
}

export function listAccessRules(eventId: string, gate?: string): AccessRuleRow[] {
  const rows = gate
    ? db.prepare('SELECT * FROM access_rules WHERE event_id = ? AND gate = ? ORDER BY gate').all(eventId, gate) as Row[]
    : db.prepare('SELECT * FROM access_rules WHERE event_id = ? ORDER BY gate').all(eventId) as Row[];
  return rows.map(rowToAccessRule);
}

export function upsertAccessRule(rule: AccessRuleRow): AccessRuleRow {
  db.prepare('INSERT INTO access_rules (id, event_id, gate, label, allowed_tier_ids, allowed_kinds, requires_accreditation, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET gate=excluded.gate, label=excluded.label, allowed_tier_ids=excluded.allowed_tier_ids, allowed_kinds=excluded.allowed_kinds, requires_accreditation=excluded.requires_accreditation, notes=excluded.notes').run(rule.id, rule.eventId, rule.gate, rule.label, JSON.stringify(rule.allowedTierIds), JSON.stringify(rule.allowedKinds), rule.requiresAccreditation ? 1 : 0, rule.notes, rule.createdAt);
  return rule;
}

export function deleteAccessRule(id: string): boolean {
  return db.prepare('DELETE FROM access_rules WHERE id = ?').run(id).changes > 0;
}

export function checkAccessRule(eventId: string, gate: string, tierId: string, tierKind: string): { allowed: true } | { allowed: false; reason: string } {
  const rules = listAccessRules(eventId, gate);
  if (rules.length === 0) return { allowed: true };
  for (const rule of rules) {
    const tierOk = rule.allowedTierIds.length === 0 || rule.allowedTierIds.includes(tierId);
    const kindOk = rule.allowedKinds.length === 0 || rule.allowedKinds.includes(tierKind);
    if (!tierOk || !kindOk) return { allowed: false, reason: `Ticket type not permitted at ${gate}. ${rule.label}` };
  }
  return { allowed: true };
}

// ─── Re-entry ─────────────────────────────────────────────────────────────────

export interface ReEntryRow {
  id: string;
  ticketId: string;
  holderName: string;
  eventId: string;
  gate: string;
  passedOutAt: string;
  readmittedAt?: string;
  operatorId: string;
}

function rowToReEntry(r: Row): ReEntryRow {
  return { id: r.id as string, ticketId: r.ticket_id as string, holderName: r.holder_name as string, eventId: r.event_id as string, gate: r.gate as string, passedOutAt: r.passed_out_at as string, readmittedAt: (r.readmitted_at as string | null) ?? undefined, operatorId: r.operator_id as string };
}

export function createReEntryRecord(record: Omit<ReEntryRow, 'readmittedAt'>): ReEntryRow {
  db.prepare('INSERT INTO re_entry_records (id, ticket_id, holder_name, event_id, gate, passed_out_at, operator_id) VALUES (?,?,?,?,?,?,?)').run(record.id, record.ticketId, record.holderName, record.eventId, record.gate, record.passedOutAt, record.operatorId);
  return record;
}

export function getActiveReEntryRecord(ticketId: string): ReEntryRow | null {
  const r = db.prepare('SELECT * FROM re_entry_records WHERE ticket_id = ? AND readmitted_at IS NULL ORDER BY passed_out_at DESC LIMIT 1').get(ticketId) as Row | undefined;
  return r ? rowToReEntry(r) : null;
}

export function completeReEntry(recordId: string): void {
  db.prepare('UPDATE re_entry_records SET readmitted_at = ? WHERE id = ?').run(nowIso(), recordId);
}

export function listReEntryRecords(eventId: string): ReEntryRow[] {
  return (db.prepare('SELECT * FROM re_entry_records WHERE event_id = ? ORDER BY passed_out_at DESC').all(eventId) as Row[]).map(rowToReEntry);
}

// ─── Waiting Room / Queue ─────────────────────────────────────────────────────

export interface WaitingRoomRow {
  id: string;
  eventId: string;
  sessionId: string;
  buyerEmail: string;
  position: number;
  priority: number;
  status: 'queued' | 'releasing' | 'admitted' | 'expired';
  queueToken?: string;
  joinedAt: string;
  releasedAt?: string;
  expiresAt: string;
}

function rowToQueueEntry(r: Row): WaitingRoomRow {
  return { id: r.id as string, eventId: r.event_id as string, sessionId: r.session_id as string, buyerEmail: r.buyer_email as string, position: r.position as number, priority: r.priority as number, status: r.status as WaitingRoomRow['status'], queueToken: (r.queue_token as string | null) ?? undefined, joinedAt: r.joined_at as string, releasedAt: (r.released_at as string | null) ?? undefined, expiresAt: r.expires_at as string };
}

export function joinQueue(eventId: string, sessionId: string, buyerEmail: string, ttlMinutes = 30, priority = 0): WaitingRoomRow {
  const existing = db.prepare("SELECT * FROM waiting_room WHERE event_id = ? AND session_id = ? AND status IN ('queued','releasing')").get(eventId, sessionId) as Row | undefined;
  if (existing) return rowToQueueEntry(existing);

  const maxPos = (db.prepare("SELECT COALESCE(MAX(position), 0) as max_pos FROM waiting_room WHERE event_id = ?").get(eventId) as { max_pos: number }).max_pos;
  const position = maxPos + 1;
  const now = nowIso();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  const id = randomId('q');
  db.prepare('INSERT INTO waiting_room (id, event_id, session_id, buyer_email, position, priority, status, joined_at, expires_at) VALUES (?,?,?,?,?,?,\'queued\',?,?)').run(id, eventId, sessionId, buyerEmail, position, priority, now, expiresAt);
  return { id, eventId, sessionId, buyerEmail, position, priority, status: 'queued', joinedAt: now, expiresAt };
}

export function getQueueEntry(eventId: string, sessionId: string): WaitingRoomRow | null {
  const r = db.prepare("SELECT * FROM waiting_room WHERE event_id = ? AND session_id = ? AND status IN ('queued','releasing') ORDER BY joined_at DESC LIMIT 1").get(eventId, sessionId) as Row | undefined;
  return r ? rowToQueueEntry(r) : null;
}

export function getQueueEntryByToken(token: string): WaitingRoomRow | null {
  const r = db.prepare("SELECT * FROM waiting_room WHERE queue_token = ? AND status = 'releasing'").get(token) as Row | undefined;
  return r ? rowToQueueEntry(r) : null;
}

export function getQueueStats(eventId: string): { queued: number; releasing: number; admitted: number; expired: number; nextPosition: number } {
  const counts = db.prepare("SELECT status, COUNT(*) as n FROM waiting_room WHERE event_id = ? GROUP BY status").all(eventId) as Array<{ status: string; n: number }>;
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.n]));
  const nextPosition = (db.prepare("SELECT MIN(position) as min_pos FROM waiting_room WHERE event_id = ? AND status = 'queued'").get(eventId) as { min_pos: number | null }).min_pos ?? 0;
  return { queued: byStatus.queued ?? 0, releasing: byStatus.releasing ?? 0, admitted: byStatus.admitted ?? 0, expired: byStatus.expired ?? 0, nextPosition };
}

export function releaseQueueBatch(eventId: string, count: number, tokenTtlMinutes = 15): WaitingRoomRow[] {
  const now = nowIso();
  const tokenExpiry = new Date(Date.now() + tokenTtlMinutes * 60_000).toISOString();
  const rows = db.prepare("SELECT * FROM waiting_room WHERE event_id = ? AND status = 'queued' ORDER BY priority DESC, position ASC LIMIT ?").all(eventId, count) as Row[];
  const released: WaitingRoomRow[] = [];
  const tx = db.transaction(() => {
    for (const row of rows) {
      const token = crypto.randomBytes(16).toString('hex');
      db.prepare("UPDATE waiting_room SET status = 'releasing', queue_token = ?, released_at = ?, expires_at = ? WHERE id = ?").run(token, now, tokenExpiry, row.id as string);
      released.push({ ...rowToQueueEntry(row), status: 'releasing', queueToken: token, releasedAt: now, expiresAt: tokenExpiry });
    }
  });
  tx();
  return released;
}

export function admitQueueToken(token: string): boolean {
  return db.prepare("UPDATE waiting_room SET status = 'admitted' WHERE queue_token = ? AND status = 'releasing' AND expires_at > ?").run(token, nowIso()).changes > 0;
}

export function expireQueueEntries(eventId?: string): number {
  const now = nowIso();
  const clause = eventId ? 'AND event_id = ?' : '';
  const params = eventId ? [now, now, eventId] : [now, now];
  return db.prepare(`UPDATE waiting_room SET status = 'expired' WHERE status IN ('queued','releasing') AND expires_at < ? AND expires_at < ? ${clause}`).run(...params).changes;
}

export function isQueueActive(eventId: string): boolean {
  const row = db.prepare("SELECT COUNT(*) as n FROM waiting_room WHERE event_id = ? AND status = 'queued'").get(eventId) as { n: number };
  return row.n > 0;
}

// ─── Abuse Events ─────────────────────────────────────────────────────────────

export interface AbuseEventRow {
  id: string;
  eventId: string;
  pattern: string;
  ipHash: string;
  sessionCount: number;
  detectedAt: string;
  action: 'logged' | 'blocked' | 'flagged';
  resolved: boolean;
}

function rowToAbuseEvent(r: Row): AbuseEventRow {
  return { id: r.id as string, eventId: r.event_id as string, pattern: r.pattern as string, ipHash: r.ip_hash as string, sessionCount: r.session_count as number, detectedAt: r.detected_at as string, action: r.action as AbuseEventRow['action'], resolved: Boolean(r.resolved) };
}

export function insertAbuseEvent(event: Omit<AbuseEventRow, 'detectedAt' | 'resolved'>): AbuseEventRow {
  const now = nowIso();
  db.prepare('INSERT INTO abuse_events (id, event_id, pattern, ip_hash, session_count, detected_at, action, resolved) VALUES (?,?,?,?,?,?,?,0)').run(event.id, event.eventId, event.pattern, event.ipHash, event.sessionCount, now, event.action);
  return { ...event, detectedAt: now, resolved: false };
}

export function listAbuseEvents(filters: { eventId?: string; resolved?: boolean } = {}): AbuseEventRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.eventId) { where.push('event_id = ?'); params.push(filters.eventId); }
  if (filters.resolved !== undefined) { where.push('resolved = ?'); params.push(filters.resolved ? 1 : 0); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return (db.prepare(`SELECT * FROM abuse_events ${clause} ORDER BY detected_at DESC LIMIT 200`).all(...params) as Row[]).map(rowToAbuseEvent);
}

export function resolveAbuseEvent(id: string): boolean {
  return db.prepare('UPDATE abuse_events SET resolved = 1 WHERE id = ?').run(id).changes > 0;
}

// ─── Rate limit helpers ───────────────────────────────────────────────────────

const orderAttemptCache = new Map<string, { count: number; windowStart: number }>();
const ORDER_RATE_WINDOW_MS = 60_000;
const ORDER_RATE_LIMIT = 5;

export function checkOrderRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = orderAttemptCache.get(key);
  if (!bucket || now - bucket.windowStart > ORDER_RATE_WINDOW_MS) {
    orderAttemptCache.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= ORDER_RATE_LIMIT) return false;
  bucket.count++;
  return true;
}

export function countActiveHolds(eventId: string): number {
  return (db.prepare("SELECT COUNT(*) as n FROM inventory_holds WHERE event_id = ? AND status = 'active' AND expires_at > ?").get(eventId, nowIso()) as { n: number }).n;
}

// ─── M13 — Finance and reporting queries ─────────────────────────────────────

export function getRevenueReport(filters: { eventId?: string; from?: string; to?: string }) {
  const where: string[] = ["o.status = 'paid'"];
  const params: unknown[] = [];
  if (filters.eventId) { where.push('o.event_id = ?'); params.push(filters.eventId); }
  if (filters.from) { where.push('o.created_at >= ?'); params.push(filters.from); }
  if (filters.to) { where.push('o.created_at <= ?'); params.push(filters.to); }
  const clause = `WHERE ${where.join(' AND ')}`;

  const totals = db.prepare(`SELECT COALESCE(SUM(o.total),0) AS gross, COALESCE(SUM(o.quantity),0) AS tickets, COUNT(*) AS orders FROM orders o ${clause}`).get(...params) as { gross: number; tickets: number; orders: number };
  const byEvent = db.prepare(`SELECT o.event_id, e.name AS event_name, COALESCE(SUM(o.total),0) AS revenue, COALESCE(SUM(o.quantity),0) AS tickets_sold, COUNT(*) AS orders FROM orders o LEFT JOIN events e ON e.id = o.event_id ${clause} GROUP BY o.event_id ORDER BY revenue DESC`).all(...params) as Array<{ event_id: string; event_name: string; revenue: number; tickets_sold: number; orders: number }>;
  const byTier = db.prepare(`SELECT o.tier_id, t.name AS tier_name, COALESCE(SUM(o.total),0) AS revenue, COALESCE(SUM(o.quantity),0) AS tickets_sold FROM orders o LEFT JOIN ticket_tiers t ON t.id = o.tier_id ${clause} GROUP BY o.tier_id ORDER BY revenue DESC`).all(...params) as Array<{ tier_id: string; tier_name: string; revenue: number; tickets_sold: number }>;
  const byDay = db.prepare(`SELECT SUBSTR(o.created_at, 1, 10) AS date, COALESCE(SUM(o.total),0) AS revenue, COUNT(*) AS orders FROM orders o ${clause} GROUP BY date ORDER BY date`).all(...params) as Array<{ date: string; revenue: number; orders: number }>;

  return { totals, byEvent: byEvent.map((r) => ({ eventId: r.event_id, eventName: r.event_name, revenue: r.revenue, ticketsSold: r.tickets_sold, orders: r.orders })), byTier: byTier.map((r) => ({ tierId: r.tier_id, tierName: r.tier_name, revenue: r.revenue, ticketsSold: r.tickets_sold })), byDay };
}

export function getRefundReport(filters: { eventId?: string; from?: string; to?: string }) {
  const where: string[] = ["o.status = 'refunded'"];
  const params: unknown[] = [];
  if (filters.eventId) { where.push('o.event_id = ?'); params.push(filters.eventId); }
  if (filters.from) { where.push('o.created_at >= ?'); params.push(filters.from); }
  if (filters.to) { where.push('o.created_at <= ?'); params.push(filters.to); }
  const clause = `WHERE ${where.join(' AND ')}`;
  const totals = db.prepare(`SELECT COALESCE(SUM(o.total),0) AS refunded_amount, COUNT(*) AS refunded_orders FROM orders o ${clause}`).get(...params) as { refunded_amount: number; refunded_orders: number };
  const rows = db.prepare(`SELECT o.id, o.event_id, e.name AS event_name, o.buyer_email, o.total, o.quantity, o.created_at FROM orders o LEFT JOIN events e ON e.id = o.event_id ${clause} ORDER BY o.created_at DESC LIMIT 200`).all(...params) as Array<Record<string, unknown>>;
  return { totals, orders: rows.map((r) => ({ id: r.id, eventId: r.event_id, eventName: r.event_name, buyerEmail: r.buyer_email, total: r.total, quantity: r.quantity, createdAt: r.created_at })) };
}

export function getSellThroughReport(eventId?: string) {
  const where = eventId ? 'WHERE event_id = ?' : '';
  const params = eventId ? [eventId] : [];
  const rows = db.prepare(`SELECT t.id, t.event_id, e.name AS event_name, t.name AS tier_name, t.inventory, t.sold, CAST(t.sold AS REAL) / NULLIF(t.inventory, 0) * 100 AS sell_through_pct FROM ticket_tiers t LEFT JOIN events e ON e.id = t.event_id ${where} ORDER BY sell_through_pct DESC`).all(...params) as Array<Record<string, unknown>>;
  return rows.map((r) => ({ tierId: r.id, eventId: r.event_id, eventName: r.event_name, tierName: r.tier_name, inventory: r.inventory, sold: r.sold, sellThroughPct: Math.round((r.sell_through_pct as number | null) ?? 0) }));
}

export function getEventPerformanceReport(eventId: string) {
  const event = (db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as Row | undefined);
  if (!event) return null;
  const tiers = (db.prepare('SELECT * FROM ticket_tiers WHERE event_id = ?').all(eventId) as Row[]).map(rowToTier);
  const orderStats = db.prepare("SELECT COUNT(*) AS total_orders, COALESCE(SUM(total),0) AS gross_revenue, COALESCE(SUM(quantity),0) AS tickets_sold, SUM(CASE WHEN status='refunded' THEN 1 ELSE 0 END) AS refunded_orders FROM orders WHERE event_id = ?").get(eventId) as { total_orders: number; gross_revenue: number; tickets_sold: number; refunded_orders: number };
  const scanStats = db.prepare("SELECT COUNT(*) AS total_scans, SUM(CASE WHEN result='admitted' THEN 1 ELSE 0 END) AS admitted, SUM(CASE WHEN result='denied' THEN 1 ELSE 0 END) AS denied, SUM(CASE WHEN result='duplicate' THEN 1 ELSE 0 END) AS duplicates FROM scan_records WHERE event_id = ?").get(eventId) as { total_scans: number; admitted: number; denied: number; duplicates: number };
  const peakHour = db.prepare("SELECT SUBSTR(scanned_at, 12, 2) AS hour, COUNT(*) AS cnt FROM scan_records WHERE event_id = ? AND result = 'admitted' GROUP BY hour ORDER BY cnt DESC LIMIT 1").get(eventId) as { hour: string; cnt: number } | undefined;
  return { event: rowToEvent(event), tiers, orders: orderStats, scans: { ...scanStats, peakHour: peakHour?.hour }, tierPerformance: tiers.map((t) => ({ tierId: t.id, tierName: t.name, inventory: t.inventory, sold: t.sold, available: Math.max(0, t.inventory - t.sold), sellThroughPct: t.inventory > 0 ? Math.round(t.sold / t.inventory * 100) : 0 })) };
}

export function getGateOpsReport(eventId: string) {
  const gateRows = db.prepare("SELECT gate, COUNT(*) AS total, SUM(CASE WHEN result='admitted' THEN 1 ELSE 0 END) AS admitted, SUM(CASE WHEN result='denied' THEN 1 ELSE 0 END) AS denied, SUM(CASE WHEN result='duplicate' THEN 1 ELSE 0 END) AS duplicates, MIN(scanned_at) AS first_scan, MAX(scanned_at) AS last_scan FROM scan_records WHERE event_id = ? GROUP BY gate ORDER BY total DESC").all(eventId) as Array<Record<string, unknown>>;
  const hourlyRows = db.prepare("SELECT SUBSTR(scanned_at, 12, 2) AS hour, COUNT(*) AS cnt FROM scan_records WHERE event_id = ? GROUP BY hour ORDER BY hour").all(eventId) as Array<{ hour: string; cnt: number }>;
  const reEntryCount = (db.prepare('SELECT COUNT(*) AS n FROM re_entry_records WHERE event_id = ?').get(eventId) as { n: number }).n;
  return { gates: gateRows.map((r) => ({ gate: r.gate, total: r.total, admitted: r.admitted, denied: r.denied, duplicates: r.duplicates, admissionRate: r.total ? Math.round((r.admitted as number) / (r.total as number) * 100) : 0, firstScan: r.first_scan, lastScan: r.last_scan })), hourlyActivity: hourlyRows, reEntryCount };
}

export function getReconciliationReport(eventId?: string) {
  const where = eventId ? 'WHERE o.event_id = ?' : '';
  const params = eventId ? [eventId] : [];
  const rows = db.prepare(`SELECT o.id AS order_id, o.event_id, o.total, o.status AS order_status, p.id AS payment_id, p.intent_id, p.amount_cents, p.status AS payment_status, p.provider FROM orders o LEFT JOIN payment_records p ON p.order_id = o.id ${where} ORDER BY o.created_at DESC LIMIT 500`).all(...params) as Array<Record<string, unknown>>;
  const matched = rows.filter((r) => r.payment_id && r.order_status === 'paid' && r.payment_status === 'succeeded').length;
  const unmatched = rows.filter((r) => !r.payment_id || (r.order_status === 'paid' && r.payment_status !== 'succeeded')).length;
  const variance = rows.reduce((sum, r) => {
    if (r.order_status === 'paid' && r.payment_status === 'succeeded') {
      return sum + ((r.total as number) - (r.amount_cents as number) / 100);
    }
    return sum;
  }, 0);
  return { matched, unmatched, varianceAmount: Math.round(variance * 100) / 100, rows: rows.map((r) => ({ orderId: r.order_id, eventId: r.event_id, total: r.total, orderStatus: r.order_status, paymentId: r.payment_id, intentId: r.intent_id, amountCents: r.amount_cents, paymentStatus: r.payment_status, provider: r.provider })) };
}

export function getTaxReport(filters: { eventId?: string; from?: string; to?: string; taxRate?: number }) {
  const rate = (filters.taxRate ?? 15) / 100;
  const where: string[] = ["o.status = 'paid'"];
  const params: unknown[] = [];
  if (filters.eventId) { where.push('o.event_id = ?'); params.push(filters.eventId); }
  if (filters.from) { where.push('o.created_at >= ?'); params.push(filters.from); }
  if (filters.to) { where.push('o.created_at <= ?'); params.push(filters.to); }
  const clause = `WHERE ${where.join(' AND ')}`;
  const totals = db.prepare(`SELECT COALESCE(SUM(o.total),0) AS gross FROM orders o ${clause}`).get(...params) as { gross: number };
  const gross = totals.gross;
  const taxIncluded = Math.round(gross * rate / (1 + rate) * 100) / 100;
  const net = Math.round((gross - taxIncluded) * 100) / 100;
  const byEvent = db.prepare(`SELECT o.event_id, e.name AS event_name, COALESCE(SUM(o.total),0) AS gross FROM orders o LEFT JOIN events e ON e.id = o.event_id ${clause} GROUP BY o.event_id`).all(...params) as Array<{ event_id: string; event_name: string; gross: number }>;
  return { gross, taxIncluded, net, taxRate: filters.taxRate ?? 15, byEvent: byEvent.map((r) => ({ eventId: r.event_id, eventName: r.event_name, gross: r.gross, tax: Math.round(r.gross * rate / (1 + rate) * 100) / 100 })) };
}

// ─── M13 — Audit with enhanced filters ───────────────────────────────────────

export function listAuditEnhanced(filters: { actor?: string; action?: string; target?: string; severity?: string; from?: string; to?: string; limit?: number; offset?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.actor) { where.push('actor = ?'); params.push(filters.actor); }
  if (filters.action) { where.push('action LIKE ?'); params.push(`%${filters.action}%`); }
  if (filters.target) { where.push('target LIKE ?'); params.push(`%${filters.target}%`); }
  if (filters.severity) { where.push('severity = ?'); params.push(filters.severity); }
  if (filters.from) { where.push('timestamp >= ?'); params.push(filters.from); }
  if (filters.to) { where.push('timestamp <= ?'); params.push(filters.to); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) as n FROM audit_log ${clause}`).get(...params) as { n: number }).n;
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  return { entries: (db.prepare(`SELECT * FROM audit_log ${clause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Row[]).map(rowToAudit), total };
}

// ─── M14 — Audience segments from real order data ────────────────────────────

export function computeAudienceSegments(eventId?: string) {
  const eWhere = eventId ? 'WHERE event_id = ?' : '';
  const eParams = eventId ? [eventId] : [];

  const repeatBuyers = db.prepare(`SELECT buyer_email, COUNT(DISTINCT event_id) AS events, SUM(total) AS lifetime_value FROM orders WHERE status='paid' ${eventId ? 'AND event_id = ?' : ''} GROUP BY buyer_email HAVING events > 1`).all(...eParams) as Array<{ buyer_email: string; events: number; lifetime_value: number }>;
  const highValue = db.prepare(`SELECT buyer_email, SUM(total) AS lifetime_value FROM orders WHERE status='paid' ${eventId ? 'AND event_id = ?' : ''} GROUP BY buyer_email HAVING lifetime_value >= 200`).all(...eParams) as Array<{ buyer_email: string; lifetime_value: number }>;
  const totalBuyers = (db.prepare(`SELECT COUNT(DISTINCT buyer_email) AS n FROM orders WHERE status='paid' ${eventId ? 'AND event_id = ?' : ''}`).get(...eParams) as { n: number }).n;

  return { totalBuyers, repeatBuyerCount: repeatBuyers.length, highValueCount: highValue.length, repeatBuyers: repeatBuyers.map((r) => ({ email: r.buyer_email, events: r.events, lifetimeValue: r.lifetime_value })), highValueBuyers: highValue.map((r) => ({ email: r.buyer_email, lifetimeValue: r.lifetime_value })) };
}

export function getAttributionReport(eventId: string) {
  const referrals = listReferrals(eventId);
  const campaigns = listCampaigns(eventId);
  return { referrals: referrals.map((r) => ({ id: r.id, label: r.label, code: r.code, source: r.source, clicks: r.clicks, conversions: r.conversions, revenue: r.revenueAttributed, conversionRate: r.clicks > 0 ? Math.round(r.conversions / r.clicks * 100) : 0 })), campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, channel: c.channel, status: c.status, sentCount: c.sentCount, openRate: c.openRate, clickRate: c.clickRate, conversionRate: c.conversionRate })) };
}

export function applyDiscountCode(code: string, eventId: string, orderTotal: number): { valid: true; discountAmount: number; finalTotal: number; discountId: string } | { valid: false; reason: string } {
  const discounts = listDiscounts(eventId);
  const now = nowIso();
  const discount = discounts.find((d) => d.code.toLowerCase() === code.toLowerCase() && d.active);
  if (!discount) return { valid: false, reason: 'Discount code not found or inactive.' };
  if (discount.startsAt && now < discount.startsAt) return { valid: false, reason: 'Discount is not yet active.' };
  if (discount.endsAt && now > discount.endsAt) return { valid: false, reason: 'Discount has expired.' };
  const discountAmount = discount.type === 'percentage' ? Math.round(orderTotal * discount.amount / 100 * 100) / 100 : Math.min(discount.amount, orderTotal);
  const finalTotal = Math.max(0, orderTotal - discountAmount);
  db.prepare('UPDATE discounts SET redemptions = redemptions + 1 WHERE id = ?').run(discount.id);
  return { valid: true, discountAmount, finalTotal, discountId: discount.id };
}

// ─── M15 — Conference sessions, speakers, exhibitors, sponsors ────────────────

function rowToSession(r: Row) {
  return { id: r.id as string, eventId: r.event_id as string, title: r.title as string, track: r.track as string, startsAt: r.starts_at as string, endsAt: r.ends_at as string, speakerIds: JSON.parse(r.speaker_ids as string) as string[], room: r.room as string, capacity: (r.capacity as number | null) ?? undefined, createdAt: r.created_at as string };
}
function rowToSpeaker(r: Row) {
  return { id: r.id as string, eventId: r.event_id as string, name: r.name as string, title: r.title as string, organization: r.organization as string, bio: r.bio as string, topicTags: JSON.parse(r.topic_tags as string) as string[], createdAt: r.created_at as string };
}
function rowToExhibitor(r: Row) {
  return { id: r.id as string, eventId: r.event_id as string, name: r.name as string, hall: r.hall as string, boothCode: r.booth_code as string, leadCount: r.lead_count as number, meetingCount: r.meeting_count as number, createdAt: r.created_at as string };
}
function rowToSponsor(r: Row) {
  return { id: r.id as string, eventId: r.event_id as string, name: r.name as string, tier: r.tier as string, boothId: (r.booth_id as string | null) ?? undefined, website: (r.website as string | null) ?? undefined, createdAt: r.created_at as string };
}
function rowToAppointment(r: Row) {
  return { id: r.id as string, eventId: r.event_id as string, attendeeName: r.attendee_name as string, counterpart: r.counterpart as string, startsAt: r.starts_at as string, location: r.location as string, status: r.status as string, createdAt: r.created_at as string };
}
function rowToAnnouncement(r: Row) {
  return { id: r.id as string, eventId: r.event_id as string, title: r.title as string, body: r.body as string, channel: r.channel as string, sentAt: r.sent_at as string, createdAt: r.created_at as string };
}
function rowToSurvey(r: Row) {
  return { id: r.id as string, eventId: r.event_id as string, title: r.title as string, audience: r.audience as string, completionRate: r.completion_rate as number, createdAt: r.created_at as string };
}
function rowToPoll(r: Row) {
  return { id: r.id as string, eventId: r.event_id as string, question: r.question as string, status: r.status as string, options: JSON.parse(r.options as string) as string[], responses: r.responses as number, createdAt: r.created_at as string };
}

export function listSessions(eventId: string) { return (db.prepare('SELECT * FROM conference_sessions WHERE event_id = ? ORDER BY starts_at').all(eventId) as Row[]).map(rowToSession); }
export function getConferenceSession(id: string) { const r = db.prepare('SELECT * FROM conference_sessions WHERE id = ?').get(id) as Row | undefined; return r ? rowToSession(r) : null; }
export function upsertSession(s: ReturnType<typeof rowToSession>) { db.prepare('INSERT INTO conference_sessions (id, event_id, title, track, starts_at, ends_at, speaker_ids, room, capacity, created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,track=excluded.track,starts_at=excluded.starts_at,ends_at=excluded.ends_at,speaker_ids=excluded.speaker_ids,room=excluded.room,capacity=excluded.capacity').run(s.id, s.eventId, s.title, s.track, s.startsAt, s.endsAt, JSON.stringify(s.speakerIds), s.room, s.capacity ?? null, s.createdAt); return s; }
export function deleteConferenceSession(id: string) { return db.prepare('DELETE FROM conference_sessions WHERE id = ?').run(id).changes > 0; }

export function listSpeakers(eventId?: string) { return eventId ? (db.prepare('SELECT * FROM speakers WHERE event_id = ? ORDER BY name').all(eventId) as Row[]).map(rowToSpeaker) : (db.prepare('SELECT * FROM speakers ORDER BY name').all() as Row[]).map(rowToSpeaker); }
export function getSpeaker(id: string) { const r = db.prepare('SELECT * FROM speakers WHERE id = ?').get(id) as Row | undefined; return r ? rowToSpeaker(r) : null; }
export function upsertSpeaker(s: ReturnType<typeof rowToSpeaker>) { db.prepare('INSERT INTO speakers (id, event_id, name, title, organization, bio, topic_tags, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,title=excluded.title,organization=excluded.organization,bio=excluded.bio,topic_tags=excluded.topic_tags').run(s.id, s.eventId, s.name, s.title, s.organization, s.bio, JSON.stringify(s.topicTags), s.createdAt); return s; }
export function deleteSpeaker(id: string) { return db.prepare('DELETE FROM speakers WHERE id = ?').run(id).changes > 0; }

export function listExhibitors(eventId: string) { return (db.prepare('SELECT * FROM exhibitors WHERE event_id = ? ORDER BY name').all(eventId) as Row[]).map(rowToExhibitor); }
export function upsertExhibitor(e: ReturnType<typeof rowToExhibitor>) { db.prepare('INSERT INTO exhibitors (id, event_id, name, hall, booth_code, lead_count, meeting_count, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,hall=excluded.hall,booth_code=excluded.booth_code,lead_count=excluded.lead_count,meeting_count=excluded.meeting_count').run(e.id, e.eventId, e.name, e.hall, e.boothCode, e.leadCount, e.meetingCount, e.createdAt); return e; }
export function deleteExhibitor(id: string) { return db.prepare('DELETE FROM exhibitors WHERE id = ?').run(id).changes > 0; }

export function listSponsors(eventId: string) { return (db.prepare('SELECT * FROM sponsors WHERE event_id = ? ORDER BY tier').all(eventId) as Row[]).map(rowToSponsor); }
export function upsertSponsor(s: ReturnType<typeof rowToSponsor>) { db.prepare('INSERT INTO sponsors (id, event_id, name, tier, booth_id, website, created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,tier=excluded.tier,booth_id=excluded.booth_id,website=excluded.website').run(s.id, s.eventId, s.name, s.tier, s.boothId ?? null, s.website ?? null, s.createdAt); return s; }
export function deleteSponsor(id: string) { return db.prepare('DELETE FROM sponsors WHERE id = ?').run(id).changes > 0; }

export function listAppointments(eventId: string) { return (db.prepare('SELECT * FROM appointments WHERE event_id = ? ORDER BY starts_at').all(eventId) as Row[]).map(rowToAppointment); }
export function upsertAppointment(a: ReturnType<typeof rowToAppointment>) { db.prepare('INSERT INTO appointments (id, event_id, attendee_name, counterpart, starts_at, location, status, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET attendee_name=excluded.attendee_name,counterpart=excluded.counterpart,starts_at=excluded.starts_at,location=excluded.location,status=excluded.status').run(a.id, a.eventId, a.attendeeName, a.counterpart, a.startsAt, a.location, a.status, a.createdAt); return a; }
export function deleteAppointment(id: string) { return db.prepare('DELETE FROM appointments WHERE id = ?').run(id).changes > 0; }

export function listAnnouncements(eventId: string) { return (db.prepare('SELECT * FROM announcements WHERE event_id = ? ORDER BY sent_at DESC').all(eventId) as Row[]).map(rowToAnnouncement); }
export function insertAnnouncement(a: ReturnType<typeof rowToAnnouncement>) { db.prepare('INSERT INTO announcements (id, event_id, title, body, channel, sent_at, created_at) VALUES (?,?,?,?,?,?,?)').run(a.id, a.eventId, a.title, a.body, a.channel, a.sentAt, a.createdAt); return a; }
export function deleteAnnouncement(id: string) { return db.prepare('DELETE FROM announcements WHERE id = ?').run(id).changes > 0; }

export function listSurveys(eventId: string) { return (db.prepare('SELECT * FROM surveys WHERE event_id = ? ORDER BY created_at DESC').all(eventId) as Row[]).map(rowToSurvey); }
export function upsertSurvey(s: ReturnType<typeof rowToSurvey>) { db.prepare('INSERT INTO surveys (id, event_id, title, audience, completion_rate, created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,audience=excluded.audience,completion_rate=excluded.completion_rate').run(s.id, s.eventId, s.title, s.audience, s.completionRate, s.createdAt); return s; }
export function deleteSurvey(id: string) { return db.prepare('DELETE FROM surveys WHERE id = ?').run(id).changes > 0; }

export function listPolls(eventId: string) { return (db.prepare('SELECT * FROM polls WHERE event_id = ? ORDER BY created_at DESC').all(eventId) as Row[]).map(rowToPoll); }
export function upsertPoll(p: ReturnType<typeof rowToPoll>) { db.prepare('INSERT INTO polls (id, event_id, question, status, options, responses, created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET question=excluded.question,status=excluded.status,options=excluded.options,responses=excluded.responses').run(p.id, p.eventId, p.question, p.status, JSON.stringify(p.options), p.responses, p.createdAt); return p; }
export function respondToPoll(id: string) { db.prepare('UPDATE polls SET responses = responses + 1 WHERE id = ?').run(id); }
export function deletePoll(id: string) { return db.prepare('DELETE FROM polls WHERE id = ?').run(id).changes > 0; }

// ─── M16 — Resale, upgrades, memberships, dynamic pricing ────────────────────

function rowToResale(r: Row) { return { id: r.id as string, eventId: r.event_id as string, ticketId: r.ticket_id as string, sellerEmail: r.seller_email as string, askingPrice: r.asking_price as number, faceValue: r.face_value as number, status: r.status as string, createdAt: r.created_at as string }; }
function rowToUpgrade(r: Row) { return { id: r.id as string, eventId: r.event_id as string, name: r.name as string, targetTierId: r.target_tier_id as string, upgradePrice: r.upgrade_price as number, inventory: r.inventory as number, claimed: r.claimed as number, createdAt: r.created_at as string }; }
function rowToMembership(r: Row) { return { id: r.id as string, name: r.name as string, price: r.price as number, billingCycle: r.billing_cycle as string, benefits: JSON.parse(r.benefits as string) as string[], activeMembers: r.active_members as number, createdAt: r.created_at as string }; }
function rowToDynamicRule(r: Row) { return { id: r.id as string, eventId: r.event_id as string, tierId: r.tier_id as string, trigger: r.trigger as string, adjustmentType: r.adjustment_type as string, adjustmentValue: r.adjustment_value as number, status: r.status as string, createdAt: r.created_at as string }; }
function rowToSponsorPlacement(r: Row) { return { id: r.id as string, eventId: (r.event_id as string | null) ?? undefined, name: r.name as string, placement: r.placement as string, sponsor: r.sponsor as string, impressions: r.impressions as number, clicks: r.clicks as number, createdAt: r.created_at as string }; }

export function listResaleListings(eventId?: string) { const rows = eventId ? db.prepare('SELECT * FROM resale_listings WHERE event_id = ? ORDER BY created_at DESC').all(eventId) : db.prepare('SELECT * FROM resale_listings ORDER BY created_at DESC').all(); return (rows as Row[]).map(rowToResale); }
export function getResaleListing(id: string) { const r = db.prepare('SELECT * FROM resale_listings WHERE id = ?').get(id) as Row | undefined; return r ? rowToResale(r) : null; }
export function insertResaleListing(l: ReturnType<typeof rowToResale>) { db.prepare('INSERT INTO resale_listings (id, event_id, ticket_id, seller_email, asking_price, face_value, status, created_at) VALUES (?,?,?,?,?,?,?,?)').run(l.id, l.eventId, l.ticketId, l.sellerEmail, l.askingPrice, l.faceValue, l.status, l.createdAt); return l; }
export function updateResaleStatus(id: string, status: string) { return db.prepare('UPDATE resale_listings SET status = ? WHERE id = ?').run(status, id).changes > 0; }

export function listUpgradeOffers(eventId: string) { return (db.prepare('SELECT * FROM upgrade_offers WHERE event_id = ? ORDER BY upgrade_price').all(eventId) as Row[]).map(rowToUpgrade); }
export function upsertUpgradeOffer(u: ReturnType<typeof rowToUpgrade>) { db.prepare('INSERT INTO upgrade_offers (id, event_id, name, target_tier_id, upgrade_price, inventory, claimed, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,upgrade_price=excluded.upgrade_price,inventory=excluded.inventory,claimed=excluded.claimed').run(u.id, u.eventId, u.name, u.targetTierId, u.upgradePrice, u.inventory, u.claimed, u.createdAt); return u; }
export function claimUpgrade(id: string): boolean {
  const tx = db.transaction(() => {
    const offer = db.prepare('SELECT * FROM upgrade_offers WHERE id = ?').get(id) as Row | undefined;
    if (!offer || (offer.claimed as number) >= (offer.inventory as number)) return false;
    db.prepare('UPDATE upgrade_offers SET claimed = claimed + 1 WHERE id = ?').run(id);
    return true;
  });
  return tx() as boolean;
}
export function deleteUpgradeOffer(id: string) { return db.prepare('DELETE FROM upgrade_offers WHERE id = ?').run(id).changes > 0; }

export function listMembershipPlans() { return (db.prepare('SELECT * FROM membership_plans ORDER BY price').all() as Row[]).map(rowToMembership); }
export function upsertMembershipPlan(m: ReturnType<typeof rowToMembership>) { db.prepare('INSERT INTO membership_plans (id, name, price, billing_cycle, benefits, active_members, created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,price=excluded.price,billing_cycle=excluded.billing_cycle,benefits=excluded.benefits,active_members=excluded.active_members').run(m.id, m.name, m.price, m.billingCycle, JSON.stringify(m.benefits), m.activeMembers, m.createdAt); return m; }
export function deleteMembershipPlan(id: string) { return db.prepare('DELETE FROM membership_plans WHERE id = ?').run(id).changes > 0; }

export function listDynamicPricingRules(eventId: string) { return (db.prepare('SELECT * FROM dynamic_pricing_rules WHERE event_id = ? ORDER BY created_at').all(eventId) as Row[]).map(rowToDynamicRule); }
export function upsertDynamicPricingRule(r: ReturnType<typeof rowToDynamicRule>) { db.prepare('INSERT INTO dynamic_pricing_rules (id, event_id, tier_id, trigger, adjustment_type, adjustment_value, status, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET trigger=excluded.trigger,adjustment_type=excluded.adjustment_type,adjustment_value=excluded.adjustment_value,status=excluded.status').run(r.id, r.eventId, r.tierId, r.trigger, r.adjustmentType, r.adjustmentValue, r.status, r.createdAt); return r; }
export function deleteDynamicPricingRule(id: string) { return db.prepare('DELETE FROM dynamic_pricing_rules WHERE id = ?').run(id).changes > 0; }

export function evaluateDynamicPricing(eventId: string): Array<{ tierId: string; currentPrice: number; suggestedPrice: number; rule: string }> {
  const rules = listDynamicPricingRules(eventId).filter((r) => r.status === 'active');
  const results: Array<{ tierId: string; currentPrice: number; suggestedPrice: number; rule: string }> = [];
  for (const rule of rules) {
    const tier = getTier(rule.tierId);
    if (!tier) continue;
    let shouldAdjust = false;
    if (rule.trigger === 'inventory') {
      const available = getAvailableInventoryDb(rule.tierId);
      shouldAdjust = available < tier.inventory * 0.2; // under 20% remaining
    } else if (rule.trigger === 'date') {
      const event = getEvent(eventId);
      if (event) {
        const daysUntil = (new Date(event.startsAt).getTime() - Date.now()) / 86_400_000;
        shouldAdjust = daysUntil <= 7;
      }
    } else if (rule.trigger === 'pace') {
      const dailyPace = (db.prepare("SELECT COALESCE(SUM(quantity),0) AS qty FROM orders WHERE tier_id = ? AND created_at >= ? AND status='paid'").get(rule.tierId, new Date(Date.now() - 86_400_000).toISOString()) as { qty: number }).qty;
      shouldAdjust = dailyPace >= 20;
    }
    if (shouldAdjust) {
      const adj = rule.adjustmentType === 'increase_percent' ? tier.price * (1 + rule.adjustmentValue / 100) : tier.price * (1 - rule.adjustmentValue / 100);
      results.push({ tierId: rule.tierId, currentPrice: tier.price, suggestedPrice: Math.round(adj * 100) / 100, rule: `${rule.trigger}:${rule.adjustmentType}:${rule.adjustmentValue}%` });
    }
  }
  return results;
}

export function listSponsorPlacements(eventId?: string) { const rows = eventId ? db.prepare('SELECT * FROM sponsor_placements WHERE event_id = ? ORDER BY created_at DESC').all(eventId) : db.prepare('SELECT * FROM sponsor_placements ORDER BY created_at DESC').all(); return (rows as Row[]).map(rowToSponsorPlacement); }
export function upsertSponsorPlacement(p: ReturnType<typeof rowToSponsorPlacement>) { db.prepare('INSERT INTO sponsor_placements (id, event_id, name, placement, sponsor, impressions, clicks, created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,placement=excluded.placement,sponsor=excluded.sponsor,impressions=excluded.impressions,clicks=excluded.clicks').run(p.id, p.eventId ?? null, p.name, p.placement, p.sponsor, p.impressions, p.clicks, p.createdAt); return p; }
export function recordSponsorImpression(id: string) { db.prepare('UPDATE sponsor_placements SET impressions = impressions + 1 WHERE id = ?').run(id); }
export function recordSponsorClick(id: string) { db.prepare('UPDATE sponsor_placements SET clicks = clicks + 1 WHERE id = ?').run(id); }
export function deleteSponsorPlacement(id: string) { return db.prepare('DELETE FROM sponsor_placements WHERE id = ?').run(id).changes > 0; }

