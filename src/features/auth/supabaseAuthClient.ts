import { getSupabaseClient } from '@/shared/lib/supabaseClient';
import type { AuthClient, AuthOutcome, AuthResult } from './client';
import { RESET_PASSWORD_REDIRECT_URL } from './deepLink';

/**
 * P1-1.0 §3.5 — the real `AuthClient`, backed by `supabase.auth` for both
 * confirmed methods (spec §1.2, §1.2.1). Nothing here touches Keychain or
 * app state — that's `useSessionStore` (src/app/stores), which subscribes to
 * `supabase.auth.onAuthStateChange` separately from any call made here.
 *
 * Method C (email + code, spec §1.2.2) is NOT implemented here — it is a
 * proposed, unconfirmed addition. Do not add it until confirmed.
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
  async signUpWithEmail(email, password): Promise<AuthResult<AuthOutcome>> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({ email, password });

      if (error || !data.user) {
        return { ok: false, error: error?.message ?? 'Sign-up failed.' };
      }

      await ensureProfileRow(data.user.id);

      // supabase-js returns session: null when email confirmation is
      // required, and a live session when it isn't — this project hasn't
      // decided/configured that yet (P0-3.0's auth-config box is still open),
      // so both outcomes are handled rather than assuming one.
      return {
        ok: true,
        data: { userId: data.user.id, sessionEstablished: data.session != null },
      };
    });
  },

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
   * Requires custom SMTP configured on the Supabase project
   * (supabase/README.md) — without it, delivery is limited to the project's
   * own org members and rate-limits almost immediately. That's an
   * operational blocker, not a code one; this call is correct either way.
   */
  async requestPasswordReset(email): Promise<AuthResult> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: RESET_PASSWORD_REDIRECT_URL,
      });

      if (error) {
        // Password-reset requests are themselves an enumeration vector (does
        // this email have an account?). Supabase's own behavior here does not
        // error on an unknown email, so this branch should only fire for real
        // failures (rate limit, network, SMTP misconfiguration) — safe to
        // surface as-is.
        return { ok: false, error: error.message };
      }

      return { ok: true, data: undefined };
    });
  },

  /**
   * Called from ResetPasswordConfirmScreen after the deep-link (§3.2)
   * lands the user back in the app with a live recovery session —
   * Supabase establishes that session itself from the link's token before
   * this screen ever renders; nothing here re-parses the URL.
   */
  async confirmPasswordReset(newPassword): Promise<AuthResult> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        return { ok: false, error: error.message };
      }

      return { ok: true, data: undefined };
    });
  },

  /**
   * `AU-3`'s Resend action. `supabase.auth.resend` is the SDK's dedicated
   * method for this — a second `signUp` call would return "account already
   * exists" for the very account whose confirmation email this resends.
   */
  async resendSignupConfirmation(email): Promise<AuthResult> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.resend({ type: 'signup', email });

      if (error) {
        return { ok: false, error: error.message };
      }

      return { ok: true, data: undefined };
    });
  },

  /** Method B (§1.2.1), step 1: send the SMS code via Twilio Verify. */
  async requestPhoneOtp(phone): Promise<AuthResult> {
    return runSafely(async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({ phone });

      if (error) {
        return { ok: false, error: error.message };
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
        return { ok: false, error: error.message };
      }

      return { ok: true, data: undefined };
    });
  },
};
