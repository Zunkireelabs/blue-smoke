/**
 * Admin auth gate — AD-1 M1a, execution brief §3 / §7.
 *
 * Same pure/thin split as `revokeRequest.ts` versus `revoke-device-session/index.ts`: everything
 * that can be reasoned about without a network connection lives here and is unit-tested here;
 * the one DB-touching piece (`assertAdmin`) and the composed gate (`requireAdmin`) stay thin and
 * are verified by reading, by the SQL proofs, and — where possible — against the deployed
 * function with real tokens.
 *
 * ── The auth gate, in order ──────────────────────────────────────────────────────────────────
 * valid JWT → (if requireMfa) aal2 with a totp amr entry → `admin_users` row exists and
 * `disabled_at is null`. A mobile-app user fails the last check: they have no route to appear in
 * `admin_users` at all (see the migration's comment).
 *
 * ── Path B (MFA deferred) — brief §3 ─────────────────────────────────────────────────────────
 * The project is on free Supabase; TOTP enforcement is deferred to M2. `requireMfa` is threaded
 * in from `index.ts`, which reads it from `Deno.env.get('REQUIRE_ADMIN_MFA') !== 'false'` —
 * default enforced. Only an explicit `REQUIRE_ADMIN_MFA=false` secret relaxes the aal2 check.
 * The `admin_users` membership check below is NEVER behind that flag — logging in is not being
 * an admin, and that line never moves regardless of MFA posture.
 *
 * ── `aal` in a Supabase JWT ───────────────────────────────────────────────────────────────────
 * `aal` is a top-level claim (`"aal": "aal1" | "aal2"`) and `amr` is an array of
 * `{ method, timestamp }` entries. The installed `@supabase/supabase-js` is 2.112.0, whose
 * `GoTrueClient` exposes `getClaims()` (verifies via JWKS and returns `aal`) — but `getClaims()`
 * needs network access to fetch/cache the JWKS and is a heavier call than this gate needs for a
 * value we still have to cross-check against `getUser()` regardless (step 2 below). We use the
 * plain payload-decode + `getUser()` pair the brief specifies, matching `issue-device-session`'s
 * existing `getUser()`-only pattern rather than introducing a second verification path.
 */

// ── Pure: decode + shape-check the JWT payload. No network, no DB. Unit-tested. ──

export type AdminClaims =
  | { readonly ok: true; readonly sub: string; readonly aal: string; readonly amrMethods: string[] }
  | { readonly ok: false; readonly reason: string };

/**
 * Base64url-decodes a JWT segment. Never throws — a malformed segment surfaces as an `AdminClaims`
 * `ok: false`, not an exception, so `requireAdmin` never needs a try/catch around this.
 */
function decodeBase64UrlJson(segment: string): unknown {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  // atob is a global in both Deno and modern Node (18+); no Buffer, matching the rest of
  // _shared/'s runtime-agnostic style.
  const json = atob(padded + padding);
  return JSON.parse(json);
}

/**
 * Decodes the JWT payload and extracts `sub`, `aal`, `amr`. Never throws.
 *
 * This is a SHAPE check only — it does not verify the signature. The decoded `aal`/`sub` are only
 * trusted once `requireAdmin`'s step 2 (`getUser()`) proves the token is genuinely valid; see the
 * header note on why both steps exist.
 */
export function parseAdminClaims(authorizationHeader: string | null): AdminClaims {
  if (authorizationHeader === null) {
    return { ok: false, reason: 'authorization header absent' };
  }
  if (!authorizationHeader.startsWith('Bearer ')) {
    return { ok: false, reason: 'authorization header is not a Bearer token' };
  }
  const jwt = authorizationHeader.slice('Bearer '.length).trim();
  if (jwt.length === 0) {
    return { ok: false, reason: 'bearer token is empty' };
  }

  const segments = jwt.split('.');
  if (segments.length !== 3) {
    return { ok: false, reason: 'token is not a well-formed JWT (expected 3 segments)' };
  }

  let payload: unknown;
  try {
    payload = decodeBase64UrlJson(segments[1]);
  } catch {
    return { ok: false, reason: 'token payload is not valid base64url JSON' };
  }

  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, reason: 'token payload is not a JSON object' };
  }

  const { sub, aal, amr } = payload as Record<string, unknown>;

  if (typeof sub !== 'string' || sub.length === 0) {
    return { ok: false, reason: 'token payload missing sub' };
  }
  if (typeof aal !== 'string' || aal.length === 0) {
    return { ok: false, reason: 'token payload missing aal' };
  }

  // `amr` is optional-ish in shape here: a missing or malformed amr array just yields no methods,
  // rather than failing claim parsing outright — `isSecondFactorSatisfied` is what actually cares.
  const amrMethods: string[] = Array.isArray(amr)
    ? amr
        .map((entry) => (typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>).method : undefined))
        .filter((method): method is string => typeof method === 'string')
    : [];

  return { ok: true, sub, aal, amrMethods };
}

