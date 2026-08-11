/**
 * Persona `POST /inquiries` request/response — spec §6.2 increment 2, execution brief §3–§4.
 *
 * Pure and runtime-agnostic (no Deno imports, no `fetch`), same split as `personaSignature.ts`
 * / `inquiryTemplate.ts`: everything that can be reasoned about without a network connection
 * lives here and is unit-tested here; `create-inquiry/index.ts` stays thin HTTP/DB glue that
 * does the actual `fetch()` and hands this module the raw pieces.
 *
 * ── Two headers are pinned, never inherited from the key's dashboard defaults ────────────
 * `Persona-Version` and `Key-Inflection` are both console settings on the API key, not
 * properties of our request. Either one drifting — a replacement key minted on a newer
 * "Latest", or someone flipping the dashboard's Key Inflection dropdown to Camel — changes the
 * response shape while STILL returning 201: `meta.session-token` silently becomes
 * `meta.sessionToken` and the parse below returns `undefined` with no error anywhere. Sending
 * both explicitly is what makes the shape ours to depend on instead of the console's (brief §3).
 *
 * ── `reference-id` is deliberately never sent — brief §4.1 ───────────────────────────────
 * The inquiry↔user binding is the `verifications` row `create-inquiry` writes, not anything
 * Persona holds. Sending `user_id` across would create exactly the join the §8.3 vendor-breach
 * claim says does not exist.
 *
 * ── `meta.auto-create-inquiry-session` — confirmed live, not in the execution brief ──────
 * The brief's §3 request shape (traced from the same 2025-12-08 docs this module pins) omits
 * this, and a real sandbox call against it came back 201 with `meta.session-token: null` and
 * `meta.one-time-link: null` — both present as keys, neither populated. That is Persona's
 * documented behaviour, not drift: `session-token` and `one-time-link` are each `null` unless
 * the matching `meta.auto-create-*` boolean asks for it on THIS request. `one-time-link` is the
 * hosted-flow URL this project does not use (§3), so only the session flag is sent.
 */

/** Pinned per brief §3 — do not depend on the key's dashboard "Latest" default. */
export const PERSONA_API_VERSION = '2025-12-08';
export const PERSONA_INQUIRIES_URL = 'https://api.withpersona.com/api/v1/inquiries';

export interface BuildCreateInquiryRequestInput {
  readonly apiKey: string;
  readonly templateId: string;
  readonly idempotencyKey: string;
}

export interface PersonaHttpRequest {
  readonly url: string;
  readonly method: 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export function buildCreateInquiryRequest(input: BuildCreateInquiryRequestInput): PersonaHttpRequest {
  return {
    url: PERSONA_INQUIRIES_URL,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      'Persona-Version': PERSONA_API_VERSION,
      'Key-Inflection': 'kebab',
      'Idempotency-Key': input.idempotencyKey,
    },
    // Brief §4.1: deliberately no `reference-id` — see the module doc.
    // `auto-create-inquiry-session: true` — see the module doc above; without it Persona
    // returns `meta.session-token: null` on every 201, confirmed against a live sandbox call.
    body: JSON.stringify({
      data: { attributes: { 'inquiry-template-id': input.templateId } },
      meta: { 'auto-create-inquiry-session': true },
    }),
  };
}

/**
 * Brief §4.3: stable per user PER VERIFICATION ATTEMPT, never the bare `user_id` — a user who
 * legitimately needs a second attempt after a decline must not get their first inquiry back
 * forever.
 *
 * `attemptNumber` is the caller's count of every `verifications` row (any status) the user has
 * ever had, taken BEFORE this attempt's row is inserted. Two concurrent requests for the same
 * attempt (neither has inserted yet) read the same count and so derive the SAME key — which
 * collapses them into the one Persona call the race in §4.3 exists to prevent, since Persona
 * returns its cached response for a replayed `Idempotency-Key` rather than billing a second
 * inquiry. A genuinely new attempt only starts once the previous row exists, so it always
 * observes a higher count and gets a fresh key.
 */
export function buildIdempotencyKey(userId: string, attemptNumber: number): string {
  return `create-inquiry:${userId}:${attemptNumber}`;
}

/**
 * Every non-201 outcome the module distinguishes — brief §5. Each maps to a distinct HTTP
 * status in `index.ts`; there is deliberately no catch-all.
 *
 *   unauthenticated       — 401, the API key itself is bad
 *   forbidden              — 403, key lacks `inquiry.write` (a likely first-run failure — §2)
 *   unprocessable           — 422
 *   rate_limited            — 429, `RateLimit-Reset` surfaced when present
 *   malformed_response      — the body on ANY status could not be read as the documented shape
 *   missing_session_token   — 201, but `meta.session-token` is absent. The app cannot resume an
 *                              inquiry without it, so this must fail loudly (brief §5) rather
 *                              than let the caller write a row that strands the user forever.
 *   unexpected              — any other status Persona might return
 */
