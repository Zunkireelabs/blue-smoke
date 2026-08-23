import { getSupabaseClient } from '@/shared/lib/supabaseClient';
import type { AuthClient, AuthOutcome, AuthResult } from './client';
import { toAuthUserMessage } from './authErrors';

/**
 * P1-1.0 §3.5 — the real `AuthClient`, backed by `supabase.auth`. Nothing
 * here touches Keychain or app state — that's `useSessionStore`
 * (src/app/stores), which subscribes to `supabase.auth.onAuthStateChange`
 * separately from any call made here.
 *
 * Method C (email + code, spec §1.2.2) is implemented here as of 2026-08-09 —
 * team-confirmed, client confirmation still outstanding. It is the **only**
 * email front door: `requestEmailCode` / `verifyEmailCode` serve both signup
 * and sign-in, so no method here sends `emailRedirectTo` — under the old
 * link flow that omission stranded accounts against Site URL, and codes
 * remove the link rather than repairing it. Adding a redirect back would
 * reintroduce what removing the link fixed.
 *
 * Password sign-in (`signInWithEmail`) and password-setting (`setPassword`)
 * are kept as a **later credential**, not a competing front door — see
 * `client.ts` for why. Both are real, tested and **unrouted** in this PR.
 *
 * **Why this is a real implementation, not the brief's suggested
 * `throw new Error('P0-3.0')` stub:** `getSupabaseClient()` (P0-4.0 scaffold)
 * already lazily throws a clear config error until `SUPABASE_URL` /
 * `SUPABASE_ANON_KEY` are set — every method below inherits that for free.
 * A hardcoded stub would be strictly worse: it would need deleting and
 * rewriting the moment P0-3.0 lands, whereas this version starts working
 * the moment env config is supplied, with no further code change. The
 * abstraction boundary the brief actually cares about — screens never
 * import `@supabase/supabase-js` — holds either way.
 */

/**
 * Generic, non-enumerating message for anything in the login path. Per
 * TODO-phase-1.md P1-1.0: "error handling that does not leak account
 * existence." `signInWithPassword` already returns a generic
 * "Invalid login credentials" for both a wrong password and an unknown
 * email, but this normalizes the few cases where the underlying message
 * could still vary by cause, so the UI has one string to render either way.
 */
const GENERIC_LOGIN_ERROR = 'Incorrect email or password.';

/**
 * P1-1.0 follow-up (docs/execution-briefs/P1-1.0-followup-auth-exception-paths.md):
 * every method below honours its own `Promise<AuthResult<T>>` signature — no
 * path may throw. `getSupabaseClient()` throws by design when config is
 * missing (correct — loud at the boundary), so each method's whole body runs
 * through this wrapper rather than trusting individual call sites to catch
 * it. The message is deliberately generic: coaching, not diagnostic, and
 * never names the vendor (CLAUDE.md's "never a stack trace... never the word
 * Supabase").
 */
const UNEXPECTED_ERROR = "We couldn't reach the server. Check your connection and try again.";

/**
 * One string for every code failure, across both `type: 'signup'` and
 * `type: 'email'`. Wrong code, expired code, already-used code and unknown
 * address must be indistinguishable to the caller — distinguishing them would
 * turn the code screen into the enumeration vector the login screen carefully
 * isn't. Identical to `verifyPhoneOtp`'s copy, so one assertion covers all
 * three verify paths.
 */
const INVALID_CODE_ERROR = 'Incorrect or expired code.';

async function runSafely<T>(fn: () => Promise<AuthResult<T>>): Promise<AuthResult<T>> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * §5.2.1: `profiles` has no DB trigger creating a row on signup — it is a
 * plain table with `id references auth.users(id)` and an `own_profile` RLS
 * policy the client satisfies directly (`id = auth.uid()`). TODO-phase-1.md
 * P1-1.0: "`profiles` row created on signup, regardless of method" — done
 * here, called from both the email and phone success paths.
 */
