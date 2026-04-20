import type {
  AbuseEvent,
  AccessRule,
  AnnouncementRecord,
  ApiCredential,
  AppointmentRecord,
  AuditLogEntry,
  Campaign,
  CheckInScan,
  Checkpoint,
  CheckoutQuestion,
  ConversionReport,
  CustomerSegment,
  DeviceStatus,
  DiscountCampaign,
  DynamicPricingRule,
  EmailLog,
  EventRecord,
  ExhibitorBooth,
  FinanceExport,
  FraudFlag,
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
  PriorityGroup,
  PurchaseLimitRule,
  QueueSnapshot,
  ReEntryRecord,
  ReconciliationRun,
  ReferralLink,
  ResaleListing,
  ScanDevice,
  SessionRecord,
  SpeakerProfile,
  SponsorPlacement,
  SponsorProfile,
  SsoConfiguration,
  SurveyRecord,
  TaxProfile,
  TeamMember,
  TicketTier,
  Venue,
  WaitingRoomEntry,
  WebhookEndpoint,
  UpgradeOffer,
} from './domain';

export const EVENTHUB_SCHEMA_VERSION = 1;

export interface AppDatabase {
  schemaVersion: number;
  updatedAt: string;
  organization: Organization;
  teamMembers: TeamMember[];
  venues: Venue[];
  events: EventRecord[];
  ticketTiers: TicketTier[];
  orders: OrderRecord[];
  issuedTickets: IssuedTicket[];
  checkInScans: CheckInScan[];
  checkpoints: Checkpoint[];
  auditLog: AuditLogEntry[];
  orgSettings: OrgSettings;
  paymentRecords: PaymentRecord[];
  emailLogs: EmailLog[];
  campaigns: Campaign[];
  discountCampaigns: DiscountCampaign[];
  referralLinks: ReferralLink[];
  checkoutQuestions: CheckoutQuestion[];
  customerSegments: CustomerSegment[];
  conversionReports: ConversionReport[];
  integrationConnections: IntegrationConnection[];
  webhookEndpoints: WebhookEndpoint[];
  apiCredentials: ApiCredential[];
  financeExports: FinanceExport[];
  reconciliationRuns: ReconciliationRun[];
  taxProfiles: TaxProfile[];
  managedOrganizations: ManagedOrganization[];
  ssoConfigurations: SsoConfiguration[];
  sessions: SessionRecord[];
  speakers: SpeakerProfile[];
  sponsors: SponsorProfile[];
  exhibitorBooths: ExhibitorBooth[];
  matchmakingProfiles: MatchmakingProfile[];
  appointments: AppointmentRecord[];
  livePolls: LivePoll[];
  surveys: SurveyRecord[];
  announcements: AnnouncementRecord[];
  resaleListings: ResaleListing[];
  upgradeOffers: UpgradeOffer[];
  membershipPlans: MembershipPlan[];
  sponsorPlacements: SponsorPlacement[];
  dynamicPricingRules: DynamicPricingRule[];
  devices: ScanDevice[];
  accessRules: AccessRule[];
  offlineQueue: OfflineScanEntry[];
  reEntryRecords: ReEntryRecord[];
  waitingRoom: WaitingRoomEntry[];
  inventoryHolds: InventoryHold[];
  purchaseLimits: PurchaseLimitRule[];
  presaleCodes: PresaleCode[];
  priorityGroups: PriorityGroup[];
  fraudFlags: FraudFlag[];
  abuseEvents: AbuseEvent[];
  queueSnapshots: QueueSnapshot[];
}

export interface AuthSessionRecord {
  userId: string;
  authenticatedAt: string;
}

export interface BackendCapability {
  label: string;
  status: 'ready' | 'configured' | 'pending';
  mode: 'browser' | 'api' | 'hybrid';
  notes: string;
}

export interface DataStoreMetadata {
  auth: BackendCapability;
  persistence: BackendCapability;
  payments: BackendCapability;
  email: BackendCapability;
  qr: BackendCapability;
  checkIn: BackendCapability;
}
