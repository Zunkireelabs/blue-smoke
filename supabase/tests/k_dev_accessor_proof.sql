-- Proof that `get_device_key_material` cannot be reached by a client (§5.4 step 5).
--
-- This function is SECURITY DEFINER and reads Vault, so its EXECUTE grants are the entire
-- security boundary. Postgres grants EXECUTE to PUBLIC by default on CREATE FUNCTION: if the
-- REVOKE in migration 20260807120000 were ever dropped, this function would be callable over
-- PostgREST by an ANONYMOUS request and would hand out K_dev. Nothing else in the schema
-- would look wrong, and no other test would fail.
--
-- Checks 2 and 3 are the ones that matter. They are worth more than reading the migration,
-- because a later `create or replace function` REISSUES the default PUBLIC grant unless the
-- revokes are repeated — which is a very easy way to silently undo this.
--
-- Wrapped in BEGIN/ROLLBACK: creates nothing lasting, safe to re-run anywhere.
-- Run with ON_ERROR_STOP=1, or a failed fixture silently skips the checks below it.

begin;

create temporary table kdev_proof_results (check_name text, result text) on commit drop;
grant insert, select on kdev_proof_results to authenticated, anon;

insert into auth.users (id, instance_id, aud, role, email)
values ('88888888-8888-8888-8888-888888888888','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','kdev-proof@bluesmoke-test.local');

insert into devices (id, serial_hash)
values ('99999999-9999-9999-9999-999999999999','kdev-proof-fixture-hash');

do $do$
declare v_secret_id uuid;
begin
  -- 16 bytes of hex, matching the encoding get_device_key_material decodes.
  select vault.create_secret('000102030405060708090a0b0c0d0e0f', 'kdev-proof-secret',
                             'k_dev accessor proof — deleted with the transaction')
    into v_secret_id;
  insert into device_keys (device_id, k_dev_secret_id)
  values ('99999999-9999-9999-9999-999999999999', v_secret_id);
end
$do$;

-- ── Check 1 — the happy path: the owner/service role gets the key back ──────
-- Establishes the function actually works, so a PASS on checks 2-3 means "denied" rather
-- than "broken for everyone".
insert into kdev_proof_results (check_name, result) select
  'service role unwraps K_dev',
  case when encode(k_dev, 'hex') = '000102030405060708090a0b0c0d0e0f'
       then 'PASS' else 'FAIL: got ' || coalesce(encode(k_dev,'hex'),'null') end
  from public.get_device_key_material('99999999-9999-9999-9999-999999999999');

-- ── Check 2 — 🔴 an authenticated user must NOT be able to call it ──────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);

insert into kdev_proof_results (check_name, result) select
  'GUARD: running as authenticated, not owner',
  case when current_user = 'authenticated' then 'PASS'
       else 'FAIL: running as ' || current_user || ' — this proves nothing' end;

do $do$
declare v_key bytea;
begin
  select k_dev into v_key
  from public.get_device_key_material('99999999-9999-9999-9999-999999999999');
  insert into kdev_proof_results (check_name, result) values
    ('authenticated user calls get_device_key_material',
     'FAIL: SUCCEEDED — K_dev is reachable from a user JWT');
exception when insufficient_privilege then
  insert into kdev_proof_results (check_name, result) values
    ('authenticated user calls get_device_key_material', 'PASS: denied — ' || sqlerrm);
when others then
  insert into kdev_proof_results (check_name, result) values
    ('authenticated user calls get_device_key_material',
     'INCONCLUSIVE: blocked by something other than the grant — ' || sqlerrm);
end
$do$;

reset role;

-- ── Check 3 — 🔴 and neither must an anonymous request ─────────────────────
set local role anon;

do $do$
declare v_key bytea;
begin
  select k_dev into v_key
  from public.get_device_key_material('99999999-9999-9999-9999-999999999999');
  insert into kdev_proof_results (check_name, result) values
    ('anon calls get_device_key_material',
     'FAIL: SUCCEEDED — K_dev is reachable by an unauthenticated request');
exception when insufficient_privilege then
  insert into kdev_proof_results (check_name, result) values
    ('anon calls get_device_key_material', 'PASS: denied — ' || sqlerrm);
when others then
  insert into kdev_proof_results (check_name, result) values
    ('anon calls get_device_key_material',
     'INCONCLUSIVE: blocked by something other than the grant — ' || sqlerrm);
end
$do$;

reset role;

-- ── Check 4 — no CLIENT-facing role holds EXECUTE ──────────────────────────
-- Asserts the ABSENCE of anon/authenticated/PUBLIC rather than an exact grantee list. The
-- list legitimately also contains owner/superuser roles, and those differ between a real
-- Supabase project (owner `postgres`) and the bare postgres image (`supabase_admin`) — an
-- exact-match assertion fails for the wrong reason in one of the two environments.
insert into kdev_proof_results (check_name, result) select
  'no client role holds EXECUTE',
  case when count(*) = 0 then 'PASS'
       else 'FAIL: reachable by ' || string_agg(grantee, ',' order by grantee) end
  from information_schema.role_routine_grants
  where routine_name = 'get_device_key_material'
    and grantee in ('anon', 'authenticated', 'PUBLIC');

-- ── Check 5 — search_path is pinned (SECURITY DEFINER escalation) ──────────
-- Without a pinned search_path, a caller able to create objects in an earlier schema could
-- shadow device_keys or vault.decrypted_secrets and make this function return a key of THEIR
-- choosing, with definer privileges. Postgres stores the setting as `search_path=""`, so this
-- matches the prefix rather than an exact string.
insert into kdev_proof_results (check_name, result) select
  'search_path pinned on the definer function',
  case when exists (
         select 1 from unnest(coalesce(proconfig, '{}')) cfg
         where cfg like 'search_path=%'
       ) then 'PASS'
       else 'FAIL: proconfig = ' || coalesce(array_to_string(proconfig, ','), 'null') end
  from pg_proc where proname = 'get_device_key_material';

select ctid, check_name, result from kdev_proof_results order by ctid;

rollback;
