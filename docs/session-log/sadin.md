# Session log — Sadin

Newest first. Conventions in [`README.md`](README.md).

---

## 2026-08-07 (later) — three streams merged; two live security holes closed; five false-green tests found

**Branch:** `chore/integrate-auth-db-persona` — 17 commits, **not pushed**. Everything below is on it.
**Landed on `stage`:** nothing. This branch is the integration point and stays local until the app runs.

**The three streams had never touched each other, and that turned out to be a merge problem, not a
technical one.** `P0-3.0` (backend), `P1-1.0` (auth, ~3,100 lines) and `P0-2.5` (mock) were all
built, all green, all unmerged. **Rebasing looks impossible and merging is trivial** — `P1-1.0`'s
11 commits each re-conflict on `navigation.tsx` under rebase, while a merge collapses the whole
thing to two additive conflicts per branch and none for the mock. "We couldn't put it together"
was never a hard problem; it had been attempted with the wrong tool. Suite went **1 test → 142**.

### 🔴 Two live security holes, both closed

**1. `verifications` was client-writable on dev and staging.** `insert_own_verifications` let any
authenticated user INSERT their own `age_verified = true`. `issue-device-session` reads exactly
that table before releasing key material, so it was **a complete bypass of the age gate reachable
with nothing but a valid login** — no ID, no selfie, no vendor. It got there honestly: the
migration was written against spec v1.1, where the client genuinely held the only copy of an
on-device result. v1.5 deleted the policy *on paper*; the databases had already been migrated.
**A spec change is not a fix until a migration carries it.** Closed by `20260807090000` + a
10-check proof. ⚠️ **Still not applied to dev — needs credentials I do not hold.**

**2. `K_dev` needed a `SECURITY DEFINER` accessor, and Postgres grants `EXECUTE` to `PUBLIC` by
default.** `vault.decrypted_secrets` is unreachable through PostgREST, so `issue-device-session`
needs a bridge function. Without an explicit `revoke`, that function — running as its owner,
reading Vault — **would have been callable by any anonymous PostgREST request.** One missing line
between here and handing out device root keys. Three controls (pinned `search_path`, revoke from
public/anon/authenticated, grant to `service_role` only), all proven, and I verified the proof
bites by granting `EXECUTE` to `authenticated` and watching two independent checks flip to FAIL.

### The pattern of the day: five tests that passed while proving nothing

Every one was found by **breaking the thing the test claims to check** and confirming it still
passed. None would have been found by reading.

