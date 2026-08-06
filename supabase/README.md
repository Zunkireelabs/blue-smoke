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

## Not yet done (tracked in `docs/project-roadmap-todos/TODO-phase-0.md`, P0-3.0)

- Auth config: email/password + reset email (dashboard, both projects)
- Phone + OTP: Twilio Verify as the native provider — **blocked**, no Twilio account
  provisioned yet (same class of external dependency as OQ-8)
- Supabase Vault config for wrapping `K_dev` (`device_keys.k_dev_wrapped`)
- Edge Functions `issue-device-session` (§5.4) and `revoke-device-session` (§5.4.1)
- APNs / FCM credentials for push
- RLS proof: a script that signs up two throwaway users and confirms cross-user reads fail
- Staging migrated to match dev, once dev is verified
