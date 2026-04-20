export type UserRole = 'super_admin' | 'organizer' | 'venue_manager' | 'staff' | 'customer';
export type ProductPack = 'standard' | 'finance' | 'operations' | 'growth' | 'conference' | 'enterprise' | 'monetization';
export type EventStatus = 'draft' | 'on_sale' | 'sold_out' | 'live' | 'completed' | 'cancelled';
export type OrderStatus = 'paid' | 'pending' | 'refunded' | 'cancelled';
export type TicketKind = 'general_admission' | 'reserved_seating' | 'vip' | 'timed_entry';
export type ScanResult = 'admitted' | 'denied' | 'duplicate';
export type IssuedTicketStatus = 'valid' | 'used' | 'cancelled' | 'transferred' | 'refunded';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  scope: string;
  lastActive: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  region: string;
  plan: 'starter' | 'growth' | 'enterprise';
  enabledPacks: ProductPack[];
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  capacity: number;
  zones: string[];
  managerId: string;
  manager: string;
  createdAt: string;
}

export interface EventRecord {
  id: string;
  name: string;
  description: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  venueId: string;
  organizerId: string;
  category: string;
  ticketsSold: number;
  grossRevenue: number;
  createdAt: string;
  imageUrl?: string;
}

export interface TicketTier {
  id: string;
  eventId: string;
  name: string;
  kind: TicketKind;
  price: number;
  inventory: number;
  sold: number;
  description: string;
  saleStartsAt?: string;
  saleEndsAt?: string;
}

export interface OrderRecord {
  id: string;
  eventId: string;
  tierId: string;
  buyerName: string;
  buyerEmail: string;
  total: number;
  quantity: number;
  currency?: string;
  status: OrderStatus;
  paymentIntentId?: string;
  paymentProvider?: string;
  createdAt: string;
}

export interface IssuedTicket {
  id: string;
  orderId: string;
  tierId: string;
  eventId: string;
  holderName: string;
  holderEmail: string;
  qrPayload: string;
  status: IssuedTicketStatus;
  issuedAt: string;
  scannedAt?: string;
  scannedGate?: string;
  seatNumber?: string;
}

export type DenyReason =
  | 'not_found'
  | 'already_used'
  | 'wrong_gate'
  | 'tier_not_allowed'
  | 'cancelled_ticket'
  | 'session_expired'
  | 'outside_entry_window';

export interface CheckInScan {
  id: string;
  ticketId: string;
  eventId: string;
  gate: string;
  scannedAt: string;
  result: ScanResult;
  operatorId: string;
  // Milestone 5 extensions (optional for backward compat)
  deviceId?: string;
  tierId?: string;
  denyReason?: DenyReason;
}

export interface Checkpoint {
  gate: string;
  eventId?: string;
  scanned: number;
  admitted: number;
  denied: number;
  offlineDevices: number;
  reAdmissions: number;
}

export type DeviceStatus = 'online' | 'offline' | 'syncing';

export interface ScanDevice {
  id: string;
  name: string;
  gate: string;
  eventId: string;
  operatorId: string;
  status: DeviceStatus;
  lastSeen: string;
  pendingScans: number;
}

export interface AccessRule {
  id: string;
  eventId: string;
  gate: string;
  label: string;
  allowedTierIds: string[];   // empty = all tiers allowed
  allowedKinds: TicketKind[]; // empty = all kinds allowed
  requiresAccreditation: boolean;
  notes?: string;
}

export interface OfflineScanEntry {
  id: string;
  qrPayload: string;
  gate: string;
  deviceId: string;
  eventId: string;
  scannedAt: string;
  synced: boolean;
  conflict?: 'duplicate' | 'unknown';
}

export interface ReEntryRecord {
  id: string;
  ticketId: string;
  holderName: string;
  eventId: string;
  gate: string;
  passedOutAt: string;
  readmittedAt?: string;
  operatorId: string;
}

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
  note?: string;
}

export interface NotificationChannel {
  channel: 'email' | 'payments' | 'audit' | 'qr' | 'check_in';
  status: 'ready' | 'needs_config';
  note: string;
}

export interface OrgSettings {
  orgId: string;
  emailSender: string;
  paymentProvider: string;
  emailProvider: string;
  qrIssuerKey: string;
  auditWebhook: string;
}

export type PaymentRecordStatus = 'initiated' | 'succeeded' | 'failed' | 'refunded';

export interface PaymentRecord {
  id: string;
  orderId: string;
  intentId: string;
  provider: string;
  amountCents: number;
  currency: string;
  status: PaymentRecordStatus;
  createdAt: string;
}

