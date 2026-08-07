# Supabase — Blue Smoke (P0-3.0)

Schema and RLS live here as versioned migrations. **Never edit schema in the dashboard** —
spec §10.1. Applying a migration is a deliberate, reviewable act; the dashboard's Table
Editor is read-only territory for this project.

## Environments

Three cloud Supabase projects, per spec §10.1 (not the local-Docker model floated in
`docs/ci-cd-pipeline-plan.md` — that deviation was never adopted; dev and staging exist as
real cloud projects):

| Env | Project ref | URL |
|---|---|---|
| Development | `hejwrhijrztgdysycvto` | https://hejwrhijrztgdysycvto.supabase.co |
| Staging | `rwhawlvigzakmjwpzvnc` | https://rwhawlvigzakmjwpzvnc.supabase.co |
| Production | *(not created yet)* | — |

No local Supabase stack (`supabase start`) is used or required — this machine has no
Docker, and it isn't needed to develop against real cloud dev/staging projects.

## Applying migrations

The CLI needs your own credentials (DB password on link, or an access token) — this is not
something to hand to an agent or paste into chat.

```powershell
$env:PATH = "C:\Program Files\Git\cmd;$env:PATH"   # if git commands are also needed
npx supabase login                                  # opens a browser, one-time
npx supabase link --project-ref hejwrhijrztgdysycvto # prompts for the DB password
npx supabase db push                                 # applies every migration in order
```

Repeat `link` + `db push` against `rwhawlvigzakmjwpzvnc` for staging once dev is verified.
Never skip dev to push straight to staging.

## Migrations in this directory

- `20260806060100_core_schema.sql` — the 8 tables from spec §5.2.
- `20260806060200_rls_policies.sql` — RLS enable + policies from spec §5.3.
- `20260806060300_device_keys_vault_secret.sql` — corrects `device_keys` to store `K_dev` as
  a `vault.secrets` reference (`k_dev_secret_id uuid`) instead of a raw `k_dev_wrapped bytea`
  column. Supabase advises against new use of pgsodium's Transparent Column Encryption; this
  switches to the currently-recommended `vault.create_secret()` / `vault.decrypted_secrets`
  pattern. `docs/TECHNICAL_SPEC.md` §5.2.5 and §5.4 step 5 updated to match.

The first two incorporate two corrections from PR #6 (`feature/P0-2.0-ble-protocol`, open at the time
of writing, spec v1.3 pending merge to `stage`) rather than the version currently merged:

1. `device_ownership`'s "one active owner per device" rule is a **partial unique index**,
   not an inline `unique (...) where (...)` table constraint — the latter doesn't parse in
   Postgres and the migration would fail as originally specified.
2. `device_ownership` RLS denies client `INSERT`/`DELETE` outright. The original
   `for all` policy only constrained `user_id` in its `WITH CHECK`, so any authenticated
   user could `INSERT` an ownership row for someone else's unclaimed device and permanently
   lock out the real owner. Ownership is created service-side only, by
   `issue-device-session` (§5.4 step 4).

Once PR #6 merges, `docs/TECHNICAL_SPEC.md` and these migrations will already agree — no
follow-up migration should be needed for that reconciliation.

## Applied

- All three migrations applied to **dev** (`hejwrhijrztgdysycvto`) via the Supabase MCP
  server's `apply_migration`, 2026-08-05. Confirmed via `list_tables`: all 8 tables have
  `rls_enabled: true`. Security advisor (`get_advisors`) shows only the expected
  `device_keys` "RLS enabled, no policy" INFO (intentional deny-all) and two WARNs on
  `public.rls_auto_enable` — a Supabase-platform event trigger (not part of this migration,
  pre-existing on the project) that auto-enables RLS on any new table; it returns
  `event_trigger`, which Postgres cannot invoke via RPC regardless of the grant the linter
  flags, so the WARN doesn't correspond to an exploitable endpoint. Left untouched. Re-ran
  advisors after the vault-secret migration too — unchanged, nothing new introduced.
