# Track A — make the app walkable on dev

**Goal:** Get a real session, apply the two pending migrations, and seed one verified row — so that
for the first time someone can walk Blue Smoke end to end and check
[`docs/FLOWS.md`](../FLOWS.md) against the running app rather than against source reading.

**Written:** 2026-08-08 (Day 9) · **Est:** ~20 min of credentialed work + ~40 min of verification
**Branch:** work on `chore/integrate-auth-db-persona` (current). No new branch — this is enablement,
not a PRD task.

**Supersedes** [`../session-log/RESUME-twilio-otp-test.md`](../session-log/RESUME-twilio-otp-test.md)
for the OTP half. That file is stale in one important way: it gives Windows paths and a
`C:\Users\Projects\blue-smoke` root. **The build machine is macOS + zsh.** Its Twilio facts are
still good.

---

## 🔴 Read this first: who does what

**The Supabase CLI and dashboard need Sadin's own credentials. Those are not handed to an agent and
not pasted into chat** (`supabase/README.md`). So this brief has two columns, and the agent must not
attempt the left one.

| Sadin only — credentialed | The agent — everything else |
|---|---|
| A1 · Enable test OTP on the dev project | B1 · Confirm migration state |
| A2 · `supabase login` + `link` | B2 · Run the app, walk auth, screenshot |
| A3 · `db push` (applies the 2 pending migrations) | B3 · Prove the RLS gate with a second user |
| A4 · Run the seed SQL, and report the `user_id` used | B4 · Test SD-2 (the deep link) |
| | B5 · Delete the row, confirm the gate re-closes |
| | B6 · Write up findings, update the docs |

**Agent: if you find yourself about to run `supabase login`, `link`, `db push`, or open the
dashboard — stop and ask.** Those are Sadin's steps. Everything else here is yours.

---

## Read before starting

- `CLAUDE.md` — especially the three inviolable rules and the commit conventions
- [`../FLOWS.md`](../FLOWS.md) — what the app does today; this exercise validates it
- [`../system-design-ux/USER_FLOWS.md`](../system-design-ux/USER_FLOWS.md) §F3, §F5 — the flows walked
- `supabase/README.md` — environments and the migration procedure
- [`../project-roadmap-todos/WORKSTREAM-app-walkthrough-and-design.md`](../project-roadmap-todos/WORKSTREAM-app-walkthrough-and-design.md)
  — Track A's origin and its "Not to be done" list

**Dev project:** `hejwrhijrztgdysycvto` · https://hejwrhijrztgdysycvto.supabase.co
**Never staging (`rwhawlvigzakmjwpzvnc`) or prod for any of this.**

---

# Part A — Sadin's steps

## A1 · Enable test OTP on the dev project

Dashboard → project `hejwrhijrztgdysycvto` → **Authentication → Phone provider → Test phone numbers
and OTPs**. Add one pair:

| Phone | OTP |
|---|---|
| `+15551234567` | `123456` |

This bypasses SMS entirely for that number. It is **server-side configuration on one project** — no
app code, no build flag, nothing compiled into a binary, and disabling it is deleting the row.

> The local equivalent is already sitting commented out at `supabase/config.toml:267-269`
> (`[auth.sms.test_otp]`). It is not used here because this machine has no local Supabase stack.

⚠️ **Dev only.** Test OTP on staging or prod is on the project's do-not list — a known
number/code pair that reaches a real account is an open door. Twilio Verify stays configured on dev
for the *real* end-to-end test; test OTP does not replace it and does not prove it.

## A2–A3 · Apply the two pending migrations

```bash
npx supabase login                                     # one-time, opens a browser
npx supabase link --project-ref hejwrhijrztgdysycvto   # prompts for the DB password
npx supabase migration list --linked                   # BEFORE — expect 3 applied, 2 pending
npx supabase db push                                   # applies the 2
npx supabase migration list --linked                   # AFTER  — expect all 5
```

The two pending are:
- `20260807090000_verifications_persona_v15.sql`
- `20260807120000_k_dev_accessor.sql`

> 🔴 **This is worth doing regardless of design work.** Until `20260807090000` is applied, dev and
> staging still carry the `insert_own_verifications` policy — **any logged-in user can insert their
> own `verifications` row and set `age_verified = true`**. That is the age gate bypassed with a
> single insert. The migration drops that policy.