export interface EmailLog {
  id: string;
  template: string;
  to: string;
  orderId?: string;
  provider: string;
  status: 'sent' | 'failed';
  error?: string;
  sentAt: string;
}

// ─── Milestone 4 — High-demand sales layer ────────────────────────────────────

export type CampaignChannel = 'email' | 'sms';
export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused';

export interface Campaign {
  id: string;
  eventId?: string;
  name: string;
  channel: CampaignChannel;
  segmentId?: string;
  status: CampaignStatus;
  subject: string;
  scheduledAt?: string;
  sentCount: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
  sourceTag: string;
  createdAt: string;
}

export type DiscountType = 'percentage' | 'fixed' | 'early_bird';

export interface DiscountCampaign {
  id: string;
  eventId: string;
  name: string;
  code: string;
  type: DiscountType;
  amount: number;
  startsAt?: string;
  endsAt?: string;
  redemptions: number;
  revenueAttributed: number;
  active: boolean;
  createdAt: string;
}

export interface ReferralLink {
  id: string;
  eventId: string;
  label: string;
  code: string;
  source: string;
  clicks: number;
  conversions: number;
  revenueAttributed: number;
  createdAt: string;
}

export type CheckoutQuestionType = 'text' | 'select' | 'checkbox';

export interface CheckoutQuestion {
  id: string;
  eventId: string;
  label: string;
  type: CheckoutQuestionType;
  required: boolean;
  options?: string[];
}

export interface CustomerSegment {
  id: string;
  name: string;
  criteria: string;
  memberCount: number;
  repeatBuyerCount: number;
  highValueCount: number;
  notes?: string;
}

export interface ConversionReport {
  id: string;
  eventId?: string;
  scope: 'event' | 'organization';
  windowLabel: string;
  visits: number;
  checkoutStarts: number;
  ordersCompleted: number;
  revenue: number;
  topSource: string;
  updatedAt: string;
}

export type IntegrationKind = 'webhook' | 'crm' | 'accounting' | 'sso' | 'api';
export type IntegrationStatus = 'connected' | 'needs_config' | 'degraded' | 'disabled';

export interface IntegrationConnection {
  id: string;
  kind: IntegrationKind;
  name: string;
  provider: string;
  status: IntegrationStatus;
  syncMode: 'push' | 'pull' | 'bidirectional';
  lastSyncAt?: string;
  notes?: string;
}

export interface WebhookEndpoint {
  id: string;
  label: string;
  url: string;
  subscribedEvents: string[];
  status: 'active' | 'paused';
  lastDeliveryAt?: string;
}

export interface ApiCredential {
  id: string;
  label: string;
  scope: 'read_only' | 'ops' | 'admin';
  createdAt: string;
  lastUsedAt?: string;
  status: 'active' | 'revoked';
}

export interface FinanceExport {
  id: string;
  kind: 'orders' | 'payouts' | 'tax' | 'reconciliation';
  provider: string;
  periodLabel: string;
  status: 'ready' | 'processing' | 'failed';
  rowCount: number;
  amount: number;
  createdAt: string;
}

export interface ReconciliationRun {
  id: string;
  provider: string;
  periodLabel: string;
  matchedCount: number;
  unmatchedCount: number;
  varianceAmount: number;
  status: 'completed' | 'review' | 'failed';
  createdAt: string;
}

export interface TaxProfile {
  id: string;
  region: string;
  registrationNumber: string;
  defaultRate: number;
  filingCadence: 'monthly' | 'quarterly' | 'annual';
  pricesIncludeTax: boolean;
}

export interface ManagedOrganization {
  id: string;
  name: string;
  region: string;
  activeEvents: number;
  revenue: number;
  teamCount: number;
  complianceStatus: 'healthy' | 'attention' | 'critical';
}

export interface SsoConfiguration {
  provider: string;
  domain: string;
  status: 'configured' | 'pending';
  enforced: boolean;
}

export interface SessionRecord {
  id: string;
  eventId: string;
  title: string;
  track: string;
  startsAt: string;
  endsAt: string;
  speakerIds: string[];
  room: string;
  capacity?: number;
}

export interface SpeakerProfile {
  id: string;
  name: string;
  title: string;
  organization: string;
  bio: string;
  topicTags: string[];
}

export interface SponsorProfile {
  id: string;
  eventId: string;
  name: string;
  tier: 'headline' | 'gold' | 'supporting';
  boothId?: string;
  website?: string;
}

export interface ExhibitorBooth {
  id: string;
  eventId: string;
  name: string;
  hall: string;
  boothCode: string;
  leadCount: number;
  meetingCount: number;
}

