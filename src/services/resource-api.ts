import type {
  AuditLogEntry,
  Campaign,
  CheckInScan,
  DiscountCampaign,
  EventRecord,
  IssuedTicket,
  OrderRecord,
  ReferralLink,
  StaffAssignment,
  TicketTier,
  Venue,
} from '../lib/domain';
import { apiRequest } from './api';

export interface PageResult<T> {
  total: number;
  [key: string]: T[] | number;
}

export interface EventsResult { events: EventRecord[]; total: number }
export interface OrdersResult { orders: OrderRecord[]; total: number }
export interface TicketsResult { tickets: IssuedTicket[]; total: number }
export interface AuditResult { entries: AuditLogEntry[]; total: number }

export interface ScanRequest {
  qrPayload: string;
  gate: string;
  eventId?: string;
  deviceId?: string;
}

export interface ScanResponse {
  result: 'admitted' | 'denied' | 'duplicate';
  denyReason?: string;
  message?: string;
  ticketId?: string;
  holderName?: string;
  holderEmail?: string;
  tierId?: string;
  eventName?: string;
  scanId: string;
  scannedAt: string;
}

function opts(token: string, method?: string, body?: unknown) {
  return {
    token,
    method: method ?? 'GET',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

// ─── Events ──────────────────────────────────────────────────────────────────

export async function apiListEvents(token: string, filters?: { status?: string; venueId?: string; organizerId?: string; limit?: number; offset?: number }): Promise<EventsResult> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.venueId) params.set('venueId', filters.venueId);
  if (filters?.organizerId) params.set('organizerId', filters.organizerId);
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters?.offset !== undefined) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return apiRequest<EventsResult>(`/events${qs ? `?${qs}` : ''}`, opts(token));
}

export async function apiGetEvent(token: string, id: string): Promise<EventRecord & { tiers: TicketTier[] }> {
  return apiRequest(`/events/${id}`, opts(token));
}

export async function apiCreateEvent(token: string, event: Partial<EventRecord>): Promise<EventRecord> {
  return apiRequest('/events', opts(token, 'POST', event));
}

export async function apiUpdateEvent(token: string, id: string, patch: Partial<EventRecord>): Promise<EventRecord> {
  return apiRequest(`/events/${id}`, opts(token, 'PATCH', patch));
}

export async function apiTransitionEventStatus(token: string, id: string, status: EventRecord['status']): Promise<EventRecord> {
  return apiRequest(`/events/${id}/status`, opts(token, 'POST', { status }));
}

export async function apiDeleteEvent(token: string, id: string): Promise<void> {
  return apiRequest(`/events/${id}`, opts(token, 'DELETE'));
}

export async function apiCloneEvent(token: string, id: string, overrides?: Partial<Pick<EventRecord, 'name' | 'startsAt' | 'endsAt' | 'venueId'>>): Promise<EventRecord & { tiers: TicketTier[] }> {
  return apiRequest(`/events/${id}/clone`, opts(token, 'POST', overrides ?? {}));
}

// ─── Tiers ───────────────────────────────────────────────────────────────────

export async function apiListTiers(token: string, eventId: string): Promise<TicketTier[]> {
  return apiRequest(`/events/${eventId}/tiers`, opts(token));
}

export async function apiCreateTier(token: string, eventId: string, tier: Partial<TicketTier>): Promise<TicketTier> {
  return apiRequest(`/events/${eventId}/tiers`, opts(token, 'POST', tier));
}

export async function apiUpdateTier(token: string, eventId: string, tierId: string, patch: Partial<TicketTier>): Promise<TicketTier> {
  return apiRequest(`/events/${eventId}/tiers/${tierId}`, opts(token, 'PATCH', patch));
}

export async function apiDeleteTier(token: string, eventId: string, tierId: string): Promise<void> {
  return apiRequest(`/events/${eventId}/tiers/${tierId}`, opts(token, 'DELETE'));
}

// ─── Venues ──────────────────────────────────────────────────────────────────

