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

- **`20260807090000_verifications_persona_v15` and `20260807120000_k_dev_accessor` applied to
  dev** (`hejwrhijrztgdysycvto`), 2026-08-08, via MCP `apply_migration` — Track A. Dev now has all
  five. Verified after applying, rather than assumed:

  | Check | Result |
  |---|---|
  | `INSERT` policies on `verifications` | **0** — `insert_own_verifications` gone |
  | Policies remaining | `read_own_verifications [SELECT]` only |
  | `inquiry_id`, `provider_status` | both present |
  | `threshold_version` | now nullable |
  | `age_verified` | now defaults `false` |
  | `verifications_inquiry_id_key` partial unique index | present |
  | `get_device_key_material` | `SECURITY DEFINER`, `search_path=""`, EXECUTE granted to `postgres` + `service_role` **only** — `anon` and `authenticated` revoked |
  | Tables in `public` without RLS | **0** of 8 |
  | Security advisors | unchanged — same `device_keys` INFO and two `rls_auto_enable` WARNs as before. Nothing new introduced |

  🔴 **The hole this closed was live, and was confirmed before closing it.** `pg_policies` showed
  `insert_own_verifications` as an `INSERT` policy with `with_check (user_id = auth.uid())` — so any
  authenticated user could insert their own row with `age_verified = true` and pass the age gate.
  It existed on dev from 2026-08-05 until 2026-08-08.

  🔴 **Staging still has that hole.** It is still on three migrations. Deliberately not fixed in
  passing — pushing to staging is a separate, deliberate act — but it should not sit there long.

### ⚠️ `db push` will not work against dev — read before running it

Dev's migrations were applied by **MCP `apply_migration`**, which stamps `version` with the *time of
application*, not the migration filename's prefix. Staging's were applied by `db push`, which uses
the filename. So the two environments disagree about what a version number means:

```
file                                          dev version      staging version
20260806060100_core_schema.sql                20260806062905   20260806060100
20260807090000_verifications_persona_v15.sql  20260808172716   (not applied)
```

The CLI compares **versions**, not names. Against dev it will therefore conclude that *none* of the
five local files are applied and try to run them all — and `20260806060100` has a bare
`create table verifications (…)` with no `if not exists`, so it fails on the first statement.

**Consequences:** `npx supabase migration list --linked` against dev is misleading, and `db push`
against dev errors. Neither is data loss, but both will look like something is badly wrong.

