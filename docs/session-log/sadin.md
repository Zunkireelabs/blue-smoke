# Session log — Sadin

Newest first. Conventions in [`README.md`](README.md).

---

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