export async function apiListVenues(token: string): Promise<Venue[]> {
  return apiRequest('/venues', opts(token));
}

export async function apiGetVenue(token: string, id: string): Promise<Venue> {
  return apiRequest(`/venues/${id}`, opts(token));
}

export async function apiCreateVenue(token: string, venue: Partial<Venue>): Promise<Venue> {
  return apiRequest('/venues', opts(token, 'POST', venue));
}

export async function apiUpdateVenue(token: string, id: string, patch: Partial<Venue>): Promise<Venue> {
  return apiRequest(`/venues/${id}`, opts(token, 'PATCH', patch));
}

export async function apiDeleteVenue(token: string, id: string): Promise<void> {
  return apiRequest(`/venues/${id}`, opts(token, 'DELETE'));
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function apiListOrders(token: string, filters?: { eventId?: string; buyerEmail?: string; status?: string; limit?: number; offset?: number }): Promise<OrdersResult> {
  const params = new URLSearchParams();
  if (filters?.eventId) params.set('eventId', filters.eventId);
  if (filters?.buyerEmail) params.set('buyerEmail', filters.buyerEmail);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters?.offset !== undefined) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return apiRequest<OrdersResult>(`/orders${qs ? `?${qs}` : ''}`, opts(token));
}

export async function apiGetOrder(token: string, id: string): Promise<OrderRecord & { tickets: IssuedTicket[] }> {
  return apiRequest(`/orders/${id}`, opts(token));
}

export async function apiUpdateOrderStatus(token: string, id: string, status: OrderRecord['status']): Promise<OrderRecord> {
  return apiRequest(`/orders/${id}/status`, opts(token, 'PATCH', { status }));
}

export async function apiRefundOrder(token: string, id: string, reason?: string): Promise<{ order: OrderRecord; refund: unknown }> {
  return apiRequest(`/orders/${id}/refund`, opts(token, 'POST', { reason }));
}

export async function apiTransferTicket(token: string, orderId: string, ticketId: string, holderName: string, holderEmail: string): Promise<IssuedTicket> {
  return apiRequest(`/orders/${orderId}/tickets/${ticketId}/transfer`, opts(token, 'POST', { holderName, holderEmail }));
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

export async function apiListTickets(token: string, filters?: { orderId?: string; eventId?: string; holderEmail?: string; status?: string; limit?: number; offset?: number }): Promise<TicketsResult> {
  const params = new URLSearchParams();
  if (filters?.orderId) params.set('orderId', filters.orderId);
  if (filters?.eventId) params.set('eventId', filters.eventId);
  if (filters?.holderEmail) params.set('holderEmail', filters.holderEmail);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters?.offset !== undefined) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return apiRequest<TicketsResult>(`/tickets${qs ? `?${qs}` : ''}`, opts(token));
}

export async function apiRevokeTicket(token: string, ticketId: string, reason?: string): Promise<IssuedTicket> {
  return apiRequest(`/tickets/${ticketId}/revoke`, opts(token, 'POST', { reason }));
}

export async function apiReissueTicket(token: string, ticketId: string): Promise<IssuedTicket> {
  return apiRequest(`/tickets/${ticketId}/reissue`, opts(token, 'POST', {}));
}

export async function apiScan(token: string, req: ScanRequest): Promise<ScanResponse> {
  return apiRequest('/tickets/scan', opts(token, 'POST', req));
}

export async function apiScanHistory(token: string, filters?: { eventId?: string; gate?: string; result?: string; limit?: number }): Promise<CheckInScan[]> {
  const params = new URLSearchParams();
  if (filters?.eventId) params.set('eventId', filters.eventId);
  if (filters?.gate) params.set('gate', filters.gate);
  if (filters?.result) params.set('result', filters.result);
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return apiRequest(`/tickets/scan/history${qs ? `?${qs}` : ''}`, opts(token));
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export async function apiListAudit(token: string, filters?: { actor?: string; action?: string; severity?: string; limit?: number; offset?: number }): Promise<AuditResult> {
  const params = new URLSearchParams();
  if (filters?.actor) params.set('actor', filters.actor);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.severity) params.set('severity', filters.severity);
  if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters?.offset !== undefined) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return apiRequest<AuditResult>(`/audit${qs ? `?${qs}` : ''}`, opts(token));
}

