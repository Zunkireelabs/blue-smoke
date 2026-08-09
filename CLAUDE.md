# CLAUDE.md — Blue Smoke

Guidance for Claude Code when working in this repository.

---

## What this is

A React Native (iOS + Android) app controlling a **Bluetooth-enabled vape device**. Three pillars:

1. **Accounts & multi-device BLE pairing** — ownership enforced server-side via Supabase RLS
2. **18+ age verification via Persona** (third-party vendor) — ID scan + selfie captured by Persona's SDK, verified off-device, result confirmed to us by webhook. Changed from the original on-device (ID OCR + face match) design — **written client confirmation is still outstanding**, see `docs/session-log/anish.md` (commit `6bbe150`).
3. **Proximity lock/unlock** — authenticated BLE commands; the device auto-locks itself when the phone leaves range

**Timeline: 30 days.** Aggressive. Scope is fixed by a client PRD.

---

## 🔴 The three inviolable rules

Check these on **every** change. A breach is an automatic block, not a review comment.

1. **No image, video frame, or biometric embedding ever enters our process, is written to disk, logged, sent to a crash reporter, or transmitted by us.** *(Restated for the Persona architecture — spec v1.5 §6.)* Capture and upload happen inside Persona's SDK, in its own process, so the rule is no longer "zeroise it" but **"never acquire it"**: do not fetch inquiry payloads from the vendor API, do not add DB columns for them, do not proxy or screenshot the SDK's UI. The one handle we hold, `inquiry_id`, must never be logged beside anything that re-identifies the person.
2. **`K_dev` never leaves the server.** The app receives only a derived, scoped, expiring `K_sess`.
3. **`age_verified` is validated server-side before any privileged action.** A client-side boolean is a UX hint, never an authority.

**And the authority model:** the **firmware dead-man timer** is what makes the device safe. The app's proximity monitor only makes it feel *fast*. Any design requiring the app to be alive for the device to lock is **wrong** — reject it.

---

## Read before answering, don't guess

| Question | Answer lives in |
|---|---|
| Anything architectural | [`docs/TECHNICAL_SPEC.md`](docs/TECHNICAL_SPEC.md) — the build contract |
| BLE UUIDs, byte layouts, commands, result codes | Spec **§4** — and `src/features/ble/protocol.ts` once it exists |
| DB schema, RLS, Edge Functions | Spec **§5** |
| Persona flow, webhook, what we may/may not store | Spec **§6** *(rewritten in v1.5 — OCR/DOB/face-match thresholds are gone, vendor-owned)* |
| Proximity, hysteresis, state machine | Spec **§7** |
| Security, threat model, data classes | Spec **§8** |
| What am I building today | [`docs/project-roadmap-todos/`](docs/project-roadmap-todos/) — ROADMAP + per-phase TODOs |
| Is this in scope? | The phase TODO files. If it's in `TODO-addons.md`, **it is not in scope** |
| Why was X rejected? | [`docs/archive/PROJECT_BRIEF-superseded.md`](docs/archive/PROJECT_BRIEF-superseded.md) |

**Never invent a UUID, byte offset, command ID, or threshold.** They are all specified. If something genuinely isn't, say so and flag it — don't fill the gap with a plausible value.

---

## Team & how work is claimed

Three developers — **Sadin, Anish, Hardik** — working independently on feature branches.

**There is no fixed ownership.** Anyone can pick up any task. Work is claimed dynamically:

> **Pushing a branch named for a PRD task is the claim.** `git push -u origin feature/P1-4.0-bonding-flow` means P1-4.0 is taken. Check the remote branch list before starting something — it is the live picture of who is on what.

So: **push the branch early**, on day one of the task, even empty. An unpushed branch claims nothing, and two people silently building `P2-2.0` is the expensive failure mode when everyone works apart.

### Codebase areas

Not assignments — a map, so you can tell whose in-flight branch your diff might land near.

