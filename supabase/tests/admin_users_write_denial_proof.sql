-- AD-1 M1a — proof that `admin_users` / `admin_audit_log` are deny-all to clients.
--
-- `admin_users` and `admin_audit_log` (20260830120000_admin_identity.sql) get RLS ENABLED with
-- ZERO POLICIES — the same deny-all pattern `device_keys` uses. This proof exercises what a
-- *client* (the `authenticated` role, not service role) can do to either table: nothing.
--
-- ══ HOW THIS TEST CAN LIE (mirrors verifications_write_denial_proof.sql / revoke_session_proof.sql) ══
--
-- (1) 🔴 RUNNING AS THE TABLE OWNER SILENTLY DISABLES RLS. The whole script runs inside ONE
-- explicit transaction, because `SET LOCAL` outside a transaction block is a silent NO-OP (only a
-- WARNING, easy to miss in script output) — every check would then run as the superuser/table
-- owner, which BYPASSES row-level security completely and reports PASS while proving nothing.
-- CHECK 0 asserts `current_user` really is `authenticated` before any denial below is trusted.
--
-- (2) DENIED INSERT AND DENIED UPDATE/SELECT FAIL IN DIFFERENT WAYS.
--   • INSERT with no permissive INSERT policy RAISES (42501) — caught with an exception handler.
--   • UPDATE/SELECT with no permissive policy do NOT raise. The row is simply invisible to the
--     command, so it affects/returns ZERO ROWS and reports success.
-- Every check here asserts on ROW COUNTS / VALUES, never on "did it throw" for the UPDATE/SELECT
-- cases — treating "no exception" as failure there would report FAIL against a correctly locked
-- table.
--
-- HOW TO RUN
--   docker exec -i <pg> psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < this_file
-- Always pass ON_ERROR_STOP=1. Wrapped in BEGIN/ROLLBACK — safe to re-run anywhere.

begin;

create temporary table admin_users_proof_results (check_name text, result text) on commit drop;
grant insert, select on admin_users_proof_results to authenticated;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('a1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','admin-proof-nonadmin@bluesmoke-test.local'),
  ('a1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','admin-proof-target@bluesmoke-test.local');

-- A real admin row, seeded as the (still-privileged) transaction owner — stands in for the
-- service-role seed described in supabase/README.md. Not the row under test; it exists so
-- "SELECT from admin_users" below has a non-empty table to be denied against, which is a
-- stronger proof than an empty-table vacuous pass.
insert into admin_users (id, role, note)
values ('a1000000-0000-0000-0000-000000000002', 'superadmin', 'admin_users_proof fixture');

-- ── Become a non-admin authenticated client ──────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);

-- ── Check 0 — THE GUARD: are we actually un-privileged? ──────────────────────
insert into admin_users_proof_results (check_name, result) select
  'GUARD: running as authenticated, not table owner',
  case when current_user = 'authenticated' and auth.uid() = 'a1000000-0000-0000-0000-000000000001'
       then 'PASS'
       else 'FAIL: running as ' || current_user || ' / uid ' || coalesce(auth.uid()::text,'null')
            || ' — RLS IS BYPASSED, every result below is meaningless' end;

-- ── Check 1 — a client cannot INSERT into admin_users (self-promotion) ───────
do $do$
begin
  insert into admin_users (id, role, note)
  values ('a1000000-0000-0000-0000-000000000001', 'superadmin', 'self-promoted');
  insert into admin_users_proof_results (check_name, result) values
    ('Client INSERT into admin_users', 'FAIL: insert succeeded — a client can self-promote to admin');
exception when insufficient_privilege then
  insert into admin_users_proof_results (check_name, result) values
    ('Client INSERT into admin_users', 'PASS: denied by RLS — ' || sqlerrm);
when others then
  -- Not counted as a pass — an FK/not-null error would land here too and would prove nothing
  -- about RLS. Same discipline as verifications_write_denial_proof.sql Check 1.
  insert into admin_users_proof_results (check_name, result) values
    ('Client INSERT into admin_users', 'INCONCLUSIVE: blocked by something other than RLS — ' || sqlerrm);
end
$do$;

-- ── Check 2 — a client cannot UPDATE an existing admin_users row ─────────────
-- No exception expected (note 2 above): a denied UPDATE affects zero rows and returns success.
-- The value assertion happens after `reset role`, below.
update admin_users set role = 'readonly' where id = 'a1000000-0000-0000-0000-000000000002';

-- ── Check 3 — a client cannot SELECT admin_users, even a row that exists ─────
insert into admin_users_proof_results (check_name, result) select
  'Client SELECT admin_users returns 0 rows',
  case when count(*) = 0 then 'PASS: 0 rows visible' else 'FAIL: got ' || count(*) || ' rows' end
  from admin_users;

-- ── Check 4 — a client cannot INSERT into admin_audit_log ────────────────────
do $do$
begin
  insert into admin_audit_log (actor_admin_id, action, outcome)
  values ('a1000000-0000-0000-0000-000000000001', 'me', 'ok');
  insert into admin_users_proof_results (check_name, result) values
    ('Client INSERT into admin_audit_log', 'FAIL: insert succeeded — a client can forge an audit row');
exception when insufficient_privilege then
  insert into admin_users_proof_results (check_name, result) values
    ('Client INSERT into admin_audit_log', 'PASS: denied by RLS — ' || sqlerrm);
when others then
  insert into admin_users_proof_results (check_name, result) values
    ('Client INSERT into admin_audit_log', 'INCONCLUSIVE: blocked by something other than RLS — ' || sqlerrm);
end
$do$;

-- ── Check 5 — a client cannot SELECT admin_audit_log ─────────────────────────
insert into admin_users_proof_results (check_name, result) select
  'Client SELECT admin_audit_log returns 0 rows',
  case when count(*) = 0 then 'PASS: 0 rows visible' else 'FAIL: got ' || count(*) || ' rows' end
  from admin_audit_log;

reset role;

-- ── Verdict for Check 2, read back as owner ──────────────────────────────────
insert into admin_users_proof_results (check_name, result) select
  'Client UPDATE of admin_users.role did not take effect',
  case when role = 'superadmin' then 'PASS: role unchanged'
       else 'FAIL: client demoted/altered an admin row, role is now ' || role end
  from admin_users where id = 'a1000000-0000-0000-0000-000000000002';

select ctid, check_name, result from admin_users_proof_results order by ctid;

-- Nothing above is kept. Fixtures, results table and all writes disappear here.
rollback;
