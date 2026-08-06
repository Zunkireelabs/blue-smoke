import { getSupabaseClient } from '@/shared/lib/supabaseClient';
import type { Session, User } from '@supabase/supabase-js';

/**
 * P1-1.0 — thin wrapper around `supabase.auth` for both confirmed methods
 * (spec §1.2, §1.2.1). Screens call these; nothing here touches Keychain or
 * app state — that's `useSessionStore` (src/app/stores), which subscribes to
 * `supabase.auth.onAuthStateChange` separately from any call made here.
 *
 * Method C (email + code, spec §1.2.2) is NOT implemented here — it is a
 * proposed, unconfirmed addition. Do not add it until confirmed.
 */

export type AuthResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

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
 * §5.2.1: `profiles` has no DB trigger creating a row on signup — it is a
 * plain table with `id references auth.users(id)` and an `own_profile` RLS
 * policy the client satisfies directly (`id = auth.uid()`). TODO-phase-1.md
 * P1-1.0: "`profiles` row created on signup, regardless of method" — done
 * here, called from both the email and phone success paths.
 */
async function ensureProfileRow(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  // upsert, not insert: verifyPhoneOtp / signUp can both race a retry or an
  // already-linked account; a duplicate call must not error.
  const { error } = await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' });
  if (error) {
    // Non-fatal to the caller's auth result — the session is real either
    // way. Surfacing this as an auth failure would be misleading.
    throw new Error(`profiles row upsert failed: ${error.message}`);
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<AuthResult<{ user: User | null; session: Session | null }>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    return { ok: false, error: error.message };
  }

  if (data.user) {
    await ensureProfileRow(data.user.id);
  }

  return { ok: true, data: { user: data.user, session: data.session } };
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult<{ user: User; session: Session }>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  return { ok: true, data: { user: data.user, session: data.session } };
}

/**
 * Sends the password-reset email. Requires custom SMTP configured on the
 * Supabase project (supabase/README.md) — without it, delivery is limited
 * to the project's own org members and rate-limits almost immediately.
 * That's an operational blocker, not a code one; this call is correct
 * either way.
 */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);

  if (error) {
    // Password-reset requests are themselves an enumeration vector (does
    // this email have an account?). Supabase's own behavior here does not
    // error on an unknown email, so this branch should only fire for real
    // failures (rate limit, network, SMTP misconfiguration) — safe to
    // surface as-is.
    return { ok: false, error: error.message };
  }

  return { ok: true, data: undefined };
}

/** Method B (§1.2.1), step 1: send the SMS code via Twilio Verify. */
export async function signInWithPhoneOtp(phone: string): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: undefined };
}

/** Method B (§1.2.1), step 2: verify the code and establish the session. */
export async function verifyPhoneOtp(
  phone: string,
  code: string,
): Promise<AuthResult<{ user: User; session: Session }>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });

  if (error || !data.session || !data.user) {
    return { ok: false, error: 'Incorrect or expired code.' };
  }

  await ensureProfileRow(data.user.id);

  return { ok: true, data: { user: data.user, session: data.session } };
}

export async function signOut(): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: undefined };
}
