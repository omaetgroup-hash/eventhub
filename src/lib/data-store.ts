import { loadPersistedState, savePersistedState } from './persistence';
import type { AppDatabase, DataStoreMetadata } from './schema';
import { EVENTHUB_SCHEMA_VERSION } from './schema';
import { createSeedDatabase } from './mock-platform';
import { env, isApiPersistenceConfigured } from './env';
import { apiRequest } from '../services/api';
import { normalizeEnabledPacks } from './packs';

export const DATA_STORE_METADATA: DataStoreMetadata = {
  auth: {
    label: 'Role-aware auth session',
    status: isApiPersistenceConfigured() ? 'configured' : 'ready',
    mode: isApiPersistenceConfigured() ? 'api' : 'browser',
    notes: 'API-backed email-code auth with persisted sessions and route guards.',
  },
  persistence: {
    label: 'Application database',
    status: isApiPersistenceConfigured() ? 'configured' : 'ready',
    mode: isApiPersistenceConfigured() ? 'hybrid' : 'browser',
    notes: 'SQLite-backed snapshots sync through the API, with browser persistence retained for resilience.',
  },
  payments: {
    label: 'Payment API contract',
    status: 'configured',
    mode: 'api',
    notes: 'Frontend now targets backend endpoints for intents, sessions, refunds, and webhook parsing.',
  },
  email: {
    label: 'Transactional email contract',
    status: 'configured',
    mode: 'api',
    notes: 'Frontend dispatches to backend email endpoint; provider keys remain server-side.',
  },
  qr: {
    label: 'QR integrity layer',
    status: 'ready',
    mode: 'hybrid',
    notes: 'Offline checksum validation works in-browser; server-issued tokens can replace checksum salts later.',
  },
  checkIn: {
    label: 'Venue operations',
    status: 'ready',
    mode: 'hybrid',
    notes: 'Scanner, queueing, audit, and gate ops now persist against the API for authenticated workspace use.',
  },
};

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeDatabase(candidate: AppDatabase | null | undefined): AppDatabase {
  if (!candidate || candidate.schemaVersion !== EVENTHUB_SCHEMA_VERSION) {
    return createSeedDatabase();
  }

  return {
    ...candidate,
    schemaVersion: EVENTHUB_SCHEMA_VERSION,
    updatedAt: candidate.updatedAt || nowIso(),
    organization: {
      ...candidate.organization,
      enabledPacks: normalizeEnabledPacks(candidate.organization.enabledPacks),
    },
  };
}

export function createInitialDatabase(): AppDatabase {
  const seed = createSeedDatabase();
  const persisted = loadPersistedState<AppDatabase | null>('platform', null);
  return normalizeDatabase(persisted ?? seed);
}

export async function fetchDatabaseSnapshot(token?: string | null): Promise<AppDatabase> {
  if (!isApiPersistenceConfigured()) {
    return createInitialDatabase();
  }

  const path = token ? '/platform/private' : '/platform/public';
  const snapshot = await apiRequest<AppDatabase>(path, {
    token: token ?? undefined,
  });

  const normalized = normalizeDatabase(snapshot);
  savePersistedState('platform', normalized);
  return normalized;
}

export function loadDatabaseSnapshot(): AppDatabase {
  const seed = createSeedDatabase();
  const persisted = loadPersistedState<AppDatabase | null>('platform', null);
  return normalizeDatabase(persisted ?? seed);
}

export async function saveDatabaseSnapshot(database: AppDatabase, token?: string | null): Promise<void> {
  const snapshot = {
    ...database,
    schemaVersion: EVENTHUB_SCHEMA_VERSION,
    updatedAt: nowIso(),
  };

  savePersistedState('platform', snapshot);

  if (isApiPersistenceConfigured() && token) {
    await apiRequest<AppDatabase>('/platform/private', {
      method: 'PUT',
      token,
      body: JSON.stringify(snapshot),
    });
  }
}

export function hasApiPersistence(): boolean {
  return isApiPersistenceConfigured() && Boolean(env.apiBaseUrl);
}
