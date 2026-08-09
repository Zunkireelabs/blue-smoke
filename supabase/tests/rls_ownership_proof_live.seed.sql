-- P0-3.0 — Step 1 of 3 for the live-HTTP RLS proof. SERVICE ROLE / SQL EDITOR ONLY.
-- Partner files: `rls_ownership_proof_live.mjs` (step 2), `…teardown.sql` (step 3).
--
-- ⚠️ These fixtures are COMMITTED rows, not a BEGIN/ROLLBACK transaction like
-- `rls_ownership_proof.sql`. Step 3 is mandatory — see the teardown file.
--
-- WHY THIS CANNOT BE PART OF THE SCRIPT: as user A over the anon key, creating
-- these rows is *not permitted*, and that is exactly what the proof establishes.
-- `device_ownership` denies client INSERT outright (the PR #6 ownership-squat fix)
-- and `verifications` lost its INSERT policy in `20260807090000` (the age-gate fix).
-- A proof able to seed its own fixtures would be evidence the holes were still open.
--
-- Run against dev (hejwrhijrztgdysycvto) via the Supabase MCP server's
-- `execute_sql`, or the dashboard SQL editor. The service-role key stays there and
-- never enters this repo, the script, or a shell environment.
--
-- Users A and B are pre-existing dashboard-created accounts with Auto Confirm on —
-- this script does NOT create them, and the signup path is therefore not exercised
-- anywhere in this proof. See the .mjs header.
--   A  60bbe9c9-2d2a-4823-8f35-669f4d2e1592
--   B  55b18ad2-0d2a-4ca4-bdd3-787e9d80d834

-- One device, owned by A only — as `issue-device-session` (§5.4 step 4) would
-- create it server-side. B is deliberately given nothing to own.
insert into devices (id, serial_hash) values
  ('3f3f3f3f-0000-4000-8000-000000000001', 'rls-proof-live-fixture-hash')
on conflict (id) do nothing;

insert into device_ownership (id, user_id, device_id) values
  ('3f3f3f3f-0000-4000-8000-000000000002',
   '60bbe9c9-2d2a-4823-8f35-669f4d2e1592',
   '3f3f3f3f-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into push_tokens (user_id, token, platform) values
  ('60bbe9c9-2d2a-4823-8f35-669f4d2e1592', 'rls-proof-live-token-a', 'ios')
on conflict do nothing;

-- v1.5 Persona-shaped row. `inquiry_id` is a fixture string, not a real inquiry —
-- it re-identifies nothing, which is the only reason it is safe to commit here
-- (CLAUDE.md, verification rule 1).
insert into verifications
  (user_id, age_verified, method, inquiry_id, provider_status, app_version, platform, outcome_reason)
values
  ('60bbe9c9-2d2a-4823-8f35-669f4d2e1592', true, 'persona-v1',
   'inq_rlsproof_live_fixture', 'approved', '0.0.1', 'ios', 'pass')
on conflict do nothing;

-- Confirm what was actually created before running step 2. If any count is 0 the
-- proof will produce a false negative that looks like a security pass.
select 'devices'          as fixture, count(*) from devices          where id = '3f3f3f3f-0000-4000-8000-000000000001'
union all
select 'device_ownership', count(*) from device_ownership where id = '3f3f3f3f-0000-4000-8000-000000000002'
union all
select 'push_tokens',      count(*) from push_tokens      where token = 'rls-proof-live-token-a'
union all
select 'verifications',    count(*) from verifications    where inquiry_id = 'inq_rlsproof_live_fixture';
