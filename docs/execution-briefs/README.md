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
| [`P0-4.0-rn-scaffold.md`](P0-4.0-rn-scaffold.md) | RN app scaffold, navigation, native module wiring | `feature/P0-4.0-rn-scaffold` | Ready to execute |
