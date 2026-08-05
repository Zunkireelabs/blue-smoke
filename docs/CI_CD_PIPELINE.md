# CI/CD Pipeline Flow — Blue Smoke

How code moves from a feature branch to the App Store / Play Store. For
required secrets and manual GitHub setup, see `docs/CI_CD_SETUP.md`. For the
underlying requirement, see `docs/TECHNICAL_SPEC.md` §10.3 and
`docs/project-roadmap-todos/TODO-phase-0.md` (`P0-5.0`).

---

## 1. Overview

```
 feature/*  ──PR──►  main  ──push──►  staging build  ──►  TestFlight
                      │                                    Play Internal
                      │
                      └──tag v*──►  ⏸ manual approval  ──►  production build  ──►  App Store
                                                                                    Play Production
```

Three workflows, three triggers, no overlap:

| Workflow | Trigger | Gate |
|---|---|---|
| `.github/workflows/ci.yml` | PR opened/updated against `main` | All jobs green required to merge |
| `.github/workflows/deploy-staging.yml` | push to `main` (i.e. every merge) | None — staging always tracks `main` |
| `.github/workflows/deploy-production.yml` | push of a tag matching `v*` | Required reviewers on the `production` GitHub Environment |

---

## 2. Stage 1 — Pull Request (`ci.yml`)

Anyone pushes a `feature/P{phase}-{task}-*` branch (per `CLAUDE.md`'s
claim-by-push convention) and opens a PR into `main`.

```
                ┌──────────────┐
                │ secret-scan  │  (gitleaks — independent, always runs)
                └──────────────┘

┌───────────┐   ┌────────┐
│ typecheck │──►│        │
└───────────┘   │        │
                │ needs:  │──►┌────────────────┐
┌───────────┐   │typecheck│  │ build-android  │  (Ubuntu, gradlew assembleDebug)
│   lint    │──►│  + lint │  └────────────────┘
└───────────┘   │        │
                │        │──►┌────────────────┐
┌───────────┐   └────────┘   │   build-ios    │  (macOS, xcodebuild, unsigned)
│   test    │  (independent) └────────────────┘
└───────────┘
```

- **secret-scan** and **test** have no dependencies — they run immediately and in parallel with everything else.
- **build-android** / **build-ios** wait on `typecheck` + `lint` so a broken PR fails fast and cheap (Linux minutes) before spending macOS minutes.
- These are **debug/simulator builds**, not signed release artifacts — they exist to catch native build breakage on every PR without burning EAS build credits. Signed builds only happen in stages 2 and 3.
- All jobs must succeed for the PR to be mergeable. No stage/develop branch — merging to `main` is the only promotion step (per the team's flat branching model).

---

## 3. Stage 2 — Staging deploy (`deploy-staging.yml`)

Fires on every push to `main` — i.e. every PR merge.

```
checkout → npm ci → eas build --profile staging --platform all --wait
                                     │
                    ┌────────────────┴────────────────┐
                    ▼                                  ▼
        eas submit --platform ios          eas submit --platform android
        (App Store Connect API key)        (Play service-account JSON)
                    │                                  │
                    ▼                                  ▼
               TestFlight                    Play Internal Testing
```

- Builds **both platforms in one EAS invocation**, then submits each separately.
- Signing material (App Store Connect `.p8`, Play service-account JSON) is written to disk from GitHub secrets at the start of the job and deleted in an `if: always()` cleanup step at the end — never committed, never persisted past the job.
- No approval gate. Staging is meant to always reflect the tip of `main` so QA/the team can pull the latest build without asking anyone.
- Uses the `bluesmoke-staging` Supabase project and the `com.bluesmoke.app.staging` app identifier (spec §10.1).

---

## 4. Stage 3 — Production deploy (`deploy-production.yml`)

Fires only when someone tags a commit on `main` with `v*` (e.g. `v1.0.0`) —
a deliberate, human-initiated action, not automatic.

```
tag v* pushed
      │
      ▼
┌─────────────────────────┐
│  job: build              │
│  environment: production │  ⏸ waits for required reviewer approval
│                           │
│  eas build --profile      │
│  production --platform all│
└─────────────────────────┘
      │  (approved + built)
      ▼
┌─────────────────────────┐
│  job: submit              │
│  environment: production │  ⏸ waits for required reviewer approval (again)
│                           │
│  eas submit → App Store   │
│  eas submit → Play (prod) │
└─────────────────────────┘
```

- **The approval gate is not YAML** — it's a GitHub Environment (`production`) configured with required reviewers in repo settings. Any job declaring `environment: production` pauses until a reviewer approves the run. This is what satisfies "tag `v*` → production build behind a manual approval gate" (spec §10.3).
- Approval happens **twice**: once before the build starts, once before submission. Collapse `build` and `submit` into a single job if the team decides one sign-off is enough.
- Google Play release is submitted with `releaseStatus: draft` (see `eas.json`) — it lands in the Play Console but does not go live until a human publishes it there. Apple review is separate and always manual regardless.
- Uses the `bluesmoke-prod` Supabase project and the `com.bluesmoke.app` app identifier.

---

## 5. What decides whether a build is "staging" or "production"

`eas.json` — not the workflow files. Each workflow passes `--profile
staging` or `--profile production` to `eas build`/`eas submit`, and the
named profile in `eas.json` carries the environment variables, channel, and
(intended, see caveat below) app identifier for that environment.

## 6. Known caveats (see `docs/CI_CD_SETUP.md` for full detail)

- No application code exists yet — the build jobs and the iOS scheme name in `ci.yml` are best-effort until `P0-4.0` scaffolds the app.
- Per-environment bundle IDs in `eas.json` assume Expo prebuild; this is a **bare** RN project, so the real separation needs native Xcode/Gradle configuration once the app is scaffolded.
- No E2E (Detox) job yet.