**Options, none urgent:** run `npx supabase migration repair --status applied <filename-version>`
for each of the five to rewrite dev's version stamps to match the filenames; or keep applying to dev
via MCP and treat `db push` as staging-only. **Pick one before anyone tries to push to dev.** The
mismatch predates Track A — the first three rows already had it — so this is a pre-existing trap
being written down, not a new one.
- **Phone provider toggle enabled on dev**, 2026-08-09 — the provider was *configured* (Twilio
  Verify + test-OTP pairs saved) but the **Enable toggle itself was off**, so every
  `POST /auth/v1/otp` returned `400 phone_provider_disabled` ("Unsupported phone provider").
  GoTrue checks the toggle **before** consulting the test-number list, so saved test OTPs do not
  prove the provider is on. If OTP requests 400 with that code, check the toggle first.
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
- **Custom SMTP (Resend) configured on dev** (`hejwrhijrztgdysycvto`), 2026-08-09 — this is what
  unblocked the password-reset email path and the live-HTTP RLS proof below.

  | Setting | Value |
  |---|---|
  | Host / port | `smtp.resend.com:465` |
  | Username | `resend` |
  | Sender | `noreply@ble.everestdeploy.com` |
  | Sending domain | `ble.everestdeploy.com` — verified via GoDaddy DNS, Resend Tokyo region |
  | API key | `supabase-dev`, sending access only |
  | Providers | Email **on**, Phone **on**, Confirm email **on** |

  **The email rate limit moved 2 → 30/hour on its own.** Enabling custom SMTP raises it
  automatically; nobody set it. Worth knowing before reading it as someone having widened a limit
  to make something pass. **The per-user minimum interval was deliberately left at 60 s** as an
  anti-abuse control — do not lower it to speed up a test.

  **`bluesmoke://reset-password` is allow-listed as a redirect URL, and that allow-list is proven
  to be honoured** (see the two-send control below). **Site URL is still `http://localhost:3000`,
  and that is deliberate** — it is a diagnostic, not an oversight. Because the fallback destination
  is a URL that obviously is not our app, an allow-list mismatch **fails loudly** instead of
  silently opening the app and looking like success. Changing Site URL to a `bluesmoke://` value
  would destroy that signal.

  🔴 **`ble.everestdeploy.com` is OUR infrastructure domain, not the client's brand.** Two things
  follow, neither of them solved:
  - **Production must send from the client's own brand domain.** A verification or password-reset
    email arriving from a domain the user has never heard of is a phishing signal, and it is not
    the client's to control or protect.
  - **The Resend account and the `supabase-dev` API key are currently owned by one developer's
    personal account** (created by `hardik.phuel@nepa.global`). That is a single point of failure
    and a handover problem, not just a naming one.

  ⚠️ **This has no OQ row, and it should.** It is the same *class* of question as **OQ-8** (who owns
  the Apple/Google developer accounts and signing assets) and depends on the answer to **OQ-7**
  (brand assets), but **neither OQ covers it** — OQ-7 is logo/palette/app-name/store-copy and OQ-8
  is app-store accounts. Flagged here rather than mis-cited to an existing row; per spec §13's own
  note on OQ-12, *a gap recorded only in passing is a gap nobody owns.* Needs registering.

- **Password-reset email proven end to end on dev**, 2026-08-09. Not inferred from configuration —
  observed: the Resend key's usage counter moved 0 → 1, the Resend **Emails** tab showed
  **Delivered**, the mail arrived and was opened, and the verify link carried
  `redirect_to=bluesmoke://reset-password`.

  **Method — a two-send control, because "the email arrived" proves almost nothing on its own.**
  The same request was sent twice: once **with** `redirect_to` and once **without**. The second
  fell back to `http://localhost:3000`. That contrast is the only reason the allow-list can be
  claimed to be *honoured* rather than merely *configured* — a single successful send is equally
  consistent with the redirect parameter being ignored entirely.

  🔴 **NOT proven: that the deep link opens the app.** That needs a physical device, which this
  machine does not have. The corresponding box in `TODO-phase-1.md` is deliberately left unticked.

