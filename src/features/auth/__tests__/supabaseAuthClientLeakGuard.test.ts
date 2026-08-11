/**
 * P1-1.0 — the regression guard for the vendor-text leak, which until now was
 * fixed but **unguarded**.
 *
 * `authErrors.ts` exists because `supabaseAuthClient` used to return
 * `error.message` verbatim, and driving the real app printed our SMS vendor's
 * name, our trial-account posture and a link to our own admin console into the
 * phone form. The email-code graft (P1-1.0) arrived carrying the same defect on
 * `requestEmailCode`'s non-429 path and it was fixed during integration — but
 * nothing tested it. Replacing `toAuthUserMessage(error)` with `error.message`
 * left the entire suite green, which is exactly how this class of defect
 * survives: the fix is correct, and nothing stops the next person undoing it.
 *
 * Its sibling `supabaseAuthClient.test.ts` cannot cover this. That file mocks
 * `getSupabaseClient` to **throw**, so no vendor call is ever reached; it proves
 * the config-absent contract, not the error-mapping one. This file mocks a
 * client that *answers*, and answers loudly.
 *
 * The table is deliberately exhaustive over every method that touches the
 * vendor, not just the four that call `toAuthUserMessage` today: a method that
 * later starts returning a provider string is caught here rather than in the
 * field. CLAUDE.md — user-facing errors are coaching, never diagnostic.
 */
import { supabaseAuthClient } from '../supabaseAuthClient';

// Must be inline and `mock`-prefixed: Jest hoists `jest.mock` above the imports,
// and its factory may not close over ordinary out-of-scope variables.
const mockVendorMessage =
  'Error sending confirmation OTP to provider: The phone number is unverified. ' +
  'Trial accounts cannot send messages to unverified numbers; verify it at ' +
  'twilio.com/user/account/phone-numbers/verified More information: ' +
  'https://www.twilio.com/docs/errors/21608';

jest.mock('@/shared/lib/supabaseClient', () => {
  const vendorError = {
    message:
      'Error sending confirmation OTP to provider: The phone number is unverified. ' +
      'Trial accounts cannot send messages to unverified numbers; verify it at ' +
      'twilio.com/user/account/phone-numbers/verified More information: ' +
      'https://www.twilio.com/docs/errors/21608',
    // A code deliberately NOT in authErrors.ts's table, so every method falls to
    // the generic fallback. If the fallback ever leaked, this is where it shows.
    code: 'some_unmapped_provider_code',
    status: 500,
  };
  const failing = async () => ({ data: { user: null, session: null }, error: vendorError });
  return {
    getSupabaseClient: () => ({
      auth: {
        signInWithOtp: failing,
        verifyOtp: failing,
        signInWithPassword: failing,
        updateUser: failing,
        signOut: async () => ({ error: vendorError }),
      },
    }),
  };
});

const VENDOR_MARKERS = ['twilio', 'trial', 'http', 'provider', 'unverified'];

describe('supabaseAuthClient — no vendor text reaches the user, on any method', () => {
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
  ] as const)('%s never returns the provider message', async (_name, call) => {
    const result = await call();

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    // The exact string is the thing that actually shipped to a user once.
    expect(result.error).not.toBe(mockVendorMessage);

    const shown = result.error.toLowerCase();
    for (const marker of VENDOR_MARKERS) {
      expect(shown).not.toContain(marker);
    }
  });
});
