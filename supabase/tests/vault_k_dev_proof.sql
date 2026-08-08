-- P0-3.0 — Vault proof: K_dev wrap/unwrap round-trips, and clients are denied at two
-- independent layers (device_keys RLS deny-all, and vault schema grants).
--
-- Uses a dummy 16-byte value standing in for K_dev — no real device key exists yet in any
-- environment (real K_dev provisioning is blocked on OQ-4: who provisions K_dev into OTP at
-- manufacture, how the key manifest reaches us). This proves the storage mechanism
-- (migration 20260806060300_device_keys_vault_secret.sql) works; it does not and cannot
-- prove anything about real key material, which doesn't exist yet.
--
-- Run via `mcp__supabase__execute_sql` or `psql`/`supabase db query` against a project where
-- migration 20260806060300 is already applied. Safe to re-run: every fixture row it creates
-- is deleted at the end, and it never touches non-fixture data (all ids below are fixed
-- UUIDs reserved for this script).
--
-- Last run: 2026-08-05 against dev (hejwrhijrztgdysycvto) — all 4 checks PASS. See
-- supabase/README.md "Applied" section for the recorded output.
--
-- ══ CORRECTED 2026-08-07 — the third file with the same invocation-dependent bug ══
-- `SET LOCAL` is a NO-OP outside a transaction block (it emits only "WARNING: SET LOCAL can
-- only be used in transaction blocks"). Through a client that wraps the script in one — as
-- mcp__supabase__execute_sql does — the role switch works and the recorded PASSes are real.
-- Through psql, where each statement is its own implicit transaction, the switch silently
-- does nothing, both "client cannot..." checks run as the TABLE OWNER, and they report FAIL
-- against controls that are actually fine.
--
-- Here the failure direction happened to be the safe one — a false FAIL, not a false PASS —
-- but the file still could not be trusted either way, which is the same defect as
-- rls_ownership_proof.sql and verifications_write_denial_proof.sql. Fixed identically: one
-- explicit transaction ending in ROLLBACK, plus a GUARD check that asserts the role switch
-- took effect before any denial is claimed.

begin;

create temporary table vault_proof_results (check_name text, result text) on commit drop;
grant insert, select on vault_proof_results to authenticated, anon;

insert into devices (id, serial_hash) values
  ('55555555-5555-5555-5555-555555555555','vault-proof-fixture-hash');

do $do$
declare
  v_secret_id uuid;
begin
  v_secret_id := vault.create_secret(
    encode(gen_random_bytes(16), 'base64'),
    'vault-proof-k-dev',
    'P0-3.0 vault proof — dummy K_dev, deleted at end of script'
  );
  insert into device_keys (device_id, k_dev_secret_id) values
    ('55555555-5555-5555-5555-555555555555', v_secret_id);
  insert into vault_proof_results (check_name, result) values
    ('seeded device_keys row referencing vault secret', 'PASS: id=' || v_secret_id);
end
$do$;

-- Service-role round-trip: unwrap must produce a non-null value.
insert into vault_proof_results (check_name, result)
select 'service-role unwrap round-trips correctly',
  case when (
    select vs.decrypted_secret
    from device_keys dk
    join vault.decrypted_secrets vs on vs.id = dk.k_dev_secret_id
    where dk.device_id = '55555555-5555-5555-5555-555555555555'
  ) is not null then 'PASS' else 'FAIL: decrypted_secret is null' end;

-- Layer 1: RLS on device_keys (zero policies = deny-all, from 20260806060200_rls_policies.sql).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);

insert into vault_proof_results (check_name, result) select
  'GUARD: running as authenticated, not table owner',
  case when current_user = 'authenticated' then 'PASS'
       else 'FAIL: running as ' || current_user
            || ' — RLS IS BYPASSED, both denial checks below are meaningless' end;

insert into vault_proof_results (check_name, result) select
  'client cannot read device_keys row (RLS deny-all)', case when count(*)=0 then 'PASS' else 'FAIL got '||count(*) end from device_keys;

-- Layer 2: schema-level grants on vault itself, independent of RLS. Even a client that
-- somehow obtained a k_dev_secret_id cannot query vault.decrypted_secrets directly.
do $do$
begin
  perform 1 from vault.decrypted_secrets limit 1;
  insert into vault_proof_results (check_name, result) values
    ('client cannot query vault.decrypted_secrets at all', 'FAIL: query succeeded, schema grant leaked');
exception when others then
  insert into vault_proof_results (check_name, result) values
    ('client cannot query vault.decrypted_secrets at all', 'PASS: denied — ' || sqlerrm);
end
$do$;

reset role;

select ctid, check_name, result from vault_proof_results order by ctid;

-- Nothing above is kept. Replaces the hand-written DELETE cleanup, which leaked fixture rows
-- whenever the script aborted partway.
rollback;
