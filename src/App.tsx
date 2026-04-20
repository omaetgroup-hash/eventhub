import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import RequireAuth from './components/RequireAuth';
import RequirePack from './components/RequirePack';
import RequirePermission from './components/RequirePermission';

const AppShell = lazy(() => import('./components/AppShell'));
const PublicShell = lazy(() => import('./components/PublicShell'));

const OriginPage = lazy(() => import('./pages/OriginPage'));
const LoginPage = lazy(() => import('./pages/app/LoginPage'));

const PublicEventsPage = lazy(() => import('./pages/public/PublicEventsPage'));
const PublicEventDetailPage = lazy(() => import('./pages/public/PublicEventDetailPage'));
const OrganizerPage = lazy(() => import('./pages/public/OrganizerPage'));
const PublicVenuePage = lazy(() => import('./pages/public/PublicVenuePage'));
const WaitingRoomPage = lazy(() => import('./pages/public/WaitingRoomPage'));
const PublicCheckoutPage = lazy(() => import('./pages/public/PublicCheckoutPage'));
const CustomerAccountPage = lazy(() => import('./pages/public/CustomerAccountPage'));

const AccessRulesPage = lazy(() => import('./pages/app/AccessRulesPage'));
const ProtectionReportPage = lazy(() => import('./pages/app/ProtectionReportPage'));
const PresaleCodesPage = lazy(() => import('./pages/app/PresaleCodesPage'));
const PurchaseProtectionPage = lazy(() => import('./pages/app/PurchaseProtectionPage'));
const QueueDashboardPage = lazy(() => import('./pages/app/QueueDashboardPage'));
const AuditPage = lazy(() => import('./pages/app/AuditPage'));
const CheckInPage = lazy(() => import('./pages/app/CheckInPage'));
const CampaignsPage = lazy(() => import('./pages/app/CampaignsPage'));
const AudiencePage = lazy(() => import('./pages/app/AudiencePage'));
const AgendaPage = lazy(() => import('./pages/app/AgendaPage'));
const DashboardPage = lazy(() => import('./pages/app/DashboardPage'));
const DiscountsPage = lazy(() => import('./pages/app/DiscountsPage'));
const EngagementPage = lazy(() => import('./pages/app/EngagementPage'));
const EnterpriseAnalyticsPage = lazy(() => import('./pages/app/EnterpriseAnalyticsPage'));
const EventDetailPage = lazy(() => import('./pages/app/EventDetailPage'));
const EventsPage = lazy(() => import('./pages/app/EventsPage'));
const ExhibitorsPage = lazy(() => import('./pages/app/ExhibitorsPage'));
const FinancePage = lazy(() => import('./pages/app/FinancePage'));
const GateOpsPage = lazy(() => import('./pages/app/GateOpsPage'));
const GrowthAnalyticsPage = lazy(() => import('./pages/app/GrowthAnalyticsPage'));
const IntegrationsPage = lazy(() => import('./pages/app/IntegrationsPage'));
const KioskPage = lazy(() => import('./pages/app/KioskPage'));
const OrderDetailPage = lazy(() => import('./pages/app/OrderDetailPage'));
const OrdersPage = lazy(() => import('./pages/app/OrdersPage'));
const MonetizationPage = lazy(() => import('./pages/app/MonetizationPage'));
const ResalePage = lazy(() => import('./pages/app/ResalePage'));
const ScannerPage = lazy(() => import('./pages/app/ScannerPage'));
const SettingsPage = lazy(() => import('./pages/app/SettingsPage'));
const TeamPage = lazy(() => import('./pages/app/TeamPage'));
const TicketsPage = lazy(() => import('./pages/app/TicketsPage'));
const VenueDetailPage = lazy(() => import('./pages/app/VenueDetailPage'));
const VenuesPage = lazy(() => import('./pages/app/VenuesPage'));
const AdminRecoveryPage = lazy(() => import('./pages/app/AdminRecoveryPage'));

