# CI/CD Pipeline Plan — Blue Smoke

Grounds: spec **§10.3**, TODO **P0-5.0**, and the earlier gap analysis. Three tracks,
phased. This is a **plan only** — no workflow code is created here.

## Objective

An EAS-based mobile pipeline (iOS + Android) across staging / prod cloud + local dev,
plus a gated Supabase migration path and privacy / supply-chain enforcement. Beat
world-class on the axes that match *this* product's real risk — a leaked ID / selfie
— not on ops-visibility that is banned here (crash reporting in the 🔴 subtree).

## Supabase environments — **two cloud + local** (deviation from §10.1)

Spec §10.1 names three cloud projects (`dev` / `staging` / `prod`). We deliberately
drop the **dev cloud** project and use **local Supabase** (Docker via the CLI) for all
feature work:

```
feature (all devs) → LOCAL Supabase (supabase start / db reset)
stage branch       → bluesmoke-staging  (cloud)
main → prod        → bluesmoke-prod      (cloud)
```

- Local gives perfect per-dev isolation for migrations for free — no per-branch cloud
  project, no sprawl.
- **Cost:** staging is the only shared cloud sandbox, so it can drift. Discipline —
  break things locally, never on staging; staging stays a true prod-mirror (§10.1).
- Logged as a **conscious deviation** so nobody re-adds a `dev` cloud project assuming
  it was an oversight.

## Branching model — chosen: **stage buffer** (feature → stage → main)

Three devs work apart on separate areas (UI / BLE / auth). Their pieces must be seen
*combined* before anything is blessed. So a long-lived `stage` **integration branch**
sits in front of `main`:

```
feature/* ──PR──► stage ──(look at combined app)──► PR ──► main ──tag v*──► prod
```

- **`stage`** — where all three devs' work meets. Merge here triggers a TestFlight /
  Play Internal build so the *combined* app is eyeballed before promotion.
- **`main`** — pristine, always release-ready. Only ever receives promotion PRs from
  `stage`. Never edited directly (branch protection).
- **prod** — a tag `v*` on `main` + a **manual human approval gate** (unchanged).

Why stage, not pure trunk: at 3 devs / 30 days / beginners, an explicit "combine then
look" checkpoint beats trunk's flag-hidden discipline. Trunk is the world-class default
but earns its keep only at large fluent teams — revisit past ~5 devs. See *Benchmark*
below for why this divergence is deliberate, not a gap.

> **Non-negotiable rule:** rebase `stage` on `main` **every morning**
> (`git pull --rebase origin main`). Skip it → stage drifts → the promotion PR becomes
> a conflict monster. This is the single failure mode of the stage model.

## Tracks & workflows

| Workflow | Trigger | Jobs |
|---|---|---|
| **ci** | PR → stage/main | promotion-guard (keep existing), privacy-guard, typecheck, lint, unit + coverage, dependency-review, EAS preview build (ios + android) |
| **privacy-guard** | called by ci | the three 🔴 rules as blocking checks + gitleaks |
| **codeql** | PR / push / weekly | SAST, security-extended |
| **backend** | PR on `supabase/**`; called by releases | migration dry-run + pgTAP RLS with a 2nd user's JWT |
| **release-staging** | merge → **stage** | EAS staging build → TestFlight + Play Internal (the "look at combined app" step). **Build only — no DB push** |
| **migrate-staging** | `workflow_dispatch` (manual) | `supabase db push` → staging. Decoupled from builds so merging a migration *file* never alters the staging DB |
| **release-production** | tag `v*` on **main** | manual gate → migrate prod → build → submit → vitals-gated staged rollout |
| **device-farm** | nightly + pre-prod | Detox golden flow on Firebase Test Lab, **against the §11.1 mock peripheral** (real hardware unavailable until OQ-1) |
| **integration** | called by ci | App ↔ §11.1 mock peripheral: full §4 handshake, all commands, all result codes **including failure paths** (`AUTH_FAILED`, `REPLAY`, `RATE_LIMITED`, dead-man auto-lock) |
| **remote-config** | called by backend | validate §10.2 remote-config keys exist + typed defaults; block deploy if a flag the release depends on is missing |