| Where | Why it lied |
|---|---|
| `rls_ownership_proof.sql` | `SET LOCAL` is a **no-op outside a transaction** — every check silently ran as the table owner, RLS bypassed |
| same file, hijack check | caught `when others`, so an **FK error from a fixture that never created** scored as "denied by RLS" |
| `vault_k_dev_proof.sql` | same `SET LOCAL` bug — the third file with it, and I fixed two and missed this one |
| my own `navigation.gating` test | asserted on rendered routes; **React Navigation mounts only the focused screen**, so it matched an empty array every time |
| `revoke_session_proof.sql` (executor's) | `now()` is **transaction-scoped** — frozen at transaction start, so `pg_sleep` cannot move it and both writes recorded the same timestamp |

The `SET LOCAL` one is the nastiest, because it is **invocation-dependent**: through the MCP
client (which wraps in a transaction) the proof is real, through `psql` it is not. The same file
reports different results for the same database depending only on who called it. All four proof
files now run in one transaction ending in `ROLLBACK`, with a **GUARD check that asserts
`current_user` before any denial is claimed**.

Worth stealing: the executor's proof carries the *inverse* insight — running as `authenticated`
would make every UPDATE affect zero rows regardless of predicate, so "B cannot revoke A's session"
would pass even against code with no `user_id` predicate at all. **Both postures can hide the same
hole.** Assert which one you are in.

### §6.6 ship-blocker closed — and the thing it was hiding is worse

The Persona webhook signature scheme was marked "do not guess". Correct, but **"do not guess" and
"blocked" are not the same thing** — the scheme is published, so reading it is research. Header
`Persona-Signature`, `t=<unix>,v1=<hex>`, HMAC-SHA256 over `` `${t}.${rawBody}` ``, and **rotation
sends two space-separated pair-sets**. §12.1 gate **G2** met: 20 tests, including a forged body,
a re-serialised body (proving the raw-bytes requirement rather than asserting it), and a stale
signature re-sent under a fresh timestamp.

**Persona documents no timestamp tolerance at all**, yet §8.3 lists replay as its own threat — so
the 5-minute window is *our* decision, not the vendor's, backed by the unique index on
`inquiry_id` as a second defence.

**Closing it made the real gap sharper, not smaller.** `completed`/`approved` mean *"passed the
checks the template was configured with"* — **not** *"is over 18"*. A template with no age
requirement returns `approved` for a fourteen-year-old while the RLS lockdown, the signature
verification and the `issue-device-session` gate all function perfectly. After a day spent closing
two server-side holes, **the age gate rests on a dashboard checkbox no code in this repo can
verify.** Promoted to 🔴 in v1.6. Sadin confirmed the template does carry the age requirement
(2026-08-07, verbally) — **a dashboard screenshot in `docs/` would make that auditable**, which it
currently is not.

### Gotchas worth stealing

- **`.env` did nothing.** `.env.example` says "copy this to `.env`", and that instruction was
  false: `transform-inline-environment-variables` reads the **shell environment of the build
  process**, and nothing loaded `.env` into it. The failure is quiet, not loud —
  `getSupabaseClient()` throws, the session listener catches it and reports `signedOut`, so the
  app renders the auth stack and **looks healthy while every login fails**, with one
  `console.warn` as the only clue. The innocent suspects (anon key, project, Twilio) would all
  have been blamed first. Fixed in `babel.config.js`, hand-parsed, no new dependency.
- **`now()` vs `clock_timestamp()`** inside `begin;…rollback;` — see the table above.
- **Never `git commit` while a delegated executor is mid-task.** `git commit --amend` targets
  whatever `HEAD` is, so a commit of mine would have been rewritten by their amend. Stash and wait.
- **The `supabase/postgres` image is not a Supabase project.** User is `supabase_admin`, not
  `postgres`; `auth.users` is a pre-GoTrue stub without `email_confirmed_at`/`is_sso_user`; and
  `auth.uid()` reads the **legacy** `request.jwt.claim.sub` GUC, not the `request.jwt.claims` JSON
  a real project uses. Set **both** or `auth.uid()` returns null and every "own row" check goes
  vacuous. Fixture columns must exist in both environments.
- **Do not run `supabase start` on this machine** — port 54322 belongs to an unrelated project
  (`edgexcrm`). Throwaway containers on high ports; the image restarts internally during init, so
  poll `pg_isready` twice with a gap or migrations hit a half-built schema.
- **CocoaPods installed and `pod install` succeeded** — 82 pods, `BlueSmoke.xcworkspace` created,
  BLE 3.5.1 / Persona 2.52.1 / Keychain 10.0.0 all linked. **New Architecture compatibility of
  Persona and Keychain is still unproven** until a real device build runs.

### Blocked / needs a human

- **The migrations are not on dev.** `20260807090000` and `20260807120000`, plus the four proofs.
  Until then dev's age gate is forgeable. Needs DB credentials.
- **No physical device build yet** — needs the iPhone plugged in and a signing Team. The simulator
  is not an option: no BLE, no camera, and zero runtimes installed.
- **Use `bluesmoke-dev` (`hejwrhijrztgdysycvto`) only.** Phone auth (Twilio Verify) is configured
  on dev and **not** on staging, so Method B silently cannot work there. And **do not promote dev
  to production later** — dev accumulates "Test Phone Numbers and OTPs" pairs, which are permanent
  auth bypasses. The migrations are the promotion path; point them at a fresh project.
- **Everything from the previous entry is unchanged and now nine days old:** the unsent client
  message, OQ-11, OQ-6 and the firmware team, OQ-10, and the two physical hardware checks.

### Delegation started, and the review caught what the report did not

`revoke-device-session` and the `inquiry_id` lint guard were both written by an executor against
committed briefs, then reviewed against the **diff** rather than the report. Worth doing again;
also worth knowing what it costs.

Both reports were polished and both contained something the diff contradicted. The revoke report
quoted its bytea literal as `` `\x${…}` `` — which would be a *SyntaxError* in a template literal;
the source was correctly `` `\\x${…}` ``. Harmless, but it means **a report reads as evidence and
isn't**. The real find was in its proof: a vacuous idempotency check, sent back with the mechanism
and a demonstration that the fix bites. The executor re-derived `now()`'s behaviour itself before
applying it, which is the right instinct.

**Every delegated artefact got mutation-tested by me, not by its author.** For revoke I broke three
predicates (idempotency guard, `user_id` in the cross-user check, `user_id` in the bulk branch) —
all three flipped to FAIL. For the lint guard I stripped the overrides from `.eslintrc.js` and
re-ran its test: **all four positive assertions failed**, the negative ones correctly held. That is
the difference between a suite that passes and a suite that means something.

The guard is deliberately honest about its own limits: `CLAUDE.md`'s rule is a **data-flow**
property and ESLint has none, so `{id: inquiryId, who: user.email}` passed to a logger is a real
violation nothing will catch. The config says so in those words. The import ban *is* genuinely
enforceable and is described that way — the distinction is the point. `no-console` is deliberately
**not** applied to the Edge Functions, which have nine legitimate `console.error` sites; a probe
proving a genuine `console.error` still lints clean is part of the test.


---


## 2026-08-07 — new machine; stack re-based onto a moved `stage`; P2-1.0 reviewed after the fact

**Branches:** the whole stack rebased onto `stage` `e24d263` and force-pushed —
`docs/correct-stale-workflow-and-denominators` `2a8b5b4→288cf3b`,
`fix/P0-2.0-…` `8c1ae85→181da52`, `feature/P0-4.5-…` `b89aa45→8f0e712`,
`docs/persona-verification-realignment` `ad609dd→ea76606`. Pre-rebase tips kept at
`refs/backup/2026-08-07-*`.
**Landed:** nothing into `stage` — `stage` moved on its own (see below).

**The build machine changed again — Windows, and completely bare.** Not "git is off PATH" as
every prior handover says: **git was not installed at all**, and neither was anything else.
Installed via `winget install Git.Git`. The `P0-4.0` / `P1-1.0` briefs describing a Windows box
are accidentally accurate again, and the macOS notes in the previous entry are now the stale
ones. **Neither platform builds here either** — no Android SDK, no Java, no Xcode. M0 stays
missed; that is settled, not a thing to keep re-discovering.

Two mechanics worth keeping:

- `git credential approve` fails from a PowerShell pipe (`refusing to work with credential
  missing protocol field`) regardless of encoding. `cmd /c "git credential approve < file"`
  works. Do that once and the PAT never needs to touch `.git/config`.
- **Set `user.name` / `user.email` repo-local before rebasing anything.** A rebase rewrites the
  *committer*, so an unconfigured box halts mid-rebase with staged changes and no commit. Three
  Sadin identities exist in this repo's history; the stack uses `sadin@zunkireelabs.com`.

**`stage` had moved and the stack was one commit stale.** PR #11 (`d5bad2e`, `.env.example`
only) landed at 16:15. All four branches still forked from `ac0ec8b` — they had never been
rebased past Anish's P2-1.0 merge, only *verified* against it.

