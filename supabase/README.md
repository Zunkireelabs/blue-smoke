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

Both incorporate two corrections from PR #6 (`feature/P0-2.0-ble-protocol`, open at the time
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

- Both migrations applied to **dev** (`hejwrhijrztgdysycvto`) via the Supabase MCP server's
  `apply_migration`, 2026-08-05. Confirmed via `list_tables`: all 8 tables have
  `rls_enabled: true`. Security advisor (`get_advisors`) shows only the expected
  `device_keys` "RLS enabled, no policy" INFO (intentional deny-all) and two WARNs on
  `public.rls_auto_enable` — a Supabase-platform event trigger (not part of this migration,
  pre-existing on the project) that auto-enables RLS on any new table; it returns
  `event_trigger`, which Postgres cannot invoke via RPC regardless of the grant the linter
  flags, so the WARN doesn't correspond to an exploitable endpoint. Left untouched.
- **Not yet applied to staging** (`rwhawlvigzakmjwpzvnc`). Per the sequencing below, do this
  next via `npx supabase link --project-ref rwhawlvigzakmjwpzvnc && npx supabase db push` (or
  by repointing `.mcp.json`'s `project_ref` and re-running `apply_migration`), then re-run the
  RLS proof against staging too.
- RLS proof (`supabase/tests/rls_ownership_proof.sql`) run against dev, 2026-08-05 — all 8
  checks PASS, including the PR #6 hijack scenario: a second user's simulated JWT cannot
  read `device_ownership`/`devices`/`verifications`/`push_tokens` rows it doesn't own, cannot
  self-insert ownership over another user's device (`new row violates row-level security
  policy for table "device_ownership"`), and cannot repoint an ownership row it doesn't own
  via the column-restricted `UPDATE`. See the test file's header for why this uses simulated
  JWT claims rather than a live signup (SMTP isn't configured yet, so the project's default
  auth email rate limit throttles scripted signups immediately) and what should supersede it
  once SMTP is configured.

## Not yet done (tracked in `docs/project-roadmap-todos/TODO-phase-0.md`, P0-3.0)

- Third Supabase project (prod) — not created yet
- Auth config: email/password + reset email (dashboard, both projects)
- Phone + OTP: Twilio Verify as the native provider — **blocked**, no Twilio account
  provisioned yet (same class of external dependency as OQ-8)
- Supabase Vault config for wrapping `K_dev` (`device_keys.k_dev_wrapped`)
- Edge Functions `issue-device-session` (§5.4) and `revoke-device-session` (§5.4.1)
- APNs / FCM credentials for push
- Staging migrated to match dev, once dev is verified (dev is now verified — see above)
- Once SMTP is configured: replace the RLS proof with a live-HTTP version using two real
  signups and their actual access tokens