## The three differentiators (why "better than world-class")

1. **Privacy Guard** — CLAUDE.md's three inviolable rules become *blocking CI checks*:
   no disk / log / network / analytics sink in `verification/**`; only `decision.ts`
   exits the subtree; no `K_dev` in client code; age-gate stays server-authoritative.
   No consumer-scale shop enforces data-handling policy in the pipeline — for this
   product a leaked ID is the top risk, not a slow build.
2. **Vitals-gated rollout, no crash SDK** — auto-halt the staged rollout on Play
   Android OS-vitals (crash / ANR rate), keeping metric-gated progressive delivery
   while honouring the 🔴 ban on crash-reporting SDKs.
3. **RLS proven with a 2nd user's JWT on every deploy** (Definition of Done §12.1) —
   most shops don't gate DB ownership this hard.

## Release safety via remote config (§10.2) — not app builds

The seven §10.2 keys (`min_age`, `facematch_tau_ios/android`, `rssi_lock/unlock_threshold`,
`autolock_grace_ms`, `session_ttl_days`) live in a Supabase table, cached on-device.
They are the **kill-switch / tuning layer**, changeable without a store round-trip:

- Ship region-specific 21+ (`min_age`) without a rebuild (§6.2 R7).
- Tune face-match τ and RSSI hysteresis per platform / enclosure post-launch.
- Shorten `session_ttl_days` to cut revocation lag (§8.5) — a security lever.

Pipeline role:
- `remote-config` job (above) treats the key set as a **typed contract** — CI fails
  if a release references a flag that isn't seeded in the target env's table.
- Migrations that add / rename a key go through the same dev → staging → prod order
  as schema (§10.1); never edited in the dashboard.
- **Not** a general feature-flag vendor (LaunchDarkly etc.) — out of scope, adds a
  data-egress surface the 🔴 model doesn't want. Supabase table only.

## The §11.1 mock peripheral is CI infrastructure, not a test fixture

Hardware is unavailable until ~Day 26 (OQ-1); the mock is "the highest-leverage item
in the entire plan" (§11.1). So it is a **first-class CI service**, not an afterthought:

- The `integration` and `device-farm` jobs boot the mock (Node `bleno` script or the
  §11.1 second-phone rig) and run the full §4 surface **including failure paths**.
- E2E golden flow (signup → verify → pair → unlock → walk away → auto-lock) runs
  against it every night.
- Real-firmware §4.10 `FW-01`–`FW-15` stays **manual / out-of-CI** (joint with the
  firmware team) — named here so nobody expects it automated.

## Phasing

**Phase A — foundation** (do first, after the P0-4.0 scaffold lands)
- `eas.json` with 3 profiles → §10.1 bundle IDs
- ci.yml: promotion-guard + typecheck + lint + unit + gitleaks
- privacy-guard.yml
- npm-script contract: `typecheck`, `lint`, `test`

**Phase B — release paths** (needs OQ-8: Apple / Google accounts)
- branch protection: `main` no direct push (promotion PR from `stage` only); `stage`
  requires green CI
- release-staging (merge → **stage** → TestFlight / Play Internal) — **build only**
- migrate-staging (`workflow_dispatch`, manual `db push`) — decoupled from builds so a
  merged migration *file* never alters staging DB until a human clicks Run
- release-production (tag `v*` on **main**, manual gate)
- iOS ASC API key + Play service account as secrets

**Phase C — backend gate**
- backend.yml: migrations dev → staging → prod, pgTAP RLS 2nd-JWT
- `scripts/rls-smoke.mjs`, `supabase/tests/**`
- remote-config contract check: §10.2 seven keys seeded + typed per env
- integration.yml: App ↔ §11.1 mock peripheral, full §4 + failure paths
  (needs the mock from `P0-2.5` — build Day 2, blocks nothing downstream)