export type CreateInquiryFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'unprocessable'
  | 'rate_limited'
  | 'malformed_response'
  | 'missing_session_token'
  | 'unexpected';

export type CreateInquiryOutcome =
  | { readonly ok: true; readonly inquiryId: string; readonly sessionToken: string }
  | {
      readonly ok: false;
      readonly kind: CreateInquiryFailureKind;
      /**
       * For OUR logs only — a fixed, safe string per `kind`. Never vendor response body
       * content: an inquiry doesn't exist yet on the failure paths above `missing_session_token`,
       * but nothing here should ever get in the habit of echoing an untrusted body back out.
       */
      readonly detail: string;
      readonly retryAfterSeconds?: number;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export interface ParseCreateInquiryResponseInput {
  readonly status: number;
  readonly rawBody: string;
  /** `RateLimit-Reset` response header, when present — brief §3, only meaningful on a 429. */
  readonly rateLimitReset?: string | null;
}

/**
 * The single authority on what a Persona `POST /inquiries` response means. Never throws — a
 * malformed body is a `{ ok: false, kind: 'malformed_response' }` value, not an exception.
 */
export function parseCreateInquiryResponse(input: ParseCreateInquiryResponseInput): CreateInquiryOutcome {
  const { status } = input;

  if (status === 401) {
    return { ok: false, kind: 'unauthenticated', detail: 'Persona rejected the API key (401)' };
  }
  if (status === 403) {
    return {
      ok: false,
      kind: 'forbidden',
      detail: 'Persona key lacks the required permission — expected inquiry.write only (403)',
    };
  }
  if (status === 422) {
    return { ok: false, kind: 'unprocessable', detail: 'Persona rejected the request body (422)' };
  }
  if (status === 429) {
    const resetSeconds = input.rateLimitReset ? Number(input.rateLimitReset) : NaN;
    return {
      ok: false,
      kind: 'rate_limited',
      detail: 'Persona rate limit exceeded (429)',
      ...(Number.isFinite(resetSeconds) ? { retryAfterSeconds: resetSeconds } : {}),
    };
  }

  if (status !== 201) {
    return { ok: false, kind: 'unexpected', detail: `Persona returned unexpected status ${status}` };
  }

  let parsed: unknown;
  try {
    parsed = input.rawBody ? JSON.parse(input.rawBody) : null;
  } catch {
    return { ok: false, kind: 'malformed_response', detail: '201 body was not valid JSON' };
  }

  const body = asRecord(parsed);
  const inquiryId = asRecord(body?.data)?.id;
  if (typeof inquiryId !== 'string' || inquiryId.length === 0) {
    return { ok: false, kind: 'malformed_response', detail: '201 body missing data.id' };
  }

  // §3 / §5: the thing the mobile SDK needs to resume a server-created inquiry. Read via the
  // literal kebab key — never `sessionToken` — because `Key-Inflection: kebab` is pinned above.
  const sessionToken = asRecord(body?.meta)?.['session-token'];
  if (typeof sessionToken !== 'string' || sessionToken.length === 0) {
    return {
      ok: false,
      kind: 'missing_session_token',
      detail: '201 body missing meta.session-token',
    };
  }

  return { ok: true, inquiryId, sessionToken };
}

export interface BuildResumeInquiryRequestInput {
  readonly apiKey: string;
  readonly inquiryId: string;
}

/**
 * `POST /inquiries/{id}/resume` — resume-path execution brief §2–§3. Mints a fresh session
 * token for an inquiry that already exists, so `create-inquiry/index.ts`'s reuse branch can
 * call this instead of `buildCreateInquiryRequest` when a `pending` row is found. Same two
 * pinned headers as create, for the same reason (module doc above) — the response is read via
 * the literal kebab key, so a `Key-Inflection` drift would silently break this path too.
 *
 * No `Idempotency-Key`: resume isn't the operation that key exists to deduplicate, and reusing
 * `buildIdempotencyKey`'s value here would collide with the create call's key for the same
 * attempt.
 */
export function buildResumeInquiryRequest(input: BuildResumeInquiryRequestInput): PersonaHttpRequest {
  return {
    url: `${PERSONA_INQUIRIES_URL}/${input.inquiryId}/resume`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Persona-Version': PERSONA_API_VERSION,
      'Key-Inflection': 'kebab',
    },
    // Resume takes no attributes of its own — nothing to send but the request itself.
    body: '',
  };
}

