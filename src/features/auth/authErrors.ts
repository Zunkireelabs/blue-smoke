/**
 * Turns a provider auth failure into something we are willing to show a user.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────────────────
 * `supabaseAuthClient` used to return `error.message` verbatim from six of its methods, and
 * every auth screen renders `result.error` directly. On 2026-08-10, driving the real app on
 * the simulator with a number that is not a Supabase test number printed this, in full, in
 * the phone form:
 *
 *   "Error sending confirmation OTP to provider: The phone number is unverified. Trial
 *    accounts cannot send messages to unverified numbers; verify it at
 *    twilio.com/user/account/phone-numbers/verified More information:
 *    https://www.twilio.com/docs/errors/21608"
 *
 * That names our SMS vendor, discloses our account posture, and hands the user a link to our
 * own admin console. CLAUDE.md: user-facing errors are **coaching, never diagnostic** — and
 * `supabaseAuthClient`'s own header already says a message must "never name the vendor".
 * Two methods there (`signInWithEmail`, `verifyPhoneOtp`) had always normalised; the other
 * six had not, so the rule held only where someone had remembered it.
 *
 * ── The property that matters ────────────────────────────────────────────────────────────
 * 🔴 **Nothing derived from the provider's own text can ever reach the return value.** This
 * module reads `code` and `status` — never `message` — and every branch returns one of the
 * fixed strings below. An unrecognised failure therefore degrades to a vague-but-safe
 * message; it cannot degrade to a leak. That is deliberate: a wrong guess about a code name
 * costs a little specificity, never a disclosure.
 *
 * Structural typing rather than importing `AuthError` from supabase-js keeps this pure and
 * unit-testable with plain objects, the same split as `_shared/personaInquiry.ts` on the
 * backend.
 */

/** Only the two fields we are willing to branch on. `message` is deliberately absent. */
export interface ProviderErrorLike {
  readonly code?: string | null;
  readonly status?: number | null;
}

/**
 * The fallback. Deliberately says nothing about cause: it is what an unrecognised `code`
 * gets, so it must be safe for a failure we have not thought about yet.
 */
export const GENERIC_AUTH_ERROR = "That didn't work. Please try again.";

const RATE_LIMITED = 'Too many attempts just now. Wait a minute, then try again.';
const SMS_UNDELIVERABLE =
  "We couldn't send a code to that number. Check it's right, or try a different one.";
const SERVICE_UNAVAILABLE = "We can't do that right now. Please try again in a few minutes.";

/**
 * GoTrue error codes → coaching copy.
 *
 * Codes absent from this map fall through to `GENERIC_AUTH_ERROR` by design (see the header),
 * so this list is an optimisation for the failures we expect to actually hit, not a contract
 * we depend on being exhaustive.
 */
const BY_CODE: Readonly<Record<string, string>> = {
  // Rate limits — the most common real failure, and the one users can act on by waiting.
  over_request_rate_limit: RATE_LIMITED,
  over_sms_send_rate_limit: RATE_LIMITED,
  over_email_send_rate_limit: RATE_LIMITED,

  // 🔴 The Twilio case above. The user cannot know or fix why delivery failed, and the
  // reason (a trial account that can only message pre-verified numbers) is ours to fix, so
  // this coaches the one thing they *can* do rather than explaining our billing posture.
  sms_send_failed: SMS_UNDELIVERABLE,

  // Provider/config states. All "not you, us" — never explain which toggle is off.
  signup_disabled: SERVICE_UNAVAILABLE,
  phone_provider_disabled: SERVICE_UNAVAILABLE,
  email_provider_disabled: SERVICE_UNAVAILABLE,

  otp_expired: 'That code has expired. Ask for a new one.',
  email_not_confirmed: 'Confirm your email first — check your inbox for the link.',
  weak_password: 'Pick a longer password — mix in a few numbers or symbols.',
  same_password: "That's already your password. Choose a different one.",
  validation_failed: 'Check the details above and try again.',
};

/**
 * Maps a provider failure to user-facing copy.
 *
 * Never returns provider text. Callers may pass anything, including `null`/`undefined`
 * (which yields the generic message) — this must not throw, because it runs on the failure
 * path of every auth call.
 */
export function toAuthUserMessage(error: ProviderErrorLike | null | undefined): string {
  const code = error?.code;
  if (typeof code === 'string') {
    const mapped = BY_CODE[code];
    if (mapped !== undefined) {
      return mapped;
    }
  }

  // Status is a coarser second pass, for a provider that returns a code we do not know.
  const status = error?.status;
  if (typeof status === 'number') {
    if (status === 429) {
      return RATE_LIMITED;
    }
    if (status >= 500) {
      return SERVICE_UNAVAILABLE;
    }
  }

  return GENERIC_AUTH_ERROR;
}