async function ensureProfileRow(userId: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    // upsert, not insert: verifyPhoneOtp / signUp can both race a retry or an
    // already-linked account; a duplicate call must not error.
    await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' });
  } catch {
    // Non-fatal to the caller's auth result — the session is real either
    // way. Surfacing this as an auth failure would be misleading, and it
    // must not escape as an unhandled rejection either (the bug this file
    // exists to fix).
  }
}

export const supabaseAuthClient: AuthClient = {
  async signInWithEmail(email, password): Promise<AuthResult<AuthOutcome>> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error || !data.session || !data.user) {
        return { ok: false, error: GENERIC_LOGIN_ERROR };
      }

      return { ok: true, data: { userId: data.user.id, sessionEstablished: true } };
    });
  },

  /**
   * Renamed from `confirmPasswordReset` (P1-1.0) — the reset-link deep-link
   * this used to be reached from is gone with the reset subsystem. The call
   * itself (`updateUser({ password })`) is unchanged and already correct;
   * only its purpose changed, from "confirm a reset" to "set a password on
   * an already-signed-in account" (PR 2's Settings screen).
   */
  async setPassword(newPassword): Promise<AuthResult> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        return { ok: false, error: toAuthUserMessage(error) };
      }

      return { ok: true, data: undefined };
    });
  },

  /**
   * Sign-up confirmation (§1.2.2). `type: 'signup'` verifies the code from
   * the "Confirm sign up" template.
   *
   * **Kept but unrouted.** Measured against dev 2026-08-10: a sign-up code
   * verifies under `type: 'email'` too (both return 200; the `'email'` case
   * was independently confirmed through the app on Android with a brand-new
   * account), so `verifyEmailCode` below handles every case a screen needs
   * and nothing routes here. Kept because it costs nothing and one cell of
   * the type matrix (a *sign-in* code presented as `type: 'signup'`) is
   * still untested — do not delete on the assumption it's provably dead.
   */
  async confirmSignupWithCode(email, code): Promise<AuthResult<AuthOutcome>> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'signup',
      });

      if (error || !data.session || !data.user) {
        return { ok: false, error: INVALID_CODE_ERROR };
      }

      await ensureProfileRow(data.user.id);

      return { ok: true, data: { userId: data.user.id, sessionEstablished: true } };
    });
  },

  /**
   * The single front door for email — sends a 6-digit code that serves
   * signup and sign-in identically.
   *
   * `shouldCreateUser: true` is deliberate and load-bearing — see `client.ts`.
   * With `false` this call errors for an unrecognised address, which leaks
   * account existence and breaks the no-enumeration rule. Do not "tighten" it.
   *
   * No `emailRedirectTo`, on purpose — there are no links in this flow.
   */
  async requestEmailCode(email): Promise<AuthResult> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });

      if (error) {
        return { ok: false, error: toAuthUserMessage(error) };
      }

      return { ok: true, data: undefined };
    });
  },

  /**
   * Verifies the sign-in code and establishes the session. `type: 'email'` —
   * proven end to end for both a brand-new address and a returning one.
   */
  async verifyEmailCode(email, code): Promise<AuthResult<AuthOutcome>> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: 'email',
      });

      if (error || !data.session || !data.user) {
        return { ok: false, error: INVALID_CODE_ERROR };
      }

      await ensureProfileRow(data.user.id);

      return { ok: true, data: { userId: data.user.id, sessionEstablished: true } };
    });
  },

  /** Method B (§1.2.1), step 1: send the SMS code via Twilio Verify. */
  async requestPhoneOtp(phone): Promise<AuthResult> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({ phone });

      if (error) {
        return { ok: false, error: toAuthUserMessage(error) };
      }

      return { ok: true, data: undefined };
    });
  },

  /** Method B (§1.2.1), step 2: verify the code and establish the session. */
  async verifyPhoneOtp(phone, code): Promise<AuthResult<AuthOutcome>> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });

      if (error || !data.session || !data.user) {
        return { ok: false, error: 'Incorrect or expired code.' };
      }

      await ensureProfileRow(data.user.id);

      return { ok: true, data: { userId: data.user.id, sessionEstablished: true } };
    });
  },

  async signOut(): Promise<AuthResult> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        return { ok: false, error: toAuthUserMessage(error) };
      }

      return { ok: true, data: undefined };
    });
  },
};
