/**
 * P1-1.0 follow-up (docs/execution-briefs/P1-1.0-followup-auth-exception-paths.md) —
 * proves the root-cause fix: `getSupabaseClient()` throws by design when
 * config is missing (correct — loud at the boundary), and every
 * `supabaseAuthClient` method must catch that instead of letting it escape,
 * so the `Promise<AuthResult>` contract holds no matter what.
 *
 * `getSupabaseClient` is mocked directly rather than unsetting env vars —
 * `babel.config.js`'s `transform-inline-environment-variables` plugin bakes
 * `process.env.SUPABASE_URL` into a literal at transform time, so mutating
 * `process.env` in a test has no effect on the already-compiled module.
 */
import { supabaseAuthClient } from '../supabaseAuthClient';

jest.mock('@/shared/lib/supabaseClient', () => ({
  getSupabaseClient: () => {
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY are not set. Configure them via env (spec §10.1).',
    );
  },
}));

const COACHING_ERROR = "We couldn't reach the server. Check your connection and try again.";

describe('supabaseAuthClient — config forced absent', () => {
  it('requestPhoneOtp returns ok:false instead of throwing', async () => {
    const result = await supabaseAuthClient.requestPhoneOtp('+12015550123');
    expect(result).toEqual({ ok: false, error: COACHING_ERROR });
  });

  it('the error never names the vendor or repeats the raw SDK/config string', async () => {
    const result = await supabaseAuthClient.signInWithEmail('a@example.com', 'password123');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.toLowerCase()).not.toContain('supabase');
      expect(result.error).not.toContain('SUPABASE_URL');
    }
  });

  /**
   * Every method on the interface, deliberately — the point of this table is
   * that it is exhaustive, so a method added later without a `runSafely`
   * wrapper is caught here rather than by a screen crashing in the field.
   * `signUpWithEmail`, `requestPasswordReset` and `resendSignupConfirmation`
   * were removed with Method A (P1-1.0, keeping passwords); `setPassword` is
   * `confirmPasswordReset` renamed, and `requestEmailCode` /
   * `verifyEmailCode` / `confirmSignupWithCode` are the email-code additions
   * this table had never covered before.
   */
  it.each([
    ['signInWithEmail', () => supabaseAuthClient.signInWithEmail('a@example.com', 'password123')],
    ['setPassword', () => supabaseAuthClient.setPassword('newpassword123')],
    ['requestPhoneOtp', () => supabaseAuthClient.requestPhoneOtp('+12015550123')],
    ['verifyPhoneOtp', () => supabaseAuthClient.verifyPhoneOtp('+12015550123', '123456')],
    ['requestEmailCode', () => supabaseAuthClient.requestEmailCode('a@example.com')],
    ['verifyEmailCode', () => supabaseAuthClient.verifyEmailCode('a@example.com', '123456')],
    [
      'confirmSignupWithCode',
      () => supabaseAuthClient.confirmSignupWithCode('a@example.com', '123456'),
    ],
    ['signOut', () => supabaseAuthClient.signOut()],
  ] as const)('%s never throws — it resolves ok:false', async (_name, call) => {
    await expect(call()).resolves.toEqual({ ok: false, error: COACHING_ERROR });
  });
});
