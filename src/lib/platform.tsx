import { createContext, useCallback, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type {
  AbuseEvent,
  AccessRule,
  ApiCredential,
  AnnouncementRecord,
  AppointmentRecord,
  AuditLogEntry,
  Campaign,
  Checkpoint,
  CheckInScan,
  CheckoutQuestion,
  ConversionReport,
  CustomerSegment,
  DenyReason,
  DeviceStatus,
  DiscountCampaign,
  DynamicPricingRule,
  EmailLog,
  EventRecord,
  EventStatus,
  ExhibitorBooth,
  FinanceExport,
  FlagSeverity,
  FlagType,
  FraudFlag,
  HoldStatus,
  IntegrationConnection,
  InventoryHold,
  IssuedTicket,
  LivePoll,
  ManagedOrganization,
  MatchmakingProfile,
  MembershipPlan,
  OfflineScanEntry,
  OrderRecord,
  Organization,
  OrgSettings,
  PaymentRecord,
  PresaleCode,
  PresaleCodeStatus,
  PriorityGroup,
  PurchaseLimitRule,
  QueueEntryStatus,
  QueueSnapshot,
  ReconciliationRun,
  ReEntryRecord,
  ReferralLink,
  ResaleListing,
  ScanDevice,
  SessionRecord,
  SpeakerProfile,
  SponsorProfile,
  SponsorPlacement,
  SsoConfiguration,
  SurveyRecord,
  TaxProfile,
  TicketKind,
  TeamMember,
  TicketTier,
  Venue,
  WaitingRoomEntry,
  WebhookEndpoint,
  UpgradeOffer,
} from './domain';
import { AUDIT } from '../services/audit';
import type { AppDatabase } from './schema';
import { createInitialDatabase, fetchDatabaseSnapshot, hasApiPersistence, loadDatabaseSnapshot, saveDatabaseSnapshot } from './data-store';
import { useAuth } from './auth';

// ─── Access rule check (pure utility) ────────────────────────────────────────

export function checkTicketAccess(
  tierId: string,
  ticketKind: TicketKind,
  gate: string,
  eventId: string,
  rules: AccessRule[],
): { allowed: boolean; reason?: DenyReason } {
  const applicable = rules.filter((r) => r.eventId === eventId && r.gate === gate);
  if (applicable.length === 0) return { allowed: true };

  for (const rule of applicable) {
    const tierOk = rule.allowedTierIds.length === 0 || rule.allowedTierIds.includes(tierId);
    const kindOk = rule.allowedKinds.length === 0 || rule.allowedKinds.includes(ticketKind);
    if (tierOk && kindOk) return { allowed: true };
  }

  return { allowed: false, reason: 'tier_not_allowed' };
}

// ─── Milestone 4 utilities (exported pure functions) ─────────────────────────

export function getAvailableInventory(
  tierId: string,
  ticketTiers: TicketTier[],
  inventoryHolds: InventoryHold[],
): number {
  const tier = ticketTiers.find((t) => t.id === tierId);
  if (!tier) return 0;
  const held = inventoryHolds
    .filter((h) => h.tierId === tierId && h.status === 'active')
    .reduce((sum, h) => sum + h.quantity, 0);
  return Math.max(0, tier.inventory - tier.sold - held);
}

export function checkPurchaseLimit(
  buyerEmail: string,
  tierId: string,
  eventId: string,
  quantity: number,
  purchaseLimits: PurchaseLimitRule[],
  orders: OrderRecord[],
): { allowed: boolean; reason?: string } {
  // Most-specific rule first: tier-scoped, then event-scoped
  const rule =
    purchaseLimits.find((r) => r.eventId === eventId && r.tierId === tierId) ??
    purchaseLimits.find((r) => r.eventId === eventId && !r.tierId);
  if (!rule) return { allowed: true };

  if (quantity > rule.maxPerOrder) {
    return { allowed: false, reason: `Maximum ${rule.maxPerOrder} tickets per order for this tier` };
  }

  const alreadyBought = orders
    .filter((o) => o.buyerEmail === buyerEmail && o.tierId === tierId && o.status !== 'cancelled')
    .reduce((sum, o) => sum + o.quantity, 0);

  if (alreadyBought + quantity > rule.maxPerBuyer) {
    const remaining = Math.max(0, rule.maxPerBuyer - alreadyBought);
    return {
      allowed: remaining > 0,
      reason: remaining > 0
        ? `You may only purchase ${remaining} more ticket${remaining !== 1 ? 's' : ''} for this tier`
        : `Purchase limit of ${rule.maxPerBuyer} already reached for this tier`,
    };
  }

  return { allowed: true };
}

export function validatePresaleCode(
  code: string,
  eventId: string,
  tierId: string,
  presaleCodes: PresaleCode[],
  nowIso: string,
): { valid: boolean; codeRecord?: PresaleCode; reason?: string } {
  const record = presaleCodes.find(
    (c) => c.code.toLowerCase() === code.toLowerCase() && c.eventId === eventId,
  );
  if (!record) return { valid: false, reason: 'Invalid or unrecognised access code' };
  if (record.status !== 'active') return { valid: false, reason: 'This access code is no longer active' };
  if (record.maxUses > 0 && record.usedCount >= record.maxUses) {
    return { valid: false, reason: 'This access code has been fully used' };
  }
  if (record.allowedTierIds.length > 0 && !record.allowedTierIds.includes(tierId)) {
    return { valid: false, reason: 'This code does not apply to the selected ticket type' };
  }
  if (record.validUntil && record.validUntil < nowIso) {
    return { valid: false, reason: 'This access code has expired' };
  }
  if (record.validFrom && record.validFrom > nowIso) {
    return { valid: false, reason: 'This access code is not yet active' };
  }
  return { valid: true, codeRecord: record };
}

export function detectSuspiciousPurchase(
  buyerEmail: string,
  eventId: string,
  tierId: string,
  quantity: number,
  orders: OrderRecord[],
): Omit<FraudFlag, 'id' | 'detectedAt' | 'resolved'> | null {
  if (quantity >= 8) {
    return {
      eventId,
      flagType: 'bulk_purchase' as FlagType,
      buyerEmail,
      severity: 'high' as FlagSeverity,
      detail: `Order of ${quantity} tickets in a single transaction — probable resale activity`,
    };
  }
  if (quantity >= 4) {
    return {
      eventId,
      flagType: 'bulk_purchase' as FlagType,
      buyerEmail,
      severity: 'medium' as FlagSeverity,
      detail: `Order of ${quantity} tickets — may be resale, monitor buyer`,
    };
  }
  const priorOrders = orders.filter(
    (o) => o.buyerEmail === buyerEmail && o.eventId === eventId && o.status !== 'cancelled',
  );
  if (priorOrders.length >= 2) {
    return {
      eventId,
      flagType: 'duplicate_email' as FlagType,
      buyerEmail,
      severity: 'medium' as FlagSeverity,
      detail: `Buyer has ${priorOrders.length} existing orders for this event across different tiers`,
    };
  }
  return null;
}

// ─── Status transition map ────────────────────────────────────────────────────

export interface StatusTransition {
  to: EventStatus;
  label: string;
  variant: 'primary' | 'danger' | 'neutral';
}

export const EVENT_STATUS_TRANSITIONS: Record<EventStatus, StatusTransition[]> = {
  draft: [
    { to: 'on_sale', label: 'Publish', variant: 'primary' },
    { to: 'cancelled', label: 'Cancel event', variant: 'danger' },
  ],
  on_sale: [
    { to: 'live', label: 'Go Live', variant: 'primary' },
    { to: 'draft', label: 'Unpublish', variant: 'neutral' },
    { to: 'cancelled', label: 'Cancel event', variant: 'danger' },
  ],
  sold_out: [
    { to: 'live', label: 'Go Live', variant: 'primary' },
    { to: 'on_sale', label: 'Re-open sales', variant: 'neutral' },
    { to: 'cancelled', label: 'Cancel event', variant: 'danger' },
  ],
  live: [
    { to: 'completed', label: 'End event', variant: 'neutral' },
    { to: 'cancelled', label: 'Cancel event', variant: 'danger' },
  ],
  completed: [],
  cancelled: [
    { to: 'draft', label: 'Reactivate', variant: 'neutral' },
  ],
};

// ─── State ────────────────────────────────────────────────────────────────────

type PlatformState = AppDatabase;

// ─── Actions ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'REPLACE_STATE'; payload: PlatformState }
  | { type: 'UPDATE_ORGANIZATION'; patch: Partial<Organization> }
  | { type: 'UPSERT_VENUE'; payload: Venue }
  | { type: 'DELETE_VENUE'; id: string }
  | { type: 'UPSERT_EVENT'; payload: EventRecord }
  | { type: 'DELETE_EVENT'; id: string }
  | { type: 'TRANSITION_EVENT_STATUS'; id: string; to: EventStatus; actor: string }
  | { type: 'UPSERT_TIER'; payload: TicketTier }
  | { type: 'DELETE_TIER'; id: string }
  | { type: 'CREATE_ORDER'; payload: OrderRecord; tickets: IssuedTicket[] }
  | { type: 'UPDATE_ORDER_STATUS'; id: string; status: OrderRecord['status'] }
  | { type: 'RECORD_SCAN'; scan: CheckInScan }
  | { type: 'INVITE_MEMBER'; payload: TeamMember }
  | { type: 'UPDATE_MEMBER_ROLE'; id: string; role: TeamMember['role'] }
  | { type: 'APPEND_AUDIT'; entry: Omit<AuditLogEntry, 'id' | 'timestamp'> }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<OrgSettings> }
  | { type: 'CREATE_PAYMENT'; payload: PaymentRecord }
  | { type: 'LOG_EMAIL'; payload: EmailLog }
  | { type: 'UPSERT_CAMPAIGN'; payload: Campaign }
  | { type: 'DELETE_CAMPAIGN'; id: string }
  | { type: 'UPSERT_DISCOUNT'; payload: DiscountCampaign }
  | { type: 'DELETE_DISCOUNT'; id: string }
  | { type: 'UPSERT_REFERRAL_LINK'; payload: ReferralLink }
  | { type: 'DELETE_REFERRAL_LINK'; id: string }
  | { type: 'UPSERT_CHECKOUT_QUESTION'; payload: CheckoutQuestion }
  | { type: 'DELETE_CHECKOUT_QUESTION'; id: string }
  | { type: 'UPSERT_INTEGRATION'; payload: IntegrationConnection }
  | { type: 'DELETE_INTEGRATION'; id: string }
  | { type: 'UPSERT_WEBHOOK'; payload: WebhookEndpoint }
  | { type: 'DELETE_WEBHOOK'; id: string }
  | { type: 'UPSERT_API_CREDENTIAL'; payload: ApiCredential }
  | { type: 'REVOKE_API_CREDENTIAL'; id: string }
  | { type: 'UPSERT_SESSION'; payload: SessionRecord }
  | { type: 'DELETE_SESSION'; id: string }
  | { type: 'UPSERT_SPEAKER'; payload: SpeakerProfile }
  | { type: 'UPSERT_EXHIBITOR'; payload: ExhibitorBooth }
  | { type: 'UPSERT_ANNOUNCEMENT'; payload: AnnouncementRecord }
  // Milestone 5 — gate ops
  | { type: 'UPSERT_DEVICE'; payload: ScanDevice }
  | { type: 'SET_DEVICE_STATUS'; id: string; status: DeviceStatus; pendingScans?: number; lastSeen?: string }
  | { type: 'UPSERT_ACCESS_RULE'; payload: AccessRule }
  | { type: 'DELETE_ACCESS_RULE'; id: string }
  | { type: 'QUEUE_OFFLINE_SCAN'; entry: OfflineScanEntry }
  | { type: 'SYNC_OFFLINE_SCANS'; deviceId: string }
  | { type: 'RECORD_REENTRY'; record: ReEntryRecord }
  | { type: 'ADMIT_REENTRY'; id: string; readmittedAt: string }
  // Milestone 4 — high-demand sales layer
  | { type: 'JOIN_QUEUE'; entry: WaitingRoomEntry }
  | { type: 'RELEASE_FROM_QUEUE'; id: string; releasedAt: string }
  | { type: 'EXPIRE_QUEUE_ENTRY'; id: string }
  | { type: 'UPDATE_QUEUE_STATUS'; id: string; status: QueueEntryStatus }
  | { type: 'CREATE_HOLD'; hold: InventoryHold }
  | { type: 'RELEASE_HOLD'; id: string }
  | { type: 'EXPIRE_HOLDS'; tierId: string; nowStr: string }
  | { type: 'CONVERT_HOLD'; id: string; orderId: string }
  | { type: 'UPSERT_PURCHASE_LIMIT'; payload: PurchaseLimitRule }
  | { type: 'DELETE_PURCHASE_LIMIT'; id: string }
  | { type: 'UPSERT_PRESALE_CODE'; payload: PresaleCode }
  | { type: 'DELETE_PRESALE_CODE'; id: string }
  | { type: 'USE_PRESALE_CODE'; id: string }
  | { type: 'UPSERT_PRIORITY_GROUP'; payload: PriorityGroup }
  | { type: 'DELETE_PRIORITY_GROUP'; id: string }
  | { type: 'FLAG_PURCHASE'; flag: Omit<FraudFlag, 'id' | 'detectedAt' | 'resolved'> }
  | { type: 'RESOLVE_FRAUD_FLAG'; id: string; resolvedBy: string; resolvedAt: string }
  | { type: 'RECORD_ABUSE_EVENT'; event: Omit<AbuseEvent, 'id' | 'detectedAt'> }
  | { type: 'SNAPSHOT_QUEUE'; snapshot: Omit<QueueSnapshot, 'id' | 'capturedAt'> };