/** True iff claims show a second factor was actually USED (aal2 + a totp amr entry), not merely enrolled. */
export function isSecondFactorSatisfied(claims: Extract<AdminClaims, { ok: true }>): boolean {
  return claims.aal === 'aal2' && claims.amrMethods.includes('totp');
}

// ── Thin: the DB membership check. Takes a service-role client. ──

export interface AdminRow {
  userId: string;
  role: 'readonly' | 'admin' | 'superadmin';
}

/** Minimal shape this module needs from `@supabase/supabase-js`'s client — avoids importing the
 * Deno/JSR specifier into a file Jest also loads. */
export interface AdminGateSupabaseClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{ data: { role: string; disabled_at: string | null } | null; error: unknown }>;
      };
    };
  };
  auth: {
    getUser(jwt?: string): Promise<{ data: { user: { id: string; email?: string | null } | null }; error: unknown }>;
  };
}

/**
 * Reads `admin_users` for `userId`. Returns `null` for "not an admin" AND for "disabled admin" —
 * callers must not distinguish the two in the response (both are a flat 403 `NOT_AN_ADMIN`), only
 * in the audit metadata if ever needed.
 */
export async function assertAdmin(
  serviceClient: AdminGateSupabaseClient,
  userId: string,
): Promise<AdminRow | null> {
  const { data, error } = await serviceClient
    .from('admin_users')
    .select('role, disabled_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }
  if (data.disabled_at !== null) {
    return null;
  }
  if (data.role !== 'readonly' && data.role !== 'admin' && data.role !== 'superadmin') {
    // Defensive: the DB check constraint already guarantees this, but a gate must never trust a
    // value it hasn't shape-checked itself.
    return null;
  }
  return { userId, role: data.role };
}

// ── Compose: what index.ts calls. ──

export type AdminGate =
  | { readonly ok: true; readonly admin: AdminRow; readonly userId: string }
  | { readonly ok: false; readonly status: 401 | 403; readonly code: string; readonly loggableUserId: string | null };

export async function requireAdmin(args: {
  authorizationHeader: string | null;
  anonClient: AdminGateSupabaseClient; // to validate the token via auth.getUser()
  serviceClient: AdminGateSupabaseClient; // to read admin_users
  requireMfa: boolean; // §3: from REQUIRE_ADMIN_MFA, default true
}): Promise<AdminGate> {
  const { authorizationHeader, anonClient, serviceClient, requireMfa } = args;

  // Step 1: shape-check the token locally. Not yet trusted — see step 2.
  const claims = parseAdminClaims(authorizationHeader);
  if (!claims.ok) {
    return { ok: false, status: 401, code: 'NO_TOKEN', loggableUserId: null };
  }

  // Step 2: validate signature + expiry against the auth server. This is what actually proves
  // the token is real; step 1's decoded fields are trusted only after this succeeds.
  const jwt = (authorizationHeader as string).slice('Bearer '.length).trim();
  const { data: userData, error: userError } = await anonClient.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return { ok: false, status: 401, code: 'INVALID_TOKEN', loggableUserId: null };
  }
  if (userData.user.id !== claims.sub) {
    // Cross-check: a validated token whose server-confirmed sub disagrees with the decoded
    // payload's sub is not something to trust for either value.
    return { ok: false, status: 401, code: 'INVALID_TOKEN', loggableUserId: null };
  }

  const sub = userData.user.id;

  // Step 3: second factor, gated by requireMfa (Path B). Membership is NOT gated by this flag —
  // see the header note.
  if (requireMfa && !isSecondFactorSatisfied(claims)) {
    return { ok: false, status: 403, code: 'MFA_REQUIRED', loggableUserId: sub };
  }

  // Step 4: the real authority. Always enforced, regardless of requireMfa.
  const admin = await assertAdmin(serviceClient, sub);
  if (admin === null) {
    return { ok: false, status: 403, code: 'NOT_AN_ADMIN', loggableUserId: sub };
  }

  return { ok: true, admin, userId: sub };
}
