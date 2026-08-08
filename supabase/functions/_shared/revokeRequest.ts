/**
 * `revoke-device-session` request parsing — spec §5.4.1.
 *
 * Pure and runtime-agnostic (no Deno imports), same split as `personaSignature.ts` versus
 * `persona-webhook/index.ts`: everything that can be reasoned about without a network
 * connection lives here, is unit-tested here, and `index.ts` stays thin HTTP/DB glue.
 *
 * ── What this module is deliberately strict about ─────────────────────────────────────
 *
 * `session_id` is validated at this boundary, not left for Postgres to reject — see §7.4 of
 * the execution brief. Three rules that are easy to get backwards:
 *
 *   1. Absent field  → bulk revoke (`{ kind: 'all' }`).
 *   2. Explicit `null` → INVALID, not bulk. `{"session_id": null}` reads far more like a
 *      client bug (a variable that failed to populate) than a deliberate "revoke everything",
 *      and guessing the friendlier interpretation logs the caller out of every device.
 *   3. Anything that is not exactly 32 lowercase-or-mixed-case hex characters → INVALID.
 *      `issue-device-session` always emits lowercase hex (`toHex`), so this lowercases before
 *      comparing rather than rejecting mixed-case input outright.
 *
 * `toByteaLiteral` is the other half of §7.1: `device_sessions.session_id` is `bytea`, and
 * `issue-device-session` writes it as a `\x`-prefixed hex literal
 * (`session_id: \`\\x${toHex(sessionId)}\``). A plain hex string compared with `.eq()` matches
 * zero rows, silently, every time — this function exists so both sides of that comparison go
 * through one place instead of being retyped at the call site.
 */

/** §4 / device_sessions.session_id — 16 bytes, i.e. 32 hex characters. */
const SESSION_ID_HEX_LENGTH = 32;
const HEX_PATTERN = /^[0-9a-f]{32}$/i;

export type RevokeTarget =
  | { readonly kind: 'single'; readonly sessionIdHex: string }
  | { readonly kind: 'all' }
  | { readonly kind: 'invalid'; readonly reason: string };

/**
 * Parses and validates the request body into a discriminated result. Never throws — a
 * malformed body is a `kind: 'invalid'` value, not an exception, so the caller can map it to
 * `400 INVALID_SESSION_ID` without a try/catch.
 */
export function parseRevokeTarget(body: unknown): RevokeTarget {
  if (body === null || typeof body !== 'object') {
    return { kind: 'invalid', reason: 'body must be a JSON object' };
  }

  // `in` rather than reading the property first: reading `undefined` from a present key set to
  // `undefined` and reading `undefined` from an absent key are indistinguishable afterwards,
  // and only the absent case means "bulk" — see the header, rule 2.
  if (!('session_id' in body)) {
    return { kind: 'all' };
  }

  const raw = (body as { session_id: unknown }).session_id;

  // Explicit null (or any non-string) is INVALID, never bulk. Deliberately excludes
  // `undefined` too: `{"session_id": undefined}` cannot occur from `JSON.parse`, but if a
  // caller ever constructs the object directly, treat it the same as an unset field would only
  // apply to a genuinely absent key, which the `in` check above already handled.
  if (typeof raw !== 'string') {
    return { kind: 'invalid', reason: 'session_id must be a string, or the field omitted for a bulk revoke' };
  }

  if (raw.length !== SESSION_ID_HEX_LENGTH || !HEX_PATTERN.test(raw)) {
    return { kind: 'invalid', reason: `session_id must be exactly ${SESSION_ID_HEX_LENGTH} hex characters` };
  }

  return { kind: 'single', sessionIdHex: raw.toLowerCase() };
}

/**
 * `\x`-prefixed bytea literal for a 32-char hex session id — see §7.1. This is exactly the
 * representation `issue-device-session` writes on insert
 * (`session_id: \`\\x${toHex(sessionId)}\``); a query that omits the `\x` prefix compares a
 * hex-encoded string against raw bytes and matches nothing, ever.
 *
 * Callers must pass an already-validated hex string (i.e. the `sessionIdHex` of a `'single'`
 * `RevokeTarget`) — this function re-validates rather than trusting the caller, since a bad
 * literal here fails silently in exactly the way §7.1 warns about.
 */
export function toByteaLiteral(sessionIdHex: string): string {
  if (sessionIdHex.length !== SESSION_ID_HEX_LENGTH || !HEX_PATTERN.test(sessionIdHex)) {
    throw new RangeError(`session_id must be exactly ${SESSION_ID_HEX_LENGTH} hex characters`);
  }
  return `\\x${sessionIdHex.toLowerCase()}`;
}
