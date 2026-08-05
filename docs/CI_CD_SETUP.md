# CI/CD Setup — Blue Smoke

Implements `P0-5.0` (`docs/project-roadmap-todos/TODO-phase-0.md`) against the
pipeline spec in `docs/TECHNICAL_SPEC.md` §10.3.

## What exists

| File | Trigger | Does |
|---|---|---|
| `.github/workflows/ci.yml` | PR → `main` | secret scan, typecheck, lint, unit tests, debug/simulator build both platforms |
| `.github/workflows/deploy-staging.yml` | push to `main` | EAS staging build → TestFlight + Play Internal Testing |
| `.github/workflows/deploy-production.yml` | manual (`workflow_dispatch`, enter a tag) | EAS production build → App Store + Play |
| `eas.json` | — | build/submit profiles for development, staging, production |

## Known gap — this cannot be finished until P0-4.0 lands

**No app code exists yet.** `ci.yml`'s build jobs assume `package.json` with
`typecheck`/`lint`/`test` scripts, and a real `android/` + `ios/` native
project. `build-ios` currently guesses the Xcode workspace/scheme name
(`BlueSmoke.xcworkspace` / `BlueSmoke`) — verify against whatever
`react-native init` actually produces once the scaffold task lands, and
correct if the RN project is named differently.

**Bare RN + per-environment bundle IDs:** `eas.json`'s `ios.bundleIdentifier`
/ `android.package` overrides in the `staging` and `production` build
profiles only take effect through Expo's prebuild step. This is a **bare**
RN project (§9.1) — no prebuild — so those fields are placeholders. The real
mechanism is native: an Xcode build configuration/scheme per environment, and
an Android product flavor per environment, each pointed at its own bundle
ID/applicationId per §10.1. That's scaffold work, not CI/CD work — whoever
does P0-4.0 needs to wire it up, and this file's overrides should be
double-checked against it afterward.

## Required GitHub configuration (manual, one-time)

### Environments (Settings → Environments)

`staging` and `production` exist (created 2026-08-05). Add `development`
too if a manual dev-build trigger is wanted later.

- **`staging`** — no gate. Secrets below.
- **`production`** — **required reviewers is unavailable**: it's a paid
  GitHub feature (Team/Enterprise) for private repos, and this org is on a
  plan that doesn't include it (`gh api` returned "Please ensure the
  billing plan supports the required reviewers protection rule" when
  attempted). Approval decision (2026-08-05, sthasadin + ani-shh): the gate
  is **manual `workflow_dispatch`** instead — `deploy-production.yml` has no
  automatic trigger, so it only runs when someone with write access
  explicitly clicks "Run workflow" and enters the tag to deploy. That
  action of triggering it is the approval. If the org upgrades its plan
  later, add required reviewers (sthasadin, ani-shh) to `production` for a
  second layer on top of this.

### Secrets

| Secret | Environment | What it is |
|---|---|---|
| `EXPO_TOKEN` | staging, production | EAS access token for the `expo-github-action` |
| `STAGING_SUPABASE_URL` / `STAGING_SUPABASE_ANON_KEY` | staging | `bluesmoke-staging` Supabase project (§10.1) |
| `PROD_SUPABASE_URL` / `PROD_SUPABASE_ANON_KEY` | production | `bluesmoke-prod` Supabase project |
| `ASC_API_KEY_P8` | staging, production | Contents of the App Store Connect API key `.p8` file |
| `ASC_API_KEY_ID` / `ASC_ISSUER_ID` | staging, production | IDs that pair with the key above |
| `STAGING_PLAY_SERVICE_ACCOUNT_JSON` | staging | Google Play service account JSON, scoped to internal testing |
| `PROD_PLAY_SERVICE_ACCOUNT_JSON` | production | Google Play service account JSON, scoped to production releases |

All of these are **assumed to be client-provided** (spec §10.3, OQ-8) — Apple
and Google developer accounts aren't ours. Nothing above is committed to the
repo; workflows write key/service-account files to disk at runtime and
delete them in an `if: always()` cleanup step. `.gitignore` already blocks
`*.p8`, `service-account*.json`, and `AuthKey_*.p8` as a second layer.

### EAS project

Someone needs to run `eas init` once the app is scaffolded (creates the EAS
project and links it to this repo) and generate `EXPO_TOKEN` from an EAS
account with access to it.

## Still open

- Android signing keystore generation/storage isn't set up — EAS can manage
  this (`eas credentials`) once the project exists, or the team can supply
  its own upload keystore.
- No Detox E2E job yet — CLAUDE.md lists `npm run test:e2e` as an expected
  command but the PR pipeline only runs unit tests. Add once Detox is wired
  up in P0-4.0/P0-1 (mock BLE peripheral).
