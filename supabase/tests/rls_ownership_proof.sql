-- P0-3.0 — RLS proof: "tested with a second user's JWT" (TODO-phase-0.md, P0-3.0)
--
-- Creates two throwaway auth.users rows, seeds one device owned by user A only, then
-- simulates each user's request by setting the same GUCs PostgREST sets from a decoded
-- real JWT (request.jwt.claims / role) before running a query — see auth.uid()'s own
-- definition, which reads exactly those GUCs. This exercises the identical code path RLS
-- policies see for a real request; it differs from a live end-to-end test only in that the
-- JWT itself isn't fetched over the wire from GoTrue.
--
-- Why not real signups: this project has no custom SMTP configured yet (see README's "not
-- yet done" list), so the default project email rate limit throttles scripted signups almost
-- immediately (`429 over_email_send_rate_limit`). Once SMTP is configured, replace this with
-- a live-HTTP version that signs up two real users and calls PostgREST with their access
-- tokens directly — that is a strictly stronger proof and should supersede this file.
--
-- Run via `mcp__supabase__execute_sql` or `psql`/`supabase db query` against a project where
-- migrations 20260806060100 and 20260806060200 are already applied. Safe to re-run: every
-- fixture row it creates is deleted at the end, and it never touches non-fixture data (all
-- ids below are fixed UUIDs reserved for this script).
--
-- Last run: 2026-08-05 against dev (hejwrhijrztgdysycvto) — all 8 checks PASS. See
-- supabase/README.md "RLS proof" section for the recorded output.

create temporary table rls_proof_results (check_name text, result text);
grant insert, select on rls_proof_results to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','rls-proof-a@bluesmoke-test.local','x',now(),'{}','{}',
   false,false,now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','rls-proof-b@bluesmoke-test.local','x',now(),'{}','{}',
   false,false,now(),now());

-- Fixture: one device, owned by user A only (as issue-device-session would create it server-side).
insert into devices (id, serial_hash) values
  ('33333333-3333-3333-3333-333333333333','rls-proof-fixture-hash');
insert into device_ownership (id, user_id, device_id) values
  ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333');
insert into push_tokens (user_id, token, platform) values
  ('11111111-1111-1111-1111-111111111111','rls-proof-token-a','ios');
insert into verifications (user_id, age_verified, method, threshold_version, app_version, platform, outcome_reason)
values
  ('11111111-1111-1111-1111-111111111111', true, 'ondevice-mlkit-v1','facematch-tau-0.62','0.0.1','ios','pass');

-- ── Sanity check: user A sees their own rows ─────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into rls_proof_results (check_name, result) select
  'A sees own device_ownership row', case when count(*)=1 then 'PASS' else 'FAIL got '||count(*) end from device_ownership;
insert into rls_proof_results (check_name, result) select
  'A sees own device via ownership', case when count(*)=1 then 'PASS' else 'FAIL got '||count(*) end from devices;

reset role;

-- ── The proof: user B (a second, unrelated JWT) must not see any of A's rows ─
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

insert into rls_proof_results (check_name, result) select
  'B cannot see As device_ownership row', case when count(*)=0 then 'PASS' else 'FAIL got '||count(*) end from device_ownership;
insert into rls_proof_results (check_name, result) select
  'B cannot see As device', case when count(*)=0 then 'PASS' else 'FAIL got '||count(*) end from devices;
insert into rls_proof_results (check_name, result) select
  'B cannot see As verification', case when count(*)=0 then 'PASS' else 'FAIL got '||count(*) end from verifications;
insert into rls_proof_results (check_name, result) select
  'B cannot see As push_token', case when count(*)=0 then 'PASS' else 'FAIL got '||count(*) end from push_tokens;

-- The PR #6 vulnerability this migration set out to close: B must not be able to
-- self-insert ownership over A's device (no INSERT policy on device_ownership at all).
do $do$
begin
  insert into device_ownership (user_id, device_id) values
    ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
  insert into rls_proof_results (check_name, result) values
    ('B hijack-insert ownership over As device', 'FAIL: insert succeeded, RLS did not block it');
exception when others then
  insert into rls_proof_results (check_name, result) values
    ('B hijack-insert ownership over As device', 'PASS: denied — ' || sqlerrm);
end
$do$;

-- B must not be able to repoint As ownership row at a device_id of Bs choosing via the
-- nickname/revoked_at-only column grant (WITH CHECK can't see the OLD row, so this is what
-- the migration's comment says actually stops it).
update device_ownership set nickname = 'hijacked-by-b' where id = '44444444-4444-4444-4444-444444444444';
insert into rls_proof_results (check_name, result) select
  'B update-attempt on As ownership row (0 rows should be affected)',
  case when (select count(*) from device_ownership where id='44444444-4444-4444-4444-444444444444' and nickname='hijacked-by-b') = 0
       then 'PASS' else 'FAIL: nickname was changed' end;

reset role;

-- ── Cleanup: remove every throwaway row this script created ──────────────
delete from device_ownership where id = '44444444-4444-4444-4444-444444444444';
delete from push_tokens where user_id in ('11111111-1111-1111-1111-111111111111');
delete from verifications where user_id in ('11111111-1111-1111-1111-111111111111');
delete from devices where id = '33333333-3333-3333-3333-333333333333';
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');

select ctid, check_name, result from rls_proof_results order by ctid;
