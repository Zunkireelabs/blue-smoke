#!/usr/bin/env node
// P0-3.0 — RLS proof, LIVE HTTP version: "tested with a second user's JWT"
// (TODO-phase-0.md, P0-3.0). Supersedes the simulated-JWT proof in
// `rls_ownership_proof.sql` — which is KEPT, deliberately, see "Relationship" below.
//
// ══ WHAT THIS PROVES, AND WHAT IT DOES NOT ══════════════════════════════════
//
// Two real users sign in over HTTP against GoTrue
// (`POST /auth/v1/token?grant_type=password`), and every assertion below is made
// through PostgREST with their genuine access tokens. That is a strictly stronger
// proof than the SQL version: the JWT is minted by GoTrue, signed, and decoded by
// PostgREST exactly as it is for a real app request — no GUC is set by hand.
//
// 🔴 **The signup path is NOT exercised.** Users A and B were created in the
// Supabase dashboard with **Auto Confirm** on. This proof therefore says nothing
// about whether a real email signup can confirm — and as of 2026-08-09 it cannot
// (see `docs/session-log/hardik.md`: `signUp()` sends no `emailRedirectTo`, so the
// confirmation link falls back to Site URL `http://localhost:3000`). What is proven
// here is the behaviour of the *resulting JWTs*, nothing earlier in their lifecycle.
//
// ══ THE TWO WAYS A PROOF LIKE THIS REPORTS PASS WITHOUT PROVING ═════════════
//
// Both are inherited lessons from the SQL version — see `session-log/sadin.md`,
// 2026-08-07. They have HTTP analogues, and both are guarded against here.
//
// (1) 🔴 WRONG-ROLE BYPASS. The SQL version's trap was `SET LOCAL` being a no-op
// outside a transaction, silently running every check as the table owner with RLS
// bypassed. Over HTTP the same hole opens if the script is ever handed a
// **service-role** key instead of a user access token: service_role bypasses every
// policy, so all eight checks would report a cheerful PASS against a wide-open
// database. Sadin's inverse case is the one that makes this non-obvious — *both*
// role postures can hide the same hole, so it is not enough to be "not the owner".
// **Guarded:** before any denial is claimed, each token is (a) decoded locally and
// asserted to carry `role: "authenticated"` and the expected `sub`, and (b) round-
// tripped through `GET /auth/v1/user` to prove the token is live and accepted.
// (a) alone would pass on a forged string; (b) alone would not catch a service key.
//
// (2) AN UNRELATED ERROR COUNTED AS A SECURITY PASS. The SQL version caught
// `when others`, so a foreign-key violation from a fixture that never got created
// scored as "denied by RLS". Over HTTP the equivalent is treating any non-2xx as a
// denial: a 409 unique-violation or a 23503 FK error would both "pass". **Guarded:**
// only PostgREST code `42501` counts as an RLS denial. Anything else is reported
// INCONCLUSIVE, never PASS.
//
// ⚠️ A third trap is specific to HTTP and has no SQL analogue: **an RLS-filtered
// read is a `200` with an empty array, not an error.** An assertion written for the
// SQL shapes ("did it throw?") reads that as success while proving nothing. Every
// read check below asserts on status *and* row count.
//
// ══ RELATIONSHIP TO `rls_ownership_proof.sql` ═══════════════════════════════
//
// The SQL file is kept, not deleted. It is the only version that runs with no
// network and no service-role key, it wraps in BEGIN/ROLLBACK so it leaves nothing
// behind, and it carries the two corrections above in their original form. Treat it
// as the cheap local check and this file as the authoritative one.
//
// ══ HOW TO RUN — THIS IS A TWO-PART PROCEDURE, NOT A SELF-CONTAINED SCRIPT ══
//
// The fixtures cannot be created by this script. As user A it is *not permitted* to
// create them, and that is the point: `device_ownership` denies client INSERT
// outright (the PR #6 ownership-squat fix) and `verifications` lost its INSERT
// policy in `20260807090000` (the age-gate fix). A proof that could seed its own
// fixtures over the anon key would be proving the holes were still open.
//
// So seeding and teardown run server-side with service-role privileges, via the
// Supabase MCP server's `execute_sql` or the SQL editor. The service-role key never
// enters this repo, this script, or the shell environment.
//
//   1. SEED     — run `rls_ownership_proof_live.seed.sql`     (service role)
//   2. ASSERT   — run this script                             (anon key + user JWTs)
//   3. TEARDOWN — run `rls_ownership_proof_live.teardown.sql` (service role)
//
// Step 3 is not optional: unlike the SQL version there is no ROLLBACK, so the
// fixtures are real committed rows until they are deleted.
//
// Required environment (never hardcoded, never committed — see `.env`, gitignored):
//
//   SUPABASE_URL            https://<ref>.supabase.co
//   SUPABASE_ANON_KEY       the project's anon/publishable key
//   RLS_PROOF_A_EMAIL       user A's email
//   RLS_PROOF_B_EMAIL       user B's email
//   RLS_PROOF_PASSWORD      shared password for both dev test users
//
//   node supabase/tests/rls_ownership_proof_live.mjs
//
// Exit code is 0 only if every check PASSes. INCONCLUSIVE is a failure exit.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ── Fixed identities ────────────────────────────────────────────────────────
// The expected user ids are hardcoded ON PURPOSE. The guard's whole job is to
// assert the token belongs to the user we think it does; comparing it against a
// value read from the same environment that produced the token would be vacuous.
const USER_A = '60bbe9c9-2d2a-4823-8f35-669f4d2e1592';
const USER_B = '55b18ad2-0d2a-4ca4-bdd3-787e9d80d834';