**Phase D — quality depth** (partly add-on tier)
- device-farm.yml (Firebase Test Lab, §11.3 device matrix)
- codeql.yml
- staged-rollout automation + `scripts/rollout.mjs`

## Secrets (GitHub Secrets — none committed)

`EXPO_TOKEN`, `PLAY_SERVICE_ACCOUNT_JSON`, ASC API key (`.p8`) + team / app IDs,
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`,
`SUPABASE_URL`, `RLS_TEST_USER_A/B_JWT`, `GCP_TEST_LAB_SA`, `TEST_LAB_BUCKET`.
gitleaks scans full history and fails on any hit.

## Decision: existing VPS Docker scaffold

`deploy*.yml` / `rollback.yml` / `Dockerfile` / `docker-compose*` target GHCR + VPS —
the wrong target, since the RN app ships to stores, not a container. **Recommend
delete**, keeping only promotion-guard. Re-bootstrap from the `ci-cd-deployment`
skill only if a self-hosted backend is ever greenlit.

## Benchmark vs world-class (Uber / Airbnb / Google / Spotify mobile)

Overall ≈ **85% of world-class** on paper, exceeding them on the axes that match *this*
product's real risk (a leaked ID), trailing only where the 🔴 rules or team scale force
it. Caveat: this is still **plan, unproven** — world-class is measured by running
pipelines with green history; ours has executed nothing yet.

| Axis | World-class | This plan | Verdict |
|---|---|---|---|
| Branching | trunk + feature flags | stage → main buffer | ⚖️ deliberate — right for 3 devs, not a gap |
| PR checks (type/lint/test/build ×2) | yes | yes + coverage | ✅ par |
| Secret scanning | yes | gitleaks, full history | ✅ par |
| SAST | CodeQL / internal | codeql | ✅ par |
| Build system | internal farms / EAS-equiv | EAS | ✅ par |
| Environments | dev/staging/prod + canary | dev/staging/prod | ⚠️ no canary ring |
| Tester distribution | TestFlight / Play Internal | same | ✅ par |
| Staged rollout | %-based + metric auto-halt | vitals-gated halt | ✅ par |
| Crash / observability | Crashlytics / Sentry deep | **banned by 🔴** | ⚖️ deliberate trade |
| DB / RLS ownership gate | often weaker | 2nd-JWT every deploy | 🏆 **beats them** |
| Privacy-as-CI-gate | rare | privacy-guard (🔴 rules) | 🏆 **beats them** |
| Hardware-in-loop | N/A | §11.1 mock peripheral | 🏆 unique |
| Device farm | huge real matrix | Firebase Test Lab, smaller | ⚠️ scale gap |

**Where we beat world-class:** privacy enforced *in the pipeline*, RLS proven with a
second user's JWT on every deploy, and a mock peripheral that turns the missing-hardware
blocker into a CI asset.

**The three gaps, and why each is acceptable:**
- **No crash/observability SDK** — the 🔴 rules ban it (a crash report could carry an
  ID). Deliberate; vitals-gating covers the release-safety slice. The one true
  "less-than", and correct for a biometric app.
- **No canary ring** — scale; `%`-rollout already covers most of it. Cheap to add later.
- **Smaller device farm** — 3 devs, not 300; the §11.3 matrix suffices for launch.

Not a worse clone of FAANG's pipeline — a pipeline tuned to a **different top risk**
(a leaked ID, not a slow deploy).

## Blockers

- 🔴 **P0-4.0 RN scaffold** must land first — nothing to build against (no
  `package.json` / npm scripts yet).
- 🟠 **OQ-8** — Apple / Google developer accounts + signing assets. Blocks Phase B.
  Chase the client.
- 🟠 **`feature/P0-5.0-cicd-pipeline` already claimed** on the remote — coordinate
  with that branch's owner before starting work.
