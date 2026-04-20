const STORAGE_KEYS = {
  auth: 'eventhub.auth.v1',
  platform: 'eventhub.platform.v1',
} as const;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadPersistedState<T>(key: keyof typeof STORAGE_KEYS, fallback: T): T {
  if (!canUseStorage()) return fallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[key]);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function savePersistedState<T>(key: keyof typeof STORAGE_KEYS, value: T): void {
  if (!canUseStorage()) return;

  try {
    window.localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
  } catch {
    // Ignore quota / serialization failures and keep the app usable.
  }
}

export function clearPersistedState(key: keyof typeof STORAGE_KEYS): void {
  if (!canUseStorage()) return;

  try {
    window.localStorage.removeItem(STORAGE_KEYS[key]);
  } catch {
    // Ignore cleanup failures.
  }
}
