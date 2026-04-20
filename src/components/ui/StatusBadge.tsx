import type { EventStatus, OrderStatus, IssuedTicketStatus, ScanResult, UserRole } from '../../lib/domain';

const EVENT_STATUS_CLASS: Record<EventStatus, string> = {
  draft: 'badge-neutral',
  on_sale: 'badge-green',
  sold_out: 'badge-amber',
  live: 'badge-cyan',
  completed: 'badge-muted',
  cancelled: 'badge-red',
};

const ORDER_STATUS_CLASS: Record<OrderStatus, string> = {
  paid: 'badge-green',
  pending: 'badge-amber',
  refunded: 'badge-red',
  cancelled: 'badge-muted',
};

const TICKET_STATUS_CLASS: Record<IssuedTicketStatus, string> = {
  valid: 'badge-green',
  used: 'badge-muted',
  cancelled: 'badge-red',
  transferred: 'badge-cyan',
  refunded: 'badge-orange',
};

const SCAN_RESULT_CLASS: Record<ScanResult, string> = {
  admitted: 'badge-green',
  denied: 'badge-red',
  duplicate: 'badge-amber',
};

const ROLE_CLASS: Record<UserRole, string> = {
  super_admin: 'badge-violet',
  organizer: 'badge-cyan',
  venue_manager: 'badge-amber',
  staff: 'badge-neutral',
  customer: 'badge-muted',
};

function badge(label: string, cls: string) {
  return <span className={`badge ${cls}`}>{label.replace(/_/g, ' ')}</span>;
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  return badge(status, EVENT_STATUS_CLASS[status]);
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return badge(status, ORDER_STATUS_CLASS[status]);
}

export function TicketStatusBadge({ status }: { status: IssuedTicketStatus }) {
  return badge(status, TICKET_STATUS_CLASS[status]);
}

export function ScanResultBadge({ result }: { result: ScanResult }) {
  return badge(result, SCAN_RESULT_CLASS[result]);
}

export function RoleBadge({ role }: { role: UserRole }) {
  return badge(role, ROLE_CLASS[role]);
}
