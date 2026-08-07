-- v1.5 — proof that `verifications` is READ-ONLY to clients (spec §5.3, inviolable rule 3)
--
-- Spec §5.3 states the requirement in testable form: "MUST be tested with a second user's JWT,
-- and with the row's own owner attempting an UPDATE of provider_status / age_verified — both
-- must fail." This file is that test.
--
-- What it is really proving: before 20260807090000, `insert_own_verifications` let any
-- authenticated user INSERT their own age_verified = true row. `issue-device-session` (§5.4
-- step 2) reads this table to decide whether to release key material, so that policy was a
-- complete bypass of the age gate reachable with nothing but a valid login. Check 1 is the
-- regression test for that specific hole; the rest close the neighbouring ones.
--
-- ⚠️ A TRAP WORTH NAMING, because it makes a broken policy look like a passing test.
-- Denied INSERT and denied UPDATE/DELETE fail in DIFFERENT WAYS under RLS:
--   • INSERT with no permissive INSERT policy RAISES (42501, "new row violates row-level
--     security policy") — so it is caught with an exception handler.
--   • UPDATE/DELETE with no permissive policy of that command type does NOT raise. The row
--     simply is not visible to the command, so it affects ZERO ROWS and returns success.
-- Asserting "it threw" for the UPDATE cases would therefore report FAIL against a correctly
-- locked table, and — far worse — wrapping the UPDATE in a try/catch that treats "no
-- exception" as success would report PASS against a table someone had re-opened for writes.
-- The UPDATE/DELETE checks below assert on the row's VALUE afterwards, which is the only
-- assertion that actually distinguishes the two cases.
--
-- Method mirrors rls_ownership_proof.sql: set the same GUCs PostgREST sets from a decoded
-- JWT (request.jwt.claims / role) before each query, which is the identical code path RLS
-- sees for a real request. Same caveat applies — no custom SMTP yet, so real scripted signups
-- hit the default email rate limit; replace with a live-HTTP version once SMTP is configured.
--
-- Run against a project with migrations 20260806060100, 20260806060200 and 20260807090000
-- applied. Safe to re-run: all fixture ids are fixed UUIDs reserved for this script and every
-- row it creates is deleted at the end.

create temporary table ver_proof_results (check_name text, result text);
grant insert, select on ver_proof_results to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  created_at, updated_at)
values
  ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','ver-proof-a@bluesmoke-test.local','x',now(),'{}','{}',
   false,false,now(),now()),
  ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','ver-proof-b@bluesmoke-test.local','x',now(),'{}','{}',
   false,false,now(),now());

-- Fixture: one PENDING verification for user A, created as the service role — i.e. exactly as
-- `create-inquiry` (§6.2) will create it. age_verified defaults to false, which is the state
-- the whole design depends on being un-forgeable from the client.
insert into verifications (id, user_id, method, inquiry_id, provider_status, app_version, platform)
values ('77777777-7777-7777-7777-777777777777','55555555-5555-5555-5555-555555555555',
        'persona-v1','inq_verproof_fixture','pending','0.0.1','ios');

-- ── Check 1 — THE ONE THAT MATTERS: A cannot self-assert age_verified ────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

do $do$
begin
  insert into verifications (user_id, age_verified, method, app_version, platform)
  values ('55555555-5555-5555-5555-555555555555', true, 'persona-v1','0.0.1','ios');
  insert into ver_proof_results (check_name, result) values
    ('A self-INSERTs age_verified=true', 'FAIL: insert succeeded — the age gate is forgeable');
exception when others then
  insert into ver_proof_results (check_name, result) values
    ('A self-INSERTs age_verified=true', 'PASS: denied — ' || sqlerrm);
end
$do$;

-- ── Check 2 — A cannot promote their own PENDING row to verified ─────────────
-- No exception expected; assert on the value. See the trap note in the header.
update verifications set age_verified = true
  where id = '77777777-7777-7777-7777-777777777777';
insert into ver_proof_results (check_name, result) select
  'A UPDATEs own row age_verified -> true',
  case when (select age_verified from verifications
             where id='77777777-7777-7777-7777-777777777777') is not true
       then 'PASS: still false' else 'FAIL: client promoted its own verification' end;

-- ── Check 3 — A cannot write provider_status (webhook is the sole writer, §5.3) ──
update verifications set provider_status = 'approved'
  where id = '77777777-7777-7777-7777-777777777777';
insert into ver_proof_results (check_name, result) select
  'A UPDATEs own row provider_status',
  case when (select provider_status from verifications
             where id='77777777-7777-7777-7777-777777777777') = 'pending'
       then 'PASS: unchanged' else 'FAIL: client wrote the vendor decision' end;

-- ── Check 4 — A cannot delete a failed verification and retry clean ──────────
delete from verifications where id = '77777777-7777-7777-7777-777777777777';
insert into ver_proof_results (check_name, result) select
  'A DELETEs own verification',
  case when (select count(*) from verifications
             where id='77777777-7777-7777-7777-777777777777') = 1
       then 'PASS: row survives' else 'FAIL: client deleted its own audit trail' end;

-- ── Check 5 — A CAN still read their own row (the one thing clients keep) ────
insert into ver_proof_results (check_name, result) select
  'A SELECTs own verification',
  case when count(*)=1 then 'PASS' else 'FAIL got '||count(*) end
  from verifications where id='77777777-7777-7777-7777-777777777777';

reset role;

-- ── Check 6 — second user's JWT: B sees nothing of A's (spec §5.3 verbatim) ──
set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

insert into ver_proof_results (check_name, result) select
  'B cannot see As verification',
  case when count(*)=0 then 'PASS' else 'FAIL got '||count(*) end from verifications;

-- B must not be able to grant themselves verification by writing A's row either.
update verifications set age_verified = true, provider_status = 'approved'
  where id = '77777777-7777-7777-7777-777777777777';
insert into ver_proof_results (check_name, result) select
  'B UPDATEs As verification',
  case when (select age_verified from verifications
             where id='77777777-7777-7777-7777-777777777777') is not true
       then 'PASS: unchanged' else 'FAIL: cross-user write succeeded' end;

reset role;

-- ── Check 7 — webhook idempotency: a replayed inquiry_id cannot create a 2nd row ──
-- Runs as service role deliberately: persona-webhook IS service role, so the unique index is
-- the only thing standing between a replayed vendor delivery and a duplicate outcome (§8.3).
do $do$
begin
  insert into verifications (user_id, method, inquiry_id, app_version, platform)
  values ('55555555-5555-5555-5555-555555555555','persona-v1','inq_verproof_fixture','0.0.1','ios');
  insert into ver_proof_results (check_name, result) values
    ('Replayed inquiry_id rejected', 'FAIL: duplicate inquiry_id inserted');
exception when unique_violation then
  insert into ver_proof_results (check_name, result) values
    ('Replayed inquiry_id rejected', 'PASS: unique index held');
end
$do$;

-- ── Cleanup ─────────────────────────────────────────────────────────────────
delete from verifications where user_id in ('55555555-5555-5555-5555-555555555555');
delete from auth.users where id in ('55555555-5555-5555-5555-555555555555',
                                    '66666666-6666-6666-6666-666666666666');

select ctid, check_name, result from ver_proof_results order by ctid;
