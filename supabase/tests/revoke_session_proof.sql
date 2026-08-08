-- `revoke-device-session` proof — spec §5.4.1, execution brief §5 / §7.1-§7.3.
--
-- `device_sessions` has RLS enabled but NO client UPDATE policy at all (§5.3): the endpoint
-- runs as service role, which bypasses RLS entirely, and the `user_id = <caller>` predicate in
-- the UPDATE's WHERE clause is the WHOLE authorisation model — there is no RLS backstop if
-- that predicate is ever dropped or weakened. That means this proof is deliberately NOT an RLS
-- test: it exercises the exact predicate `revoke-device-session/index.ts` builds, run with the
-- same bypass-RLS privilege the service-role key has, against fixtures seeded through the same
-- `\x`-prefixed bytea representation `issue-device-session` writes.
--
-- ══ HOW THIS PROOF COULD LIE, IF WRITTEN CARELESSLY (mirrors verifications_write_denial_proof.sql) ══
--
-- (1) 🔴 TESTING AS `authenticated` WOULD PASS FOR THE WRONG REASON. Because there is no
-- permissive UPDATE policy on this table AT ALL, running these checks as the `authenticated`
-- role would make every UPDATE affect zero rows regardless of which predicate was used — "B
-- cannot revoke A's session" would report PASS even against a broken index.ts that dropped the
-- `user_id` predicate entirely, because RLS would still block B from touching the row. That is
-- the mirror image of the bug the sibling proof files guard against: there, running privileged
-- when you should be restricted hides a real hole; here, running restricted when you should be
-- privileged hides the same class of hole behind an unrelated wall. So CHECK 0 asserts we are
-- running with row-security bypassed (`current_setting('row_security')` off, or superuser/table
-- owner) — i.e. the same posture the service-role key has in production — before any denial or
-- isolation result below is trusted. If that guard fails, everything below is meaningless.
--
-- (2) DENIED/NO-MATCH UPDATE DOES NOT RAISE. Exactly as the sibling proof documents: a WHERE
-- clause that matches nothing returns success with zero rows affected, not an exception. Every
-- check here asserts on the row's VALUE (`revoked_at`) afterwards, never on "did it throw".
--
-- (3) 🔴 `now()` IS TRANSACTION-SCOPED, SO IT CANNOT DETECT A SECOND WRITE INSIDE begin;…rollback;.
-- Postgres freezes `now()` at transaction start; it does not advance between statements in the
-- same transaction, `pg_sleep()` included. This file originally used `now()` in the idempotency
-- check (Check 2) and a `pg_sleep(0.01)` it claimed would "guarantee a distinguishable now() if
-- the guard below is wrong" — that comment was simply mistaken. Both UPDATEs in that check wrote
-- the identical frozen timestamp, so `first_revoked_at = second_revoked_at` held whether or not
-- the second UPDATE's `revoked_at is null` predicate actually fired: with that predicate deleted
-- entirely, the check still reported PASS, proving nothing. Every UPDATE below now uses
-- `clock_timestamp()`, which reads the real wall clock at each call — the same thing `new
-- Date()` gives `index.ts` on every request, a fresh value per call rather than one value fixed
-- for the whole transaction.
--
-- Session ids are seeded via the literal `\x<hex>` bytea representation
-- `issue-device-session` writes (`session_id: \`\\x${toHex(sessionId)}\``) — see §7.1. Seeding
-- some other way (e.g. `decode(hex,'hex')` alone, without going through the same string form)
-- would prove nothing about the mismatch that endpoint is actually at risk of.
--
-- HOW TO RUN
--   docker exec -i <pg> psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < this_file
-- Always pass ON_ERROR_STOP=1. Wrapped in BEGIN/ROLLBACK — safe to re-run anywhere.

begin;

create temporary table revoke_proof_results (check_name text, result text) on commit drop;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('88888888-8888-8888-8888-888888888888','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','revoke-proof-a@bluesmoke-test.local'),
  ('99999999-9999-9999-9999-999999999999','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','revoke-proof-b@bluesmoke-test.local');

insert into devices (id, serial_hash) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','revoke-proof-fixture-hash');

-- User A: two active sessions. User B: one active session. Session ids seeded as the exact
-- `\x`-prefixed hex literal issue-device-session writes (§7.1) — NOT via decode()/bytea-array
-- syntax, which would sidestep the very mismatch this proof exists to catch.
insert into device_sessions (session_id, user_id, device_id, expires_at) values
  ('\xa1000000000000000000000000000001', '88888888-8888-8888-8888-888888888888',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() + interval '30 days'),
  ('\xa1000000000000000000000000000002', '88888888-8888-8888-8888-888888888888',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() + interval '30 days'),
  ('\xb2000000000000000000000000000001', '99999999-9999-9999-9999-999999999999',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() + interval '30 days');