// ─── Marketing ────────────────────────────────────────────────────────────────

export async function apiListCampaigns(token: string, eventId?: string): Promise<Campaign[]> {
  const qs = eventId ? `?eventId=${eventId}` : '';
  return apiRequest(`/marketing/campaigns${qs}`, opts(token));
}

export async function apiUpsertCampaign(token: string, campaign: Campaign): Promise<Campaign> {
  if (campaign.id && campaign.id.startsWith('cmp_')) {
    return apiRequest(`/marketing/campaigns/${campaign.id}`, opts(token, 'PATCH', campaign));
  }
  return apiRequest('/marketing/campaigns', opts(token, 'POST', campaign));
}

export async function apiDeleteCampaign(token: string, id: string): Promise<void> {
  return apiRequest(`/marketing/campaigns/${id}`, opts(token, 'DELETE'));
}

export async function apiListDiscounts(token: string, eventId?: string): Promise<DiscountCampaign[]> {
  const qs = eventId ? `?eventId=${eventId}` : '';
  return apiRequest(`/marketing/discounts${qs}`, opts(token));
}

export async function apiUpsertDiscount(token: string, discount: DiscountCampaign): Promise<DiscountCampaign> {
  if (discount.id) {
    return apiRequest(`/marketing/discounts/${discount.id}`, opts(token, 'PATCH', discount));
  }
  return apiRequest('/marketing/discounts', opts(token, 'POST', discount));
}

export async function apiDeleteDiscount(token: string, id: string): Promise<void> {
  return apiRequest(`/marketing/discounts/${id}`, opts(token, 'DELETE'));
}

export async function apiListReferrals(token: string, eventId?: string): Promise<ReferralLink[]> {
  const qs = eventId ? `?eventId=${eventId}` : '';
  return apiRequest(`/marketing/referrals${qs}`, opts(token));
}

export async function apiUpsertReferral(token: string, referral: ReferralLink): Promise<ReferralLink> {
  if (referral.id) {
    return apiRequest(`/marketing/referrals/${referral.id}`, opts(token, 'PATCH', referral));
  }
  return apiRequest('/marketing/referrals', opts(token, 'POST', referral));
}

export async function apiDeleteReferral(token: string, id: string): Promise<void> {
  return apiRequest(`/marketing/referrals/${id}`, opts(token, 'DELETE'));
}

// ─── Staff Assignments ────────────────────────────────────────────────────────

export async function apiListStaffAssignments(token: string, filters?: { eventId?: string; staffId?: string }): Promise<StaffAssignment[]> {
  const params = new URLSearchParams();
  if (filters?.eventId) params.set('eventId', filters.eventId);
  if (filters?.staffId) params.set('staffId', filters.staffId);
  const qs = params.toString();
  return apiRequest(`/team/assignments${qs ? `?${qs}` : ''}`, opts(token));
}

export async function apiCreateStaffAssignment(token: string, staffId: string, eventId: string, gate?: string): Promise<StaffAssignment> {
  return apiRequest('/team/assignments', opts(token, 'POST', { staffId, eventId, gate }));
}

export async function apiDeleteStaffAssignment(token: string, id: string): Promise<void> {
  return apiRequest(`/team/assignments/${id}`, opts(token, 'DELETE'));
}

export interface TeamInviteResponse {
  invite: {
    id: string;
    email: string;
    role: string;
    scope: string;
    expiresAt: string;
  };
  acceptUrl: string;
}

export async function apiCreateTeamInvite(
  token: string,
  payload: { name: string; email: string; role: string; scope?: string },
): Promise<TeamInviteResponse> {
  return apiRequest('/team/invites', opts(token, 'POST', payload));
}
