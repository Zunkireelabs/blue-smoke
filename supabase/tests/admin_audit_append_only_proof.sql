-- AD-1 M1a — proof that `admin_audit_log` is genuinely append-only, even to service role.
--
-- `admin_users`/`admin_audit_log`'s RLS (deny-all, zero policies) only stops CLIENT roles — the
-- service-role key BYPASSES RLS entirely in production, which is exactly why the audit log's
-- immutability cannot depend on RLS at all. It depends on the `admin_audit_log_no_mutate` BEFORE
-- UPDATE/DELETE trigger (20260830120000_admin_identity.sql), which RLS bypass does NOT bypass —
-- triggers fire regardless of role. This proof deliberately runs with row-security BYPASSED (the
-- same posture the service-role key has) to prove the trigger, not RLS, is what's holding.
--
-- ══ HOW THIS TEST CAN LIE ══
--
-- (1) 🔴 RUNNING AS A RESTRICTED ROLE WOULD PASS FOR THE WRONG REASON. If this ran as
-- `authenticated`, the UPDATE/DELETE would fail with `insufficient_privilege` (RLS has zero
-- policies) regardless of whether the trigger works at all — a broken/missing trigger would still
-- report PASS. Mirrors the `revoke_session_proof.sql` CHECK 0 rationale exactly: running
-- privileged when the property under test needs privilege is the failure mode here, not the
-- reverse. CHECK 0 asserts row-security is actually bypassed (superuser/table-owner posture)
-- before trusting anything below.
--
-- (2) THE EXCEPTION MUST BE CAUGHT AND ASSERTED ON MESSAGE, NOT JUST "it threw something". A
-- generic `when others` would also catch an unrelated failure (e.g. a constraint violation from a
-- bad fixture) and misreport it as proof of the append-only guarantee. Every trap here asserts
-- `sqlerrm` names the specific trigger exception.
--
-- HOW TO RUN
--   docker exec -i <pg> psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < this_file
-- Always pass ON_ERROR_STOP=1. Wrapped in BEGIN/ROLLBACK — safe to re-run anywhere.

begin;

create temporary table audit_append_only_results (check_name text, result text) on commit drop;
-- Holds the one fixture row's id so later checks can reference it without a psql meta-command
-- (\gset) that no other proof file in this repo uses.
create temporary table audit_append_only_fixture (fixture_id bigint) on commit drop;

insert into auth.users (id, instance_id, aud, role, email)
values ('a2000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','audit-proof-actor@bluesmoke-test.local');

-- ── Check 0 — THE GUARD: are we actually running with row-security bypassed? ─
insert into audit_append_only_results (check_name, result) select
  'GUARD: running with RLS bypassed (service-role posture), not restricted by policy',
  case when current_user in ('supabase_admin','postgres') or session_user in ('supabase_admin','postgres')
       then 'PASS: running as ' || current_user
       else 'FAIL: running as ' || current_user || ' — an append-only PASS below could be RLS blocking everyone, not the trigger working' end;

-- ── Check 1 — INSERT succeeds ─────────────────────────────────────────────────
do $do$
declare
  new_id bigint;
begin
  insert into admin_audit_log (actor_admin_id, action, outcome, metadata)
  values ('a2000000-0000-0000-0000-000000000001', 'me', 'ok', '{"note":"append_only_proof fixture"}'::jsonb)
  returning id into new_id;
  insert into audit_append_only_fixture (fixture_id) values (new_id);
end
$do$;

insert into audit_append_only_results (check_name, result) select
  'INSERT into admin_audit_log succeeds even with RLS bypassed',
  case when count(*) = 1 then 'PASS: row present'
       else 'FAIL: expected 1 row, got ' || count(*) end
  from admin_audit_log where id = (select fixture_id from audit_append_only_fixture);

-- ── Check 2 — UPDATE must RAISE, even here ────────────────────────────────────
do $do$
declare
  target_id bigint := (select fixture_id from audit_append_only_fixture);
begin
  update admin_audit_log set outcome = 'error' where id = target_id;
  insert into audit_append_only_results (check_name, result) values
    ('UPDATE on admin_audit_log', 'FAIL: update succeeded — the log is not append-only');
exception when others then
  if sqlerrm like '%admin_audit_log is append-only%' then
    insert into audit_append_only_results (check_name, result) values
      ('UPDATE on admin_audit_log', 'PASS: raised by the immutability trigger — ' || sqlerrm);
  else
    insert into audit_append_only_results (check_name, result) values
      ('UPDATE on admin_audit_log', 'INCONCLUSIVE: raised, but not the expected trigger message — ' || sqlerrm);
  end if;
end
$do$;

-- ── Check 3 — DELETE must RAISE, even here ────────────────────────────────────
do $do$
declare
  target_id bigint := (select fixture_id from audit_append_only_fixture);
begin
  delete from admin_audit_log where id = target_id;
  insert into audit_append_only_results (check_name, result) values
    ('DELETE on admin_audit_log', 'FAIL: delete succeeded — the log is not append-only');
exception when others then
  if sqlerrm like '%admin_audit_log is append-only%' then
    insert into audit_append_only_results (check_name, result) values
      ('DELETE on admin_audit_log', 'PASS: raised by the immutability trigger — ' || sqlerrm);
  else
    insert into audit_append_only_results (check_name, result) values
      ('DELETE on admin_audit_log', 'INCONCLUSIVE: raised, but not the expected trigger message — ' || sqlerrm);
  end if;
end
$do$;

-- ── Check 4 — the row survives, completely unchanged, after both attempts ───
-- Deliberately not `group by outcome`: if the row were missing, grouping over zero rows
-- produces zero output rows and this check would silently vanish from the results table
-- instead of reporting FAIL. count(*) and a filtered count together handle "missing" and
-- "mutated" without that trap.
insert into audit_append_only_results (check_name, result) select
  'Row still present and unchanged after failed UPDATE + DELETE',
  case when count(*) = 1 and count(*) filter (where outcome = 'ok') = 1 then 'PASS: row intact, outcome still ok'
       else 'FAIL: row missing or mutated (present: ' || count(*) || ')' end
  from admin_audit_log where id = (select fixture_id from audit_append_only_fixture);

select ctid, check_name, result from audit_append_only_results order by ctid;

-- Nothing above is kept — including the fixture row, which a real append-only table would
-- otherwise retain forever.
rollback;
