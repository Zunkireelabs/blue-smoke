# Session log — Sadin

Newest first. Conventions in [`README.md`](README.md).

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