function RouteLoader() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#060b16', color: 'rgba(220,232,239,0.8)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#d4af37', boxShadow: '0 0 18px rgba(212,175,55,0.7)' }} />
        <span>Loading EventHub…</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/" element={<OriginPage />} />

        <Route element={<PublicShell />}>
          <Route path="/events" element={<PublicEventsPage />} />
        <Route path="/events/:id" element={<PublicEventDetailPage />} />
        <Route path="/checkout/:eventId" element={<PublicCheckoutPage />} />
        <Route path="/account" element={<CustomerAccountPage />} />
        <Route path="/organizers/:id" element={<OrganizerPage />} />
          <Route path="/venues/:id" element={<PublicVenuePage />} />
          <Route path="/queue/:eventId" element={<WaitingRoomPage />} />
        </Route>

        <Route path="/app/login" element={<LoginPage />} />
        <Route path="/app" element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route element={<RequirePack pack="standard" />}>
              <Route index element={<DashboardPage />} />
              <Route element={<RequirePermission permission="events:read" />}>
                <Route path="events" element={<EventsPage />} />
                <Route path="events/:id" element={<EventDetailPage />} />
              </Route>
              <Route element={<RequirePermission permission="venues:read" />}>
                <Route path="venues" element={<VenuesPage />} />
                <Route path="venues/:id" element={<VenueDetailPage />} />
              </Route>
              <Route element={<RequirePermission permission="tickets:read" />}>
                <Route path="tickets" element={<TicketsPage />} />
              </Route>
              <Route element={<RequirePermission permission="orders:read" />}>
                <Route path="orders" element={<OrdersPage />} />
                <Route path="orders/:id" element={<OrderDetailPage />} />
              </Route>
              <Route element={<RequirePermission permission="team:read" />}>
                <Route path="team" element={<TeamPage />} />
              </Route>
              <Route element={<RequirePermission permission="audit:read" />}>
                <Route path="audit" element={<AuditPage />} />
              </Route>
              <Route element={<RequirePermission permission="settings:read" />}>
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="admin-recovery" element={<AdminRecoveryPage />} />
            </Route>

            <Route element={<RequirePack pack="operations" />}>
              <Route element={<RequirePermission permission="check_in:read" />}>
                <Route path="check-in" element={<CheckInPage />} />
                <Route path="gate-ops" element={<GateOpsPage />} />
              </Route>
              <Route element={<RequirePermission permission="check_in:write" />}>
                <Route path="scanner" element={<ScannerPage />} />
                <Route path="access-rules" element={<AccessRulesPage />} />
                <Route path="kiosk" element={<KioskPage />} />
              </Route>
              <Route element={<RequirePermission permission="tickets:write" />}>
                <Route path="queue-ops" element={<QueueDashboardPage />} />
                <Route path="presale-codes" element={<PresaleCodesPage />} />
                <Route path="purchase-protection" element={<PurchaseProtectionPage />} />
                <Route path="protection-report" element={<ProtectionReportPage />} />
              </Route>
            </Route>

            <Route element={<RequirePack pack="growth" />}>
              <Route element={<RequirePermission permission="marketing:read" />}>
                <Route path="campaigns" element={<CampaignsPage />} />
                <Route path="discounts" element={<DiscountsPage />} />
                <Route path="audience" element={<AudiencePage />} />
              </Route>
              <Route element={<RequirePermission permission="analytics:read" />}>
                <Route path="growth-analytics" element={<GrowthAnalyticsPage />} />
              </Route>
            </Route>

            <Route element={<RequirePack pack="conference" />}>
              <Route element={<RequirePermission permission="events:read" />}>
                <Route path="agenda" element={<AgendaPage />} />
                <Route path="exhibitors" element={<ExhibitorsPage />} />
                <Route path="engagement" element={<EngagementPage />} />
              </Route>
            </Route>

            <Route element={<RequirePack pack="enterprise" />}>
              <Route element={<RequirePermission permission="settings:read" />}>
                <Route path="integrations" element={<IntegrationsPage />} />
              </Route>
              <Route element={<RequirePermission permission="analytics:read" />}>
                <Route path="enterprise-analytics" element={<EnterpriseAnalyticsPage />} />
              </Route>
            </Route>

            <Route element={<RequirePack pack="finance" />}>
              <Route element={<RequirePermission permission="settings:read" />}>
                <Route path="finance" element={<FinancePage />} />
              </Route>
            </Route>

            <Route element={<RequirePack pack="monetization" />}>
              <Route element={<RequirePermission permission="tickets:read" />}>
                <Route path="resale" element={<ResalePage />} />
              </Route>
              <Route element={<RequirePermission permission="analytics:read" />}>
                <Route path="monetization" element={<MonetizationPage />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