**Tried and abandoned — `git merge-tree` as a rebase dry-run.** It reported conflicts on
`CLAUDE.md`, `ROADMAP.md` and `TODO-phase-2.md` for all four branches, and I wrote that up as
fact. It is wrong: `merge-tree` simulates a *merge* and does not do rebase's patch-id
already-upstream detection. The real rebase printed `skipped previously applied commit 9b6e62c`
and applied **zero conflicts**, at 1/3/4/5 commits exactly as predicted. Anish's P2-1.0 was cut
from `0efdaa2`, so half of what looked like a conflict was already upstream.

I also claimed the earlier "verified clean" was chronologically impossible because the branch
tips predated `b087c64`. Also wrong — a dry-run verification does not move tips. **Only a real
rebase in a throwaway worktree answers this question.** That is the same lesson as the two-tree
diff that looked like a revert, arrived at from the opposite direction.

**Found: `ROADMAP` §8.1 has been internally inconsistent on `stage` since PR #10.** It reported
Phase 2 at **97** sub-tasks while `TODO-phase-2.md` reported **30** — a 67-box divergence inside
the one table whose entire purpose is to be the trustworthy denominator, under a heading
asserting "understated by 23%" that had stopped being true. P2-1.0 updated the block-C summary
row and the phase file but not the audit table.