// Fixture ids — must match the seed/teardown SQL exactly. Deliberately distinct
// from the SQL proof's 1111…/3333… set so the two can never be confused in a
// table listing, and so a failed teardown is unambiguous about which run left it.
const FIXTURE_DEVICE = '3f3f3f3f-0000-4000-8000-000000000001';
const FIXTURE_OWNERSHIP = '3f3f3f3f-0000-4000-8000-000000000002';

// ── Minimal .env loader ─────────────────────────────────────────────────────
// Hand-parsed, no dependency — same approach `babel.config.js` already uses, and
// for the same reason: nothing in this project loads `.env` into the environment
// on its own (see session-log/sadin.md 2026-08-07, "`.env` did nothing").
function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../../.env');
  let raw = '';
  try {
    raw = readFileSync(envPath, 'utf8');
  } catch {
    return; // env vars may be supplied by the shell instead; validated below
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim().replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    console.error('See this file\'s header for the full list.');
    process.exit(2);
  }
  return v;
}

// ── Results ─────────────────────────────────────────────────────────────────
const results = [];
const record = (name, result) => results.push({ name, result });
const pass = (name) => record(name, 'PASS');
const fail = (name, why) => record(name, `FAIL: ${why}`);
const inconclusive = (name, why) => record(name, `INCONCLUSIVE: ${why}`);

// ── HTTP helpers ────────────────────────────────────────────────────────────
let SUPABASE_URL, ANON_KEY;

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `sign-in failed for ${email}: ${res.status} ${JSON.stringify(body)}`,
    );
  }
  return body.access_token;
}

async function rest(path, { token, method = 'GET', body, prefer } = {}) {
  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

// Decode a JWT payload without verifying it. Verification is PostgREST's job and
// is proven by the round-trip below; this only reads what the token claims to be,
// which is what catches a service-role key before it can fake eight passes.
function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('not a JWT');
  const json = Buffer.from(parts[1], 'base64url').toString('utf8');
  return JSON.parse(json);
}

// ── The guard ───────────────────────────────────────────────────────────────
// Runs before any denial is claimed. See header note (1).
async function guard(label, token, expectedSub) {
  let claims;
  try {
    claims = decodeJwtPayload(token);
  } catch (e) {
    fail(label, `token is not a decodable JWT — ${e.message}`);
    return false;
  }

  if (claims.role !== 'authenticated') {
    fail(
      label,
      `token role is "${claims.role}", not "authenticated" — RLS IS BYPASSED, ` +
        'every result below is meaningless',
    );
    return false;
  }
  if (claims.sub !== expectedSub) {
    fail(label, `token sub is ${claims.sub}, expected ${expectedSub}`);
    return false;
  }

  // Round-trip: proves the token is live and actually accepted by GoTrue, which
  // a locally-crafted string with the right claims would not be.
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const user = await res.json().catch(() => ({}));
  if (res.status !== 200 || user.id !== expectedSub) {
    fail(
      label,
      `GET /auth/v1/user returned ${res.status} / id ${user.id ?? 'null'} — ` +
        'token not accepted as this user',
    );
    return false;
  }

  pass(label);
  return true;
}

