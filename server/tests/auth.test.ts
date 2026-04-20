import { describe, it, expect } from 'vitest';
import {
  consumeAuthCode,
  createAuthCode,
  createSession,
  deleteSession,
  findUserByEmail,
  getSession,
  invalidateOutstandingAuthCodes,
} from '../db';

const EMAIL = 'admin@test.com';

describe('auth — auth codes', () => {
  it('valid code is consumed once', () => {
    const expiresAt = new Date(Date.now() + 600_000).toISOString();
    createAuthCode(EMAIL, '123456', expiresAt);
    expect(consumeAuthCode(EMAIL, '123456')).toBe(true);
    expect(consumeAuthCode(EMAIL, '123456')).toBe(false);
  });

  it('wrong code rejected', () => {
    createAuthCode(EMAIL, '999999', new Date(Date.now() + 600_000).toISOString());
    expect(consumeAuthCode(EMAIL, '000000')).toBe(false);
  });

  it('expired code rejected', () => {
    createAuthCode(EMAIL, '111111', new Date(Date.now() - 1000).toISOString());
    expect(consumeAuthCode(EMAIL, '111111')).toBe(false);
  });

  it('invalidate clears all outstanding codes', () => {
    createAuthCode(EMAIL, '555555', new Date(Date.now() + 600_000).toISOString());
    invalidateOutstandingAuthCodes(EMAIL);
    expect(consumeAuthCode(EMAIL, '555555')).toBe(false);
  });
});

describe('auth — sessions', () => {
  it('session round-trip works', () => {
    const user = findUserByEmail(EMAIL)!;
    const token = `tok_test_${Date.now()}`;
    createSession(user.id, token, new Date(Date.now() + 86_400_000).toISOString());
    const session = getSession(token);
    expect(session).not.toBeNull();
    expect(session!.user.email).toBe(EMAIL);
  });

  it('deleted session returns null', () => {
    const user = findUserByEmail(EMAIL)!;
    const token = `tok_del_${Date.now()}`;
    createSession(user.id, token, new Date(Date.now() + 86_400_000).toISOString());
    deleteSession(token);
    expect(getSession(token)).toBeNull();
  });

  it('expired session returns null', () => {
    const user = findUserByEmail(EMAIL)!;
    const token = `tok_exp_${Date.now()}`;
    createSession(user.id, token, new Date(Date.now() - 1000).toISOString());
    expect(getSession(token)).toBeNull();
  });
});
