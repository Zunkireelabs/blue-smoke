# Blue Smoke — Documentation Index

| Document | What it's for | Read it when |
|---|---|---|
| [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md) | Client-facing product summary and locked decisions | You need the 2-minute version |
| **[`TECHNICAL_SPEC.md`](TECHNICAL_SPEC.md)** | **The build contract.** Architecture, BLE GATT spec, data model, security model, testing, DoD | Before writing any code. §4 is the firmware team's contract |
| [`project-roadmap-todos/ROADMAP.md`](project-roadmap-todos/ROADMAP.md) | The 30-day plan — tracks, milestones, capacity, and where it strains | Planning, standups, status |
| [`project-roadmap-todos/TODO-phase-0.md`](project-roadmap-todos/TODO-phase-0.md) | Foundation, architecture, BLE spec, CI/CD, design system | Days 1–6 |
| [`project-roadmap-todos/TODO-phase-1.md`](project-roadmap-todos/TODO-phase-1.md) | Accounts, pairing, multi-device management | Days 7–12 |
| [`project-roadmap-todos/TODO-phase-2.md`](project-roadmap-todos/TODO-phase-2.md) | On-device age & identity verification | Days 13–19 |
| [`project-roadmap-todos/TODO-phase-3.md`](project-roadmap-todos/TODO-phase-3.md) | Lock/unlock, proximity, integration, submission | Days 20–30 |
| [`project-roadmap-todos/TODO-addons.md`](project-roadmap-todos/TODO-addons.md) | Parked scope — do not build during the 30 days | When someone asks for "just one small thing" |
| [`session-log/`](session-log/) | Working journal, one file per developer — decisions, dead ends, blockers, gotchas | Starting your day; picking up someone else's thread; before asking "why is it like this" |
| [`execution-briefs/`](execution-briefs/) | Self-contained work orders, one per PRD task — scope, non-scope, definition of done | Before starting a task that has one |
| [`ci-cd-pipeline-plan.md`](ci-cd-pipeline-plan.md) | The full pipeline design — EAS, environments, release gates | Working on `P0-5.0` |
| [`team-cicd-briefing.md`](team-cicd-briefing.md) | The plain-language version: branches, daily steps, golden rules | You just want to know how to ship |
| [`ARCHITECTURE-SIGNOFF.md`](ARCHITECTURE-SIGNOFF.md) | Client-facing architecture record — privacy model, commitments needed from the client, accepted risks | You need the ten-minute version of the spec |
| [`audits/`](audits/) | Consistency audits of the spec against itself | Before trusting a spec section you're about to implement |
| [`archive/PROJECT_BRIEF-superseded.md`](archive/PROJECT_BRIEF-superseded.md) | ⚠️ Dead. Early exploration, kept for history | Never, except to understand why a decision was rejected |

Commercial source of truth for scope and deliverable wording:
`../Project_Bluesmoke - Nepa.works App - PRD - Master Scope - Internal.xlsx`

---

## If you read nothing else

**The three inviolable rules** (`TECHNICAL_SPEC.md` §2.2). A PR breaking any of these is blocked, not commented on:

1. **No image, video frame, or biometric embedding is ever written to disk, logged, or transmitted.** RAM only, zeroised in a `finally` block.
2. **`K_dev` never leaves the server.** The app receives only a derived, scoped, expiring `K_sess`.
3. **`age_verified` is validated server-side before any privileged action.** A client-side boolean is a hint, never an authority.

**And the authority model** (`TECHNICAL_SPEC.md` §7.1): the firmware dead-man timer is what makes
the device safe. The app's proximity monitor only makes it feel fast. Any design that requires the
app to be alive for the device to lock is wrong.
