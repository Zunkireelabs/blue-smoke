/**
 * `revoke-device-session` — spec §5.4.1.
 *
 * Runs as service role because `device_sessions` has no client UPDATE policy (§5.3) — there is
 * no RLS backstop here, which means the `user_id` predicate in the UPDATE below is the ENTIRE
 * authorisation model for this endpoint (§7.2 of the execution brief). It handles no key
 * material: this only marks rows, it never touches `K_dev`/`K_sess`, and it must never reach
 * `device_ownership` (§7.6) — revocation stops the *server* re-issuing, it does not unpair the
 * device, which keeps honouring its `K_sess` offline until `sessionExpiry` elapses by design.
 *
 * Deploy WITH JWT verification, same as `issue-device-session`: the caller must present a real
 * user token, resolved with the anon key so an expired or forged token cannot get past it.
 *
 * ── §7.1 — the one thing that will silently break this ──────────────────────────────────
 *
 * `device_sessions.session_id` is `bytea`. `issue-device-session` writes it as a `\x`-prefixed
 * hex literal. Comparing against plain hex matches zero rows, every time, and the endpoint
 * then returns a clean `404 SESSION_NOT_FOUND` — which looks exactly like "that session
 * doesn't exist" and is actually "revocation has never worked." `toByteaLiteral` in
 * `_shared/revokeRequest.ts` is the only place that encoding happens.
 *
 * ── §3 of the execution brief — the bulk-404 deviation from spec prose ──────────────────
 *
 * Spec §5.4.1 step 3 says "affected 0 rows → 404" without distinguishing single vs. bulk. For
 * a named `session_id` that is right: nothing matched, so nothing was found. For an omitted
 * `session_id` ("revoke everything I have") it is wrong: zero active sessions is a *satisfied*
 * request, not a missing resource, so that case answers `200 { revoked: 0 }` instead. See the
 * execution brief §3 for the full reasoning; this is a documented deviation, not an oversight.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { parseRevokeTarget, toByteaLiteral } from '../_shared/revokeRequest.ts';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json(405, { error: 'METHOD_NOT_ALLOWED' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json(401, { error: 'UNAUTHENTICATED' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error('revoke-device-session: incomplete environment configuration');
    return json(500, { error: 'NOT_CONFIGURED' });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json(400, { error: 'MALFORMED_BODY' });
  }

  // Validated at the boundary, not handed to Postgres — §7.4. In particular, an explicit
  // `{"session_id": null}` is INVALID here, not "revoke all"; only an absent field is bulk.
  const target = parseRevokeTarget(rawBody);
  if (target.kind === 'invalid') {
    return json(400, { error: 'INVALID_SESSION_ID' });
  }

  // ── Step 1: resolve the user from THEIR token ────────────────────────────
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return json(401, { error: 'UNAUTHENTICATED' });
  }
  const userId = userData.user.id;

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── Step 2: revoke ────────────────────────────────────────────────────────
  // `user_id` is present in BOTH branches — it is never optional (§7.2). A bulk revoke that
  // lost it would be a cross-user session wipe. `.select('id')` on an UPDATE returns the rows
  // actually matched, which is how we count them without a second round trip — and, per §5,
  // a denied/no-match UPDATE does not throw, so the row count is the only signal that means
  // anything here.
  const revokedAt = new Date();
  let query = admin
    .from('device_sessions')
    .update({ revoked_at: revokedAt.toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null);

  if (target.kind === 'single') {
    query = query.eq('session_id', toByteaLiteral(target.sessionIdHex));
  }

  const { data: updatedRows, error: updateError } = await query.select('id');

  if (updateError) {
    console.error(`revoke-device-session: update failed — ${updateError.message}`);
    return json(500, { error: 'REVOKE_FAILED' });
  }

  const revokedCount = updatedRows?.length ?? 0;

  // Step 3: single-session 404, distinguishable from another user's session only by never
  // leaking which (§7.3) — the `user_id` predicate above already makes someone else's
  // session_id look identical to a nonexistent one. Bulk revoke of zero active sessions is a
  // satisfied request, not a missing resource — see the deviation note in the file header.
  if (target.kind === 'single' && revokedCount === 0) {
    return json(404, { error: 'SESSION_NOT_FOUND' });
  }

  // ── Step 4: audit, metadata only (§5.2.8 / §7.5) ─────────────────────────
  // No session_id, no device_id in the JSON — only a count. `audit_log.metadata` must never
  // carry an identifier that could re-associate this event with a specific session or device.
  await admin.from('audit_log').insert({
    user_id: userId,
    event: 'session_revoked',
    metadata: { revoked_count: revokedCount },
  });

  // ── Step 5 ────────────────────────────────────────────────────────────────
  return json(200, {
    revoked: revokedCount,
    revoked_at: revokedAt.toISOString(),
  });
});