| Area | Paths | Notes |
|---|---|---|
| **BLE & Lock** | `src/features/ble/**`, `src/features/lock/**` | Scan, bonding, auth handshake, lock/unlock, proximity, background BLE. **Critical path** — most likely to block others. |
| **Verification** | `src/features/verification/**` | Persona SDK integration (capture flow), the create-inquiry + webhook Edge Functions. No longer a no-network zone — see rules below. Most self-contained area; easiest to work in without collisions. |
| **App & Backend** | `src/features/auth|onboarding|profile|devices/**`, `supabase/**`, `.github/**` | Auth, onboarding, device UI, Supabase schema + RLS + Edge Functions, CI/CD. Broadest surface, so most likely to touch shared files. |

**When work spans two areas:** say so, and prefer splitting it into two PRs over one wide diff.

### ⚠️ Shared files — announce before editing

These cause 90% of merge pain. No owner, so the rule is **single-writer at a time**: tell the other two before you start, not when you open the PR.

| File | Why it's contested | Rule |
|---|---|---|
| `src/features/ble/protocol.ts` | Single home for **all** spec §4 constants | Whoever's BLE task needs a constant adds it. **Append only** — never rewrite existing entries. Everyone else reads. |
| `supabase/migrations/**` | Ordered, append-only | **Never edit a migration that has been pushed** — always add a new one. Announce before adding, so two migrations don't claim the same sequence number. |
| `package.json` / lockfile | Everyone adds deps | Announce first. Never hand-resolve a lockfile conflict — delete and regenerate. |
| `src/app/navigation.tsx` | Every feature adds routes | Add your route, touch nothing else. |
| `src/shared/ui/**` | Shared components | Additive only. Changing an existing component's API needs a heads-up. |
| `CLAUDE.md`, `docs/**` | Shared truth | Anyone may update; mention it in the PR body. |

---

## Git workflow

Everyone works apart, so the discipline is about **merging cleanly** and **staying visible** — not about review gates.