// Counts rows from a select, failing loudly on a non-200 rather than reading an
// error body as "zero rows" — see header, third trap.
async function countRows(label, token, path, expected) {
  const { status, body } = await rest(path, { token });
  if (status !== 200 || !Array.isArray(body)) {
    fail(label, `expected 200 + array, got ${status} ${JSON.stringify(body)}`);
    return;
  }
  if (body.length !== expected) {
    fail(label, `got ${body.length} row(s), expected ${expected}`);
    return;
  }
  pass(label);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  loadEnv();
  SUPABASE_URL = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
  ANON_KEY = requireEnv('SUPABASE_ANON_KEY');
  const emailA = requireEnv('RLS_PROOF_A_EMAIL');
  const emailB = requireEnv('RLS_PROOF_B_EMAIL');
  const password = requireEnv('RLS_PROOF_PASSWORD');

  console.log(`Project: ${SUPABASE_URL}`);
  console.log('Signing in as A and B over HTTP…\n');

  const tokenA = await signIn(emailA, password);
  const tokenB = await signIn(emailB, password);

  // ── A: sanity, plus the guard that makes it meaningful ────────────────────
  const aOk = await guard('GUARD: A is authenticated, not service_role', tokenA, USER_A);

  if (aOk) {
    await countRows(
      'A sees own device_ownership row',
      tokenA,
      `device_ownership?select=id&id=eq.${FIXTURE_OWNERSHIP}`,
      1,
    );
    await countRows(
      'A sees own device via ownership',
      tokenA,
      `devices?select=id&id=eq.${FIXTURE_DEVICE}`,
      1,
    );
  }

  // ── B: the actual proof ───────────────────────────────────────────────────
  const bOk = await guard('GUARD: B is authenticated, not service_role', tokenB, USER_B);

  if (bOk) {
    await countRows(
      'B cannot see As device_ownership row',
      tokenB,
      `device_ownership?select=id&id=eq.${FIXTURE_OWNERSHIP}`,
      0,
    );
    await countRows(
      'B cannot see As device',
      tokenB,
      `devices?select=id&id=eq.${FIXTURE_DEVICE}`,
      0,
    );
    await countRows(
      'B cannot see As verification',
      tokenB,
      `verifications?select=user_id&user_id=eq.${USER_A}`,
      0,
    );
    await countRows(
      'B cannot see As push_token',
      tokenB,
      `push_tokens?select=user_id&user_id=eq.${USER_A}`,
      0,
    );

    // The PR #6 vulnerability: B must not be able to self-insert ownership over
    // A's device. Only 42501 counts — see header note (2).
    {
      const label = 'B hijack-insert ownership over As device';
      const { status, body } = await rest('device_ownership', {
        token: tokenB,
        method: 'POST',
        body: { user_id: USER_B, device_id: FIXTURE_DEVICE },
        prefer: 'return=representation',
      });
      if (status >= 200 && status < 300) {
        fail(label, 'insert succeeded, RLS did not block it');
      } else if (body && body.code === '42501') {
        pass(label);
      } else {
        inconclusive(
          label,
          `blocked by something other than RLS — ${status} ${JSON.stringify(body)}`,
        );
      }
    }

    // B must not be able to repoint/rename A's ownership row through the
    // column-restricted UPDATE grant. Over HTTP an RLS-filtered UPDATE is a 200
    // with an empty array, so assert the row count AND re-read as A — the PATCH
    // returning [] alone would also be produced by a predicate that matched
    // nothing for an unrelated reason.
    {
      const label = 'B update-attempt on As ownership row (0 rows affected)';
      const { status, body } = await rest(
        `device_ownership?id=eq.${FIXTURE_OWNERSHIP}`,
        {
          token: tokenB,
          method: 'PATCH',
          body: { nickname: 'hijacked-by-b' },
          prefer: 'return=representation',
        },
      );
      const affected = Array.isArray(body) ? body.length : null;
      if (status >= 400) {
        // A hard denial is also an acceptable outcome, but only via RLS.
        if (body && body.code === '42501') pass(label);
        else inconclusive(label, `${status} ${JSON.stringify(body)}`);
      } else if (affected !== 0) {
        fail(label, `PATCH affected ${affected} row(s)`);
      } else {
        const check = await rest(
          `device_ownership?select=nickname&id=eq.${FIXTURE_OWNERSHIP}`,
          { token: tokenA },
        );
        const nickname = Array.isArray(check.body) && check.body[0]
          ? check.body[0].nickname
          : undefined;
        if (nickname === 'hijacked-by-b') {
          fail(label, 'PATCH reported 0 rows but the nickname WAS changed');
        } else if (check.status !== 200 || check.body?.length !== 1) {
          inconclusive(
            label,
            `could not re-read the row as A: ${check.status} ${JSON.stringify(check.body)}`,
          );
        } else {
          pass(label);
        }
      }
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const width = Math.max(...results.map((r) => r.name.length));
  console.log('');
  for (const r of results) {
    console.log(`${r.name.padEnd(width)}  ${r.result}`);
  }

  const bad = results.filter((r) => r.result !== 'PASS');
  const guards = results.filter((r) => r.name.startsWith('GUARD')).length;
  console.log(
    `\n${results.length - bad.length}/${results.length} PASS ` +
      `(${results.length - guards} checks + ${guards} guards)`,
  );

  if (bad.length > 0) {
    console.error('\nNot all checks passed. Nothing here should be reported as proven.');
    process.exit(1);
  }
  console.log('\nRemember step 3: run the teardown SQL — these fixtures are committed rows.');
}

main().catch((e) => {
  console.error(`\nProof aborted: ${e.message}`);
  process.exit(1);
});
