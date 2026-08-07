/**
 * P1-1.0 §3.5 — the `AuthClient` abstraction. Screens and hooks depend on
 * this interface only, never on `@supabase/supabase-js` directly, so the
 * whole auth feature is demonstrable and unit-testable without a live
 * backend (P0-3.0 is still unmerged — `feature/P0-3.0-baas-setup` is not an
 * ancestor of this branch as of this commit).
 *
 * Two implementations satisfy this interface:
 *   - `mockAuthClient.ts` — in-memory, used by tests and available for
 *     manual/demo wiring at the composition root.
 *   - `supabaseAuthClient.ts` — the real implementation. It degrades
 *     gracefully (throws a clear config error) until `SUPABASE_URL` /
 *     `SUPABASE_ANON_KEY` are set, via `getSupabaseClient()`'s existing lazy
 *     pattern. See that file's header for why this isn't a hardcoded
 *     `throw new Error('P0-3.0')` stub as the brief's snippet suggests.
 *
 * `AuthClientContext.tsx` is the composition root: it wires
 * `supabaseAuthClient` by default and lets tests substitute
 * `mockAuthClient` — a one-line swap per §3.5.
 */

/**
 * Deviation from the brief's literal interface sketch: `requestPasswordReset`,
 * `requestPhoneOtp`, and `signOut` are typed `Promise<AuthResult>` here, not
 * `Promise<void>`. All three can fail in ways a screen must surface (rate
 * limit, network, SMTP/Twilio misconfiguration) — `api.ts`'s prior version
 * already made this call for `requestPasswordReset`. Kept for all three, for
 * the same reason: throwing across this boundary would put a raw error
 * object in front of a screen instead of the generic string it needs.
 */
export type AuthResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/**
 * What a screen learns from a successful sign-up/sign-in/OTP-verify call.
 * Deliberately not the raw supabase-js `Session`/`User` — those are wired
 * app-wide via `useSessionStore` (which listens to `onAuthStateChange`
 * separately, see that file), not passed through this interface. A screen
 * only ever needs to know (a) which account and (b) whether a live session
 * came back immediately or email confirmation is pending.
 */
export type AuthOutcome = {
  userId: string;
  sessionEstablished: boolean;
};

export interface AuthClient {
  signUpWithEmail(email: string, password: string): Promise<AuthResult<AuthOutcome>>;
  signInWithEmail(email: string, password: string): Promise<AuthResult<AuthOutcome>>;
  requestPasswordReset(email: string): Promise<AuthResult>;
  requestPhoneOtp(phone: string): Promise<AuthResult>;
  verifyPhoneOtp(phone: string, code: string): Promise<AuthResult<AuthOutcome>>;
  signOut(): Promise<AuthResult>;
}
