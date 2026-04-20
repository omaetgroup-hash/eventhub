import type { ProductPack } from './domain';

export interface PackDefinition {
  id: ProductPack;
  name: string;
  headline: string;
  description: string;
  routes: string[];
  pricingPosition: string;
  audience: string;
}

export const STANDARD_PACK: ProductPack = 'standard';

export const PACK_DEFINITIONS: Record<ProductPack, PackDefinition> = {
  standard: {
    id: 'standard',
    name: 'Standard',
    headline: 'Sell, manage, and support live events from one core platform.',
    description: 'Events, venues, ticketing, checkout, orders, customer ticket access, basic reporting, and platform settings.',
    routes: ['/app', '/app/events', '/app/venues', '/app/tickets', '/app/orders'],
    pricingPosition: 'Base subscription',
    audience: 'Promoters, venues, and organizers who need the core EventHub platform.',
  },
  finance: {
    id: 'finance',
    name: 'Finance',
    headline: 'Back-office reporting and reconciliation for revenue teams.',
    description: 'Payout visibility, reconciliation, finance exports, tax support, and finance-oriented reporting.',
    routes: ['/app/finance'],
    pricingPosition: 'Operational add-on',
    audience: 'Operators who need deeper finance control and reporting.',
  },
  operations: {
    id: 'operations',
    name: 'Operations',
    headline: 'Venue-day control for scanners, gates, and staff operations.',
    description: 'Check-in, gate operations, scanners, kiosks, access rules, and onsite reporting.',
    routes: ['/app/check-in', '/app/gate-ops', '/app/scanner', '/app/access-rules', '/app/kiosk'],
    pricingPosition: 'Premium live-ops add-on',
    audience: 'Venues, festivals, and live teams running check-in and access control.',
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    headline: 'Campaigns, discounts, and audience tools to grow ticket sales.',
    description: 'Campaigns, discounts, audience segments, referrals, and conversion analytics.',
    routes: ['/app/campaigns', '/app/discounts', '/app/audience', '/app/growth-analytics'],
    pricingPosition: 'Commercial growth add-on',
    audience: 'Organizers focused on acquisition, conversion, and retention.',
  },
  conference: {
    id: 'conference',
    name: 'Conference',
    headline: 'Agenda, exhibitors, and engagement for conference-style events.',
    description: 'Agenda, exhibitors, engagement tools, and conference-specific workflows.',
    routes: ['/app/agenda', '/app/exhibitors', '/app/engagement'],
    pricingPosition: 'Vertical add-on',
    audience: 'Conferences, expos, and trade events.',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    headline: 'Controls and integrations for larger organizations.',
    description: 'Integrations, advanced analytics, compliance tooling, and enterprise admin control.',
    routes: ['/app/integrations', '/app/enterprise-analytics'],
    pricingPosition: 'Top-tier add-on',
    audience: 'Larger customers with integration, governance, and advanced reporting needs.',
  },
  monetization: {
    id: 'monetization',
    name: 'Monetization',
    headline: 'Advanced revenue features for mature operators.',
    description: 'Resale, premium tools, upgrades, and revenue expansion surfaces.',
    routes: ['/app/resale', '/app/monetization'],
    pricingPosition: 'Advanced add-on',
    audience: 'Operators maximizing revenue through advanced commercial features.',
  },
};

export const ADD_ON_PACKS: ProductPack[] = ['finance', 'operations', 'growth', 'conference', 'enterprise', 'monetization'];

export function normalizeEnabledPacks(packs: ProductPack[] | undefined): ProductPack[] {
  const next = new Set<ProductPack>([STANDARD_PACK]);
  for (const pack of packs ?? []) {
    next.add(pack);
  }
  return Array.from(next);
}

export function hasPack(enabledPacks: ProductPack[] | undefined, pack: ProductPack): boolean {
  return normalizeEnabledPacks(enabledPacks).includes(pack);
}