Fixed by keeping the two events apart rather than overwriting one number: the recount (74→97)
was a real finding about a bad estimate; the drop to 30 is the v1.5 switch deleting
`P2-2.0`–`P2-5.0`. Re-derived all four phases rather than patching the one cell — which caught
that **Phase 0's 91 raw checkboxes are 76 under the PRD-line-item convention**, because
`P0-2.5` and `P0-4.5` are our own additions and sit outside the denominator. That convention was
nowhere in writing; it is now in §8.1 so the next recount agrees with this one. Current totals:
**76 / 91 / 30 / 119 = 316** against a claimed 311.

**P2-1.0 reviewed retroactively — [`audits/P2-1.0-retroactive-review.md`](../audits/P2-1.0-retroactive-review.md).**
Ten findings, three of them 🔴. The core design is sound and the commit is honest, but:
the ESLint guard deletion left **two live `CLAUDE.md` rules with zero enforcement** (proved with
a probe file — `console.log` of an `inquiry_id` beside an email lints clean); `personaConfig.ts`
**defaults to the Persona sandbox**, so a release build that loses `PERSONA_ENVIRONMENT`
silently ships a forgeable age gate; and 150 new lines landed with **no tests at all**, the
existing suite never mounting the new screen.

Credit where it is due: he corrected `NSCameraUsageDescription`, which still promised *"Nothing
leaves your phone"* — the same §12.2 misrepresentation class the v1.5 realignment found, caught
independently in the plist.

**Blocked / needs someone else:**

- **Anish's `P0-6.0` needs a rebase *and* a re-scope**, not just the rebase its conflicts imply.
  Its guard covers `src/native/**`, which **his own P2-1.0 deleted** — the path matches nothing
  and its stated rationale describes a data flow that no longer happens. His guard and this
  review's F1 are the same piece of work; they must not be written twice.
- **Everything in the previous entry is unchanged and now eight days old:** the unsent client
  message, OQ-11, the Persona webhook signature scheme (ship-blocker), OQ-6 and the firmware
  team, and the two physical hardware checks. None of them are engineering problems.

**Gotcha worth stealing:** the no-Claude-attribution rule is **forward-only from here**.
`0efdaa2` arrived on `stage` inside PR #10 with its trailer intact, plus two on Anish's own
commits. Removing them means rewriting `stage`, which `CLAUDE.md` forbids. **Do not "fix" this
later with a force-push** — that is the trap this line exists to close.

---
## 2026-08-07 — P1-1.0 client-side scope substantially complete; caught an abstraction violation from my own prior session

**Branches:** `feature/P1-1.0-signup-login-reset`
**Landed:** 3 commits pushed to the feature branch (not yet merged to `stage`/`main`):
refactor to the `AuthClient` abstraction, auth-choice + Method B phone/OTP screens, password
reset request/confirm + deep-link config.

