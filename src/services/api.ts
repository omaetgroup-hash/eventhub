import { env } from '../lib/env';

export interface ApiRequestOptions extends Omit<RequestInit, 'headers'> {
  token?: string | null;
  headers?: Record<string, string>;
}

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!env.apiBaseUrl) return normalizedPath;
  return `${env.apiBaseUrl}${normalizedPath}`;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(resolveApiUrl(path), {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((body as { error?: string }).error ?? `API request failed (${response.status})`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return await response.json() as T;
}
