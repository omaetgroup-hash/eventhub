import type { Request, Response, NextFunction } from 'express';
import type { EventRecord, OrderRecord, ProductPack, TeamMember, UserRole, Venue } from '../src/lib/domain';
import { getEvent, getOrganization, getSession, getStaffAssignedEventIds, getStaffAssignedGates, getVenue, listEvents, listVenues } from './db';

type Permission =
  | 'events:read' | 'events:write'
  | 'venues:read' | 'venues:write'
  | 'tickets:read' | 'tickets:write'
  | 'orders:read' | 'orders:write'
  | 'marketing:read' | 'marketing:write'
  | 'analytics:read'
  | 'team:read' | 'team:write'
  | 'check_in:read' | 'check_in:write'
  | 'audit:read'
  | 'settings:read' | 'settings:write'
  | '*';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: ['*'],
  organizer: [
    'events:read', 'events:write',
    'tickets:read', 'tickets:write',
    'orders:read', 'orders:write',
    'venues:read',
    'marketing:read', 'marketing:write',
    'analytics:read',
    'team:read', 'team:write',
    'check_in:read',
    'audit:read',
    'settings:read', 'settings:write',
  ],
  venue_manager: [
    'venues:read', 'venues:write',
    'events:read',
    'tickets:read',
    'analytics:read',
    'check_in:read', 'check_in:write',
    'team:read',
    'settings:read',
  ],
  staff: [
    'events:read',
    'check_in:read', 'check_in:write',
    'orders:read',
    'analytics:read',
  ],
  customer: ['orders:read'],
};

function canDo(role: UserRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return perms.includes('*') || perms.includes(permission);
}

function hasGlobalScope(user: TeamMember): boolean {
  return user.role === 'super_admin' || user.scope.trim().toLowerCase() === 'all organizations';
}

export function canAccessVenue(user: TeamMember, venue: Venue): boolean {
  if (hasGlobalScope(user)) return true;
  if (user.role === 'venue_manager') return venue.managerId === user.id;
  if (user.role === 'organizer') {
    return listEvents({ organizerId: user.id, limit: 500, offset: 0 }).events.some((event) => event.venueId === venue.id);
  }
  return false;
}

export function canAccessEvent(user: TeamMember, event: EventRecord): boolean {
  if (hasGlobalScope(user)) return true;
  if (user.role === 'organizer') return event.organizerId === user.id;
  if (user.role === 'venue_manager') {
    const venue = getVenue(event.venueId);
    return Boolean(venue && venue.managerId === user.id);
  }
  if (user.role === 'staff') {
    return getStaffAssignedEventIds(user.id).includes(event.id);
  }
  return false;
}

export function canAccessOrder(user: TeamMember, order: OrderRecord): boolean {
  if (hasGlobalScope(user)) return true;
  if (user.role === 'customer') return order.buyerEmail.toLowerCase() === user.email.toLowerCase();
  const event = getEvent(order.eventId);
  return Boolean(event && canAccessEvent(user, event));
}

export function getAccessibleVenueIds(user: TeamMember): string[] | null {
  if (hasGlobalScope(user)) return null;
  if (user.role === 'venue_manager') {
    return listVenues().filter((venue) => venue.managerId === user.id).map((venue) => venue.id);
  }
  if (user.role === 'organizer') {
    const eventVenueIds = new Set(listEvents({ organizerId: user.id, limit: 500, offset: 0 }).events.map((event) => event.venueId));
    return listVenues().filter((venue) => eventVenueIds.has(venue.id)).map((venue) => venue.id);
  }
  return [];
}

export function getAccessibleEventIds(user: TeamMember): string[] | null {
  if (hasGlobalScope(user)) return null;
  if (user.role === 'organizer') {
    return listEvents({ organizerId: user.id, limit: 500, offset: 0 }).events.map((event) => event.id);
  }
  if (user.role === 'venue_manager') {
    const venueIds = new Set(getAccessibleVenueIds(user) ?? []);
    return listEvents({ limit: 500, offset: 0 }).events.filter((event) => venueIds.has(event.venueId)).map((event) => event.id);
  }
  if (user.role === 'staff') {
    return getStaffAssignedEventIds(user.id);
  }
  return [];
}

// Returns null (unrestricted) for non-staff, or the gate list from the assignment table.
// Empty array means the staff member has no assignments for this event.
export function getAssignedGates(user: TeamMember, eventId: string): string[] | null {
  if (user.role !== 'staff') return null;
  return getStaffAssignedGates(user.id, eventId);
}

export type AuthRequest = Request & { session: NonNullable<ReturnType<typeof getSession>> };

export function authTokenFrom(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const token = authTokenFrom(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  const session = getSession(token);
  if (!session) {
    res.status(401).json({ error: 'Session expired or invalid.' });
    return;
  }
  (req as AuthRequest).session = session;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const session = (req as AuthRequest).session;
  if (!session || !['super_admin', 'organizer'].includes(session.user.role)) {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const session = (req as AuthRequest).session;
  if (!session || session.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Super admin access required.' });
    return;
  }
  next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const session = (req as AuthRequest).session;
    if (!session) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!canDo(session.user.role, permission)) {
      res.status(403).json({ error: `Permission denied: ${permission}` });
      return;
    }
    next();
  };
}

export function requirePack(pack: ProductPack) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const organization = getOrganization();
    const enabledPacks = new Set<ProductPack>(['standard', ...(organization.enabledPacks ?? [])]);
    if (!enabledPacks.has(pack)) {
      res.status(403).json({ error: `The ${pack} pack is not enabled for this organization.` });
      return;
    }
    next();
  };
}