- RLS proof (`supabase/tests/rls_ownership_proof.sql`) run against dev, 2026-08-05, and
  re-run against staging, 2026-08-06 — all 8 checks PASS on both, including the PR #6 hijack
  scenario: a second user's simulated JWT cannot read
  `device_ownership`/`devices`/`verifications`/`push_tokens` rows it doesn't own, cannot
  self-insert ownership over another user's device (`new row violates row-level security
  policy for table "device_ownership"`), and cannot repoint an ownership row it doesn't own
  via the column-restricted `UPDATE`. See the test file's header for why this uses simulated
  JWT claims rather than live tokens (when it was written, no custom SMTP was configured and the
  default auth email rate limit throttled scripted signups immediately).

  **Superseded — but kept, deliberately.** `supabase/tests/rls_ownership_proof_live.mjs` now makes
  the same assertions with two real users' access tokens over HTTP, which is the stronger proof.
  The SQL version stays because it is the only one that runs with **no network and no service-role
  key**, and because it wraps in `BEGIN/ROLLBACK` and so leaves nothing behind. Cheap local check;
  the live version is authoritative.
- **Live-HTTP RLS proof run against dev, 2026-08-09 — 10/10 PASS** (8 checks + 2 guards), using
  users A (`60bbe9c9…`) and B (`55b18ad2…`) signed in via
  `POST /auth/v1/token?grant_type=password`. Fixtures are seeded and torn down service-side either
  side of the run — steps 1 and 3 of the procedure below.

  **The green run is not the evidence — the pair of runs is.** The proof was deliberately run
  **once before seeding** as a vacuity control, and the two runs differ exactly where they should:

  | Check | No fixtures | Seeded |
  |---|---|---|
  | A sees own `device_ownership` row | FAIL (0 rows) | PASS |
  | A sees own device via ownership | FAIL (0 rows) | PASS |
  | B update-attempt on A's ownership row | **INCONCLUSIVE** | PASS |
  | B's four cross-user read denials | PASS — **vacuously**, nothing existed to see | PASS |
  | B hijack-insert ownership | PASS | PASS |
  | Both guards | PASS | PASS |

  Two things that table says and a single green run cannot. First, **A's "sees own row" checks are
  not vacuous** — they fail when the row is absent, so they are genuinely reading the database.
  Second, and more useful: **the update check returned INCONCLUSIVE rather than PASS** with no
  fixture present. An RLS-filtered `PATCH` returns `200 []` — zero rows affected — which a
  naively-written check scores as "RLS blocked it". It only came out INCONCLUSIVE because the check
  re-reads the row as A and refuses to conclude anything when the row isn't there. That is
  precisely the `when others` / "FK error counted as a security pass" bug from the SQL version, in
  its HTTP form, caught by the guard designed for it.

  ⚠️ Note the row that stays honest about its own weakness: **B's four "cannot see" checks pass
  even with an empty database.** They only carry meaning once A's rows really exist — which is why
  the seed step is not optional and why the control run alone would have been misleading in the
  opposite direction.
- Vault proof (`supabase/tests/vault_k_dev_proof.sql`) run against dev, 2026-08-05, and
  re-run against staging, 2026-08-06 — all 4 checks PASS on both: a dummy K_dev-sized secret
  wraps via `vault.create_secret()` and unwraps correctly via `vault.decrypted_secrets` as
  service role; a client role can read neither `device_keys` (RLS deny-all) nor
  `vault.decrypted_secrets` directly (`permission denied for schema vault` — a second,
  independent layer, so even a leaked `k_dev_secret_id` is useless to a client). This proves
  the storage **mechanism** only — no real `K_dev` exists in any environment yet; that's
  blocked on OQ-4.

## Running the live-HTTP RLS proof

`rls_ownership_proof_live.mjs` is **a three-step procedure, not a self-contained script**, and the
reason is the proof itself: as user A over the anon key, creating the fixtures is *not permitted* —
`device_ownership` denies client INSERT (the PR #6 ownership-squat fix) and `verifications` lost its
INSERT policy in `20260807090000` (the age-gate fix). A script that could seed its own fixtures
would be evidence those holes were still open. Seeding therefore runs service-side; the
service-role key never enters this repo or a shell.

1. **Seed** — `rls_ownership_proof_live.seed.sql` via MCP `execute_sql` or the dashboard SQL editor.
   It ends with four counts; all must be 1 before step 2.
2. **Assert** — `node supabase/tests/rls_ownership_proof_live.mjs`. Needs `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` (read from the gitignored `.env`) plus `RLS_PROOF_A_EMAIL`,
   `RLS_PROOF_B_EMAIL`, `RLS_PROOF_PASSWORD` from the environment. Exit 0 only if every check
   passes; INCONCLUSIVE exits non-zero too.
3. **Teardown** — `rls_ownership_proof_live.teardown.sql`. **Not optional.** There is no
   `ROLLBACK` here, so until it runs, dev carries a device and an `age_verified = true`
   verification row belonging to no real person.

**The guard is the part worth understanding.** The SQL proof's famous trap was `SET LOCAL` being a
no-op outside a transaction, silently running every check as the table owner. The HTTP analogue is
being handed a **service-role** key instead of a user token: it bypasses every policy, so all eight
checks would report PASS against a wide-open database. Each token is therefore decoded locally and
asserted to carry `role: "authenticated"` and the expected `sub`, *and* round-tripped through
`GET /auth/v1/user`. Neither check alone is sufficient — a locally-forged string passes the first,
and a service key is not caught by the second.

Two more HTTP-specific shapes that would otherwise fake a pass: **an RLS-filtered read is a `200`
with an empty array, not an error** (so every read asserts status *and* row count), and only
PostgREST code `42501` counts as an RLS denial — a `409` or an FK error is reported INCONCLUSIVE,
never PASS. That second rule is inherited directly from the SQL version's `when others` bug.

## AD-1 admin panel

`admin_users` and `admin_audit_log` (migration `20260830120000_admin_identity.sql`) are RLS-
enabled with zero policies — deny-all to every client role. Rows are created only by the seed
below (once) and, from M2, by the `admin-admins` Edge Function.

### First admin seed — run ONCE, not committed

```sql
-- Run against the linked project (Supabase SQL editor, service role).
-- Replace the email with the real first admin's account, which must already exist in
-- auth.users — they sign up through the web-admin panel first; it will 403 until this runs.
insert into admin_users (id, role, note)
select id, 'superadmin', 'bootstrap admin — <name>, 2026-08-30'
from auth.users
where email = '<first-admin@example.com>'
on conflict (id) do nothing;
```

Do not put the email in a committed migration — that puts an identity in git. **Pending**: this
has not been run yet against any environment; it is the requester's call which account becomes
the bootstrap superadmin.

### Edge Function secrets — `admin-query`

| Secret | Dev value | Purpose |
|---|---|---|
| `REQUIRE_ADMIN_MFA` | `false` | Path B (`AD-1-M1a-commission-and-auth-spine.md` §3): free Supabase has no TOTP, so the aal2 check is relaxed. **Never set on a project where `[auth.mfa.totp]` is actually on** — that would silently readmit password-only admin sessions. The `admin_users` membership check is unaffected either way. |
| `ADMIN_PANEL_ORIGINS` | the `web-admin` dev origin(s), comma-separated | CORS allowlist for `_shared/adminCors.ts`. Never `*`. |

Neither secret is set yet in any environment — **pending**, same as the seed above; both are the
requester's call (which origins, and confirming `REQUIRE_ADMIN_MFA=false` is intentional there).

## Not yet done (tracked in `docs/project-roadmap-todos/TODO-phase-0.md`, P0-3.0)

- Third Supabase project (prod) — not created yet
- Auth config: email/password + reset email (dashboard, both projects) — no MCP tool covers
  this, it's Dashboard/Management-API territory. **Done on dev** 2026-08-09, custom SMTP and all
  (see Applied above); the `429 over_email_send_rate_limit` blocker that used to sit here is gone
  with it. **Staging and prod remain unconfigured** — staging is a separate deliberate act, not
  something to do in passing, because it still carries the client-writable `verifications`
  age-gate hole.
- Phone + OTP: Twilio Verify as the native provider — **done on dev** (see Applied above,
  2026-08-07); **still to do on staging and prod**, and prod has no project yet
- Edge Functions `issue-device-session` (§5.4) and `revoke-device-session` (§5.4.1) — not a
  checkbox in `TODO-phase-0.md`'s P0-3.0 list, but this is where Vault unwrapping and the
  server-side `age_verified` check both actually happen; flagging the gap rather than
  building it silently under this task.
- APNs / FCM credentials for push
- ~~Once SMTP is configured: replace the RLS proof with a live-HTTP version using two real
  signups and their actual access tokens~~ — **unblocked 2026-08-09**, custom SMTP is configured
  on dev. Written as `supabase/tests/rls_ownership_proof_live.mjs` (+ its seed/teardown SQL).
  Note the wording above was optimistic in one respect: users A and B are **dashboard-created with
  Auto Confirm**, so the proof uses two real users' *access tokens*, not two real *signups* — the
  signup path is not exercised by it, and currently could not be (see the `emailRedirectTo` defect
  in `docs/session-log/hardik.md`, 2026-08-09)
- Once OQ-4 is answered: populate `device_keys` with real, Vault-wrapped `K_dev` material
