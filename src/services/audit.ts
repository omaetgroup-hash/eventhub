// ─── Audit service ────────────────────────────────────────────────────────────
//
// Canonical action constants + a reusable logger that components call
// instead of hand-writing audit strings inline. All audit entries flow
// through the platform store (APPEND_AUDIT) so the log remains in one place.

import type { AuditLogEntry } from '../lib/domain';

// ─── Action constants ─────────────────────────────────────────────────────────

export const AUDIT = {
  // Events
  EVENT_CREATED:        'event.created',
  EVENT_UPDATED:        'event.updated',
  EVENT_DELETED:        'event.deleted',
  EVENT_STATUS_CHANGED: 'event.status_changed',
  EVENT_PUBLISHED:      'event.published',
  EVENT_WENT_LIVE:      'event.went_live',
  EVENT_COMPLETED:      'event.completed',
  EVENT_CANCELLED:      'event.cancelled',

  // Venues
  VENUE_CREATED: 'venue.created',
  VENUE_UPDATED: 'venue.updated',
  VENUE_DELETED: 'venue.deleted',

  // Ticket tiers
  TIER_CREATED: 'tier.created',
  TIER_UPDATED: 'tier.updated',
  TIER_DELETED: 'tier.deleted',

  // Orders
  ORDER_CREATED:        'order.created',
  ORDER_PAID:           'order.paid',
  ORDER_REFUNDED:       'order.refunded',
  ORDER_CANCELLED:      'order.cancelled',
  ORDER_STATUS_CHANGED: 'order.status_changed',

  // Tickets
  TICKET_ISSUED:      'ticket.issued',
  TICKET_CANCELLED:   'ticket.cancelled',
  TICKET_TRANSFERRED: 'ticket.transferred',

  // Check-in
  SCAN_ADMITTED:  'checkin.admitted',
  SCAN_DENIED:    'checkin.denied',
  SCAN_DUPLICATE: 'checkin.duplicate',

  // Team & auth
  MEMBER_INVITED:     'team.member_invited',
  MEMBER_ROLE_CHANGED: 'team.role_changed',
  MEMBER_REMOVED:     'team.member_removed',

  // Payments
  PAYMENT_INITIATED: 'payment.initiated',
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED:    'payment.failed',
  REFUND_INITIATED:  'payment.refund_initiated',
  REFUND_SUCCEEDED:  'payment.refund_succeeded',

  // Email
  EMAIL_SENT:   'email.sent',
  EMAIL_FAILED: 'email.failed',

  // Settings
  SETTINGS_UPDATED: 'settings.updated',
  ORG_UPDATED:      'org.updated',

  // Devices & gate ops
  DEVICE_REGISTERED:  'device.registered',
  DEVICE_ONLINE:      'device.online',
  DEVICE_OFFLINE:     'device.offline',
  DEVICE_SYNCED:      'device.synced',

  // Access rules
  ACCESS_RULE_CREATED: 'access_rule.created',
  ACCESS_RULE_UPDATED: 'access_rule.updated',
  ACCESS_RULE_DELETED: 'access_rule.deleted',

  // Re-entry / pass-out
  REENTRY_PASSOUT:   'reentry.passout',
  REENTRY_ADMITTED:  'reentry.admitted',

  // Kiosk
  KIOSK_LOOKUP:   'kiosk.lookup',
  KIOSK_CHECKIN:  'kiosk.checkin',

  // Milestone 4 — High-demand sales layer
  QUEUE_JOINED:          'queue.joined',
  QUEUE_RELEASED:        'queue.released',
  QUEUE_EXPIRED:         'queue.expired',
  HOLD_CREATED:          'hold.created',
  HOLD_RELEASED:         'hold.released',
  HOLD_EXPIRED:          'hold.expired',
  HOLD_CONVERTED:        'hold.converted',
  PRESALE_CODE_CREATED:  'presale.code_created',
  PRESALE_CODE_UPDATED:  'presale.code_updated',
  PRESALE_CODE_USED:     'presale.code_used',
  PRESALE_CODE_DELETED:  'presale.code_deleted',
  LIMIT_RULE_SET:        'limit.rule_set',
  LIMIT_RULE_DELETED:    'limit.rule_deleted',
  PRIORITY_GROUP_SET:    'priority.group_set',
  PRIORITY_GROUP_DELETED: 'priority.group_deleted',
  FRAUD_FLAG_RAISED:     'fraud.flag_raised',
  FRAUD_FLAG_RESOLVED:   'fraud.flag_resolved',
  ABUSE_EVENT_LOGGED:    'abuse.event_logged',
  QUEUE_SNAPSHOT:        'queue.snapshot',
} as const;

