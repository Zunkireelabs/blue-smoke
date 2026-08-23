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

/**
 * Byte-identical to `supabaseAuthClient`'s copy, deliberately. Wrong code,
 * expired code and unknown address are one indistinguishable outcome in both
 * clients; a test asserting this string therefore guards the real client's
 * no-enumeration behaviour too.
 */
const INVALID_CODE_ERROR = 'Incorrect or expired code.';

export interface SeedEmailAccountOptions {
  /**
   * Set a password on the seeded account, so a test can exercise
   * `signInWithEmail` (unrouted in this PR, but still tested — see
   * `client.ts`). Omit for a code-only account, which is what
   * `verifyEmailCode` itself produces — nothing in this PR can set a
   * password on an account created that way.
   */
  password?: string;
  /**
   * Seed the account as still needing sign-up confirmation, the only state
   * in which `confirmSignupWithCode` succeeds.
   */
  confirmationPending?: boolean;
}

export interface MockAuthClient extends AuthClient {
  /** Test-only: pre-seed an account so a test can exercise an already-registered path. */
  seedEmailAccount(email: string, options?: SeedEmailAccountOptions): void;
}

export function createMockAuthClient(): MockAuthClient {
  type EmailAccount = { password: string | null; userId: string; confirmationPending: boolean };

  const emailAccounts = new Map<string, EmailAccount>();
  const phoneAccounts = new Map<string, { userId: string }>();
  const otpRequested = new Set<string>();
  const emailCodeRequested = new Set<string>();

  let nextUserId = 1;
  function freshUserId(): string {
    return `mock-user-${nextUserId++}`;
  }

  return {
    seedEmailAccount(email, options = {}) {
      emailAccounts.set(email, {
        password: options.password ?? null,
        userId: freshUserId(),
        confirmationPending: options.confirmationPending ?? false,
      });
    },

    async signInWithEmail(email, password): Promise<AuthResult<AuthOutcome>> {
      const account = emailAccounts.get(email);
      // Same generic message regardless of "no such account", "wrong
      // password" and "no password set" — mirrors supabaseAuthClient's
      // non-enumeration behavior, so a test asserting this string also
      // guards the real client's copy.
      if (!account || account.password == null || account.password !== password) {
        return { ok: false, error: 'Incorrect email or password.' };
      }
      return { ok: true, data: { userId: account.userId, sessionEstablished: true } };
    },

    async setPassword(_newPassword): Promise<AuthResult> {
      // No signed-in-user concept in the mock — always succeeds. A test that
      // needs the failure path uses jest.spyOn(...).mockResolvedValue on
      // this method directly, same as PhoneInputScreen's rate-limit test.
      return { ok: true, data: undefined };
    },

    /**
     * Sign-up confirmation. **Kept but unrouted** (see `client.ts`), and
     * deliberately not tested against the same code `verifyEmailCode`
     * issues — those are two different Supabase templates in the real
     * client and this mock keeps that same separation rather than
     * collapsing it into one code set.
     */
    async confirmSignupWithCode(email, code): Promise<AuthResult<AuthOutcome>> {
      const account = emailAccounts.get(email);
      if (!account || !account.confirmationPending || code !== DEV_OTP_CODE) {
        return { ok: false, error: INVALID_CODE_ERROR };
      }
      account.confirmationPending = false;
      return { ok: true, data: { userId: account.userId, sessionEstablished: true } };
    },

    async requestEmailCode(email): Promise<AuthResult> {
      // Never errors on an unknown address — that is the whole point of
      // `shouldCreateUser: true` in the real client. A mock that rejected
      // unknown emails here would let an enumeration bug pass its tests.
      emailCodeRequested.add(email);
      return { ok: true, data: undefined };
    },

    async verifyEmailCode(email, code): Promise<AuthResult<AuthOutcome>> {
      if (!emailCodeRequested.has(email) || code !== DEV_OTP_CODE) {
        return { ok: false, error: INVALID_CODE_ERROR };
      }
      emailCodeRequested.delete(email);

      // The single front door is signup and sign-in in one action
      // (`shouldCreateUser`), so a first-time address gets an account
      // rather than an error.
      let account = emailAccounts.get(email);
      if (!account) {
        account = { password: null, userId: freshUserId(), confirmationPending: false };
        emailAccounts.set(email, account);
      }
      return { ok: true, data: { userId: account.userId, sessionEstablished: true } };
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
