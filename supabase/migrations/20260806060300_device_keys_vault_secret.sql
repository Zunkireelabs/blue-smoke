-- P0-3.0 — device_keys: store K_dev via Supabase Vault, not raw column encryption (spec §5.2.5)
--
-- Corrects device_keys.k_dev_wrapped (bytea, encrypted via pgsodium column encryption) to
-- k_dev_secret_id (uuid, references vault.secrets). Supabase explicitly advises against new
-- use of pgsodium's Transparent Column Encryption ("high level of operational complexity and
-- misconfiguration risk" — https://supabase.com/docs/guides/database/extensions/pgsodium) in
-- favour of vault.create_secret() / vault.decrypted_secrets, which is what this migrates to.
--
-- device_keys is still empty in every environment (real K_dev provisioning is blocked on
-- OQ-4 — who provisions K_dev into OTP at manufacture, how the key manifest reaches us), so
-- this is a pure shape correction, not a data migration.
--
-- RLS is unaffected: device_keys keeps RLS enabled with zero policies (deny-all to clients),
-- unchanged from 20260806060200_rls_policies.sql. vault.secrets / vault.decrypted_secrets are
-- not exposed to anon/authenticated by Supabase's own defaults, so client access is denied at
-- two independent layers — confirmed in supabase/tests/vault_k_dev_proof.sql.

alter table device_keys
  drop column k_dev_wrapped,
  add column k_dev_secret_id uuid not null references vault.secrets(id);

comment on column device_keys.k_dev_secret_id is
  'References vault.secrets — K_dev itself lives in Vault, this table holds only the reference. Unwrap via vault.decrypted_secrets, service role only.';