function now(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function mkAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
  return { ...entry, id: `log_${uid()}`, timestamp: now() };
}

function parsePlatformDate(value?: string): number | null {
  if (!value) return null;
  const parsed = new Date(value.replace(' ', 'T'));
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

const HOLD_EXPIRY_INTERVAL_MS = 10_000;
const QUEUE_AUTOMATION_INTERVAL_MS = 15_000;
const CHECKOUT_WINDOW_MS = 10 * 60 * 1000;
const AUTO_RELEASE_TARGET = 3;

function reducer(state: PlatformState, action: Action): PlatformState {
  switch (action.type) {
    case 'REPLACE_STATE':
      return action.payload;

    case 'UPDATE_ORGANIZATION': {
      const nextOrganization = {
        ...state.organization,
        ...action.patch,
      };
      return {
        ...state,
        organization: nextOrganization,
        auditLog: [
          mkAudit({
            actor: 'User',
            action: AUDIT.SETTINGS_UPDATED,
            target: nextOrganization.name,
            severity: 'info',
            note: 'Organization packs and platform settings updated.',
          }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPSERT_VENUE': {
      const exists = state.venues.some((v) => v.id === action.payload.id);
      return {
        ...state,
        venues: exists
          ? state.venues.map((v) => (v.id === action.payload.id ? action.payload : v))
          : [...state.venues, action.payload],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? AUDIT.VENUE_UPDATED : AUDIT.VENUE_CREATED, target: action.payload.name, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_VENUE': {
      const venue = state.venues.find((v) => v.id === action.id);
      return {
        ...state,
        venues: state.venues.filter((v) => v.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: AUDIT.VENUE_DELETED, target: venue?.name ?? action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPSERT_EVENT': {
      const exists = state.events.some((e) => e.id === action.payload.id);
      return {
        ...state,
        events: exists
          ? state.events.map((e) => (e.id === action.payload.id ? action.payload : e))
          : [...state.events, action.payload],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? AUDIT.EVENT_UPDATED : AUDIT.EVENT_CREATED, target: action.payload.name, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_EVENT': {
      const event = state.events.find((e) => e.id === action.id);
      return {
        ...state,
        events: state.events.filter((e) => e.id !== action.id),
        ticketTiers: state.ticketTiers.filter((t) => t.eventId !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: AUDIT.EVENT_DELETED, target: event?.name ?? action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };
    }

    case 'TRANSITION_EVENT_STATUS': {
      const event = state.events.find((e) => e.id === action.id);
      if (!event) return state;
      const allowed = EVENT_STATUS_TRANSITIONS[event.status].some((t) => t.to === action.to);
      if (!allowed) return state;
      return {
        ...state,
        events: state.events.map((e) => (e.id === action.id ? { ...e, status: action.to } : e)),
        auditLog: [
          mkAudit({
            actor: action.actor,
            action: AUDIT.EVENT_STATUS_CHANGED,
            target: `${event.name} → ${action.to.replace(/_/g, ' ')}`,
            severity: action.to === 'cancelled' ? 'warning' : 'info',
          }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPSERT_TIER': {
      const exists = state.ticketTiers.some((t) => t.id === action.payload.id);
      const event = state.events.find((e) => e.id === action.payload.eventId);
      return {
        ...state,
        ticketTiers: exists
          ? state.ticketTiers.map((t) => (t.id === action.payload.id ? action.payload : t))
          : [...state.ticketTiers, action.payload],
        auditLog: [
          mkAudit({
            actor: 'User',
            action: exists ? AUDIT.TIER_UPDATED : AUDIT.TIER_CREATED,
            target: `${event?.name ?? action.payload.eventId} / ${action.payload.name}`,
            severity: 'info',
          }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_TIER': {
      const tier = state.ticketTiers.find((t) => t.id === action.id);
      return {
        ...state,
        ticketTiers: state.ticketTiers.filter((t) => t.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: AUDIT.TIER_DELETED, target: tier?.name ?? action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };
    }

    case 'CREATE_ORDER': {
      const tier = state.ticketTiers.find((t) => t.id === action.payload.tierId);
      const available = getAvailableInventory(action.payload.tierId, state.ticketTiers, state.inventoryHolds);
      if (action.payload.quantity > available) return state;
      const event = state.events.find((e) => e.id === action.payload.eventId);
      return {
        ...state,
        orders: [action.payload, ...state.orders],
        issuedTickets: [...action.tickets, ...state.issuedTickets],
        ticketTiers: tier
          ? state.ticketTiers.map((t) => t.id === tier.id ? { ...t, sold: t.sold + action.payload.quantity } : t)
          : state.ticketTiers,
        events: event
          ? state.events.map((e) => e.id === event.id
              ? { ...e, ticketsSold: e.ticketsSold + action.payload.quantity, grossRevenue: e.grossRevenue + action.payload.total }
              : e)
          : state.events,
        auditLog: [
          mkAudit({
            actor: action.payload.buyerName,
            action: AUDIT.ORDER_CREATED,
            target: `${event?.name ?? action.payload.eventId} / ${action.payload.quantity}× ${tier?.name ?? action.payload.tierId}`,
            severity: 'info',
          }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPDATE_ORDER_STATUS': {
      const order = state.orders.find((o) => o.id === action.id);
      const auditAction = action.status === 'refunded' ? AUDIT.ORDER_REFUNDED
        : action.status === 'cancelled' ? AUDIT.ORDER_CANCELLED
        : AUDIT.ORDER_STATUS_CHANGED;
      const isVoiding = action.status === 'cancelled' || action.status === 'refunded';
      const tier = order ? state.ticketTiers.find((t) => t.id === order.tierId) : undefined;
      const event = order ? state.events.find((e) => e.id === order.eventId) : undefined;
      return {
        ...state,
        orders: state.orders.map((o) => (o.id === action.id ? { ...o, status: action.status } : o)),
        issuedTickets: isVoiding
          ? state.issuedTickets.map((t) =>
              t.orderId === action.id && t.status !== 'used'
                ? { ...t, status: 'cancelled' as const }
                : t)
          : state.issuedTickets,
        ticketTiers: isVoiding && tier && order
          ? state.ticketTiers.map((t) =>
              t.id === tier.id ? { ...t, sold: Math.max(0, t.sold - order.quantity) } : t)
          : state.ticketTiers,
        events: isVoiding && event && order
          ? state.events.map((e) =>
              e.id === event.id
                ? { ...e, ticketsSold: Math.max(0, e.ticketsSold - order.quantity), grossRevenue: Math.max(0, e.grossRevenue - order.total) }
                : e)
          : state.events,
        auditLog: [
          mkAudit({
            actor: 'User',
            action: auditAction,
            target: order?.buyerName ?? action.id,
            severity: action.status === 'refunded' || action.status === 'cancelled' ? 'warning' : 'info',
          }),
          ...state.auditLog,
        ],
      };
    }

    case 'RECORD_SCAN': {
      const ticket = state.issuedTickets.find((t) => t.id === action.scan.ticketId);
      const scanAction = action.scan.result === 'admitted' ? AUDIT.SCAN_ADMITTED
        : action.scan.result === 'denied' ? AUDIT.SCAN_DENIED
        : AUDIT.SCAN_DUPLICATE;
      return {
        ...state,
        checkInScans: [action.scan, ...state.checkInScans],
        issuedTickets: ticket
          ? state.issuedTickets.map((t) => t.id === ticket.id
              ? { ...t, status: action.scan.result === 'admitted' ? 'used' as const : t.status, scannedAt: action.scan.scannedAt, scannedGate: action.scan.gate }
              : t)
          : state.issuedTickets,
        checkpoints: state.checkpoints.map((cp) => {
          if (cp.gate !== action.scan.gate) return cp;
          return {
            ...cp,
            scanned: action.scan.result === 'admitted' ? cp.scanned + 1 : cp.scanned,
            admitted: action.scan.result === 'admitted' ? cp.admitted + 1 : cp.admitted,
            denied: (action.scan.result === 'denied' || action.scan.result === 'duplicate') ? cp.denied + 1 : cp.denied,
          };
        }),
        auditLog: [
          mkAudit({
            actor: action.scan.operatorId,
            action: scanAction,
            target: `${action.scan.gate} / ${action.scan.ticketId}`,
            severity: action.scan.result === 'admitted' ? 'info' : 'warning',
          }),
          ...state.auditLog,
        ],
      };
    }

    case 'INVITE_MEMBER': {
      return {
        ...state,
        teamMembers: [...state.teamMembers, action.payload],
        auditLog: [
          mkAudit({ actor: 'User', action: AUDIT.MEMBER_INVITED, target: `${action.payload.name} (${action.payload.role})`, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPDATE_MEMBER_ROLE': {
      const member = state.teamMembers.find((m) => m.id === action.id);
      return {
        ...state,
        teamMembers: state.teamMembers.map((m) => (m.id === action.id ? { ...m, role: action.role } : m)),
        auditLog: [
          mkAudit({ actor: 'User', action: AUDIT.MEMBER_ROLE_CHANGED, target: `${member?.name ?? action.id} → ${action.role}`, severity: 'warning' }),
          ...state.auditLog,
        ],
      };
    }

    case 'APPEND_AUDIT':
      return { ...state, auditLog: [mkAudit(action.entry), ...state.auditLog] };

    case 'UPDATE_SETTINGS':
      return {
        ...state,
        orgSettings: { ...state.orgSettings, ...action.patch },
        auditLog: [
          mkAudit({ actor: 'User', action: AUDIT.SETTINGS_UPDATED, target: state.organization.name, severity: 'info' }),
          ...state.auditLog,
        ],
      };

    case 'CREATE_PAYMENT': {
      const auditAction = action.payload.status === 'succeeded' ? AUDIT.PAYMENT_SUCCEEDED
        : action.payload.status === 'failed' ? AUDIT.PAYMENT_FAILED
        : AUDIT.PAYMENT_INITIATED;
      return {
        ...state,
        paymentRecords: [action.payload, ...state.paymentRecords],
        auditLog: [
          mkAudit({
            actor: action.payload.provider,
            action: auditAction,
            target: `${action.payload.orderId} — ${action.payload.currency.toUpperCase()} ${(action.payload.amountCents / 100).toFixed(2)}`,
            severity: action.payload.status === 'failed' ? 'critical' : 'info',
          }),
          ...state.auditLog,
        ],
      };
    }

    case 'LOG_EMAIL': {
      return {
        ...state,
        emailLogs: [action.payload, ...state.emailLogs],
        auditLog: [
          mkAudit({
            actor: action.payload.provider,
            action: action.payload.status === 'sent' ? AUDIT.EMAIL_SENT : AUDIT.EMAIL_FAILED,
            target: `${action.payload.template} → ${action.payload.to}`,
            severity: action.payload.status === 'failed' ? 'warning' : 'info',
          }),
          ...state.auditLog,
        ],
      };
    }

    // ── Milestone 5: Gate ops ─────────────────────────────────────────────

    case 'UPSERT_CAMPAIGN': {
      const exists = state.campaigns.some((campaign) => campaign.id === action.payload.id);
      return {
        ...state,
        campaigns: exists
          ? state.campaigns.map((campaign) => campaign.id === action.payload.id ? action.payload : campaign)
          : [action.payload, ...state.campaigns],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? 'Updated campaign' : 'Created campaign', target: action.payload.name, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_CAMPAIGN':
      return {
        ...state,
        campaigns: state.campaigns.filter((campaign) => campaign.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: 'Deleted campaign', target: action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };

    case 'UPSERT_DISCOUNT': {
      const exists = state.discountCampaigns.some((discount) => discount.id === action.payload.id);
      return {
        ...state,
        discountCampaigns: exists
          ? state.discountCampaigns.map((discount) => discount.id === action.payload.id ? action.payload : discount)
          : [action.payload, ...state.discountCampaigns],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? 'Updated discount campaign' : 'Created discount campaign', target: action.payload.name, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_DISCOUNT':
      return {
        ...state,
        discountCampaigns: state.discountCampaigns.filter((discount) => discount.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: 'Deleted discount campaign', target: action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };

    case 'UPSERT_REFERRAL_LINK': {
      const exists = state.referralLinks.some((link) => link.id === action.payload.id);
      return {
        ...state,
        referralLinks: exists
          ? state.referralLinks.map((link) => link.id === action.payload.id ? action.payload : link)
          : [action.payload, ...state.referralLinks],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? 'Updated referral link' : 'Created referral link', target: action.payload.label, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_REFERRAL_LINK':
      return {
        ...state,
        referralLinks: state.referralLinks.filter((link) => link.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: 'Deleted referral link', target: action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };

    case 'UPSERT_CHECKOUT_QUESTION': {
      const exists = state.checkoutQuestions.some((question) => question.id === action.payload.id);
      return {
        ...state,
        checkoutQuestions: exists
          ? state.checkoutQuestions.map((question) => question.id === action.payload.id ? action.payload : question)
          : [action.payload, ...state.checkoutQuestions],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? 'Updated checkout question' : 'Created checkout question', target: action.payload.label, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_CHECKOUT_QUESTION':
      return {
        ...state,
        checkoutQuestions: state.checkoutQuestions.filter((question) => question.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: 'Deleted checkout question', target: action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };

    case 'UPSERT_INTEGRATION': {
      const exists = state.integrationConnections.some((connection) => connection.id === action.payload.id);
      return {
        ...state,
        integrationConnections: exists
          ? state.integrationConnections.map((connection) => connection.id === action.payload.id ? action.payload : connection)
          : [action.payload, ...state.integrationConnections],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? 'Updated integration' : 'Created integration', target: action.payload.name, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_INTEGRATION':
      return {
        ...state,
        integrationConnections: state.integrationConnections.filter((connection) => connection.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: 'Deleted integration', target: action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };

    case 'UPSERT_WEBHOOK': {
      const exists = state.webhookEndpoints.some((webhook) => webhook.id === action.payload.id);
      return {
        ...state,
        webhookEndpoints: exists
          ? state.webhookEndpoints.map((webhook) => webhook.id === action.payload.id ? action.payload : webhook)
          : [action.payload, ...state.webhookEndpoints],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? 'Updated webhook endpoint' : 'Created webhook endpoint', target: action.payload.label, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_WEBHOOK':
      return {
        ...state,
        webhookEndpoints: state.webhookEndpoints.filter((webhook) => webhook.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: 'Deleted webhook endpoint', target: action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };

    case 'UPSERT_API_CREDENTIAL': {
      const exists = state.apiCredentials.some((credential) => credential.id === action.payload.id);
      return {
        ...state,
        apiCredentials: exists
          ? state.apiCredentials.map((credential) => credential.id === action.payload.id ? action.payload : credential)
          : [action.payload, ...state.apiCredentials],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? 'Rotated API credential' : 'Created API credential', target: action.payload.label, severity: 'warning' }),
          ...state.auditLog,
        ],
      };
    }

    case 'REVOKE_API_CREDENTIAL':
      return {
        ...state,
        apiCredentials: state.apiCredentials.map((credential) =>
          credential.id === action.id ? { ...credential, status: 'revoked' as const } : credential
        ),
        auditLog: [
          mkAudit({ actor: 'User', action: 'Revoked API credential', target: action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };

    case 'UPSERT_SESSION': {
      const exists = state.sessions.some((session) => session.id === action.payload.id);
      return {
        ...state,
        sessions: exists
          ? state.sessions.map((session) => session.id === action.payload.id ? action.payload : session)
          : [action.payload, ...state.sessions],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? 'Updated agenda session' : 'Created agenda session', target: action.payload.title, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_SESSION':
      return {
        ...state,
        sessions: state.sessions.filter((session) => session.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: 'Deleted agenda session', target: action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };

    case 'UPSERT_SPEAKER': {
      const exists = state.speakers.some((speaker) => speaker.id === action.payload.id);
      return {
        ...state,
        speakers: exists
          ? state.speakers.map((speaker) => speaker.id === action.payload.id ? action.payload : speaker)
          : [action.payload, ...state.speakers],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? 'Updated speaker' : 'Created speaker', target: action.payload.name, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPSERT_EXHIBITOR': {
      const exists = state.exhibitorBooths.some((booth) => booth.id === action.payload.id);
      return {
        ...state,
        exhibitorBooths: exists
          ? state.exhibitorBooths.map((booth) => booth.id === action.payload.id ? action.payload : booth)
          : [action.payload, ...state.exhibitorBooths],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? 'Updated exhibitor booth' : 'Created exhibitor booth', target: action.payload.name, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPSERT_ANNOUNCEMENT': {
      const exists = state.announcements.some((announcement) => announcement.id === action.payload.id);
      return {
        ...state,
        announcements: exists
          ? state.announcements.map((announcement) => announcement.id === action.payload.id ? action.payload : announcement)
          : [action.payload, ...state.announcements],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? 'Updated announcement' : 'Created announcement', target: action.payload.title, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPSERT_DEVICE': {
      const exists = state.devices.some((d) => d.id === action.payload.id);
      return {
        ...state,
        devices: exists
          ? state.devices.map((d) => d.id === action.payload.id ? action.payload : d)
          : [...state.devices, action.payload],
        auditLog: [
          mkAudit({ actor: 'System', action: AUDIT.DEVICE_REGISTERED, target: `${action.payload.name} @ ${action.payload.gate}`, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'SET_DEVICE_STATUS': {
      const device = state.devices.find((d) => d.id === action.id);
      const auditAction = action.status === 'online' ? AUDIT.DEVICE_ONLINE
        : action.status === 'syncing' ? AUDIT.DEVICE_SYNCED
        : AUDIT.DEVICE_OFFLINE;
      return {
        ...state,
        devices: state.devices.map((d) =>
          d.id === action.id
            ? { ...d, status: action.status, pendingScans: action.pendingScans ?? d.pendingScans, lastSeen: action.lastSeen ?? d.lastSeen }
            : d
        ),
        // Update checkpoint offline device count
        checkpoints: state.checkpoints.map((cp) => {
          if (!device || cp.gate !== device.gate) return cp;
          const gateDevices = state.devices.filter((d) => d.gate === cp.gate);
          const offlineCount = gateDevices.filter((d) =>
            d.id === action.id ? action.status === 'offline' : d.status === 'offline'
          ).length;
          return { ...cp, offlineDevices: offlineCount };
        }),
        auditLog: [
          mkAudit({ actor: 'System', action: auditAction, target: device?.name ?? action.id, severity: action.status === 'offline' ? 'warning' : 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPSERT_ACCESS_RULE': {
      const exists = state.accessRules.some((r) => r.id === action.payload.id);
      const event = state.events.find((e) => e.id === action.payload.eventId);
      return {
        ...state,
        accessRules: exists
          ? state.accessRules.map((r) => r.id === action.payload.id ? action.payload : r)
          : [...state.accessRules, action.payload],
        auditLog: [
          mkAudit({
            actor: 'User',
            action: exists ? AUDIT.ACCESS_RULE_UPDATED : AUDIT.ACCESS_RULE_CREATED,
            target: `${event?.name ?? action.payload.eventId} / ${action.payload.gate} — ${action.payload.label}`,
            severity: 'info',
          }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_ACCESS_RULE': {
      const rule = state.accessRules.find((r) => r.id === action.id);
      return {
        ...state,
        accessRules: state.accessRules.filter((r) => r.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: AUDIT.ACCESS_RULE_DELETED, target: rule?.label ?? action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };
    }

    case 'QUEUE_OFFLINE_SCAN':
      return {
        ...state,
        offlineQueue: [...state.offlineQueue, action.entry],
        devices: state.devices.map((d) =>
          d.id === action.entry.deviceId
            ? { ...d, pendingScans: d.pendingScans + 1 }
            : d
        ),
      };

    case 'SYNC_OFFLINE_SCANS': {
      const pending = state.offlineQueue.filter((e) => e.deviceId === action.deviceId && !e.synced);
      let nextState = state;

      for (const entry of pending) {
        const ticket = nextState.issuedTickets.find((t) => t.qrPayload === entry.qrPayload);
        const result = !ticket ? 'denied' : ticket.status === 'used' ? 'duplicate' : 'admitted';
        const scan: CheckInScan = {
          id: `scan_sync_${uid()}`,
          ticketId: ticket?.id ?? 'unknown',
          eventId: entry.eventId,
          gate: entry.gate,
          scannedAt: entry.scannedAt,
          result,
          operatorId: action.deviceId,
          deviceId: action.deviceId,
          denyReason: result === 'denied' ? 'not_found' : result === 'duplicate' ? 'already_used' : undefined,
        };

        nextState = {
          ...nextState,
          checkInScans: [scan, ...nextState.checkInScans],
          issuedTickets: ticket && result === 'admitted'
            ? nextState.issuedTickets.map((t) => t.id === ticket.id ? { ...t, status: 'used' as const, scannedGate: entry.gate, scannedAt: entry.scannedAt } : t)
            : nextState.issuedTickets,
        };
      }

      const device = state.devices.find((d) => d.id === action.deviceId);
      return {
        ...nextState,
        offlineQueue: nextState.offlineQueue.map((e) =>
          e.deviceId === action.deviceId ? { ...e, synced: true } : e
        ),
        devices: nextState.devices.map((d) =>
          d.id === action.deviceId ? { ...d, status: 'online' as const, pendingScans: 0, lastSeen: now() } : d
        ),
        auditLog: [
          mkAudit({ actor: 'System', action: AUDIT.DEVICE_SYNCED, target: `${device?.name ?? action.deviceId} — ${pending.length} scans processed`, severity: 'info' }),
          ...nextState.auditLog,
        ],
      };
    }

    case 'RECORD_REENTRY': {
      const event = state.events.find((e) => e.id === action.record.eventId);
      return {
        ...state,
        reEntryRecords: [action.record, ...state.reEntryRecords],
        auditLog: [
          mkAudit({ actor: action.record.operatorId, action: AUDIT.REENTRY_PASSOUT, target: `${action.record.holderName} — ${event?.name ?? action.record.eventId} / ${action.record.gate}`, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'ADMIT_REENTRY': {
      const record = state.reEntryRecords.find((r) => r.id === action.id);
      return {
        ...state,
        reEntryRecords: state.reEntryRecords.map((r) =>
          r.id === action.id ? { ...r, readmittedAt: action.readmittedAt } : r
        ),
        checkpoints: state.checkpoints.map((cp) =>
          cp.gate === record?.gate ? { ...cp, reAdmissions: cp.reAdmissions + 1 } : cp
        ),
        auditLog: [
          mkAudit({ actor: 'System', action: AUDIT.REENTRY_ADMITTED, target: record?.holderName ?? action.id, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    // ── Milestone 4: High-demand sales layer ─────────────────────────────────

    case 'JOIN_QUEUE': {
      return {
        ...state,
        waitingRoom: [...state.waitingRoom, action.entry],
        auditLog: [
          mkAudit({ actor: action.entry.buyerEmail ?? 'Buyer', action: AUDIT.QUEUE_JOINED, target: `Position ${action.entry.position} — ${state.events.find((e) => e.id === action.entry.eventId)?.name ?? action.entry.eventId}`, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'RELEASE_FROM_QUEUE': {
      return {
        ...state,
        waitingRoom: state.waitingRoom.map((e) =>
          e.id === action.id ? { ...e, status: 'releasing' as QueueEntryStatus, releasedAt: action.releasedAt } : e
        ),
        auditLog: [
          mkAudit({ actor: 'System', action: AUDIT.QUEUE_RELEASED, target: `Queue entry ${action.id}`, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'EXPIRE_QUEUE_ENTRY': {
      return {
        ...state,
        waitingRoom: state.waitingRoom.map((e) =>
          e.id === action.id ? { ...e, status: 'expired' as QueueEntryStatus } : e
        ),
        auditLog: [
          mkAudit({ actor: 'System', action: AUDIT.QUEUE_EXPIRED, target: `Queue entry ${action.id}`, severity: 'warning' }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPDATE_QUEUE_STATUS': {
      return {
        ...state,
        waitingRoom: state.waitingRoom.map((e) =>
          e.id === action.id ? { ...e, status: action.status } : e
        ),
      };
    }

    case 'CREATE_HOLD': {
      const tier = state.ticketTiers.find((t) => t.id === action.hold.tierId);
      return {
        ...state,
        inventoryHolds: [...state.inventoryHolds, action.hold],
        auditLog: [
          mkAudit({ actor: 'System', action: AUDIT.HOLD_CREATED, target: `${tier?.name ?? action.hold.tierId} — ${action.hold.quantity} held until ${action.hold.expiresAt}`, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'RELEASE_HOLD': {
      const hold = state.inventoryHolds.find((h) => h.id === action.id);
      return {
        ...state,
        inventoryHolds: state.inventoryHolds.map((h) =>
          h.id === action.id ? { ...h, status: 'released' as HoldStatus } : h
        ),
        auditLog: [
          mkAudit({ actor: 'System', action: AUDIT.HOLD_RELEASED, target: hold ? `${hold.tierId} / ${hold.holderId}` : action.id, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'EXPIRE_HOLDS': {
      const expired = state.inventoryHolds.filter(
        (h) => h.tierId === action.tierId && h.status === 'active' && h.expiresAt <= action.nowStr
      );
      return {
        ...state,
        inventoryHolds: state.inventoryHolds.map((h) =>
          expired.some((e) => e.id === h.id) ? { ...h, status: 'released' as HoldStatus } : h
        ),
        auditLog: expired.length > 0
          ? [
              mkAudit({ actor: 'System', action: AUDIT.HOLD_EXPIRED, target: `${expired.length} holds expired for ${action.tierId}`, severity: 'info' }),
              ...state.auditLog,
            ]
          : state.auditLog,
      };
    }

    case 'CONVERT_HOLD': {
      return {
        ...state,
        inventoryHolds: state.inventoryHolds.map((h) =>
          h.id === action.id ? { ...h, status: 'converted' as HoldStatus, convertedToOrderId: action.orderId } : h
        ),
        auditLog: [
          mkAudit({ actor: 'System', action: AUDIT.HOLD_CONVERTED, target: `Hold ${action.id} → Order ${action.orderId}`, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPSERT_PURCHASE_LIMIT': {
      const exists = state.purchaseLimits.some((r) => r.id === action.payload.id);
      const event = state.events.find((e) => e.id === action.payload.eventId);
      return {
        ...state,
        purchaseLimits: exists
          ? state.purchaseLimits.map((r) => r.id === action.payload.id ? action.payload : r)
          : [...state.purchaseLimits, action.payload],
        auditLog: [
          mkAudit({ actor: 'User', action: AUDIT.LIMIT_RULE_SET, target: `${event?.name ?? action.payload.eventId}${action.payload.tierId ? ` / tier ${action.payload.tierId}` : ''} — max ${action.payload.maxPerBuyer}/buyer`, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_PURCHASE_LIMIT': {
      return {
        ...state,
        purchaseLimits: state.purchaseLimits.filter((r) => r.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: AUDIT.LIMIT_RULE_DELETED, target: action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPSERT_PRESALE_CODE': {
      const exists = state.presaleCodes.some((c) => c.id === action.payload.id);
      const event = state.events.find((e) => e.id === action.payload.eventId);
      return {
        ...state,
        presaleCodes: exists
          ? state.presaleCodes.map((c) => c.id === action.payload.id ? action.payload : c)
          : [...state.presaleCodes, action.payload],
        auditLog: [
          mkAudit({ actor: 'User', action: exists ? AUDIT.PRESALE_CODE_UPDATED : AUDIT.PRESALE_CODE_CREATED, target: `${action.payload.label} — ${event?.name ?? action.payload.eventId}`, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_PRESALE_CODE': {
      const code = state.presaleCodes.find((c) => c.id === action.id);
      return {
        ...state,
        presaleCodes: state.presaleCodes.filter((c) => c.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: AUDIT.PRESALE_CODE_DELETED, target: code?.label ?? action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };
    }

    case 'USE_PRESALE_CODE': {
      const code = state.presaleCodes.find((c) => c.id === action.id);
      const newUsedCount = (code?.usedCount ?? 0) + 1;
      const exhausted = code ? (code.maxUses > 0 && newUsedCount >= code.maxUses) : false;
      return {
        ...state,
        presaleCodes: state.presaleCodes.map((c) =>
          c.id === action.id
            ? { ...c, usedCount: newUsedCount, status: exhausted ? ('exhausted' as PresaleCodeStatus) : c.status }
            : c
        ),
        auditLog: [
          mkAudit({ actor: 'System', action: AUDIT.PRESALE_CODE_USED, target: `${code?.label ?? action.id} (${newUsedCount}/${code?.maxUses ?? '∞'})`, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'UPSERT_PRIORITY_GROUP': {
      const exists = state.priorityGroups.some((g) => g.id === action.payload.id);
      const event = state.events.find((e) => e.id === action.payload.eventId);
      return {
        ...state,
        priorityGroups: exists
          ? state.priorityGroups.map((g) => g.id === action.payload.id ? action.payload : g)
          : [...state.priorityGroups, action.payload],
        auditLog: [
          mkAudit({ actor: 'User', action: AUDIT.PRIORITY_GROUP_SET, target: `${action.payload.name} — ${event?.name ?? action.payload.eventId}`, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'DELETE_PRIORITY_GROUP': {
      const group = state.priorityGroups.find((g) => g.id === action.id);
      return {
        ...state,
        priorityGroups: state.priorityGroups.filter((g) => g.id !== action.id),
        auditLog: [
          mkAudit({ actor: 'User', action: AUDIT.PRIORITY_GROUP_DELETED, target: group?.name ?? action.id, severity: 'warning' }),
          ...state.auditLog,
        ],
      };
    }

    case 'FLAG_PURCHASE': {
      const newFlag: FraudFlag = {
        ...action.flag,
        id: `flag_${uid()}`,
        detectedAt: now(),
        resolved: false,
      };
      return {
        ...state,
        fraudFlags: [newFlag, ...state.fraudFlags],
        auditLog: [
          mkAudit({ actor: 'System', action: AUDIT.FRAUD_FLAG_RAISED, target: `${action.flag.flagType.replace(/_/g, ' ')} — ${action.flag.buyerEmail ?? action.flag.orderId ?? 'unknown'}`, severity: 'warning' }),
          ...state.auditLog,
        ],
      };
    }

    case 'RESOLVE_FRAUD_FLAG': {
      const flag = state.fraudFlags.find((f) => f.id === action.id);
      return {
        ...state,
        fraudFlags: state.fraudFlags.map((f) =>
          f.id === action.id ? { ...f, resolved: true, resolvedBy: action.resolvedBy, resolvedAt: action.resolvedAt } : f
        ),
        auditLog: [
          mkAudit({ actor: action.resolvedBy, action: AUDIT.FRAUD_FLAG_RESOLVED, target: flag ? `${flag.flagType} — ${flag.buyerEmail ?? flag.orderId ?? flag.id}` : action.id, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    case 'RECORD_ABUSE_EVENT': {
      const newEvent: AbuseEvent = {
        ...action.event,
        id: `abuse_${uid()}`,
        detectedAt: now(),
      };
      return {
        ...state,
        abuseEvents: [newEvent, ...state.abuseEvents],
        auditLog: [
          mkAudit({ actor: 'System', action: AUDIT.ABUSE_EVENT_LOGGED, target: `${action.event.pattern.replace(/_/g, ' ')} — ${action.event.action} (${action.event.sessionCount} sessions)`, severity: action.event.action === 'blocked' ? 'critical' : 'warning' }),
          ...state.auditLog,
        ],
      };
    }

    case 'SNAPSHOT_QUEUE': {
      const snap: QueueSnapshot = {
        ...action.snapshot,
        id: `snap_${uid()}`,
        capturedAt: now(),
      };
      return {
        ...state,
        queueSnapshots: [snap, ...state.queueSnapshots],
        auditLog: [
          mkAudit({ actor: 'System', action: AUDIT.QUEUE_SNAPSHOT, target: `Queue depth: ${action.snapshot.queueDepth} — ${state.events.find((e) => e.id === action.snapshot.eventId)?.name ?? action.snapshot.eventId}`, severity: 'info' }),
          ...state.auditLog,
        ],
      };
    }

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface PlatformContextValue {
  state: PlatformState;
  dispatch: React.Dispatch<Action>;
  refreshFromServer: () => Promise<void>;
  venueById: (id: string) => Venue | undefined;
  eventById: (id: string) => EventRecord | undefined;
  tiersByEvent: (eventId: string) => TicketTier[];
  ordersByEvent: (eventId: string) => OrderRecord[];
  ticketsByOrder: (orderId: string) => IssuedTicket[];
  orderById: (id: string) => OrderRecord | undefined;
  devicesByGate: (gate: string) => ScanDevice[];
  accessRulesByEvent: (eventId: string) => AccessRule[];
  reEntryByTicket: (ticketId: string) => ReEntryRecord | undefined;
  // Milestone 4 helpers
  availableInventory: (tierId: string) => number;
  queueByEvent: (eventId: string) => WaitingRoomEntry[];
  holdsByTier: (tierId: string) => InventoryHold[];
  presaleCodesByEvent: (eventId: string) => PresaleCode[];
  purchaseLimitsByEvent: (eventId: string) => PurchaseLimitRule[];
  priorityGroupsByEvent: (eventId: string) => PriorityGroup[];
  openFraudFlags: () => FraudFlag[];
  newId: (prefix: string) => string;
  nowStr: () => string;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: ReactNode }) {
  const { authToken, isHydrating } = useAuth();
  const [state, dispatch] = useReducer(reducer, createInitialDatabase(), loadDatabaseSnapshot);

  const refreshFromServer = useCallback(async () => {
    const snapshot = await fetchDatabaseSnapshot(authToken);
    dispatch({ type: 'REPLACE_STATE', payload: snapshot });
  }, [authToken]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = now();
      const expiredTierIds = Array.from(
        new Set(
          state.inventoryHolds
            .filter((hold) => hold.status === 'active' && hold.expiresAt <= current)
            .map((hold) => hold.tierId),
        ),
      );

      expiredTierIds.forEach((tierId) => {
        dispatch({ type: 'EXPIRE_HOLDS', tierId, nowStr: current });
      });
    }, HOLD_EXPIRY_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [state.inventoryHolds]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nowIso = now();
      const currentTime = parsePlatformDate(nowIso) ?? Date.now();

      state.waitingRoom
        .filter((entry) => {
          if (entry.status !== 'releasing' || !entry.releasedAt) return false;
          const releasedAt = parsePlatformDate(entry.releasedAt);
          return releasedAt !== null && currentTime - releasedAt >= CHECKOUT_WINDOW_MS;
        })
        .forEach((entry) => {
          dispatch({ type: 'EXPIRE_QUEUE_ENTRY', id: entry.id });
        });

      state.events
        .filter((event) => event.status === 'on_sale' || event.status === 'live')
        .forEach((event) => {
          const eventQueue = state.waitingRoom.filter((entry) => entry.eventId === event.id);
          const releasingCount = eventQueue.filter((entry) => entry.status === 'releasing').length;
          const availableSlots = Math.max(0, AUTO_RELEASE_TARGET - releasingCount);
          if (availableSlots === 0) return;

          eventQueue
            .filter((entry) => entry.status === 'queued')
            .sort((a, b) => a.position - b.position)
            .slice(0, availableSlots)
            .forEach((entry) => {
              dispatch({ type: 'RELEASE_FROM_QUEUE', id: entry.id, releasedAt: nowIso });
            });
        });
    }, QUEUE_AUTOMATION_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [state.events, state.waitingRoom]);

  useEffect(() => {
    if (!hasApiPersistence()) return;
    if (isHydrating) return;

    refreshFromServer().catch(() => {
      // Keep the locally hydrated state if the API is unavailable.
    });
  }, [authToken, isHydrating, refreshFromServer]);

  useEffect(() => {
    saveDatabaseSnapshot(state, authToken).catch(() => {
      // Keep browser persistence even if the API is temporarily unavailable.
    });
  }, [authToken, state]);

  const value: PlatformContextValue = {
    state,
    dispatch,
    refreshFromServer,
    venueById: (id) => state.venues.find((v) => v.id === id),
    eventById: (id) => state.events.find((e) => e.id === id),
    tiersByEvent: (eventId) => state.ticketTiers.filter((t) => t.eventId === eventId),
    ordersByEvent: (eventId) => state.orders.filter((o) => o.eventId === eventId),
    ticketsByOrder: (orderId) => state.issuedTickets.filter((t) => t.orderId === orderId),
    orderById: (id) => state.orders.find((o) => o.id === id),
    devicesByGate: (gate) => state.devices.filter((d) => d.gate === gate),
    accessRulesByEvent: (eventId) => state.accessRules.filter((r) => r.eventId === eventId),
    reEntryByTicket: (ticketId) => state.reEntryRecords.find((r) => r.ticketId === ticketId && !r.readmittedAt),
    availableInventory: (tierId) => getAvailableInventory(tierId, state.ticketTiers, state.inventoryHolds),
    queueByEvent: (eventId) => state.waitingRoom.filter((e) => e.eventId === eventId),
    holdsByTier: (tierId) => state.inventoryHolds.filter((h) => h.tierId === tierId),
    presaleCodesByEvent: (eventId) => state.presaleCodes.filter((c) => c.eventId === eventId),
    purchaseLimitsByEvent: (eventId) => state.purchaseLimits.filter((r) => r.eventId === eventId),
    priorityGroupsByEvent: (eventId) => state.priorityGroups.filter((g) => g.eventId === eventId),
    openFraudFlags: () => state.fraudFlags.filter((f) => !f.resolved),
    newId: (prefix) => `${prefix}_${uid()}`,
    nowStr: now,
  };

  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
  return ctx;
}
