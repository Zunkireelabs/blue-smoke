# Team CI/CD Briefing — Blue Smoke

Plain-language guide for the team. The full technical plan lives in
[`ci-cd-pipeline-plan.md`](ci-cd-pipeline-plan.md); this is the "how do I actually
work day-to-day" version.

---

## The one-liner

> Build on your own branch → PR to **stage** so we all see the combined app → promote
> **stage → main** when it's good → tag a version → it ships to the stores. Robots check
> everything automatically along the way.

---

## Our branches

```
feature/*  →  stage  →  main  →  (tag v*)  →  stores
 your work    combine   clean /   version     customers
              & look    ready
```

| Branch | What it is | Rule |
|---|---|---|
| **feature/** | where you build, one per task | push day one to claim it |
| **stage** | everyone's work meets here; we eyeball the combined app | PR only, CI must be green |
| **main** | pristine, always release-ready | only the stage→main promotion PR reaches it |
| **stores** | App Store / Play | tag `v*` **+** a human clicks "approve" |

**Two things the robot blocks:**
- Push straight to `stage` or `main` → rejected (branch protection).
- PR `feature → main` → **promotion-guard fails** (main takes `stage` only).

---

## Your daily steps

1. **Claim** — `git push -u origin feature/P?-?.?-name` (empty is fine). Unpushed = not claimed.
2. **Rebase every morning** — `git pull --rebase origin main`. **Do not skip** (see Golden Rules).
3. **Build** your feature.
4. **Check locally before pushing:**
   ```
   npm run typecheck && npm run lint && npm test
   ```
5. **Push + open PR to `stage`.**
6. **Robot runs CI.** Red → fix. Green → merge.
7. **Tick the TODO box** in the same PR.

After merge to stage, the app auto-builds to TestFlight / Play Internal — that's where
we **look at the combined app** before promoting to main.

---

## What the robot checks on every PR

```
typecheck → lint → tests → build iOS+Android → secret scan → privacy-guard
```
All green = mergeable. Any red = blocked.

Plus 3 checks special to THIS app (IDs, selfies, a lockable device):

1. **Privacy guard** — blocks any code that tries to save/send a photo or ID.
2. **Stranger test (RLS)** — robot logs in as a fake second user, confirms they can't
   touch your device data.
3. **Fake device (mock peripheral)** — real hardware isn't ready, so a pretend vape
   lets us test lock/unlock now.

---

## Database — Supabase

We run **two cloud projects** + **local on every laptop**:

```
feature (all devs) → LOCAL Supabase (Docker on your laptop)
stage branch       → bluesmoke-staging  (cloud)
main → prod        → bluesmoke-prod      (cloud)
```

> Note: spec §10.1 names three cloud projects (a `dev` one too). We deliberately drop
> `dev`-cloud and use **local** for feature work instead. Logged here so nobody
> "re-adds" it.

### Testing the DB locally

The Supabase CLI runs the **real** Supabase stack (Postgres, Auth, RLS, Storage) in
Docker on your machine — not a mock.

**One-time setup:**
```
supabase login
supabase link --project-ref <staging-ref>
```

**Every session:**
```
supabase start
# API   → http://localhost:54321
# DB    → postgresql://localhost:54322
# Studio→ http://localhost:54323
```

**Write + test a migration:**
```
supabase migration new add_pairing_table   # creates a NEW .sql file
# edit the file
supabase db reset                           # wipes local, replays ALL migrations in order
```
`db reset` proves your migration applies clean from zero — exactly what CI does later.
Break it? Only your laptop. Fix, re-run.

**Test RLS locally:** in Studio, make 2 users, try to read User A's row as User B,
confirm it's blocked. Same "stranger test" CI runs.

**Point your app at local:**
```
# .env.local
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=<printed by `supabase start`>
```

### Migrations — the rules

- **New file every time.** Never edit a migration that's already been pushed
  (`db reset` replays them all; editing an old one breaks the replay).
- **Announce before adding** — `supabase/migrations/` is a shared, ordered file.
  Two people adding same-day can clash on sequence number. Single-writer at a time.
- **Test locally first**, always. `db reset` on your laptop before any PR.

### Applying migrations to staging — manual gate (important)

Merging a migration **file** to stage does **NOT** change the staging DB. The DB only
changes when a human runs the migrate step:

```
migration.sql merges to stage   → DB untouched (it's just a file)
        │
   HUMAN → Actions tab → "Migrate staging" → Run   → supabase db push
```

So: batch your migrations, apply to staging when you're ready, on a deliberate click.
No merge ever silently alters the staging DB.

**Keep staging clean:** the laptop is the sandbox. Break things locally, never on
staging — staging must stay a true mirror of prod, or it stops being a trustworthy
rehearsal.

---

## Golden rules (never break)

- ❌ **Never push straight to `main` or `stage`** — always PR.
- ❌ **Never skip the morning rebase** — stage drifts, promotion PR becomes a conflict monster.
- ❌ **Never merge with red CI.**
- ❌ **Never edit an old migration** — new file every time.
- ❌ **Never test/break on staging** — local is the sandbox.
- ❌ **Never commit a secret** — the robot scans for them and fails the build.

---

## Why we work this way (if anyone asks)

Small team, separate areas (UI / BLE / auth). `stage` is the one place all three fit
together and get eyeballed before anything is official. `main` stays clean so a release
is always safe. Big companies skip stage (they use "trunk") — they have thousands of
engineers and tooling we don't. Stage fits **us**, now. Revisit past ~5 devs.