export type AuditAction = typeof AUDIT[keyof typeof AUDIT];

export type AuditSeverity = AuditLogEntry['severity'];

// ─── Severity defaults per action ─────────────────────────────────────────────

const SEVERITY_MAP: Partial<Record<AuditAction, AuditSeverity>> = {
  [AUDIT.EVENT_DELETED]:      'warning',
  [AUDIT.EVENT_CANCELLED]:    'warning',
  [AUDIT.VENUE_DELETED]:      'warning',
  [AUDIT.TIER_DELETED]:       'warning',
  [AUDIT.ORDER_REFUNDED]:     'warning',
  [AUDIT.ORDER_CANCELLED]:    'warning',
  [AUDIT.SCAN_DENIED]:        'warning',
  [AUDIT.SCAN_DUPLICATE]:     'warning',
  [AUDIT.PAYMENT_FAILED]:     'critical',
  [AUDIT.EMAIL_FAILED]:       'warning',
  [AUDIT.MEMBER_REMOVED]:     'warning',
  [AUDIT.MEMBER_ROLE_CHANGED]: 'warning',
};

function defaultSeverity(action: AuditAction): AuditSeverity {
  return SEVERITY_MAP[action] ?? 'info';
}

// ─── Entry builder ────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function nowStr(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

export function buildAuditEntry(
  action: AuditAction | string,
  target: string,
  actor: string,
  overrideSeverity?: AuditSeverity,
): AuditLogEntry {
  return {
    id: `log_${uid()}`,
    actor,
    action,
    target,
    timestamp: nowStr(),
    severity: overrideSeverity ?? defaultSeverity(action as AuditAction),
  };
}

// ─── AuditLogger class ────────────────────────────────────────────────────────
// Wrap an APPEND_AUDIT dispatch so components don't couple to store internals.

type AppendAuditDispatch = (entry: { type: 'APPEND_AUDIT'; entry: Omit<AuditLogEntry, 'id' | 'timestamp'> }) => void;

export class AuditLogger {
  constructor(
    private readonly dispatch: AppendAuditDispatch,
    private readonly defaultActor: string,
  ) {}

  log(
    action: AuditAction | string,
    target: string,
    overrideSeverity?: AuditSeverity,
    actor?: string,
  ): void {
    this.dispatch({
      type: 'APPEND_AUDIT',
      entry: {
        actor: actor ?? this.defaultActor,
        action,
        target,
        severity: overrideSeverity ?? defaultSeverity(action as AuditAction),
      },
    });
  }

  // Convenience methods for common categories
  event(action: AuditAction, name: string, actor?: string): void {
    this.log(action, name, undefined, actor);
  }

  order(action: AuditAction, orderId: string, buyerName: string, actor?: string): void {
    this.log(action, `${orderId} — ${buyerName}`, undefined, actor);
  }

  scan(result: 'admitted' | 'denied' | 'duplicate', gate: string, ticketId: string): void {
    const action = result === 'admitted' ? AUDIT.SCAN_ADMITTED
      : result === 'denied' ? AUDIT.SCAN_DENIED
      : AUDIT.SCAN_DUPLICATE;
    this.log(action, `${gate} / ${ticketId}`);
  }

  payment(action: AuditAction, orderId: string, amount: number, currency: string): void {
    this.log(action, `${orderId} — ${currency.toUpperCase()} ${(amount / 100).toFixed(2)}`);
  }

  email(template: string, recipient: string, success: boolean): void {
    this.log(
      success ? AUDIT.EMAIL_SENT : AUDIT.EMAIL_FAILED,
      `${template} → ${recipient}`,
    );
  }
}