**Staging is left alone in this exercise**, and still carries the hole. Flag it, don't fix it here —
pushing to staging is a separate, deliberate act.

## A4 · Seed one verified row

Sign in through the app first (or the dashboard's Auth → Users) so a user exists, then take that
user's UUID.

Dashboard → **SQL Editor** (the editor runs as service role, which is why this works — RLS denies
client writes to `verifications` by design, and that is correct):

```sql
-- Track A seed. DEV ONLY. Delete after the walkthrough — see step B5.
insert into verifications
  (user_id, age_verified, method, app_version, platform, provider_status, outcome_reason)
values
  ('PASTE-USER-UUID-HERE', true, 'persona-v1', 'dev-seed-track-a', 'ios', 'approved', 'pass');
```

Column notes, so nothing is guessed: `threshold_version` was `not null` in the original schema and is
made nullable by `20260807090000` — so **this insert only works after A3**. `provider_status` is
added by the same migration. `verified_at` defaults to `now()`. `id` defaults to
`gen_random_uuid()`.

**Then tell the agent the `user_id` you used.** It needs it for B5.

⚠️ Do not paste the service-role key anywhere. The SQL Editor already has the privilege; nothing
needs to leave the dashboard.

---

# Part B — the agent's steps

## B1 · Confirm the state you were handed

Do not take Part A on trust. Verify, and report what you actually see:

```bash
npx supabase migration list --linked   # read-only; if this fails on auth, STOP and tell Sadin
```

Expect five migrations, all applied. If `20260807090000` is missing, **stop** — every RLS claim below
is invalid and the seed will have failed on `threshold_version`.

## B2 · Walk the auth flow

```bash
npm run ios -- --simulator "iPhone 17 Pro"
xcrun simctl io booted screenshot out.png   # then Read the file
```

🔴 **Typing into a React Native `TextInput` from the agent side does not work on this setup. Do not
burn turns retrying it — ask Sadin to type.** `cliclick` taps do work; click twice, since the first
click focuses the simulator window.

Walk `AuthChoice → PhoneInput → OtpVerify` with `+15551234567` / `123456`, and **record what you
observe against [`FLOWS.md`](../FLOWS.md)**:

- Does `PhoneInputScreen:76` navigate on success as documented?
- **Is DE-4 visible?** `OtpEntryScreen:99-107` renders "Signed in" with no navigation. Does the user
  see it flash, or does the stack swap fast enough to hide it? *Either answer is useful:* invisible
  means it is latent, visible means it is a bug users hit today.
- After sign-in and before the seed lands, you should be on the `verify` stack — the Persona screen.
  **Confirm there is no sign-out on it.** That is `FLOWS.md` §4.1, the trap, and this is the first
  chance anyone has had to see it rather than infer it.

## B3 · Prove the RLS gate with a second user

This is a Definition-of-Done item (*"RLS written and tested with a second user's JWT"*) and it has
never been done for `verifications`.

`.env` holds `SUPABASE_URL` and `SUPABASE_ANON_KEY`. **Read those two values; do not print them, do
not write them into any file, and do not commit anything containing them.**

Write a throwaway script in the scratchpad (not the repo) that:

1. Signs in as user A (the seeded one) via phone OTP with the test number.
2. `select`s from `verifications` → **expect exactly one row.**
3. Attempts `insert` into `verifications` for user A → **expect denied.** After `20260807090000`
   there is no INSERT policy at all, so this must fail. *If it succeeds, the migration did not apply
   and the age gate is bypassable — stop and report that immediately; it outranks everything else in
   this brief.*
4. Signs in as a **second** user (add a second test-OTP pair, or use an email signup), then `select`s
   from `verifications` → **expect zero rows.** User B must not see user A's row.
5. Attempts to `insert` a row for **user A's** `user_id` while authenticated as B → **expect denied.**

Report the five results as a table. Keep the script out of the repo.

## B4 · Test SD-2 — the one claim source reading cannot settle

`FLOWS.md` §6 flags this as *suspected, not proven*. This is the moment to settle it.

Trigger a password reset for an email account, open the `bluesmoke://reset-password` link on the
simulator, and observe:

- Does `ResetPasswordConfirmScreen` actually render?
- Or does the recovery session flip `sessionStatus` to `signedIn` first, unmounting the auth stack
  where that route lives — leaving the deep link pointing at nothing?

**Whatever happens, record it precisely** (which screen appeared, in what order) and update
`FLOWS.md` §6 SD-2 and `USER_FLOWS.md` F5.S from "suspected" to confirmed or refuted, with the
evidence.

## B5 · Delete the row and confirm the gate re-closes

**This is the step that proves the gate does the work rather than the seed.** Skipping it means you
have proved nothing.

Ask Sadin to run:

```sql
delete from verifications where user_id = 'THE-SAME-UUID' and app_version = 'dev-seed-track-a';
```

Then confirm the app falls back from Home to the Persona screen. `useVerificationStatus` polls only
while `pending`, so you may need to background/foreground the app or restart it — note which was
required, because that is itself a finding about how quickly a revoked verification takes effect.

## B6 · Write it up

1. **`docs/FLOWS.md`** — update §6 SD-2 with the B4 result. Update the closing note, which currently
   says *"Not yet validated by running the app"* — that stops being true.
2. **`docs/system-design-ux/USER_FLOWS.md`** — F5.S callout, same.
3. **`docs/session-log/sadin.md`** — a short narrative entry: what was enabled, what was proven, what
   surprised you.
4. **`docs/execution-briefs/`** — tick this brief's boxes below, in the same commit.
5. **Delete `docs/session-log/RESUME-twilio-otp-test.md`** if its Twilio content is now fully covered,
   or fix its Windows paths. Do not leave a stale Windows-era brief sitting next to a correct one.
6. **`WORKSTREAM-app-walkthrough-and-design.md`** — tick Track A.

Commit with `git commit -F -` heredoc, `chore:` or `docs:` prefix.
**No `Co-Authored-By: Claude` and no Anthropic attribution** — the most-repeated mistake in this
repo. **Do not push**; Sadin pushes when the app works.

---

## Definition of done

- [ ] A1 — test OTP live on dev, and **only** dev
- [ ] A3 — `migration list --linked` shows all five applied
- [ ] A4 — one seeded verified row
- [ ] B2 — auth walked on the simulator, screenshots taken, DE-4 and the §4.1 trap observed
- [ ] B3 — all five RLS assertions pass, reported as a table
- [ ] B4 — **SD-2 settled**, and the docs updated from "suspected" to a verdict
- [ ] B5 — row deleted, gate confirmed to re-close
- [ ] B6 — docs updated, committed, not pushed
- [ ] `npm run typecheck` · `npm run lint` · `npm test` still green *(expect 0 / 70 warnings / 274
      tests — this brief changes no `src/`, so any movement is a red flag, not a result)*

---

## Do not

- **Do not touch `src/`.** This is enablement. The eight dead ends are recorded, not fixed — that is
  a separate task against a signed-off flow, and six of them want the same fix.
- **Do not enable test OTP on staging or prod.**
- **Do not push migrations to staging.** Dev only here. Staging's `insert_own_verifications` hole is
  real — flag it, don't fix it in passing.
- **Do not relax RLS on `verifications`**, and do not make `selectStack` treat unknown as verified,
  to "make the walkthrough work". If the walkthrough is blocked, that is the finding.
- **Do not wire `mockAuthClient` into the app.** It creates no Supabase session, so
  `useSessionStore` stays `signedOut` and the navigator never leaves the auth stack. Verified, not
  assumed.
- **Do not add a dev-bypass env flag.** It needs adding to `babel.config.js`'s inline `include` list,
  which makes it a build-time constant that ships unless someone remembers to strip it.
- **Do not commit `.env`, the anon key, the service-role key, or the RLS script.** Scratchpad only.
- **Do not run `npm ci`** (node_modules is current) **or `supabase start`** (port 54322 belongs to
  another project).
- **Do not claim something works without running it.** If a step fails, report it with the output.

---

## What this unblocks

Design work past the auth screens — today the app stops at the `verify` stack and nothing beyond it
has ever been seen. It also converts `FLOWS.md` from *read from source* to *checked against the
running app*, and settles SD-2, the single claim in that document that reading cannot resolve.

**What it does not unblock:** F6 still cannot complete (`create-inquiry` returns 501 by design), and
F7 still cannot complete (OQ-12, the `serial_hash` salt). A seeded row makes Home *reachable*; it
does not make verification or pairing *work*. Nobody should read a green walkthrough as either.
