# Execution brief — the standing `console.error` guard

Make an unexpected `console.error` fail the test that produced it, across all four Jest projects.
Test infrastructure only. **No production code changes.**

Branch: **`feature/P0-7.0-brand-mark-and-splash`**. Still no PR until part 6.
Baseline: **653 tests / 63 suites · lint 0 errors / 111 warnings · 0 act warnings**.

---

## Why now

Three review rounds on part 3 each found something real, and one of them — five `act()` warnings,
three of them newly introduced — was invisible to every gate we run. Nothing in CI reads console
output, so a regression of that class is only ever caught by a human reading scrollback.

**The blast radius today is zero.** Measured independently, twice: the full suite passes 63/63,
653/653 with the guard wired. That is the cheapest this will ever be, and part 4 adds seven
screens, parts 5 and 6 twelve more.

---

## Design — collect and assert, do not throw in place

🔴 **Do not throw from inside the `console.error` replacement.** React calls `console.error` from
inside its own render and commit paths, several of which sit behind `try/catch`. A throw there
either gets swallowed (guard silently does nothing) or surfaces as a bizarre unrelated failure
pointing at React internals. Both are worse than no guard.

Instead: **record** each call, and **assert the record is empty in an `afterEach`**. The failure
is then attributed cleanly to the test that caused it, and cannot be swallowed.

Always pass the call through to the real `console.error` as well. A guard that hides the output it
fails on makes debugging worse.

### 🔴 Do not implement it with `jest.spyOn`

`src/features/onboarding/__tests__/OnboardingCarouselScreen.test.tsx` calls
`jest.restoreAllMocks()` in its `afterEach`, and other suites may too. That would silently unhook a
`spyOn`-based guard partway through a run — leaving it green and useless, which is the exact
failure mode this guard exists to prevent.

Assign `console.error` directly, keep the original in a module-level reference, and restore it in
`afterAll`. A plain assignment is immune to `restoreAllMocks()`.

### Escape hatch — explicit, per-test, never global

Provide `allowConsoleError(matcher: string | RegExp)` for a test that legitimately asserts on error
logging. **There are zero uses today and there should be zero in this commit** — it exists so that
the future test which needs one has a sanctioned route that isn't "disable the guard."

🔴 Never add a blanket mute, a global allowlist, or a `console.error` mock in a test file. If a
suite starts failing, the warning is the finding — fix it or report it, do not silence it.

---

## Wiring — all four projects

Put the guard in a new **`tools/jest/failOnConsoleError.js`** (repo-level, not under `src/` — the
three Node projects must not import from the app tree).

Each project sets `setupFilesAfterEnv` via `require.resolve`, matching how the existing configs
already resolve their babel configs. Note each Node project sets `rootDir: '.'` to its own
directory, so a `<rootDir>`-relative path would be wrong in three of the four:

| Config | Path |
|---|---|
| `jest.config.js` (app, inline) | `require.resolve('./tools/jest/failOnConsoleError.js')` |
| `tools/mock-peripheral/jest.config.js` | `require.resolve('../jest/failOnConsoleError.js')` |
| `tools/lint-guard/jest.config.js` | `require.resolve('../jest/failOnConsoleError.js')` |
| `supabase/functions/jest.config.js` | `require.resolve('../../tools/jest/failOnConsoleError.js')` |

Keep each config's existing header comment and add a one-line note saying what the new entry is
for.

---

## Test the guard itself

A guard nobody tests is a guard that quietly no-ops — the same trap as part 1's unprotected
`flex: 1`, and as the `restoreAllMocks` hazard above.

Structure `failOnConsoleError.js` so its logic is a small importable core (record / assert /
allow), with the setup file only wiring that core into `beforeEach`/`afterEach`/`afterAll`. Then
test the core directly, which cannot fail itself:

1. Recording an error and asserting → **throws**.
2. Recording nothing and asserting → **does not throw**.
3. Recording an error that matches an `allowConsoleError` matcher → **does not throw**.
4. An allowed matcher that never fires → **fails** (a stale allowance must not pass silently).

