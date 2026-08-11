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
  /**
   * P1-1.0 (email + code, keeping passwords) — password sign-in survives as a
   * **later credential**, not a competing front door. Email always signs up
   * or signs in via `requestEmailCode` / `verifyEmailCode` below; this method
   * is **unrouted** in this PR (no screen calls it yet — PR 2 adds "Use
   * password instead"). Kept because it already works and re-deriving it
   * later is pure waste, not because anything reaches it today.
   */
  signInWithEmail(email: string, password: string): Promise<AuthResult<AuthOutcome>>;
  /**
   * Sets/changes the account's password. Renamed from `confirmPasswordReset`
   * (P1-1.0): the reset subsystem — request-a-link, "check your email",
   * confirm — is gone, because the 6-digit code *is* the recovery path now
   * (sign in with a code, then set a password here). The underlying call
   * (`supabase.auth.updateUser({ password })`) is unchanged; only the name
   * was wrong for its new purpose. **Unrouted** in this PR — PR 2's Settings
   * screen is the only caller.
   */
  setPassword(newPassword: string): Promise<AuthResult>;
  requestPhoneOtp(phone: string): Promise<AuthResult>;
  verifyPhoneOtp(phone: string, code: string): Promise<AuthResult<AuthOutcome>>;

  // ── Email codes (spec §1.2.2, team-confirmed 2026-08-09) ─────────────────
  //
  // Email sign-up and sign-in are one 6-digit-code path. Two consequences
  // worth stating at the interface, because both are easy to reintroduce by
  // accident:
  //
  //   1. `requestEmailCode` deliberately sends NO `emailRedirectTo`. Under
  //      the old link flow that omission was a defect — with Confirm email ON
  //      the confirmation link fell back to Site URL and stranded the
  //      account. Codes remove the link entirely, so the defect is fixed by
  //      construction. Do not "fix" it by adding a redirect: that
  //      reintroduces the link this decision removed.
  //   2. There is no separate sign-up method. `requestEmailCode` /
  //      `verifyEmailCode` serve a brand-new address and a returning one
  //      identically — see `requestEmailCode`'s own doc for why.

  /**
   * Confirms a newly signed-up account with the 6-digit code emailed by the
   * "Confirm sign up" template (Supabase `type: 'signup'`). **Kept but
   * unrouted**: measured against dev 2026-08-10, a sign-up code verifies
   * under `type: 'email'` too (see `verifyEmailCode`), so nothing in the app
   * routes here — `EmailCodeEntryScreen` always verifies with `type: 'email'`.
   * Costs nothing to keep; do not wire a second path to it.
   */
  confirmSignupWithCode(email: string, code: string): Promise<AuthResult<AuthOutcome>>;

  /**
   * Sends a 6-digit code — the single front door for email, signup and
   * sign-in alike.
   *
   * The underlying call uses `shouldCreateUser: true`, and that is a
   * security choice rather than a default worth inheriting silently: with
   * `false`, Supabase errors on an unrecognised address, which tells an
   * attacker whether an account exists and breaks the no-enumeration rule
   * every other path in this interface follows. `true` makes signup and
   * sign-in the same action and keeps the response identical either way.
   *
   * The 60 s per-user minimum interval on auth emails is a Supabase
   * dashboard setting; on dev it was measured **not enforced** (two sends
   * seconds apart both delivered) — flagged, not fixed, in the PR body.
   */
  requestEmailCode(email: string): Promise<AuthResult>;

  /** Verifies the sign-in code (`type: 'email'`) and establishes the session. */
  verifyEmailCode(email: string, code: string): Promise<AuthResult<AuthOutcome>>;

  signOut(): Promise<AuthResult>;
}
