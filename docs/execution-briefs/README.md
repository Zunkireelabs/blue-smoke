# Execution briefs

One brief per PRD task, named `<PRD-ID>-<slug>.md`.

A brief is a **self-contained work order**. It assumes the reader is starting cold in this repo with
no prior conversation — so it carries the environment constraints, the task's exact scope, the
non-scope, the definition of done, and the required report format. It cites `TECHNICAL_SPEC.md`
rather than restating it, except where a transcription error would be expensive (protocol constants,
byte layouts) — those get enumerated in full.

## Why these exist

Work is split between planning and execution. Briefs are the interface: the plan is written once,
reviewed, and committed, so that execution is checkable against something fixed rather than against
someone's memory of a conversation.

They live in `docs/` because CLAUDE.md treats `docs/**` as shared truth. Anyone on the team can read
what any task was actually asked to do, and what it was asked *not* to do.

## Conventions

- **Scope and non-scope are both explicit.** The non-scope section is load-bearing — it is what stops
  a task quietly absorbing the next one.
- **Definition of done is honest about blockers.** If a checkbox cannot be ticked on the available
  hardware, the brief says so and says why, rather than leaving it to be faked or stalled on.
- **Every brief ends with a required report format**, so completed work can be reviewed against the
  diff quickly and comparably.
- A brief is written *before* the work starts and is not edited to match what happened. Deviations
  belong in the report, not in retro-fitted requirements.

## Index

| Brief | Task | Branch | Status |
|---|---|---|---|
| [`P0-2.5-mock-ble-peripheral.md`](P0-2.5-mock-ble-peripheral.md) | Mock BLE peripheral implementing §4, incl. failure paths | `feature/P0-2.5-mock-ble-peripheral` | ✅ Built and reviewed — 51 tests green. Superseded in part by the addendum below |
| [`P0-2.5-addendum-v1.4-frame-discriminator.md`](P0-2.5-addendum-v1.4-frame-discriminator.md) | Revise the mock for §4.5 v1.4 `frameIndex` framing + F12; declare a phantom babel dep | `chore/integrate-auth-db-persona` | 🔴 **NOT executed — spec v1.4 was never implemented.** `protocol.ts` and the mock are both still pre-v1.4 while the spec is v1.7. Blocks `P1-4.0`. Read [`HANDOFF-P0-2.5-v1.4-framing.md`](HANDOFF-P0-2.5-v1.4-framing.md) first |
| [`P0-4.0-rn-scaffold.md`](P0-4.0-rn-scaffold.md) | RN app scaffold, navigation, native module wiring | `feature/P0-4.0-rn-scaffold` | ✅ Done — merged to `stage` |
| [`P0-4.5-background-ble-spike.md`](P0-4.5-background-ble-spike.md) | Background BLE spike — config surface, `K_sess`-in-background question, honest capability matrix | `feature/P0-4.5-background-ble-spike` | ⚠️ Partially executable — the radio half is hardware-gated and stays blocked (M0 missed, was Day 3) |
| [`P1-1.0-signup-login-reset.md`](P1-1.0-signup-login-reset.md) | Signup / login / password reset + phone OTP | `feature/P1-1.0-signup-login-reset` | ⚠️ Partially blocked — `P0-4.0` has landed, `P0-3.0` has not |
| [`P0-3.0-revoke-device-session.md`](P0-3.0-revoke-device-session.md) | Edge Function `revoke-device-session` (§5.4.1) + validation module + SQL proof | `chore/integrate-auth-db-persona` | ✅ Done and reviewed — 6/6 SQL checks, 11 unit tests. One review finding (a vacuous idempotency check) returned and fixed |
| [`P2-1.0-inquiry-id-lint-guard.md`](P2-1.0-inquiry-id-lint-guard.md) | Restore enforcement for the two `CLAUDE.md` verification rules P2-1.0 left unguarded | `chore/integrate-auth-db-persona` | ✅ Done and reviewed — 7 guard tests; verified by stripping the overrides and confirming all four positive assertions fail |
| [`P1-4.0-bonding-seam-and-handshake.md`](P1-4.0-bonding-seam-and-handshake.md) | `App.test.tsx` hermetic stub, then P1-4.0 Part 1: `BleClientContext` seam + independent AES-128-CMAC + §4.5 auth handshake, tested against the mock incl. failure paths | `chore/integrate-auth-db-persona` | ⚠️ Executed (`81a88b7`, `39da3cb`) and reviewed. Part A verified. Part B landed with 5 findings — see the follow-up below. Carries an erratum: its §2.3 mutation advice was wrong. Deliberately excludes `serial_hash`/`issue-device-session`/Keychain/pairing UI (§7) |
| [`P1-4.0-followup-handshake-review-findings.md`](P1-4.0-followup-handshake-review-findings.md) | Review findings against `39da3cb`: uniform test fixtures hide CMAC-input errors, four unbounded BLE awaits, `authenticate()` throws despite its contract, `auth.test.ts` excluded from typecheck, result codes silently dropped | `chore/integrate-auth-db-persona` | ✅ Executed (`3d15000`) and reviewed — **accepted**. All five fixes re-verified by re-applying the mutation that originally survived. Carries two errata: its §5 (`remove the exclude entry`) and §6 (`core.forceNextCommandResult`) were both wrong, corrected in the execution report and confirmed |
| [`P1-4.0-followup-2-surviving-mutants.md`](P1-4.0-followup-2-surviving-mutants.md) | Three surviving mutants found reviewing `3d15000`: the `commandId` guard, the `resolveOnce` settled-once guard, and `subscription.remove()` are all correct but untested — deleting any of them leaves 14/14 green. Tests only, no production change | `chore/integrate-auth-db-persona` | ✅ Done and reviewed (`6bad269`) — **accepted**. All three mutations re-run independently and reproduce exactly; two killed, and finding 7's survival is genuine (`settled` is read nowhere but `resolveOnce`, so it is unfalsifiable while `settleResult` is a bare promise resolver). Two extra mutations confirmed the new tests aren't hollow |
| [`P1-4.0-part2a-deviceinfo-protocol-version.md`](P1-4.0-part2a-deviceinfo-protocol-version.md) | `P1-4.0` Part 2a: read `deviceInfo` (§4.3) off an already-connected device and **report** `protocolVersion` compatibility without inventing mismatch policy. The only slice of Part 2 not blocked by 🔴 OQ-12 or by hardware | `chore/integrate-auth-db-persona` | ✅ Executed (`a328da6`) and reviewed — **accepted**. All 8 briefed mutations re-run independently and all 8 die; the 🔴 `deviceUid` rule holds (no log/persist/`detail` path) and no `serial_hash`/salt was introduced. Two gaps the brief didn't name, found by mutations of my own and **still open**: the exact-length check survives `!==` → `<` (no over-length fixture), and `protocolVersion`/`provisioningState` collide in both main fixtures so the offset-swap mutation dies only by luck. Both briefed in the follow-up below |
| [`P1-4.0-part2a-followup-two-unpinned-properties.md`](P1-4.0-part2a-followup-two-unpinned-properties.md) | The two surviving mutants found reviewing `a328da6`: the exact-length check is only tested from below, and two fixtures violate the distinct-byte rule so an offset-swap dies by accident. Tests only, no production change | `chore/integrate-auth-db-persona` | ✅ Executed (`c48cd4a`) and reviewed — **accepted**. Both mutations re-run independently and reproduce exactly; the §4 independence bar was met literally (each named test re-run *alone* under the offset swap and each fails on its own). An extra mutation of my own confirms the new `test.each` pins **both** directions of the bound — `!==` → `<` kills only the over-length case, `!==` → `>` kills only the under-length case. `deviceInfo.ts` untouched, warning count held at 70, 274 tests. Both §5 non-goals respected |

