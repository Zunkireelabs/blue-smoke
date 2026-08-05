# Heads-up: stage changed + P0-4.0 merged (please read before your next rebase)

Sadin here. I made several changes on `stage` today and — importantly — **rewrote and
merged the `feature/P0-4.0-rn-scaffold` branch**. If you have work based on either, read
this before you `git pull --rebase` so nothing surprises you.

## TL;DR
- **P0-4.0 scaffold is merged to `stage`.** `stage` now has real code: `package.json`,
  npm scripts, `src/` tree (§9.2), `src/features/ble/protocol.ts`.
- **The VPS/Docker CI scaffold is deleted** — it was the wrong target for a React Native
  store app.
- **`ci.yml` now runs RN checks** (`typecheck` / `lint` / `test`), not a web `npm run build`.
- **⚠️ `feature/P0-4.0-rn-scaffold` was force-pushed** (rebased onto stage). If you had it
  checked out, see "Action required" below.

## What changed on `stage`

1. **Deleted the VPS deploy scaffold** — `deploy.yml`, `deploy-staging.yml`,
   `rollback.yml`, `Dockerfile`, `docker-compose*.yml`. These shipped a Docker image to a
   VPS via GHCR. Blue Smoke is an RN app that ships to the App Store / Play via EAS, so
   there's no container or server to deploy. `promotion-guard` (feature → stage → main)
   is kept — it still enforces our branch flow.

2. **Fixed `ci.yml`** — the old `build` job ran `npm run build` (a Vite/Next assumption),
   which fails on RN. Replaced with a `verify` job: `npm ci` → `typecheck` → `lint` →
   `test`. This is the CI-relevant slice only; the full pipeline (EAS build,
   privacy-guard, backend/RLS gate, release paths) is still **P0-5.0's job** and is not
   built yet.

3. **Added two docs** — `docs/ci-cd-pipeline-plan.md` (the full pipeline design: EAS,
   stage-branch model, 2 cloud Supabase + local, manual migrate-staging gate,
   world-class benchmark) and `docs/team-cicd-briefing.md` (plain-language workflow for
   the team). Both are shared truth; read the briefing if you want the day-to-day flow.

4. **Merged PR #4 (P0-4.0 → stage)** — CI green (promotion-guard + typecheck/lint/test).
   Merge commit `5db075b`.

## ⚠️ Action required if you touched P0-4.0

`feature/P0-4.0-rn-scaffold` was **rebased onto stage and force-pushed** (old tip
`4a2ec18` → `af63dd9`, now merged). One conflict was resolved in
`docs/execution-briefs/README.md` — I kept the superset (both the P0-4.0 and P1-1.0 index
rows + the reconciliation note), so nothing was lost.

- If you had that branch checked out locally, **do not** `git pull` it (you'll get a
  divergence). It's merged now — just `git checkout stage && git pull --rebase`.
- If you were mid-work on top of it, rebase your work onto `stage` instead.

## Notes for specific tasks

- **P0-5.0 (CI/CD pipeline)** — the runway is clear. `stage` now has npm scripts,
  `src/features/verification/**`, and `protocol.ts`, so privacy-guard / EAS / backend
  gates finally have something to run against. `ci.yml`'s `verify` job is a starting
  point, not the finished pipeline. Blockers unchanged: **OQ-8** (Apple/Google accounts +
  signing) gates the release paths.
- **Anyone rebasing this morning** — `stage` moved. `git pull --rebase origin stage`
  (or `main`) before you start, per CLAUDE.md.
- **`protocol.ts` is now live on stage** — it's the shared, **append-only** home for
  spec §4 constants. Add what your BLE task needs; don't rewrite existing entries.

Ping me if anything looks off.
