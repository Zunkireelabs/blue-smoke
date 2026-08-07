/**
 * Persona webhook signature verification — spec §6.6 item 1, §8.3 top row.
 *
 * This closes what the spec recorded as a SHIP-BLOCKER. `persona-webhook` is an
 * unauthenticated public endpoint by nature: anything that can POST to it can grant
 * `age_verified` unless the signature is verified first. It is the most direct path to
 * defeating the age gate under the vendor architecture, which is why the scheme was
 * deliberately left unspecified rather than guessed.
 *
 * It is no longer guessed. Everything below is Persona's documented scheme:
 *   https://docs.withpersona.com/webhooks-best-practices
 *
 *   Header:     `Persona-Signature`
 *   Value:      `t=<unix_seconds>,v1=<hex_hmac>`
 *   Signed over `${t}.${rawBody}` — timestamp, a literal dot, then the RAW request body
 *   Algorithm:  HMAC-SHA256, hex-encoded digest
 *   Rotation:   during a secret rotation the header carries TWO SPACE-SEPARATED sets of
 *               those pairs, so a valid request may match either the old or the new secret
 *
 * ── Three things that will silently break this if changed ──────────────────────────────
 *
 * 1. RAW BODY, NEVER RE-SERIALISED JSON. `JSON.parse` then `JSON.stringify` is not
 *    byte-identical to what Persona signed — key order, unicode escaping and number
 *    formatting all drift — and every signature then fails. The caller must pass the exact
 *    bytes it received. This is Persona's own warning and the most common way to break it.
 *
 * 2. CONSTANT-TIME COMPARISON. A `===` on the hex digest leaks, byte by byte, how much of a
 *    forged signature was correct, which is enough to construct a valid one. `timingSafeHexEqual`
 *    below always inspects every character.
 *
 * 3. FAIL CLOSED, ALWAYS. Every path that is not a proven-valid signature returns invalid.
 *    There is deliberately no "signature missing so skip verification" branch, no debug
 *    bypass, and no environment in which this is optional — a bypass here is a forge of
 *    `age_verified` (CLAUDE.md rule 3).
 *
 * ── Replay protection is OURS, not Persona's ──────────────────────────────────────────
 *
 * Persona's documentation specifies no timestamp tolerance and gives no replay guidance,
 * but §8.3 lists "replayed webhook" as a distinct threat from "forged webhook". A captured
 * body-plus-signature stays valid forever unless we bound it, so `toleranceSeconds` is our
 * decision, not the vendor's. It is the FIRST of two independent defences; the second is the
 * unique index on `verifications.inquiry_id`, which makes a replay that beats the clock
 * window still unable to write a second outcome.
 *
 * Deliberately runtime-agnostic: only Web Crypto and TextEncoder, both present in Deno (the
 * Edge Function runtime) and in Node 18+ (so the test suite can exercise it without Deno).
 * Do not add imports here.
 */

/** Persona's documented tolerance is unspecified; five minutes is ours. See the header. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

export interface VerifyInput {
  /** The EXACT bytes received. Never a re-serialised object — see note 1. */
  readonly rawBody: string;
  /** Value of the `Persona-Signature` header, or null when absent. */
  readonly header: string | null;
  /** The webhook secret from Persona's dashboard. */
  readonly secret: string;
  /** Current time, unix seconds. Injected so the tests are deterministic. */
  readonly nowSeconds: number;
  readonly toleranceSeconds?: number;
}

export type VerifyResult =
  | { readonly valid: true; readonly timestamp: number }
  /**
   * `reason` is for OUR server logs only. It must never reach the HTTP response body:
   * telling a caller whether it failed on the digest or the clock hands them an oracle
   * for tuning an attack. The handler answers a flat 401 for every one of these.
   */
  | { readonly valid: false; readonly reason: string };

/**
 * Compares two hex strings without leaking, through timing, how many leading characters
 * matched. Length is compared first — that is not secret, since the digest length is fixed
 * and public — and the loop then always runs to completion over the full candidate.
 */
export function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    // eslint-disable-next-line no-bitwise -- REQUIRED, not incidental. Accumulating the XOR
    // is what makes this constant-time: any early return or `!==` short-circuit would leak,
    // through timing, how many leading characters of a forged signature were correct.
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

interface SignaturePair {
  readonly t: string;
  readonly v1: string;
}

/**
 * Parses `t=...,v1=...` — and, during a rotation, `t=...,v1=... t=...,v1=...`.
 *
 * Splitting on ANY whitespace run rather than a single space: the rotation format is
 * documented as space-separated, and a proxy that normalises the header differently should
 * not turn a valid request into a 401.
 */
export function parseSignatureHeader(header: string): SignaturePair[] {
  const pairs: SignaturePair[] = [];
  for (const set of header.trim().split(/\s+/)) {
    let t: string | undefined;
    let v1: string | undefined;
    for (const field of set.split(',')) {
      const eq = field.indexOf('=');
      if (eq === -1) {
        continue;
      }
      const key = field.slice(0, eq).trim();
      const value = field.slice(eq + 1).trim();
      if (key === 't') {
        t = value;
      } else if (key === 'v1') {
        v1 = value;
      }
    }
    if (t && v1) {
      pairs.push({ t, v1 });
    }
  }
  return pairs;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const bytes = new Uint8Array(signature);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * The single authority on whether a webhook body may be trusted.
 *
 * Returns valid only when a signature set both matches the HMAC AND sits inside the
 * freshness window. Callers must treat every other outcome as a 401 and must not read a
 * single field of the body first — parsing attacker-controlled JSON before authenticating it
 * is the bug this function exists to prevent.
 */
export async function verifyPersonaSignature(input: VerifyInput): Promise<VerifyResult> {
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;

  // Fail closed on a missing secret. A deployment that forgot to set PERSONA_WEBHOOK_SECRET
  // must reject every delivery, never accept them unverified.
  if (!input.secret) {
    return { valid: false, reason: 'webhook secret is not configured' };
  }
  if (!input.header) {
    return { valid: false, reason: 'Persona-Signature header absent' };
  }

  const pairs = parseSignatureHeader(input.header);
  if (pairs.length === 0) {
    return { valid: false, reason: 'Persona-Signature header malformed' };
  }

  let sawFreshCandidate = false;

  for (const pair of pairs) {
    const timestamp = Number(pair.t);
    if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp)) {
      continue;
    }

    // Bound BOTH directions. A future-dated timestamp is as suspect as a stale one: it would
    // otherwise let an attacker mint a signature that stays valid far beyond the window.
    const skew = Math.abs(input.nowSeconds - timestamp);
    if (skew > tolerance) {
      continue;
    }
    sawFreshCandidate = true;

    // The digest is computed over the fresh timestamp AS SENT (pair.t, the original string),
    // not a re-formatted number — `Number()` round-trips would alter e.g. leading zeroes and
    // break an otherwise valid signature.
    const expected = await hmacSha256Hex(input.secret, `${pair.t}.${input.rawBody}`);
    if (timingSafeHexEqual(expected, pair.v1)) {
      return { valid: true, timestamp };
    }
  }

  // Distinguished only for our logs. Both are a flat 401 to the caller.
  return sawFreshCandidate
    ? { valid: false, reason: 'no signature matched the webhook secret' }
    : { valid: false, reason: `no signature within ${tolerance}s freshness window` };
}
