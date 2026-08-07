/**
 * `issue-device-session` — spec §5.4.
 *
 * 🔴 THE SOLE PATH FROM `K_dev` TO ANYTHING OUTSIDE THE DATABASE, and the server-side
 * chokepoint that makes inviolable rule 3 real. Everything the app believes about
 * `age_verified` is a UX hint; THIS is the check that decides, and it re-reads the database
 * rather than trusting a single field the client sent.
 *
 * Deploy WITH JWT verification (unlike persona-webhook): the caller must present a real user
 * token, and step 1 resolves it with the anon key rather than the service role, so an expired
 * or forged token cannot get past it.
 *
 * ── Ordering is the security property ────────────────────────────────────────────────
 *
 * The age gate (step 2) runs BEFORE the device is resolved, before ownership, and long before
 * Vault is touched. An unverified caller must never reach the code that unwraps key material,
 * so failures are ordered cheapest-and-strictest first. Do not reorder these for tidiness.
 *
 * ── 🔴 The one thing that must never be logged ───────────────────────────────────────
 *
 * `K_dev` and `K_sess` are never logged, never returned except as the documented response
 * field, and never stored — `device_sessions` holds metadata only (§5.2.6). A `console.log`
 * of the response body here would write a live device key into the platform's log retention.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  deriveSessionKey,
  fromHex,
  toHex,
  SESSION_EXPIRY_MAX_DAYS,
  SESSION_ID_LENGTH_BYTES,
} from '../_shared/deriveSessionKey.ts';

/** §5.4 step 8. */
const MAX_ISSUANCES_PER_HOUR = 10;

/** §8.5 — the cap is 90 days; 30 is the recommended default when the caller asks for nothing. */
const DEFAULT_TTL_DAYS = 30;

