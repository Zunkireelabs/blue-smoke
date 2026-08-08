-- P0-3.0 — Row Level Security (spec §5.3)
--
-- Every table gets RLS enabled. No exceptions.
--
-- `device_ownership`'s policy set here is the corrected version from PR #6
-- (`feature/P0-2.0-ble-protocol`, commit `ceaaa86`), not the version currently merged into
-- `docs/TECHNICAL_SPEC.md` on `stage`. The original `manage_own_ownership … for all using
-- (user_id = auth.uid()) with check (user_id = auth.uid())` only constrained `user_id` in its
-- WITH CHECK — any authenticated user could INSERT an ownership row naming ANY unclaimed
-- `device_id`, take the single active-owner slot (see the partial unique index in the schema
-- migration), and permanently lock out the real owner without ever holding K_sess. Clients get
-- no INSERT and no DELETE here: ownership is created service-side only, by
-- `issue-device-session` (§5.4 step 4), which is where that decision belongs. Clients keep
-- SELECT and a column-restricted UPDATE (`nickname`, `revoked_at` only — WITH CHECK cannot see
-- the OLD row, so the column grant is what actually stops a user repointing their own row at
-- someone else's device_id).

alter table profiles         enable row level security;
alter table verifications    enable row level security;
alter table devices          enable row level security;
alter table device_ownership enable row level security;
alter table device_keys      enable row level security;
alter table device_sessions  enable row level security;
alter table push_tokens      enable row level security;
alter table audit_log        enable row level security;

-- Own rows only.
create policy own_profile on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Verifications: users may INSERT their own and READ their own. Never UPDATE or DELETE.
create policy read_own_verifications on verifications
  for select using (user_id = auth.uid());
create policy insert_own_verifications on verifications
  for insert with check (user_id = auth.uid());

-- Devices: visible only if you own them.
create policy read_owned_devices on devices for select using (
  exists (select 1 from device_ownership o
          where o.device_id = devices.id
            and o.user_id = auth.uid()
            and o.revoked_at is null)
);

-- Ownership: clients may READ their own rows, and may rename or release a device they already
-- hold. They may NOT create ownership — see the note at the top of this file.
create policy read_own_ownership on device_ownership
  for select using (user_id = auth.uid());

create policy update_own_ownership on device_ownership
  for update using (user_id = auth.uid() and revoked_at is null)
           with check (user_id = auth.uid());

-- No INSERT policy and no DELETE policy → both denied for every client role. Deleting is
-- denied deliberately: releasing a device sets revoked_at, so the history survives for the
-- audit trail.
--
-- WITH CHECK cannot see the OLD row, so it alone cannot stop a user repointing their own row
-- at someone else's device_id. Column privileges close that at the grant layer:
revoke update on device_ownership from authenticated;
grant  update (nickname, revoked_at) on device_ownership to authenticated;

-- device_keys: NO POLICY AT ALL. RLS enabled + zero policies = deny all.
-- Only the service role (Edge Function) can read it. This is intentional and load-bearing.

create policy read_own_sessions on device_sessions
  for select using (user_id = auth.uid());
-- INSERT/UPDATE on device_sessions is service-role only — no client policy for either.

create policy manage_own_push on push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy read_own_audit on audit_log
  for select using (user_id = auth.uid());
