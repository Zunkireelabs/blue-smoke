-- P1-4.0 / §5.4 — the one function permitted to unwrap `K_dev`.
--
-- 🔴 THIS IS THE MOST DANGEROUS OBJECT IN THE SCHEMA. Read the whole header before changing
-- a single line of it.
--
-- WHY IT HAS TO EXIST. `issue-device-session` must read `K_dev` to derive `K_sess`, and
-- `K_dev` lives in `vault.secrets`. The Edge Function talks to Postgres through PostgREST,
-- which only exposes the `public` schema — `vault` is deliberately unexposed, and
-- `vault_k_dev_proof.sql` proves that a client cannot reach it even holding a secret id. So
-- the function is the bridge, and the bridge is what has to be locked down.
--
-- WHY `SECURITY DEFINER`. The caller (service role) must not need direct rights on `vault`.
-- Granting the service role blanket vault access would make every future service-role
-- endpoint a potential key-exfiltration path; a single narrow function keeps §5.4's claim
-- true — **`issue-device-session` is the sole path from `K_dev` to anything outside the
-- database** — and makes that claim auditable by grepping for one name.
--
-- THE THREE CONTROLS, and what each one stops:
--
--   1. `set search_path = ''` (fully qualified names below). Without it, a caller who can
--      create objects in a schema earlier on the search path can shadow `device_keys` or
--      `vault.decrypted_secrets` and make this function return a key of THEIR choosing, with
--      definer privileges. This is the classic SECURITY DEFINER escalation and it is not
--      theoretical.
--   2. `revoke execute ... from public` (and anon/authenticated). Postgres grants EXECUTE on
--      new functions to PUBLIC by DEFAULT. Without the revoke, this function — running as its
--      owner, reading Vault — would be callable over PostgREST by any anonymous request.
--      **That single omission would hand K_dev to the internet.** The revoke is not
--      belt-and-braces; it is the control.
--   3. `grant execute ... to service_role` only. No user-facing role can invoke it, so
--      reaching it requires a key that already bypasses RLS.
--
-- WHAT IT DELIBERATELY DOES NOT DO. It performs no authorisation of its own — no age check,
-- no ownership check. Those live in `issue-device-session` (§5.4 steps 2 and 4) where the
-- user's identity is known. This function answers exactly one question, "what is the key
-- material for this device", and answering it is already gated by holding the service role.
-- Do NOT add convenience parameters (a user_id to check, a "skip verification" flag): every
-- one of them widens the single narrowest path in the system.

create or replace function public.get_device_key_material(p_device_id uuid)
returns table (k_dev bytea, key_generation int)
language sql
stable
security definer
-- Control 1. Every identifier below is schema-qualified because of this.
set search_path = ''
as $$
  select
    -- Vault stores text; K_dev is 16 raw bytes held as hex. `decode(..., 'hex')` is the
    -- inverse of how provisioning must write it. Provisioning does not exist yet (blocked on
    -- OQ-4 — who burns K_dev into OTP at manufacture), so this encoding is a contract that
    -- the provisioning path MUST match. If a device authenticates against real hardware and
    -- fails, check this first.
    decode(vs.decrypted_secret, 'hex') as k_dev,
    dk.key_generation
  from public.device_keys dk
  join vault.decrypted_secrets vs on vs.id = dk.k_dev_secret_id
  where dk.device_id = p_device_id;
$$;

comment on function public.get_device_key_material(uuid) is
  '🔴 Unwraps K_dev from Vault. SECURITY DEFINER, service_role ONLY — never grant to anon or '
  'authenticated. Called by issue-device-session (spec §5.4 step 5) and by nothing else; that '
  'exclusivity is what makes §5.4''s "sole path from K_dev" claim true. Performs no '
  'authorisation itself — the age gate and ownership assertion live in the Edge Function.';

-- Control 2 — the one whose absence would be catastrophic. Postgres grants EXECUTE to PUBLIC
-- by default on CREATE FUNCTION.
revoke execute on function public.get_device_key_material(uuid) from public;
revoke execute on function public.get_device_key_material(uuid) from anon;
revoke execute on function public.get_device_key_material(uuid) from authenticated;

-- Control 3.
grant execute on function public.get_device_key_material(uuid) to service_role;