export interface ParseResumeInquiryResponseInput {
  readonly status: number;
  readonly rawBody: string;
  /** `RateLimit-Reset` response header, when present — only meaningful on a 429. */
  readonly rateLimitReset?: string | null;
}

/**
 * The single authority on what a Persona `POST /inquiries/{id}/resume` response means. Same
 * never-throws discipline as `parseCreateInquiryResponse`, and the same `CreateInquiryOutcome`
 * / `CreateInquiryFailureKind` shape — resume-path brief §3 calls for reusing both rather than
 * inventing a parallel type for what is, from the caller's side, the same decision.
 *
 * Success is `200` OR `201` — resume returns the existing inquiry rather than creating one, so
 * unlike create's fixed `201` this does not assume a single status ahead of a live call; both
 * are treated as success and anything else is `unexpected`.
 */
export function parseResumeInquiryResponse(input: ParseResumeInquiryResponseInput): CreateInquiryOutcome {
  const { status } = input;

  if (status === 401) {
    return { ok: false, kind: 'unauthenticated', detail: 'Persona rejected the API key on resume (401)' };
  }
  if (status === 403) {
    return {
      ok: false,
      kind: 'forbidden',
      detail: 'Persona key lacks the required permission for resume (403)',
    };
  }
  if (status === 422) {
    return { ok: false, kind: 'unprocessable', detail: 'Persona rejected the resume request (422)' };
  }
  if (status === 429) {
    const resetSeconds = input.rateLimitReset ? Number(input.rateLimitReset) : NaN;
    return {
      ok: false,
      kind: 'rate_limited',
      detail: 'Persona rate limit exceeded on resume (429)',
      ...(Number.isFinite(resetSeconds) ? { retryAfterSeconds: resetSeconds } : {}),
    };
  }

  if (status !== 200 && status !== 201) {
    return {
      ok: false,
      kind: 'unexpected',
      detail: `Persona returned unexpected status ${status} on resume`,
    };
  }

  let parsed: unknown;
  try {
    parsed = input.rawBody ? JSON.parse(input.rawBody) : null;
  } catch {
    return { ok: false, kind: 'malformed_response', detail: `${status} resume body was not valid JSON` };
  }

  const body = asRecord(parsed);
  const inquiryId = asRecord(body?.data)?.id;
  if (typeof inquiryId !== 'string' || inquiryId.length === 0) {
    return { ok: false, kind: 'malformed_response', detail: `${status} resume body missing data.id` };
  }

  // Read via the literal kebab key — never `sessionToken` — same trap as create (module doc).
  const sessionToken = asRecord(body?.meta)?.['session-token'];
  if (typeof sessionToken !== 'string' || sessionToken.length === 0) {
    return {
      ok: false,
      kind: 'missing_session_token',
      detail: `${status} resume body missing meta.session-token`,
    };
  }

  return { ok: true, inquiryId, sessionToken };
}

/**
 * The partial unique index from migration `20260807090000` — `verifications.inquiry_id`,
 * `where inquiry_id is not null`. Named so `isConcurrentInquiryInsertRace` can tell THIS
 * violation apart from any other 23505 the same insert could theoretically raise (the `id`
 * primary key, effectively never in practice) rather than treating every insert error alike.
 */
export const INQUIRY_ID_UNIQUE_CONSTRAINT = 'verifications_inquiry_id_key';

/** Postgres unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = '23505';

export interface PostgrestLikeError {
  readonly code?: string | null;
  readonly message?: string | null;
}

/**
 * §4.3, the race the Idempotency-Key only half-closes: two concurrent requests for the same
 * user and attempt derive the SAME key (`buildIdempotencyKey`), so Persona collapses them into
 * ONE billable inquiry and both callers get the identical `inquiryId` back from
 * `parseCreateInquiryResponse` — that part already works. But both callers still race to
 * INSERT the pending row, and only one wins against `INQUIRY_ID_UNIQUE_CONSTRAINT`.
 *
 * This tells the caller (`create-inquiry/index.ts`) whether an insert failure is exactly that
 * race — in which case the loser's `outcome` is byte-identical to the winner's (same cached
 * Persona response), so there is nothing to invent: the caller re-confirms the winner's row
 * exists and returns the SAME success response instead of an error for a request that was not
 * actually wrong. Any other insert error (including the `id` primary key, or an unrelated
 * failure) is not this race and must keep failing as `INSERT_FAILED` — checking only `code`
 * would blur that distinction.
 */
export function isConcurrentInquiryInsertRace(error: PostgrestLikeError | null | undefined): boolean {
  return (
    error?.code === PG_UNIQUE_VIOLATION &&
    typeof error.message === 'string' &&
    error.message.includes(INQUIRY_ID_UNIQUE_CONSTRAINT)
  );
}
