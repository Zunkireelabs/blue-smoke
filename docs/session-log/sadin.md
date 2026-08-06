# Session log — Sadin

Newest first. Conventions in [`README.md`](README.md).

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