export interface MatchmakingProfile {
  id: string;
  eventId: string;
  attendeeName: string;
  interests: string[];
  goals: string[];
  availability: string;
}

export interface AppointmentRecord {
  id: string;
  eventId: string;
  attendeeName: string;
  counterpart: string;
  startsAt: string;
  location: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}

export interface LivePoll {
  id: string;
  eventId: string;
  question: string;
  status: 'draft' | 'live' | 'closed';
  responses: number;
}

export interface SurveyRecord {
  id: string;
  eventId: string;
  title: string;
  audience: 'attendees' | 'sponsors' | 'speakers';
  completionRate: number;
}

export interface AnnouncementRecord {
  id: string;
  eventId: string;
  title: string;
  channel: 'push' | 'email' | 'onsite';
  sentAt: string;
}

export interface ResaleListing {
  id: string;
  eventId: string;
  ticketId: string;
  sellerEmail: string;
  askingPrice: number;
  faceValue: number;
  status: 'listed' | 'sold' | 'cancelled';
}

export interface UpgradeOffer {
  id: string;
  eventId: string;
  name: string;
  targetTierId: string;
  upgradePrice: number;
  inventory: number;
  claimed: number;
}

export interface MembershipPlan {
  id: string;
  name: string;
  price: number;
  billingCycle: 'monthly' | 'annual';
  benefits: string[];
  activeMembers: number;
}

export interface SponsorPlacement {
  id: string;
  eventId?: string;
  name: string;
  placement: 'homepage' | 'checkout' | 'email';
  sponsor: string;
  impressions: number;
  clicks: number;
}

export interface DynamicPricingRule {
  id: string;
  eventId: string;
  tierId: string;
  trigger: 'pace' | 'inventory' | 'date';
  adjustmentType: 'increase_percent' | 'decrease_percent';
  adjustmentValue: number;
  status: 'active' | 'paused';
}

export type QueueEntryStatus = 'queued' | 'releasing' | 'admitted' | 'expired';

export interface WaitingRoomEntry {
  id: string;
  eventId: string;
  sessionId: string;
  buyerEmail?: string;
  position: number;
  estimatedWaitMins: number;
  status: QueueEntryStatus;
  joinedAt: string;
  releasedAt?: string;
}

export type HoldStatus = 'active' | 'released' | 'converted';

export interface InventoryHold {
  id: string;
  eventId: string;
  tierId: string;
  quantity: number;
  holderId: string;
  status: HoldStatus;
  createdAt: string;
  expiresAt: string;
  convertedToOrderId?: string;
}

export interface PurchaseLimitRule {
  id: string;
  eventId: string;
  tierId?: string;
  maxPerOrder: number;
  maxPerBuyer: number;
  notes?: string;
}

export type PresaleCodeStatus = 'active' | 'exhausted' | 'expired' | 'disabled';

export interface PresaleCode {
  id: string;
  eventId: string;
  code: string;
  label: string;
  allowedTierIds: string[];
  maxUses: number;
  usedCount: number;
  status: PresaleCodeStatus;
  validFrom?: string;
  validUntil?: string;
  createdAt: string;
}

export interface PriorityGroup {
  id: string;
  eventId: string;
  name: string;
  accessLevel: 'presale_early' | 'presale_code' | 'standard';
  allowedTierIds: string[];
  memberCount: number;
  notes?: string;
  createdAt: string;
}

export type FlagType =
  | 'bulk_purchase'
  | 'bot_pattern'
  | 'duplicate_email'
  | 'suspicious_payment'
  | 'known_reseller';

export type FlagSeverity = 'low' | 'medium' | 'high';

export interface FraudFlag {
  id: string;
  eventId: string;
  orderId?: string;
  ticketId?: string;
  buyerEmail?: string;
  flagType: FlagType;
  severity: FlagSeverity;
  detail: string;
  detectedAt: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
}

export type AbusePattern =
  | 'rapid_attempts'
  | 'multiple_sessions'
  | 'queue_bypass'
  | 'code_stuffing'
  | 'hold_farming';

export interface AbuseEvent {
  id: string;
  eventId: string;
  pattern: AbusePattern;
  ipHash: string;
  sessionCount: number;
  detectedAt: string;
  action: 'logged' | 'blocked' | 'flagged';
}

export interface QueueSnapshot {
  id: string;
  eventId: string;
  capturedAt: string;
  queueDepth: number;
  releaseRate: number;
  attemptRate: number;
  activeHolds: number;
  conversionRate: number;
}

export interface StaffAssignment {
  id: string;
  staffId: string;
  eventId: string;
  gate?: string; // undefined = all gates for this event
  assignedBy: string;
  createdAt: string;
}