This is new coverage, so the test count **will** rise above 653. State the new number and say it
was expected — do not report it as an unexplained change.

---

## Verification

```bash
npm test 2>&1 | grep -c "not wrapped in act"        # still 0
npm test 2>&1 | grep -c "worker process has failed" # still 0
```

**Mutation probes — report the actual result of each:**

1. Make the guard's assert a no-op → **the new core tests must fail.**
2. Add a scratch test that calls `console.error('probe')` → **it must fail**, and the failure must
   name that test. Delete the scratch test afterwards and confirm `git status` is clean.
3. Add `jest.restoreAllMocks()` to a suite that doesn't have it → **the guard must still fire**
   (probe 2 still fails). This is the `spyOn` hazard; prove the implementation is immune. Revert.

**Also measure and report, but do NOT implement:** how many suites would fail if the same guard
covered `console.warn`. Report the number and stop — that is a separate decision.

---

## Do not

- Change any production file. Infrastructure and tests only.
- Use `jest.spyOn` for the guard, or throw from inside the `console.error` replacement.
- Add any blanket mute, global allowlist, or per-file console mock.
- Extend the guard to `console.warn` in this commit.
- Touch `package.json` or add a dependency.
- Start part 4.

---

## Definition of Done

- [ ] `npm run typecheck` clean
- [ ] `npm test` — full unfiltered suite green; **report the new test/suite counts** (653/63 plus
      the guard's own tests)
- [ ] `grep -c "not wrapped in act"` still 0; `grep -c "worker process has failed"` still 0
- [ ] `npm run lint` — 0 errors, report the count (was 111)
- [ ] `npm run bundle:check` + `:release` green both platforms
- [ ] All four projects wired; state that you verified each one loads the setup file
- [ ] All three mutation probes reported with actual results
- [ ] `console.warn` blast radius reported, guard **not** extended
- [ ] Committed; not pushed

---

## The handoff note

```
You are adding a standing test-infrastructure guard to Blue Smoke, a React Native app controlling
a Bluetooth vape device: an unexpected console.error must fail the test that produced it, across
all four Jest projects. INFRASTRUCTURE AND TESTS ONLY — no production code changes.

READ FIRST:
  1. CLAUDE.md — the three inviolable rules, commit conventions. NO Claude/Anthropic attribution
     on commits, ever.
  2. docs/execution-briefs/UI-BUILD-E-console-error-guard.md — this brief.
  3. jest.config.js and the three project configs it points at.

BRANCH: stay on feature/P0-7.0-brand-mark-and-splash. No PR until part 6.
BASELINE: 653 tests / 63 suites, lint 0 errors / 111 warnings, 0 act warnings.

WHY: three review rounds on part 3 each found something real, and one of them — five act()
warnings, three newly introduced — was invisible to every gate we run, because nothing in CI reads
console output. The blast radius today is ZERO: measured independently twice, the full suite passes
63/63 and 653/653 with this guard wired. It is the cheapest it will ever be; part 4 adds 7 screens
and parts 5/6 another 12.

DESIGN — COLLECT AND ASSERT, DO NOT THROW IN PLACE:
🔴 Do NOT throw from inside the console.error replacement. React calls console.error from inside
its own render/commit paths, several of which sit behind try/catch — a throw there is either
SWALLOWED (guard silently does nothing) or surfaces as a bizarre failure pointing at React
internals. Both are worse than no guard.
  Instead: RECORD each call, and ASSERT the record is empty in an afterEach. The failure is then
  attributed cleanly to the test that caused it and cannot be swallowed.
  Always pass the call through to the real console.error too — a guard that hides the output it
  fails on makes debugging worse.

🔴 DO NOT IMPLEMENT IT WITH jest.spyOn.
src/features/onboarding/__tests__/OnboardingCarouselScreen.test.tsx calls jest.restoreAllMocks()
in its afterEach, and other suites may too. That would silently unhook a spyOn-based guard partway
through a run, leaving it GREEN AND USELESS — the exact failure mode this guard exists to prevent.
  Assign console.error directly, keep the original in a module-level reference, restore it in
  afterAll. A plain assignment is immune to restoreAllMocks().

ESCAPE HATCH — explicit, per-test, never global:
  Provide allowConsoleError(matcher: string | RegExp) for a test that legitimately asserts on error
  logging. There are ZERO uses today and there must be zero in this commit — it exists so the
  future test that needs one has a sanctioned route that isn't "disable the guard".
  🔴 Never add a blanket mute, a global allowlist, or a console.error mock in a test file. If a
  suite starts failing, the warning IS the finding — fix it or report it, do not silence it.

WIRING — all four projects. Put the guard in a NEW tools/jest/failOnConsoleError.js (repo-level,
NOT under src/ — the three Node projects must not import from the app tree). Each project sets
setupFilesAfterEnv via require.resolve, matching how the existing configs already resolve their
babel configs. NOTE each Node project sets rootDir:'.' to its OWN directory, so a <rootDir>-
relative path would be wrong in three of the four:
  jest.config.js (app, inline)           require.resolve('./tools/jest/failOnConsoleError.js')
  tools/mock-peripheral/jest.config.js   require.resolve('../jest/failOnConsoleError.js')
  tools/lint-guard/jest.config.js        require.resolve('../jest/failOnConsoleError.js')
  supabase/functions/jest.config.js      require.resolve('../../tools/jest/failOnConsoleError.js')
Keep each config's existing header comment; add a one-line note for the new entry.

TEST THE GUARD ITSELF — a guard nobody tests is a guard that quietly no-ops (same trap as part 1's
unprotected `flex: 1`). Structure failOnConsoleError.js so its logic is a small importable core
(record / assert / allow), with the setup file only wiring that core into
beforeEach/afterEach/afterAll. Then test the core directly, which cannot fail itself:
  1. record an error, then assert            → THROWS
  2. record nothing, then assert             → does NOT throw
  3. record an error matching an allowance   → does NOT throw
  4. an allowance that never fires           → FAILS (a stale allowance must not pass silently)
This is new coverage, so the test count WILL rise above 653. State the new number and say it was
expected — do not report it as an unexplained change.

VERIFY:
  npm test 2>&1 | grep -c "not wrapped in act"         → still 0
  npm test 2>&1 | grep -c "worker process has failed"  → still 0

MUTATION PROBES — report the ACTUAL result of each:
  1. Make the guard's assert a no-op → the new core tests MUST fail.
  2. Add a scratch test calling console.error('probe') → it MUST fail, and the failure must name
     that test. Delete the scratch test and confirm `git status` is clean.
  3. Add jest.restoreAllMocks() to a suite that lacks it → the guard MUST still fire (probe 2
     still fails). This is the spyOn hazard — prove the implementation is immune. Revert.

ALSO MEASURE AND REPORT, BUT DO NOT IMPLEMENT: how many suites would fail if the same guard
covered console.warn. Report the number and STOP — separate decision, Sadin's call.

DO NOT:
  - Change any production file. Infrastructure and tests only.
  - Use jest.spyOn for the guard, or throw from inside the console.error replacement.
  - Add any blanket mute, global allowlist, or per-file console mock.
  - Extend the guard to console.warn in this commit.
  - Touch package.json or add a dependency.
  - Start part 4.

WHEN DONE, run and report ACTUAL numbers — never "should pass":
  npm run typecheck
  npm test                      (full unfiltered; report the NEW test/suite counts and confirm all
                                four projects ran)
  npm run lint                  (0 errors, report the warning count — was 111)
  npm run bundle:check          (both platforms)
  npm run bundle:check:release  (both platforms)
  git diff --stat
  Plus the three mutation probes and the console.warn number.

Android still cannot be compiled here — no JDK, no ANDROID_HOME. Say so plainly.

Commit in logical chunks. Do not push and do not open a PR until Sadin asks.
```