**Decided, and why:** the 2026-08-06 foundation/signup/login commits had `SignupScreen`/
`LoginScreen` call `api.ts`, which called `@supabase/supabase-js` directly — exactly what the
P1-1.0 execution brief's §3.5 rules out, and precisely because `P0-3.0` is still unmerged
(`feature/P0-3.0-baas-setup` isn't an ancestor of this branch). Refactored to the `AuthClient`
interface (`client.ts`) with `supabaseAuthClient.ts` / `mockAuthClient.ts` implementations and
`AuthClientContext.tsx` as the composition root, before adding anything else. Two deliberate
deviations from the brief, both explained in the refactor commit body: result types instead of
`Promise<void>` on three methods, and a real (lazily-configured) `supabaseAuthClient` instead of
the brief's suggested hardcoded `throw new Error('P0-3.0')` stub — the latter would need deleting
the moment P0-3.0 lands, the former already works then with no further change.

Also added `confirmPasswordReset` to `AuthClient` — not in the brief's §3.5 interface sketch, but
without it the reset-link deep link lands the user in the app with nothing to do. Flagged in
`client.ts` rather than silently bolted on.

**Blocked / needs someone else:**

- Twilio Verify configuration itself (P0-3.0) — Method B's client-side flow is built against the
  `AuthClient` abstraction and works with the mock, but can't be exercised against a real phone
  number until that lands.
- Nothing in this task can be run on a physical device or simulator from this machine — typecheck/
  lint/test only. Deep-link config (URL scheme in `Info.plist`/`AndroidManifest.xml`, RN `linking`
  config) is therefore unverified, not untested-in-principle. Left unticked in `TODO-phase-1.md`
  where the brief's own DoD says to.

**Gotcha worth stealing:** the 2026-08-06 entry above says the build machine is now macOS with
Node/git already present. **This session ran on a third machine** — Windows, with neither `git`
nor `node` installed at all, not even the PowerShell-workaround Windows the P1-1.0 brief's §2
describes. Installed both via `winget` (`Git.Git`, `OpenJS.NodeJS.LTS`) before anything else was
possible. Worth checking `git --version` / `node --version` before assuming *either* the brief's
Windows section or yesterday's macOS note describes whatever machine you're actually on — three
different environments in three days on one small team.

## 2026-08-06 (later still) — trailers stripped; §4 realigned to Persona across nine sections

**Pushed (batched, five force-pushes with `--force-with-lease`):** the whole stack, trailer-free.
`docs/correct-stale-workflow-and-denominators` `0efdaa2→2a8b5b4`,
`fix/P0-2.0-…` `5827b6c→8c1ae85`, `feature/P0-4.5-…` `4246b8c→b89aa45`,
`docs/hardware-record-client-supplied` `83c4826→66f7dbc`,
`docs/client-message-architecture-signoff` `d57c6c9→49c21de`.
Pre-rewrite tips kept at `refs/backup/*`.

**`main` had a commit `stage` could never receive.** `7fce70b` (the no-Claude-attribution rule)
was committed straight onto `main` — which is the one branch with no `.github/`, so
`promotion-guard` could not stop it. And `ci.yml` allows only `feature|fix|hotfix|chore|docs/*`
heads into `stage`, so **`main` cannot open a PR back**. The rule had no route to the branches
where work actually happens. Re-applied as `2a8b5b4` rather than cherry-picked, because the
pick conflicted on the adjacent force-push line that the same branch had already rewritten.

**Check descendants before you force-push, not after.** `origin/feature/P2-1.0-persona-capture-flow`
turned out to be **Anish's branch cut from my `docs/correct-stale-workflow-and-denominators`**,
not from `stage` — his two commits sit directly on `0efdaa2`. Nothing was lost (his ref is
independent and keeps `0efdaa2` alive), and his rebase will be clean *by construction*:
`0efdaa2` and `9b6e62c` have byte-identical trees and **identical patch-ids**, so
`git rebase origin/stage` drops his copy as already-upstream. But that was luck, not design.
`git merge-base --is-ancestor <old-sha> <every remote ref>` is now a pre-force-push reflex.

**Verification is Persona now — decided, and the spec has been realigned to it (v1.5).**
Anish's `P2-1.0` branch replaces the on-device pipeline: `decision.ts`, the Vision/ML Kit
bridges and the subtree's ESLint guard are all deleted. **He never touched
`TECHNICAL_SPEC.md`,** so the build contract still described a pipeline that no longer exists.

**The realignment spanned nine sections, and eight of them were nowhere near §6.** §1.1, §1.2,
§1.3, §1.4, §2.1, §2.2, §2.3, §5.2.2, §5.3, §5.5, §8.1, §8.3, §8.5, §8.6, §9.1, §9.2, §10.2,
§11.2, §11.3, §12.1, §12.2. Two worth naming:

- **§5.3 was an inverted rule-3.** Pre-v1.5 the client INSERTed its own verification row. Under
  a vendor flow that is *a user asserting their own `age_verified`*. The client INSERT policy is
  gone; service role only.
- **§12's store-review note told us to tell Apple and Google** *"verification happens entirely
  on-device, no biometric data is collected or transmitted."* Under Persona that is **false**,
  and it was sitting in the release checklist as advice. A stale doc becomes a
  misrepresentation the moment someone follows it.

**What I deliberately did not write.** Persona's webhook signature scheme, template config,
`min_age` enforcement point, inquiry resumption, vendor retention. All five are listed in a new
**§6.6 "do not guess these"**, and the signature scheme is marked a **ship-blocker** — an
unverified webhook endpoint is a direct forge of `age_verified`, and it is now the top row of
the §8.3 threat model.

**Open, and not mine to close:** **OQ-11** — written client acceptance that ID images now leave
the device, Persona account ownership and the **per-verification cost the fixed-price PRD does
not contain**, the DPA, and the vendor-side erasure path GDPR now requires. Anish's own commit
message says written client confirmation is outstanding. `ARCHITECTURE-SIGNOFF.md` contradicts
the new architecture in five places and **must not be sent as written**.

---

## 2026-08-06 (later) — mock built and reviewed; §4 defect #11 found by it; nothing pushed

**Branches (all local, deliberately unpushed until EOD):**
`docs/hardware-record-client-supplied`, `docs/correct-stale-workflow-and-denominators`,
`docs/client-message-architecture-signoff` (these three *are* on the remote, pushed before the
batch-at-EOD rule was set), `fix/P0-2.0-authresponse-frame-discriminator` (local only),
`feature/P0-2.5-mock-ble-peripheral` (executor's, pushed by them).

**`P0-2.5` is built and independently reviewed.** 51 tests, 7 suites; typecheck/lint/test re-run
against the diff rather than trusted from the report. RFC 4493 vectors verified correct against the
published values. All three v1.2 crypto corrections implemented exactly — HKDF `info`, the
`N ‖ bytes[0..11]` tag, `expiresAtDelta` inside the proof. ESLint config not weakened, app BLE stubs
untouched, no real timers, mock CMAC genuinely isolated from `src/`.

**The mock found §4 defect #11, which is the whole point of building it.** The executor reported six
§4 ambiguities rather than guessing. #1 was not an ambiguity: §4.5 step 4 mandated that "an
out-of-order frame resets the handshake", but both `authResponse` frames were 20 opaque bytes on one
characteristic with no discriminator — **the device could not detect an out-of-order frame at all.**
The spec required behaviour its own wire format made impossible. Fixed in **v1.4**: `frameIndex` in
byte 0 of both frames, `expiresAtDelta` narrowed uint32 → uint24 to pay for it (194 days of range
against a 90-day cap). New obligation **F12**, new tests **FW-19/FW-20**. `protocolVersion` stays
`0x01` — this is the **last** change that gets the pre-M2 exemption.

**One real defect in the returned work:** `@babel/plugin-transform-typescript` is required by the
mock's babel config but never declared — it resolves transitively, so CI passes today and breaks
silently later. Folded into the addendum brief.

**Gotchas worth stealing:**

- **`git commit -F -` via a Bash heredoc sidesteps the PowerShell BOM problem entirely.** No temp
  file, no `WriteAllText` dance. This is the better mechanic on Windows.
- **The Claude CLI broke mid-session** with "not a valid application for this OS platform". Cause: a
  Windows auto-update cannot overwrite a *running* `.exe`, so it renames the running binary into a
  staging dir and leaves a 500-byte stub behind. Repair is to copy the real binary back from
  `node_modules/@anthropic-ai/.claude-code-*/`. It re-breaks until every session is closed.
- **Root `tsconfig.json` now excludes `tools/mock-peripheral/**`**, and its type coverage depends
  entirely on `npm run typecheck` staying a two-`tsc` script. **`P0-5.0` is rewriting `ci.yml` — if
  it calls `tsc --noEmit` directly, the mock silently stops being typechecked.**

**Blocked / needs a human, unchanged and now seven days old:**

- **The client message is still unsent**, and is now *gated*: `P0-6.0` records a third-party
  verification vendor as under consideration, which contradicts the sign-off attachment's
  on-device-only claim in five places — including a request that the client accept a **permanent**
  loss of auditability. Three exits recorded in `docs/client-messages/`.
- **Two hardware checks nobody has done:** macro photos of the PCB chip markings, and an nRF Connect
  scan. §3 sources the whole silicon story from *datasheets*, not from the board we now physically
  hold. If it is not a YC1012_JD, §4.5's AES-CMAC choice and §4.8 F2's dead-man timer both inherit
  the error — and we are about to walk a firmware team through it.

**The ceiling worth naming:** nothing we can do verifies that §4 is *implementable*. The mock and the
spec share an author, so a green suite proves internal consistency, not correctness. Only a firmware
engineer reading §4 closes that, and that is **OQ-6** — still unsent, still the critical path.

---

## 2026-08-06 — §4 and §5 audited before anyone builds against them; P0-1.0 landed

**Branches:** `feature/P0-1.0-architecture-signoff`, `feature/P0-2.0-ble-protocol`,
`fix/ci-promotion-guard-branch-prefixes`
**Landed:** PR #5, #6, #7 into `stage`, all CI green

**Six defects found in the spec, in two sittings.** All of them would have surfaced during
integration, which is the most expensive place to find anything. Details are in the v1.2 and v1.3
changelog rows; the ones worth knowing about without reading the diff:

- **§4.5 `K_sess` was underivable device-side.** `info` bound `user_id` and an absolute
  `expires_at`, and the handshake sends neither. The firmware could not have derived the same key —
  *every* authentication on real hardware would have failed. Fixed by binding only what the device
  actually receives, and moving `sessionExpiry` to a monotonic uptime counter so the device needs
  no clock at all.
- **§4.6 command tags weren't connection-scoped.** A captured `UNLOCK` would have replayed in any
  later session whose counter hadn't passed it — **without the attacker needing the key**. The tag
  now binds the connection nonce.
- **§5.3 ownership squat.** Any authenticated user could INSERT an ownership row for any unclaimed
  device, take the single active-owner slot, and lock the real owner out permanently — again with
  no `K_sess` required. Client INSERT/DELETE denied; ownership is created service-side only.
- **§5.2.4 wouldn't have migrated at all.** `unique (...) where (...)` isn't valid Postgres as an
  inline table constraint. `supabase db push` would have failed on the first run of P0-3.0.

**Decided, and why — `protocolVersion` stays `0x01` through all of this.** §4 has never been sent
to the firmware team and nothing implements it, so a bump would mint a version no party speaks.
**That exemption ends at M2.** Once §4 is acknowledged, changing it means bumping and notifying in
writing. Noted in the changelog, in `protocol.ts`, and in the P0-2.0 section so the next person
doesn't have to infer it.

**The lesson that generalises:** §2 is narrative and drifts — the P0-1.0 audit found four
divergences there. But v1.2/v1.3 showed the normative sections aren't automatically safe either;
they were internally consistent and still wrong. **Don't implement from §2. Do re-derive §4/§5 from
first principles before building against them.**

**Blocked / needs someone else:**

- **`ARCHITECTURE-SIGNOFF.md` is written and has never been sent.** The "approved by all
  stakeholders" box is ticked on internal authority. It gates Phase 1, and Phase 1 work is already
  on `stage`.
- **OQ-6 — nobody has contacted the firmware team.** Days 3–5 was the review window in the
  roadmap; it passed unused, so **M2 has slipped** and can't be recovered by working harder on our
  side. This blocks the last three P0-2.0 boxes, and `P0-2.5`/`P1-4.0`/`P3-2.0` are all now
  building against an unratified contract.
- Both go out with the same client message. Neither is an engineering problem.

**Gotchas worth stealing:**

- **The build machine is now macOS, not Windows.** Every PowerShell / BOM / `git`-not-on-PATH
  workaround in the `P0-4.0` and `P1-1.0` execution briefs (§2 of each) is stale — **those briefs
  now describe a machine that doesn't exist.** Current reality: Node v24.12.0, npm 11.6.2,
  Xcode 26.6 — but **no CocoaPods, no simulator runtimes, no `java`, no `ANDROID_HOME`**. So
  neither platform builds today, for entirely different reasons than before.
- `node_modules` had never been installed here. `npm ci` first, or `typecheck`/`lint`/`test` all
  fail with `command not found` and look like something worse than they are.
- **The workflow is `feature/* → stage → main` now**, enforced by `promotion-guard`. **`CLAUDE.md`
  still says "All PRs target `main`" and is wrong.** Needs fixing.
- `promotion-guard` rejected `chore/*` and `docs/*` outright, which left `chore/add-codeowners`
  pushed and unmergeable. Fixed in PR #7 — `main`'s restriction untouched.
- **The `62` sub-task denominator in `TODO-phase-0.md` was never right.** The seven PRD tasks hold
  **76** boxes and always have. Corrected, with the basis written down. Worth re-counting the other
  phase files rather than trusting their headers.

**Still not written down anywhere:** the client-supplied hardware findings — the ICWorkshop
PowerWriter PW200, its pinout, the safety warnings, and the fact that its stock firmware does
**not** speak §4. That belongs in `docs/hardware/client-supplied-hardware.md`. Until it exists,
those facts live only in a chat log, which is exactly the failure this journal is meant to stop.
