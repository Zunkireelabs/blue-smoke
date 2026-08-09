# Session log — Hardik

Newest first. Conventions in [`README.md`](README.md).

---

## 2026-08-09 — reset email proven end to end; two boxes were ticked on config, not delivery; a signup path that can never confirm

**Branch:** `feature/P0-3.0-hardik-resend-smtp` (level with `stage` at PR #12).
**Landed:** nothing merged yet.

**Custom SMTP is live on dev and the password-reset email is proven end to end.** Resend, sending
domain `ble.everestdeploy.com` (GoDaddy DNS, Tokyo region), `smtp.resend.com:465`, sender
`noreply@ble.everestdeploy.com`. Config details are in
[`supabase/README.md`](../../supabase/README.md) rather than repeated here.

**The method is the part worth stealing: a two-send control.** "The email arrived" proves almost
nothing — it is equally consistent with the `redirect_to` parameter being ignored outright. So the
same request went out **twice**, once with `redirect_to` and once without. The first preserved
`redirect_to=bluesmoke://reset-password`; the second fell back to `http://localhost:3000`. Only the
*contrast* licenses the claim that the allow-list is **honoured** rather than merely **configured**.
Evidence on both sides was observed, not inferred: Resend's key counter moved 0 → 1, the Emails tab
read Delivered, and the mail was opened and the link inspected.

**Site URL is still `http://localhost:3000` on purpose.** It is a diagnostic. Because the fallback
is a destination that obviously is not our app, an allow-list mismatch fails *loudly*. Point Site
URL at a `bluesmoke://` value and every future mismatch silently opens the app and looks like
success. Do not "tidy" this.

**The rate limit moved 2 → 30/hour by itself** when custom SMTP was enabled — nobody widened
anything. The per-user 60 s minimum interval was left alone deliberately.

### Two boxes were ticked while no email had ever been sent

`TODO-phase-1.md` "Password reset request + email flow" and `TODO-phase-0.md` "Auth configured:
email/password + password-reset email flow". Both described real code and real dashboard config;
neither had ever produced a delivered message. Re-ticked with what is now proven and what is not —
and what is not is specific: **the deep link opening the app is still unproven** and needs a
physical device, so that box stays unticked. The failure mode here isn't laziness, it's that
"configured" and "works" look identical from inside the repo.

### 🔴 The finding: no email signup can currently confirm

[`src/features/auth/supabaseAuthClient.ts:80`](../../src/features/auth/supabaseAuthClient.ts)
calls `signUp({ email, password })` with **no `emailRedirectTo`**. With Confirm email ON, the
confirmation link therefore falls back to Site URL — `http://localhost:3000` — which is not the
app. The account is created and then stranded.

**This is not a reading of the code; there is a live casualty on dev.** User
`info.zunkireelabs+trackab@gmail.com`, created 2026-08-09 01:48, still shows *"Waiting for
verification"*. It will never leave that state on its own.

Worth noting the file *predicted* this and was overtaken: the comment at :88–91 says the project
"hasn't decided/configured" email confirmation yet, and that is simply no longer true as of today.
A correct comment becomes a wrong one when the world moves, and nothing flags it.

**Deliberately not fixed here.** The fix needs a deep-link route and touches
`src/app/navigation.tsx`, where **Manjila is single-writer this week**. It needs announcing and its
own PR — that is why this entry records it instead of quietly widening this branch's diff.

### Live-HTTP RLS proof — replacing the simulated one

`supabase/tests/rls_ownership_proof_live.mjs`, plus seed/teardown SQL. Same 8 checks as
`rls_ownership_proof.sql` (+2 guards), now made with two real users' access tokens from
`POST /auth/v1/token?grant_type=password`.

**The SQL file is kept, not deleted** — it is the only version that runs with no network and no
service-role key, and its `BEGIN/ROLLBACK` leaves nothing behind. Cheap local check; live one is
authoritative.

**Result: 10/10 PASS against dev** (8 checks + 2 guards). But the green run is not the evidence —
**the pair of runs is.** It was deliberately run once *before* seeding, as a vacuity control:

| Check | No fixtures | Seeded |
|---|---|---|
| A sees own `device_ownership` row | FAIL (0 rows) | PASS |
| A sees own device via ownership | FAIL (0 rows) | PASS |
| B update-attempt on A's ownership row | **INCONCLUSIVE** | PASS |
| B's four cross-user read denials | PASS — **vacuously** | PASS |

The third row is the one I'd keep. With no fixture, B's `PATCH` returns `200 []` — zero rows
affected — and a check asking only "did it affect rows?" scores that as *"RLS blocked it"*. It came
out INCONCLUSIVE solely because the check re-reads the row as A afterwards and refuses to conclude
anything when the row isn't there. That is Sadin's `when others` bug — an unrelated failure counted
as a security pass — reproduced in HTTP form and caught by the guard written for it.

The fourth row is the honest weakness: **B's "cannot see" checks pass against an empty database.**
They mean nothing until A's rows exist. Which is also why the control run *alone* would have misled
in the opposite direction — five cheerful passes proving nothing.

**Three ways this proof could have reported PASS without proving anything**, all guarded:

1. **The wrong-role bypass, HTTP edition.** Sadin's `SET LOCAL` trap was silently running as the
   table owner. The analogue here is being handed a **service-role** key: it bypasses every policy,
   so all eight checks go green against a wide-open database. His inverse case is why "not the
   owner" is not enough — *both* postures hide the same hole. Each token is decoded locally
   (`role` + `sub`) **and** round-tripped through `GET /auth/v1/user`. Neither alone suffices: a
   forged string passes the first, a service key survives the second.
2. **An unrelated error scored as a denial** — the `when others` bug, ported. Only PostgREST
   `42501` counts; a 409 or FK error is INCONCLUSIVE, never PASS.
3. **HTTP-only, no SQL analogue: an RLS-filtered read is `200 []`, not an error.** An assertion
   asking "did it throw?" reads that as success while proving nothing. Every read asserts status
   *and* row count.

**It cannot seed its own fixtures, and that is the proof working.** As user A over the anon key,
creating them is *not permitted* — `device_ownership` denies client INSERT (PR #6 fix) and
`verifications` lost its INSERT policy in `20260807090000` (age-gate fix). Hence the three-step
seed → assert → teardown procedure with service-role seeding. A single self-contained script would
have been evidence the holes were still open.

**Stated plainly in the file header:** users A and B were **dashboard-created with Auto Confirm**,
so the **signup path is not exercised** — only the resulting JWTs. Given the finding above, it
currently *could not* be. `supabase/README.md`'s old note promising "two real signups" was
optimistic in exactly that way and has been corrected.

### Blocked / needs someone else

- **Prod must not send from `ble.everestdeploy.com`** — that is our infra domain, not the client's
  brand, and a reset email from an unrecognised domain is a phishing signal. The Resend account and
  `supabase-dev` key also sit in **one developer's personal account** today. **This has no OQ row.**
  It is the same class as **OQ-8** (who owns the store/signing accounts) and depends on **OQ-7**
  (brand assets), but neither covers it — flagged in `supabase/README.md` rather than mis-cited to
  an existing row. Per §13's own note on OQ-12, a gap recorded only in passing is a gap nobody owns.
- **Staging deliberately untouched.** Same procedure would work against `rwhawlvigzakmjwpzvnc`, but
  it still carries the client-writable `verifications` age-gate hole. That should be a separate
  deliberate decision, not something inherited mid-task.

### Gotchas worth stealing

- **User A's dev password was not what the handover said**, and it cost a detour. A returned
  `400 invalid_credentials` while B returned `200` on the identical password — so it was specific
  to the account, not the script or the shell (the password was confirmed to reach the process
  intact before blaming anything). `auth.users` showed A **confirmed, unbanned, undeleted, and
  holding a password** — none of the obvious causes. Worth knowing: A's `last_sign_in_at` sat
  inside the reset-email window, and **GoTrue updates that field when a recovery link is verified,
  not only on a password login** — so a non-null `last_sign_in_at` is not evidence that a password
  ever worked. Resolved by setting the password directly on the dev account.
- **The Supabase MCP server's OAuth is broken right now** — `{"message":"Unrecognized client_id"}`
  from `api.supabase.com`, on two separately-issued client ids. Not worth fighting: the dashboard
  SQL editor does the same job, and it asks for **no new grant**. The MCP flow requests
  `projects:write`, `database:write`, `secrets:read`, `storage:write` and `environment:write`
  across the whole org — wildly disproportionate to running two `insert` statements. Prefer the
  SQL editor for this kind of task even when the MCP works.

---

## 2026-08-07 — Twilio Verify live on dev; P1-1.0 client scope finished; the OTP flow still can't actually be run

**Branches:** `feature/P1-1.0-signup-login-reset`, `feature/P0-3.0-baas-setup`
**Landed:** nothing merged — both branches pushed, neither has a PR yet.

**Twilio Verify is configured on the dev Supabase project.** Verify Service `bluesmoke-dev`
(`VA193a790c…`, SMS, Fraud Guard on), wired into Auth → Providers → Phone. Details and caveats
are in [`supabase/README.md`](../../supabase/README.md) on the P0-3.0 branch rather than repeated
here. That closes the `P1-1.0` Method B Twilio box and the "blocked, no Twilio account" line that
had been sitting in P0-3.0's notes.

**The trap, if you configure phone auth on staging or prod later:** Supabase's SMS-provider
dropdown offers both **"Twilio"** and **"Twilio Verify"**, and they are different integrations.
Plain "Twilio" wants a Messaging Service SID (`MG…`) and has Supabase generate the OTP itself;
spec §1.2.1 requires the Verify integration, where Twilio generates and checks the code. Picking
the wrong one leaves you with a form that has no field your `VA…` SID fits into. I had it set to
the wrong one and didn't notice until the field labels stopped matching the credentials I had.

**Decided, and why — refactored `P1-1.0` onto the `AuthClient` abstraction before adding
anything to it.** The screens from the previous session called `api.ts`, which called
`@supabase/supabase-js` directly. The execution brief's §3.5 rules that out precisely because
`P0-3.0` hasn't merged, and §7 lists it as an automatic review-reject. Doing the refactor first
meant Method B, password reset, and every test after it inherited the right shape instead of
compounding the violation. `client.ts` / `mockAuthClient.ts` / `supabaseAuthClient.ts` /
`AuthClientContext.tsx`, with the two deviations from the brief explained in the commit body.

**Blocked / needs someone else:**

- **The phone-OTP flow is configured but has never actually been run.** Three things stand
  between here and a real SMS round-trip, none of them UI work: (1) `supabaseClient.ts` reads
  `process.env.SUPABASE_URL`, but Metro doesn't populate `process.env` in React Native — there
  is no env-injection mechanism in this project yet; (2) `.env.example` is a leftover from a web
  scaffold and declares `VITE_`-prefixed names that don't match what the code reads; (3) this
  machine has no JDK, no `ANDROID_HOME`, no Android SDK, and is Windows, so neither platform can
  build. **The screens being "done" and the flow being testable are further apart than the
  checkboxes suggest.**
- Resend SMTP still waiting on DNS domain verification — blocks the password-reset email path
  and the live-signup version of the RLS proof.
- Twilio is on a 30-day trial, so SMS only reaches numbers verified in the Twilio console. Worth
  knowing before someone reads a failed send to an arbitrary number as a broken integration.

**Gotchas worth stealing:**

- **This machine is a third distinct environment**, matching neither the P1-1.0 brief's §2
  (Windows with tooling) nor Sadin's 2026-08-06 note that the build machine is now macOS.
  Neither `git` nor `node` was installed at all; both went on via `winget`, along with `gh`.
  **Check `git --version` / `node --version` before trusting either environment description.**
- The **Twilio console's Verify → Services page kept bouncing to an upgrade interstitial** on the
  trial account — four attempts, from both the old and new console URLs. Creating the service
  worked; only the list view was gated. If it happens again, `GET https://verify.twilio.com/v2/Services`
  with account SID + auth token returns the SID directly and skips the console entirely.
- **Two auth-token hygiene items still open:** the Twilio Auth Token should be rotated (it was
  exposed in a screenshot), and the Supabase config should use a scoped API Key rather than the
  account-wide Auth Token, which Twilio's own console recommends against.

---

Copy the template below, put your entry above this line, and delete any field
that doesn't apply.

```markdown
## YYYY-MM-DD — one-line summary

**Branches:** feature/P1-4.0-bonding-flow
**Landed:** PR #12 into stage, CI green
**Decided, and why:** ...
**Tried and abandoned:** ...
**Blocked / needs someone else:** ...
**Gotcha worth stealing:** ...
```
