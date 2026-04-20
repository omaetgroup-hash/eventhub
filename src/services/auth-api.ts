import type { TeamMember } from '../lib/domain';
import { apiRequest } from './api';

export interface AuthCodeRequestResult {
  status: 'sent';
  delivery: 'email' | 'preview';
  expiresAt: string;
  nextAllowedAt?: string;
  previewCode?: string;
}

export interface AuthSessionResult {
  token: string;
  expiresAt: string;
  user: TeamMember;
}

export interface BootstrapStatusResult {
  required: boolean;
}

export interface BootstrapResult {
  status: 'created';
  user: TeamMember;
}

export interface TeamInvitePreview {
  email: string;
  name: string;
  role: TeamMember['role'];
  scope: string;
  expiresAt: string;
  status: 'pending' | 'accepted';
}

export interface AcceptedInviteResult {
  email: string;
  name: string;
  role: TeamMember['role'];
  scope: string;
  acceptedAt?: string;
}

export async function requestLoginCode(email: string): Promise<AuthCodeRequestResult> {
  return apiRequest<AuthCodeRequestResult>('/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyLoginCode(email: string, code: string): Promise<AuthSessionResult> {
  return apiRequest<AuthSessionResult>('/auth/verify-code', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
}

export async function fetchSession(token: string): Promise<AuthSessionResult> {
  return apiRequest<AuthSessionResult>('/auth/session', {
    token,
  });
}

export async function logoutSession(token: string): Promise<void> {
  return apiRequest<void>('/auth/logout', {
    method: 'POST',
    token,
  });
}

export async function logoutAllSessions(token: string): Promise<void> {
  return apiRequest<void>('/auth/logout-all', {
    method: 'POST',
    token,
  });
}

export async function fetchBootstrapStatus(): Promise<BootstrapStatusResult> {
  return apiRequest<BootstrapStatusResult>('/auth/bootstrap-status');
}

export async function bootstrapAccount(payload: {
  organizationName: string;
  organizationSlug: string;
  name: string;
  email: string;
  timezone?: string;
  region?: string;
}): Promise<BootstrapResult> {
  return apiRequest<BootstrapResult>('/auth/bootstrap', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchInvite(token: string): Promise<TeamInvitePreview> {
  return apiRequest<TeamInvitePreview>(`/auth/invites/${token}`);
}

export async function acceptInvite(token: string): Promise<AcceptedInviteResult> {
  return apiRequest<AcceptedInviteResult>(`/auth/invites/${token}/accept`, {
    method: 'POST',
  });
}