| [`P1-3.0-P1-7.0-journey-test.md`](P1-3.0-P1-7.0-journey-test.md) | One end-to-end suite walking bluetooth-off → scan → dedupe → connect+handshake → abrupt drop → reconnect-with-re-handshake → wrong-key rejection against the mock, narrating a readable transcript as it goes. Closes the gap that every existing suite tests one unit in isolation | `feature/ble-connectivity` | ✅ Executed (`8e2959c`) and verified independently — 8 new tests, 363 passing / 7 pre-existing `verificationGuard` failures, typecheck clean, lint held at 0 errors / 68 warnings. No deviations from the brief and **no missing seams**: every step was expressible through the existing `DeviceScanner`/`ConnectionManager`/`MockBleManager` surface on the first attempt, with no production file touched. One review finding returned and fixed (`70a49aa`): both this suite and `connection.test.ts` asserted a bare `0x02` where `ResultCode.AUTH_FAILED` already existed in `protocol.ts` — a pre-existing pattern the new file inherited. The transcript surfaced one thing the isolated suites never had to assume: two independent `ConnectionManager` instances against one device keep separate `entries` maps |

> **⚠️ The `P0-4.0` and `P1-1.0` briefs describe a machine that no longer exists.** Section 2 of
> each documents Windows / PowerShell 5.1 / BOM-encoding / `git`-not-on-`PATH` constraints. The
> build machine moved to macOS on 2026-08-06 — and **at least one machine in use on Day 10 is
> Windows + PowerShell again** (see the `P1-3.0`/`P1-7.0` brief §2). So the environment is now
> per-machine, not per-project: **check yours before trusting any brief's §2, including this
> warning.** Per the convention above, a brief is not edited to match what happened; read
> `docs/session-log/sadin.md` (2026-08-06) and `anish.md` (2026-08-09) for the two known setups.
>
> Those two briefs also predate the `feature/* → stage → main` promotion flow and target `main`.
> **PR into `stage`.**
