import type { AuthClient, AuthOutcome, AuthResult } from './client';

/**
 * P1-1.0 §3.5 — in-memory `AuthClient`, no network, no Supabase. This is
 * what makes the auth flow demonstrable and unit-testable while P0-3.0 is
 * still unmerged, and it's the client the DoD-required tests drive every
 * screen state through.
 *
 * `createMockAuthClient()` returns a fresh, isolated instance per call —
 * use one per test so accounts created in one test can't leak into another.
 * A shared `mockAuthClient` singleton is exported for manual/demo wiring at
 * the composition root (`AuthClientContext.tsx`'s non-Supabase branch, if
 * ever used outside tests).
 */

const DEV_OTP_CODE = '123456';

export interface MockAuthClientOptions {
  /**
   * When true, `signUpWithEmail` returns `sessionEstablished: false` (the
   * "check your email" path a screen must handle) instead of a live
   * session. Default false: matches the more common demo path so a test
   * that doesn't care about email confirmation doesn't have to opt out of
   * it. Both values are exercised by SignupScreen's own test file.
   */
  requireEmailConfirmation?: boolean;
}

export interface MockAuthClient extends AuthClient {
  /** Test-only: pre-seed an account so a login test can exercise success. */
  seedEmailAccount(email: string, password: string): void;
}

export function createMockAuthClient(options: MockAuthClientOptions = {}): MockAuthClient {
  const { requireEmailConfirmation = false } = options;

  const emailAccounts = new Map<string, { password: string; userId: string }>();
  const phoneAccounts = new Map<string, { userId: string }>();
  const otpRequested = new Set<string>();

  let nextUserId = 1;
  function freshUserId(): string {
    return `mock-user-${nextUserId++}`;
  }

  return {
    seedEmailAccount(email, password) {
      emailAccounts.set(email, { password, userId: freshUserId() });
    },

    async signUpWithEmail(email, password): Promise<AuthResult<AuthOutcome>> {
      if (emailAccounts.has(email)) {
        return { ok: false, error: 'An account with this email already exists.' };
      }
      const userId = freshUserId();
      emailAccounts.set(email, { password, userId });
      return {
        ok: true,
        data: { userId, sessionEstablished: !requireEmailConfirmation },
      };
    },

    async signInWithEmail(email, password): Promise<AuthResult<AuthOutcome>> {
      const account = emailAccounts.get(email);
      // Same generic message regardless of "no such account" vs "wrong
      // password" — mirrors supabaseAuthClient's non-enumeration behavior,
      // so a test asserting this string also guards the real client's copy.
      if (!account || account.password !== password) {
        return { ok: false, error: 'Incorrect email or password.' };
      }
      return { ok: true, data: { userId: account.userId, sessionEstablished: true } };
    },

    async requestPasswordReset(_email): Promise<AuthResult> {
      // Real client doesn't error on an unknown email either (spec: reset
      // requests are themselves an enumeration vector) — mock matches.
      return { ok: true, data: undefined };
    },

    async requestPhoneOtp(phone): Promise<AuthResult> {
      otpRequested.add(phone);
      return { ok: true, data: undefined };
    },

    async verifyPhoneOtp(phone, code): Promise<AuthResult<AuthOutcome>> {
      if (!otpRequested.has(phone) || code !== DEV_OTP_CODE) {
        return { ok: false, error: 'Incorrect or expired code.' };
      }
      otpRequested.delete(phone);
      let account = phoneAccounts.get(phone);
      if (!account) {
        account = { userId: freshUserId() };
        phoneAccounts.set(phone, account);
      }
      return { ok: true, data: { userId: account.userId, sessionEstablished: true } };
    },

    async signOut(): Promise<AuthResult> {
      return { ok: true, data: undefined };
    },
  };
}

/** Shared instance for non-test composition-root wiring. See file header. */
export const mockAuthClient: MockAuthClient = createMockAuthClient();

/** Exported so tests that need to type the code without importing the const directly still have a name for it in assertions/fixtures. */
export const MOCK_OTP_CODE = DEV_OTP_CODE;
