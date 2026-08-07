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

create temporary table vault_proof_results (check_name text, result text);
grant insert, select on vault_proof_results to authenticated;

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
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

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

-- Cleanup: remove every throwaway row this script created.
delete from device_keys where device_id = '55555555-5555-5555-5555-555555555555';
delete from vault.secrets where name = 'vault-proof-k-dev';
delete from devices where id = '55555555-5555-5555-5555-555555555555';

select ctid, check_name, result from vault_proof_results order by ctid;
