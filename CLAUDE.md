# CLAUDE.md — Blue Smoke

Guidance for Claude Code when working in this repository.

---

## What this is

A React Native (iOS + Android) app controlling a **Bluetooth-enabled vape device**. Three pillars:

1. **Accounts & multi-device BLE pairing** — ownership enforced server-side via Supabase RLS
2. **On-device 18+ age verification** — ID OCR + selfie face match, entirely on the phone, no KYC vendor
3. **Proximity lock/unlock** — authenticated BLE commands; the device auto-locks itself when the phone leaves range

**Timeline: 30 days.** Aggressive. Scope is fixed by a client PRD.

---

## 🔴 The three inviolable rules

Check these on **every** change. A breach is an automatic block, not a review comment.

1. **No image, video frame, or biometric embedding is ever written to disk, logged, sent to a crash reporter, or transmitted.** RAM only, zeroised in a `finally` block.
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
| OCR / DOB rules / face-match thresholds | Spec **§6** |
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
| **Verification** | `src/features/verification/**`, `src/native/**` | ID capture, OCR/DOB, liveness, face match. **The 🔴 zone** — extra rules below. Most self-contained area; easiest to work in without collisions. |
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
main        ← integration branch. All PRs target this. CI green to merge.
              Releases are cut by tagging a commit on main (v1.0.0).
feature/*   ← your work. One branch per task.
```

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
3. **Rebase on `main` every morning.** `git pull --rebase origin main`. A three-day-old branch is a merge conflict waiting to happen — and with everything landing on `main`, staying current matters more, not less.
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

- **Git is not on PATH.** Prefix: `$env:PATH = "C:\Program Files\Git\cmd;$env:PATH"`
- **PowerShell 5.1 mangles `-m` messages containing double quotes.** Write the message to a file and use `git commit -F <file>`.
- Never `--no-verify`. **Never force-push `main`** — everyone's work lives there.
- **No Claude co-authorship on commits or pushes.** Do not add a `Co-Authored-By: Claude ...` trailer, "Generated with Claude Code" line, or any other Claude/Anthropic attribution to commit messages. Commits are authored under the developer's own git identity (`git config user.name` / `user.email`) only, same as if they'd typed it themselves.

---

## Commands

**No application code exists yet.** The scaffold lands in `P0-4.0`. Until then there is nothing to run.

Once scaffolded, expect (verify against `package.json` before relying on these):

```powershell
npm install
npm run ios / npm run android
npm run typecheck        # tsc --noEmit
npm run lint
npm test
npm run test:e2e         # Detox
npx supabase db push     # migrations
```

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

1. No logging, analytics, or persistence imports. ESLint-enforced (`no-restricted-imports`).
2. Only `decision.ts` exports outward, returning exactly `{ passed, method, thresholdVersion, outcomeReason }`.
3. Nothing else escapes the subtree. Not the DOB, not the score, not the crop.

---

## Definition of Done

From spec §12.1. All of it, not the happy path:

- [ ] Merged to `main` via PR; CI green
- [ ] Works on **both** iOS and Android, on a **physical** device
- [ ] Touches 🔴 data → verified no disk write, no log, no network payload
- [ ] Touches BLE → tested against the mock, **failure paths included**
- [ ] Touches backend → RLS written **and tested with a second user's JWT**
- [ ] Error states have a user-visible recovery path
- [ ] TODO checkbox ticked in the same PR

---

## Do not

- **Reintroduce superseded decisions.** No Persona/KYC vendor, no self-hosted Node backend, no Ed25519 on the MCU, no us writing firmware. All rejected — see `docs/archive/`.
- **Build add-ons.** Admin panel, analytics/Sentry, firmware, advanced PAD are out of scope. If asked, name it as an add-on and point at `TODO-addons.md`.
- **Add analytics or crash reporting to the verification subtree.** Ever. A crash during ID capture must not produce a report containing the ID.
- **Commit secrets.** The Supabase service-role key bypasses every RLS policy. `.gitignore` guards this; don't defeat it.
- **Weaken a security control to make a test pass.** Fix the test.
- **Claim something works without running it.** If tests fail, say so with the output.

---

## Current state

- **Phase:** Pre-development. Docs complete, no code.
- **Next:** Phase 0 — `docs/project-roadmap-todos/TODO-phase-0.md`
- **Blocking the whole plan:** **OQ-1** (sample IDs by Day 15, hardware by Day 26) and **OQ-4** (who burns the device root key into OTP at manufacture). Both answered by the client, both take longer to answer than to implement. Chase daily.
- **9 open questions** — spec §13. Read them before assuming an answer.