-- ── Check 0 — THE GUARD: are we actually testing with RLS bypassed? ──────────
-- See note (1) above. `supabase_admin` here stands in for the `service_role` Postgres role,
-- which is granted BYPASSRLS in a real project; both mean the isolation proven below comes
-- from the WHERE clause, not from Postgres refusing the statement outright.
insert into revoke_proof_results (check_name, result) select
  'GUARD: running with RLS bypassed (service-role posture), not restricted by policy',
  case when current_user in ('supabase_admin','postgres') or session_user in ('supabase_admin','postgres')
       then 'PASS: running as ' || current_user
       else 'FAIL: running as ' || current_user || ' — an isolation PASS below could be RLS blocking everyone, not the predicate working' end;

-- ── Check 1 (§7.1) — a REAL row is actually revoked, not a 404-shaped no-op ──
-- This is exactly the single-session branch of index.ts:
--   UPDATE device_sessions SET revoked_at = now()
--     WHERE session_id = $1 AND user_id = $2 AND revoked_at is null
-- using the same \x-prefixed literal issue-device-session writes and index.ts's
-- toByteaLiteral() would produce.
update device_sessions set revoked_at = clock_timestamp()
  where session_id = '\xa1000000000000000000000000000001'
    and user_id = '88888888-8888-8888-8888-888888888888'
    and revoked_at is null;

insert into revoke_proof_results (check_name, result) select
  '§7.1: single-session revoke via \x-prefixed hex actually revokes the row',
  case when revoked_at is not null then 'PASS: revoked_at is set'
       else 'FAIL: revoked_at still null — the \x literal did not match, exactly the silent-404 trap' end
  from device_sessions where session_id = '\xa1000000000000000000000000000001';

-- ── Check 2 — idempotency: a second revoke of the same session touches nothing ──
-- The predicate includes `revoked_at is null`, so a second attempt affects zero rows and
-- revoked_at must not move. Uses `clock_timestamp()`, not `now()` — see note (3) in the header:
-- `now()` is frozen for the whole transaction, so both UPDATEs would write the same value and
-- this check would report PASS regardless of whether the predicate worked. No `pg_sleep` is
-- needed to make the two calls distinguishable — `clock_timestamp()` already reads the live
-- clock on each call, milliseconds apart is enough.
do $do$
declare
  first_revoked_at timestamptz;
  second_revoked_at timestamptz;
begin
  select revoked_at into first_revoked_at from device_sessions
    where session_id = '\xa1000000000000000000000000000001';

  update device_sessions set revoked_at = clock_timestamp()
    where session_id = '\xa1000000000000000000000000000001'
      and user_id = '88888888-8888-8888-8888-888888888888'
      and revoked_at is null;

  select revoked_at into second_revoked_at from device_sessions
    where session_id = '\xa1000000000000000000000000000001';

  insert into revoke_proof_results (check_name, result) values
    ('Idempotency: re-revoking an already-revoked session does not move revoked_at',
     case when first_revoked_at = second_revoked_at then 'PASS: unchanged'
          else 'FAIL: revoked_at moved on a second attempt' end);
end
$do$;

-- ── Check 3 (§7.2 / §7.3) — B cannot revoke A's session via a guessed/known session_id ──
-- Same shape as index.ts's single-session branch, run as B (user_id = B's id) against A's
-- still-active second session. Must affect zero rows.
update device_sessions set revoked_at = clock_timestamp()
  where session_id = '\xa1000000000000000000000000000002'
    and user_id = '99999999-9999-9999-9999-999999999999'
    and revoked_at is null;

insert into revoke_proof_results (check_name, result) select
  '§7.2/§7.3: B cannot revoke As session (user_id predicate is the only authz)',
  case when revoked_at is null then 'PASS: As session untouched by Bs request'
       else 'FAIL: cross-user revoke succeeded — the user_id predicate is not doing its job' end
  from device_sessions where session_id = '\xa1000000000000000000000000000002';

-- ── Check 4 (§5 bulk isolation) — revoke-all as A only touches As rows ───────
-- Same shape as index.ts's bulk branch (`session_id` omitted): no session_id predicate, only
-- user_id + revoked_at is null. Seed state: A has one still-active session (…02), B has one
-- active session (…01). Revoke-all as A must leave B's completely alone.
update device_sessions set revoked_at = clock_timestamp()
  where user_id = '88888888-8888-8888-8888-888888888888'
    and revoked_at is null;

insert into revoke_proof_results (check_name, result) select
  'Bulk revoke-all as A: As remaining active session is now revoked',
  case when count(*) = 0 then 'PASS: no active sessions remain for A'
       else 'FAIL: ' || count(*) || ' of As sessions still active' end
  from device_sessions
  where user_id = '88888888-8888-8888-8888-888888888888' and revoked_at is null;

insert into revoke_proof_results (check_name, result) select
  'Bulk-revoke isolation: Bs active session survives As revoke-all',
  case when revoked_at is null then 'PASS: Bs session still active'
       else 'FAIL: As bulk revoke reached into Bs session' end
  from device_sessions where session_id = '\xb2000000000000000000000000000001';

select ctid, check_name, result from revoke_proof_results order by ctid;

-- Nothing above is kept. Fixtures, results table and all writes disappear here.
rollback;