- All three migrations applied to **staging** (`rwhawlvigzakmjwpzvnc`) too, 2026-08-06, via
  `npx supabase db push` (user's own credentials, run outside chat). Confirmed via
  `npx supabase migration list --linked`: all three timestamps show matching Local/Remote.
- **Phone auth (Twilio Verify) configured on dev only**, 2026-08-07 — Dashboard →
  Authentication → Providers → Phone, SMS provider set to **Twilio Verify** (spec §1.2.1),
  backed by Twilio Verify Service `bluesmoke-dev` (`VA193a790c…`, SMS channel, Fraud Guard on).
  Note the provider dropdown offers both "Twilio" and "Twilio Verify" and they are *not*
  interchangeable: plain "Twilio" wants a Messaging Service SID (`MG…`) and has Supabase
  generate the OTP itself, which is not what §1.2.1 specifies. **Staging and prod remain
  unconfigured.** Credentials live in the dashboard, never in this repo.

  Two caveats worth knowing before reading a failure as a bug:
  - The Twilio account is on the **30-day trial**, so SMS is delivered only to numbers
    verified in the Twilio console. A send to an arbitrary number failing is the trial, not
    the config.
  - Supabase's **"Test Phone Numbers and OTPs"** field (same panel) registers fixed
    `phone=otp` pairs that bypass SMS entirely — useful on dev, and the way around the trial
    restriction for automated testing. **Never set this on prod:** a registered pair is a
    permanent auth bypass for that number.

  Auth is currently wired with the account-wide **Auth Token**. Twilio's own console
  recommends a scoped **API Key** instead, since the Auth Token grants full account access —
  worth switching before staging/prod.
- RLS proof (`supabase/tests/rls_ownership_proof.sql`) run against dev, 2026-08-05, and
  re-run against staging, 2026-08-06 — all 8 checks PASS on both, including the PR #6 hijack
  scenario: a second user's simulated JWT cannot read
  `device_ownership`/`devices`/`verifications`/`push_tokens` rows it doesn't own, cannot
  self-insert ownership over another user's device (`new row violates row-level security
  policy for table "device_ownership"`), and cannot repoint an ownership row it doesn't own
  via the column-restricted `UPDATE`. See the test file's header for why this uses simulated
  JWT claims rather than a live signup (SMTP isn't configured yet, so the project's default
  auth email rate limit throttles scripted signups immediately) and what should supersede it
  once SMTP is configured.
- Vault proof (`supabase/tests/vault_k_dev_proof.sql`) run against dev, 2026-08-05, and
  re-run against staging, 2026-08-06 — all 4 checks PASS on both: a dummy K_dev-sized secret
  wraps via `vault.create_secret()` and unwraps correctly via `vault.decrypted_secrets` as
  service role; a client role can read neither `device_keys` (RLS deny-all) nor
  `vault.decrypted_secrets` directly (`permission denied for schema vault` — a second,
  independent layer, so even a leaked `k_dev_secret_id` is useless to a client). This proves
  the storage **mechanism** only — no real `K_dev` exists in any environment yet; that's
  blocked on OQ-4.

## Not yet done (tracked in `docs/project-roadmap-todos/TODO-phase-0.md`, P0-3.0)

- Third Supabase project (prod) — not created yet
- Auth config: email/password + reset email (dashboard, both projects) — no MCP tool covers
  this, it's Dashboard/Management-API territory. Also blocked in practice: no custom SMTP is
  configured, so the default project email sender is rate-limited almost immediately (hit
  `429 over_email_send_rate_limit` on a single test signup).
- Phone + OTP: Twilio Verify as the native provider — **done on dev** (see Applied above,
  2026-08-07); **still to do on staging and prod**, and prod has no project yet
- Edge Functions `issue-device-session` (§5.4) and `revoke-device-session` (§5.4.1) — not a
  checkbox in `TODO-phase-0.md`'s P0-3.0 list, but this is where Vault unwrapping and the
  server-side `age_verified` check both actually happen; flagging the gap rather than
  building it silently under this task.
- APNs / FCM credentials for push
- Once SMTP is configured: replace the RLS proof with a live-HTTP version using two real
  signups and their actual access tokens
- Once OQ-4 is answered: populate `device_keys` with real, Vault-wrapped `K_dev` material
