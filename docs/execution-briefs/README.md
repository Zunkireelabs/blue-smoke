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
| [`P0-2.5-addendum-v1.4-frame-discriminator.md`](P0-2.5-addendum-v1.4-frame-discriminator.md) | Revise the mock for §4.5 v1.4 `frameIndex` framing + F12; declare a phantom babel dep | `feature/P0-2.5-mock-ble-peripheral` | ✅ Ready to execute — chip-independent |
| [`P0-4.0-rn-scaffold.md`](P0-4.0-rn-scaffold.md) | RN app scaffold, navigation, native module wiring | `feature/P0-4.0-rn-scaffold` | ✅ Done — merged to `stage` |
| [`P0-4.5-background-ble-spike.md`](P0-4.5-background-ble-spike.md) | Background BLE spike — config surface, `K_sess`-in-background question, honest capability matrix | `feature/P0-4.5-background-ble-spike` | ⚠️ Partially executable — the radio half is hardware-gated and stays blocked (M0 missed, was Day 3) |
| [`P1-1.0-signup-login-reset.md`](P1-1.0-signup-login-reset.md) | Signup / login / password reset + phone OTP | `feature/P1-1.0-signup-login-reset` | ⚠️ Partially blocked — `P0-4.0` has landed, `P0-3.0` has not |
| [`P0-3.0-revoke-device-session.md`](P0-3.0-revoke-device-session.md) | Edge Function `revoke-device-session` (§5.4.1) + validation module + SQL proof | `chore/integrate-auth-db-persona` | ✅ Done and reviewed — 6/6 SQL checks, 11 unit tests. One review finding (a vacuous idempotency check) returned and fixed |
| [`P2-1.0-inquiry-id-lint-guard.md`](P2-1.0-inquiry-id-lint-guard.md) | Restore enforcement for the two `CLAUDE.md` verification rules P2-1.0 left unguarded | `chore/integrate-auth-db-persona` | ✅ Done and reviewed — 7 guard tests; verified by stripping the overrides and confirming all four positive assertions fail |

> **⚠️ The `P0-4.0` and `P1-1.0` briefs describe a machine that no longer exists.** Section 2 of
> each documents Windows / PowerShell 5.1 / BOM-encoding / `git`-not-on-`PATH` constraints. The
> build machine is now macOS. Per the convention above, a brief is not edited to match what
> happened — but if you are executing from either of those, read `docs/session-log/sadin.md`
> (2026-08-06) for the current environment before trusting their §2.
>
> Those two briefs also predate the `feature/* → stage → main` promotion flow and target `main`.
> **PR into `stage`.**