/** Postgres unique-violation. §5.4 step 4 turns this into the ownership 403. */
const PG_UNIQUE_VIOLATION = '23505';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface RequestBody {
  serial_hash?: unknown;
  requested_ttl_days?: unknown;
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
    console.error('issue-device-session: incomplete environment configuration');
    return json(500, { error: 'NOT_CONFIGURED' });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(400, { error: 'MALFORMED_BODY' });
  }

  // Validate at the boundary. `serial_hash` reaches a SQL predicate, so its shape is checked
  // rather than assumed — SHA-256 hex, nothing else.
  const serialHash = typeof body.serial_hash === 'string' ? body.serial_hash.toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(serialHash)) {
    return json(400, { error: 'INVALID_SERIAL_HASH' });
  }

  const requestedTtl =
    typeof body.requested_ttl_days === 'number' && Number.isFinite(body.requested_ttl_days)
      ? body.requested_ttl_days
      : DEFAULT_TTL_DAYS;
  // Clamp rather than reject: §5.4 step 6 says min(requested, 90). A caller asking for 3650
  // days gets 90, not an error — but it can never get more, whatever it asks for.
  const ttlDays = Math.max(1, Math.min(Math.floor(requestedTtl), SESSION_EXPIRY_MAX_DAYS));

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

  // ── Step 2: THE GATE ─────────────────────────────────────────────────────
  // Server-side, from the database, before anything else. `verifications` is service-role
  // write-only (§5.3 + migration 20260807090000), so this row can only have been written by
  // the signature-verified webhook.
  const { data: verification, error: verificationError } = await admin
    .from('verifications')
    .select('age_verified')
    .eq('user_id', userId)
    .eq('age_verified', true)
    .order('verified_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (verificationError) {
    console.error(`issue-device-session: verification lookup failed — ${verificationError.message}`);
    return json(500, { error: 'LOOKUP_FAILED' });
  }
  if (!verification) {
    return json(403, { error: 'AGE_NOT_VERIFIED' });
  }

  // ── Step 8 (early): rate limit ───────────────────────────────────────────
  // Checked before any write and before Vault. §5.4 lists it as step 8, but running it here
  // costs one indexed count and denies an abusive caller before it can touch key material.
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count: recentCount, error: rateError } = await admin
    .from('device_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('issued_at', oneHourAgo);

  if (rateError) {
    console.error(`issue-device-session: rate-limit query failed — ${rateError.message}`);
    return json(500, { error: 'LOOKUP_FAILED' });
  }
  if ((recentCount ?? 0) >= MAX_ISSUANCES_PER_HOUR) {
    return json(429, { error: 'RATE_LIMITED' });
  }

  // ── Step 3: resolve the device, inserting on first sight ─────────────────
  // `serial_hash` is unique, so a concurrent first-sight insert by another caller is settled
  // by the constraint. upsert + select keeps that atomic instead of check-then-insert.
  const { data: device, error: deviceError } = await admin
    .from('devices')
    .upsert({ serial_hash: serialHash }, { onConflict: 'serial_hash' })
    .select('id')
    .single();

  if (deviceError || !device) {
    console.error(`issue-device-session: device resolve failed — ${deviceError?.message}`);
    return json(500, { error: 'DEVICE_RESOLVE_FAILED' });
  }
  const deviceId = device.id as string;

  // ── Step 4: assert ownership ─────────────────────────────────────────────
  const { data: ownership, error: ownershipError } = await admin
    .from('device_ownership')
    .select('user_id')
    .eq('device_id', deviceId)
    .is('revoked_at', null)
    .maybeSingle();

  if (ownershipError) {
    console.error(`issue-device-session: ownership lookup failed — ${ownershipError.message}`);
    return json(500, { error: 'LOOKUP_FAILED' });
  }

  if (ownership) {
    if (ownership.user_id !== userId) {
      return json(403, { error: 'DEVICE_OWNED_BY_ANOTHER_USER' });
    }
  } else {
    // First bond. Do NOT pre-check-then-insert: two users bonding the same fresh device
    // concurrently would both pass the SELECT above. Let
    // `device_ownership_one_active_owner` arbitrate, and map its unique violation to the
    // same 403 the loser would have received anyway. The INDEX is the authority here.
    const { error: bondError } = await admin
      .from('device_ownership')
      .insert({ user_id: userId, device_id: deviceId });

    if (bondError) {
      if (bondError.code === PG_UNIQUE_VIOLATION) {
        return json(403, { error: 'DEVICE_OWNED_BY_ANOTHER_USER' });
      }
      console.error(`issue-device-session: bond failed — ${bondError.message}`);
      return json(500, { error: 'BOND_FAILED' });
    }
  }

  // ── Step 5: unwrap K_dev ─────────────────────────────────────────────────
  // Only reachable by a caller that is authenticated, age-verified, within rate limits, and
  // the device's active owner. Everything above this line is what earns access to it.
  const { data: keyRows, error: keyError } = await admin.rpc('get_device_key_material', {
    p_device_id: deviceId,
  });

  if (keyError) {
    console.error(`issue-device-session: key material unavailable — ${keyError.message}`);
    return json(500, { error: 'KEY_UNAVAILABLE' });
  }
  const keyRow = Array.isArray(keyRows) ? keyRows[0] : keyRows;
  if (!keyRow?.k_dev) {
    // Expected until provisioning exists (OQ-4 — who burns K_dev into OTP at manufacture).
    // A distinct code so this is not misread as an auth failure during bring-up.
    return json(409, { error: 'DEVICE_NOT_PROVISIONED' });
  }

  // Supabase returns bytea as a `\x...` hex string.
  const kDevHex = String(keyRow.k_dev).replace(/^\\x/, '');
  const kDev = fromHex(kDevHex);
  const keyGeneration = Number(keyRow.key_generation ?? 1);

  // ── Step 6: derive ───────────────────────────────────────────────────────
  const sessionId = crypto.getRandomValues(new Uint8Array(SESSION_ID_LENGTH_BYTES));
  const expiresAt = new Date(Date.now() + ttlDays * 86_400_000);
  const kSess = await deriveSessionKey(kDev, sessionId, keyGeneration);

  // ── Step 7: record METADATA ONLY — never K_sess (§5.2.6) ─────────────────
  const { error: sessionError } = await admin.from('device_sessions').insert({
    session_id: `\\x${toHex(sessionId)}`,
    user_id: userId,
    device_id: deviceId,
    expires_at: expiresAt.toISOString(),
  });

  if (sessionError) {
    console.error(`issue-device-session: session insert failed — ${sessionError.message}`);
    return json(500, { error: 'SESSION_INSERT_FAILED' });
  }

  // ── Step 9: audit, metadata only (§5.2.8) ────────────────────────────────
  await admin.from('audit_log').insert({
    user_id: userId,
    device_id: deviceId,
    event: 'session_issued',
    metadata: { ttl_days: ttlDays, key_generation: keyGeneration },
  });

  // ── Step 10 ──────────────────────────────────────────────────────────────
  // K_sess crosses the wire exactly once, over TLS, and is never persisted on our side.
  return json(200, {
    session_id: toHex(sessionId),
    k_sess: toHex(kSess),
    expires_at: expiresAt.toISOString(),
    key_generation: keyGeneration,
  });
});