```
main        ← PRODUCTION. Nothing merges here directly.
              Only `stage` or a `promote/*` branch may open a PR into main.
              Releases are cut by tagging a commit on main (v1.0.0).
stage       ← INTEGRATION. All feature work targets this. CI green to merge.
feature/*   ← your work. One branch per task.
fix/*  hotfix/*  chore/*  docs/*   ← also accepted into stage
```

**The flow is `feature|fix|hotfix|chore|docs/* → stage → main`**, and it is
**enforced by the `promotion-guard` job** in `.github/workflows/ci.yml` — a PR with the wrong
base or a branch name outside that list fails CI before anything else runs. `chore/*` is for
tooling and repo housekeeping, `docs/*` for documentation-only work.

Two consequences people trip over:

- **A PR based on `main` is blocked, not merged-with-a-warning.** If you branched before this
  was written down, retarget the PR to `stage` — that is the whole fix.
- **`main` is stale by design between promotions.** Reading `main` to see current state will
  mislead you. `stage` is where the work is.

**Branch naming carries the PRD ID** so a branch maps to committed scope:

```
feature/P1-4.0-bonding-flow
feature/P2-2.0-ocr-dob-extraction
feature/P0-3.0-supabase-rls
fix/P3-3.0-rssi-flapping
```

**Rules that matter when three people work apart:**

1. **Check `git fetch && git branch -r` before starting a task.** Remote branches are the live claim list. If a `feature/P2-2.0-*` branch exists, that task is taken.
2. **Push your branch on day one**, empty if need be. That is how you claim the task. An unpushed branch claims nothing.
3. **Rebase on `stage` every morning.** `git pull --rebase origin stage`. A three-day-old branch is a merge conflict waiting to happen — and with everything landing on `stage`, staying current matters more, not less. (Rebasing on `main` will silently give you a stale base.)
4. **Small PRs.** One task, one PR. A 2000-line PR nobody has seen in progress is unreviewable and unmergeable.
5. **Push daily**, even if unfinished. Work sitting on a laptop is invisible to the other two and invisible to the roadmap.
6. **CI green before merge.** No exceptions.
7. **Tick the TODO box in the same PR** that completes the work. The checkbox is the progress signal; if it lags, the roadmap lies.

**Commit messages:** imperative subject, why-not-what body. Reference the PRD ID.

```
feat(ble): implement §4.5 auth handshake for P1-4.0

Two-frame authResponse write to stay inside the 23-byte ATT MTU;
frame order is mandatory per spec. Constant-time CMAC comparison.
```

### Committing — mechanics in this repo

- **The build machine is macOS + zsh** (it used to be Windows/PowerShell — the `P0-4.0` and `P1-1.0`
  briefs still say otherwise in their §2 and are stale there). Git is on PATH.
- **Use a `git commit -F -` heredoc** for multi-line messages, rather than stacked `-m` flags.
- Never `--no-verify`. **Never force-push `main` or `stage`** — everyone's work lives on `stage`.
- **No Claude co-authorship on commits or pushes.** Do not add a `Co-Authored-By: Claude ...` trailer, "Generated with Claude Code" line, or any other Claude/Anthropic attribution to commit messages. Commits are authored under the developer's own git identity (`git config user.name` / `user.email`) only, same as if they'd typed it themselves.

---

## Commands

The scaffold landed in `P0-4.0`. These all work today (verified Day 9) — the build machine is
**macOS**, so any PowerShell / `git`-not-on-PATH workaround in the older execution briefs describes a
machine that no longer exists:

```bash
npm run typecheck        # tsc --noEmit, x3 projects (app, mock, tests)
npm run lint             # 0 errors; a ruled warning baseline, see below
npm test                 # 273 tests / 30 suites
npm run bundle:check     # iOS + Android Metro bundle — catches what tsc can't
npm run ios              # works; `npm run android` has never been run (no JDK)
npx supabase db push     # migrations
```

**`npm run lint` has a ruled warning baseline, currently 70.** It is *not* "≤ 70 forever" — the rule
is **no `eslint-disable`, and no `no-bitwise` outside `src/features/ble`, `crypto`, `byteLayout`**,
where byte-level work makes bitwise operators unavoidable. Adding a file to those directories may
legitimately raise the count. Suppressing a warning to hold the number down is a breach.

**Run the mock BLE peripheral** (`P0-2.5`) for any BLE work — real hardware isn't available until ~Day 26. It implements spec §4 including failure paths. See its README.

---

## Code conventions

- **TypeScript `strict: true`.** No `any`. No non-null `!` on values crossing a trust boundary.
- **Module layout follows spec §9.2.** Put files where the spec says.
- **No magic bytes.** Every §4 constant comes from `protocol.ts`, with a comment citing its subsection.
- **Every BLE operation has an explicit timeout.** No unbounded `await`.
- **Handle every result code distinctly** (spec §4.7). No generic catch-all for the 10 command results.
- **Lock state UI is notification-driven**, never optimistic. Never render "unlocked" before the device confirms.
- **User-facing verification errors are coaching, never diagnostic.** "We couldn't read the date on your ID" — never a similarity score.
- **Zeroise in `finally`**, so it runs on the exception path too.

### `src/features/verification/**` — extra rules

Persona's SDK captures and uploads the ID/selfie itself — our code never receives the raw image,
DOB, or a biometric score, so the old no-network ESLint guard for this subtree has been removed
(nothing left to protect). The rule that still applies:

1. Never log or persist an `inquiry_id` alongside anything that could re-identify the underlying
   document or selfie — we only ever have the ID and a status string to begin with, keep it that
   way.
2. `PersonaInquiryView`'s `onComplete` status is a UI hint only. The server-side webhook is the
   only thing allowed to write `verifications.provider_status` (inviolable rule 3 below).

---

## Definition of Done

From spec §12.1. All of it, not the happy path:

- [ ] Merged to `stage` via PR; CI green
- [ ] Works on **both** iOS and Android, on a **physical** device
- [ ] Touches 🔴 data → verified no disk write, no log, no network payload
- [ ] Touches BLE → tested against the mock, **failure paths included**
- [ ] Touches backend → RLS written **and tested with a second user's JWT**
- [ ] Error states have a user-visible recovery path
- [ ] TODO checkbox ticked in the same PR

---

## Do not

- **Reintroduce superseded decisions.** No self-hosted Node backend, no Ed25519 on the MCU, no us writing firmware. All rejected — see `docs/archive/`. (Persona/KYC-vendor was on this list too — reversed, see pillar 2 above and `docs/session-log/anish.md`. Written client confirmation is still pending, so treat the vendor decision as provisional until that lands.)
- **Build add-ons.** Admin panel, analytics/Sentry, firmware, advanced PAD are out of scope. If asked, name it as an add-on and point at `TODO-addons.md`.
- **Add analytics or crash reporting to the verification subtree.** Ever. A crash during ID capture must not produce a report containing the ID.
- **Commit secrets.** The Supabase service-role key bypasses every RLS policy. `.gitignore` guards this; don't defeat it.
- **Weaken a security control to make a test pass.** Fix the test.
- **Claim something works without running it.** If tests fail, say so with the output.

---

## Current state

*(Updated Day 10, 2026-08-09. This block goes stale fastest — distrust it if the date is old.)*

- **Phase:** Phase 1, in progress. Phase 0 is done. **There is code, and it now signs in and walks
  end to end on dev** (phone test-OTP → verify stack → seeded Home; Track A, 2026-08-09 — the
  sign-in blocker was a missing `react-native-url-polyfill`, see the Track A brief). `typecheck`,
  `test` (274 tests / 30 suites) and `bundle:check` are green; iOS runs on the simulator.
  **Android has never been compiled** — no JDK, no `ANDROID_HOME` — and both platforms on
  physical hardware are in the Definition of Done.
- **Where the work is:** `chore/integrate-auth-db-persona`, ~62 commits, **not pushed**. `stage` is
  far behind it. Reading `stage` or `main` will mislead you about current state.
- **Blocking the whole plan:** **OQ-1** (sample IDs, hardware ~Day 26), **OQ-4** (who burns the
  device root key into OTP at manufacture), and 🔴 **OQ-12** (the `serial_hash` salt — same factory
  conversation as OQ-4, so chase them together). All answered by the client; all take longer to
  answer than to implement. Chase daily.
- 🔴 **NEW Day 10 — OQ-13, and it outranks the rest.** The client's PCBA archive shows the device is
  a **two-chip design** (PY32C642F app MCU + a separate **YC1012 BLE module** on a UART), so the GATT
  profile belongs to the **BLE module vendor**, not the client — and **§4's six characteristics are
  probably not implementable as written.** The module's profile manual, which holds the real service
  UUID, was not supplied. **What's actually blocked is one constant (`BLE_SERVICE_UUID`) plus the
  wire-level half of the §4.5 handshake** — not the tasks; still don't guess the UUID, it fails
  silently exactly like a guessed OQ-12 salt. Everything transport-independent in `P1-3.0`/`P1-7.0`
  landed on Day 10 against the mock: scan, dedupe, ordering, timeout, adapter-state handling,
  Android runtime permissions, the pairing screen, and reconnect with re-handshake. (An earlier,
  looser version of this line said the two tasks were "blocked outright," and it stalled one
  execution attempt that read it and stopped.) Read
  [`docs/hardware/hqd-device-architecture.md`](docs/hardware/hqd-device-architecture.md) **§8
  specifically before writing any BLE scan or connect code** — sources in
  `docs/hardware/client-supplied-2026-08-09/`.
  **OQ-14**: the supplied SDK is Android-only and keyed on MAC address, so it cannot go to iOS.
- **`P1-4.0` has nothing executable left.** Part 1 (§4.5 handshake + CMAC) and Part 2a (§4.3
  `deviceInfo`) are done and reviewed. Everything remaining is gated on OQ-12 (`salt → serial_hash →
  issue-device-session → K_sess`) or on hardware. Do not "unblock" it by inventing a salt — a guessed
  value fails **silently**.
- **OQ-6 is overdue, not blocking.** The firmware team has still never been contacted, so §4 is an
  unratified contract that several tasks are already built against. That is a real risk, but it is
  not what stops the next commit.
- **11 open questions registered** — spec §13 (OQ-1…OQ-9, OQ-11, OQ-12). **OQ-10 has no row** while
  being referenced in `session-log/sadin.md` — reconstruct it or retire the ID. Read them before
  assuming an answer.
