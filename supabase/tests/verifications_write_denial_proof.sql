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
-- ══ TWO WAYS THIS TEST CAN LIE, BOTH OF WHICH IT HAS ACTUALLY DONE ══
--
-- (1) 🔴 RUNNING AS THE TABLE OWNER SILENTLY DISABLES RLS.
-- The whole script must run inside ONE explicit transaction. `SET LOCAL` outside a transaction
-- block is a NO-OP that emits only a WARNING ("SET LOCAL can only be used in transaction
-- blocks") — psql runs each statement in its own implicit transaction, so `set local role
-- authenticated` silently does nothing and every check then runs as the superuser/table owner,
-- which BYPASSES row-level security completely. The first version of this file did exactly
-- that: it reported PASS on the age-gate check while proving nothing at all.
-- That is why CHECK 0 exists. It asserts `current_user` really is `authenticated` before any
-- denial is claimed, so the failure mode is a loud FAIL rather than a green tick.
--
-- (2) DENIED INSERT AND DENIED UPDATE/DELETE FAIL IN DIFFERENT WAYS.
--   • INSERT with no permissive INSERT policy RAISES (42501) — caught with an exception handler.
--   • UPDATE/DELETE with no permissive policy do NOT raise. The row is simply invisible to the
--     command, so it affects ZERO ROWS and returns success.
-- Asserting "it threw" for the UPDATE cases would report FAIL against a correctly locked table;
-- treating "no exception" as success would report PASS against a table someone had re-opened
-- for writes. The UPDATE/DELETE checks assert on the row's VALUE afterwards, which is the only
-- assertion that separates those two cases.
--
-- PORTABILITY: the auth.users fixture inserts only columns that exist in BOTH a real Supabase
-- project and the bare supabase/postgres image (whose auth.users is a pre-GoTrue stub without
-- email_confirmed_at / is_sso_user / is_anonymous). Do not add columns here without checking
-- both, or the test stops running in the cheap local harness.
--
-- HOW TO RUN
--   Local, no project needed:
--     docker exec -i <pg> psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < this_file
--   Against dev/staging: `supabase db query` or psql with a service-role connection.
-- Always pass ON_ERROR_STOP=1 — without it psql skips a failed fixture and carries on
-- reporting checks that never ran against the state they claim.
--
-- The whole run is wrapped in BEGIN/ROLLBACK, so it creates no lasting rows and is safe to
-- re-run anywhere, including production.

begin;

create temporary table ver_proof_results (check_name text, result text) on commit drop;
grant insert, select on ver_proof_results to authenticated;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','ver-proof-a@bluesmoke-test.local'),
  ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','ver-proof-b@bluesmoke-test.local');

-- Fixture: one PENDING verification for user A, created as the service role — i.e. exactly as
-- `create-inquiry` (§6.2) will create it. age_verified defaults to false, which is the state
-- the whole design depends on being un-forgeable from the client.
insert into verifications (id, user_id, method, inquiry_id, provider_status, app_version, platform)
values ('77777777-7777-7777-7777-777777777777','55555555-5555-5555-5555-555555555555',
        'persona-v1','inq_verproof_fixture','pending','0.0.1','ios');

-- ── Become user A ────────────────────────────────────────────────────────────
set local role authenticated;
-- Both forms, deliberately. A real Supabase project's auth.uid() reads the `request.jwt.claims`
-- JSON; the bare supabase/postgres image's auth.uid() reads the legacy dotted
-- `request.jwt.claim.sub`. Setting only one makes auth.uid() return NULL in the other
-- environment, which silently turns every "own row" check into a vacuous pass/fail.
select set_config('request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);

-- ── Check 0 — THE GUARD: are we actually un-privileged? ──────────────────────
-- Every denial below is meaningless if this fails. See note (1) in the header.
insert into ver_proof_results (check_name, result) select
  'GUARD: running as authenticated, not table owner',
  case when current_user = 'authenticated' and auth.uid() = '55555555-5555-5555-5555-555555555555'
       then 'PASS'
       else 'FAIL: running as ' || current_user || ' / uid ' || coalesce(auth.uid()::text,'null')
            || ' — RLS IS BYPASSED, every result below is meaningless' end;

-- ── Check 1 — THE ONE THAT MATTERS: A cannot self-assert age_verified ────────
do $do$
begin
  insert into verifications (user_id, age_verified, method, app_version, platform)
  values ('55555555-5555-5555-5555-555555555555', true, 'persona-v1','0.0.1','ios');
  insert into ver_proof_results (check_name, result) values
    ('A self-INSERTs age_verified=true', 'FAIL: insert succeeded — the age gate is forgeable');
exception when insufficient_privilege then
  insert into ver_proof_results (check_name, result) values
    ('A self-INSERTs age_verified=true', 'PASS: denied by RLS — ' || sqlerrm);
when others then
  -- Deliberately NOT counted as a pass. An FK or not-null error would also land here and
  -- would prove nothing about RLS; the first version of this file passed for exactly that
  -- wrong reason.
  insert into ver_proof_results (check_name, result) values
    ('A self-INSERTs age_verified=true',
     'INCONCLUSIVE: blocked by something other than RLS — ' || sqlerrm);
end
$do$;

-- ── Checks 2-4 — A attempts every write it might want ────────────────────────
-- No exception expected from any of these; a denied UPDATE/DELETE affects zero rows and
-- returns success (note (2) in the header). The VALUE assertions are deliberately deferred
-- until after `reset role` below: while acting as A the row may legitimately be invisible,
-- and a subquery over an invisible row returns NULL, which would score as a failure whether
-- or not the write landed. Reading back as owner is the only way to tell "denied" from
-- "succeeded".
update verifications set age_verified    = true       where id = '77777777-7777-7777-7777-777777777777';
update verifications set provider_status = 'approved' where id = '77777777-7777-7777-7777-777777777777';
delete from verifications                             where id = '77777777-7777-7777-7777-777777777777';

-- ── Check 5 — A CAN still read their own row (the one thing clients keep) ────
insert into ver_proof_results (check_name, result) select
  'A SELECTs own verification',
  case when count(*)=1 then 'PASS' else 'FAIL got '||count(*) end
  from verifications where id='77777777-7777-7777-7777-777777777777';

reset role;

-- ── Verdicts for checks 2-4, read back as owner ──────────────────────────────
insert into ver_proof_results (check_name, result) select
  'A UPDATEs own row age_verified -> true',
  case when age_verified = false then 'PASS: still false'
       else 'FAIL: client promoted its own verification' end
  from verifications where id='77777777-7777-7777-7777-777777777777';

insert into ver_proof_results (check_name, result) select
  'A UPDATEs own row provider_status',
  case when provider_status = 'pending' then 'PASS: unchanged'
       else 'FAIL: client wrote the vendor decision' end
  from verifications where id='77777777-7777-7777-7777-777777777777';

insert into ver_proof_results (check_name, result) select
  'A DELETEs own verification',
  case when count(*)=1 then 'PASS: row survives'
       else 'FAIL: client deleted its own audit trail' end
  from verifications where id='77777777-7777-7777-7777-777777777777';

-- ── Become user B — the "second user's JWT" §5.3 requires by name ────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);

insert into ver_proof_results (check_name, result) select
  'GUARD: B is authenticated, not table owner',
  case when current_user = 'authenticated' and auth.uid() = '66666666-6666-6666-6666-666666666666'
       then 'PASS' else 'FAIL: running as ' || current_user || ' — RLS IS BYPASSED' end;

insert into ver_proof_results (check_name, result) select
  'B cannot see As verification',
  case when count(*)=0 then 'PASS' else 'FAIL got '||count(*) end from verifications;

-- B must not be able to grant themselves verification by writing A's row either.
update verifications set age_verified = true, provider_status = 'approved'
  where id = '77777777-7777-7777-7777-777777777777';

reset role;

-- Read back as owner: B's write must have changed nothing. Checked AFTER reset role,
-- because under B's own RLS the row is invisible and the check would pass trivially.
insert into ver_proof_results (check_name, result) select
  'B UPDATEs As verification',
  case when age_verified = false and provider_status = 'pending'
       then 'PASS: unchanged' else 'FAIL: cross-user write succeeded' end
  from verifications where id='77777777-7777-7777-7777-777777777777';

-- ── Check 7 — webhook idempotency: a replayed inquiry_id cannot create a 2nd row ──
-- Runs as owner deliberately: persona-webhook IS service role, so the unique index is the
-- only thing standing between a replayed vendor delivery and a duplicate outcome (§8.3).
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

select ctid, check_name, result from ver_proof_results order by ctid;

-- Nothing above is kept. Fixtures, results table and all writes disappear here.
rollback;
