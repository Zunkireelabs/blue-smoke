# Execution brief — UI-BUILD-E part 3 follow-up 2: clear the act() warnings

Test-hygiene only. **No production code changes.** Small, and worth doing before part 4 because
parts 4/5/6 add nineteen more screens that render `BrandMark`, which is what emits these.

Branch: **`feature/P0-7.0-brand-mark-and-splash`**. Still no PR until part 6.
Baseline to hold: **653 tests / 63 suites · lint 0 errors / 111 warnings**.
Current act() warnings in the full unfiltered suite: **5** (deterministic — measured over 5 runs).

---

## What is actually happening

The previous report described this as a Jest-teardown artifact of `-t` filtering, and said the
full suite was clean. Both halves are wrong. Measured on the full unfiltered suite:

| Commit | act warnings | Where |
|---|---|---|
| `3534870` (pre-part-3) | **2** | `BootSplashScreen.test.tsx` |
| `1a83fd9` (part 3) | **4** | +1 `OnboardingCarouselScreen`, +1 `navigation.gating` |
| `c33b340` (follow-up 1) | **5** | `OnboardingCarouselScreen` now 2 |

So two are genuinely pre-existing and **three were introduced by part 3 and its follow-up** — the
carousel now renders `BrandMark` through `FlameIllustration`.

**The mechanism.** `BrandMark`'s mount effect does:

```ts
AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (mounted) setReduceMotion(enabled); });
```

That `.then` resolves on a microtask *after* a synchronous `act(() => create(...))` has already
closed. The `setReduceMotion` therefore lands outside any act scope → warning. It is not
filtering, not teardown, and not flaky: it is deterministic and reproduces on every full run.

🔴 **`BrandMark.tsx` is not at fault and must not be changed.** It already guards with `mounted`
and cleans up correctly. Editing production code to quiet a test-harness warning would be the
wrong fix.

**The correct pattern already exists in this repo.** `src/shared/ui/__tests__/BrandMark.test.tsx`
gets it right — it creates the renderer *inside* an async act and flushes microtasks in that same
act, so the state update is captured:

```ts
await act(async () => {
  renderer = ReactTestRenderer.create(<BrandMark size={100} />);
  await Promise.resolve();
  await Promise.resolve();
});
```

The three emitting suites each miss this in a different way:

- `OnboardingCarouselScreen.test.tsx` — `renderCarousel()` uses a **synchronous** `act`, and its
  `flushReduceMotionCheck()` runs in a *separate, later* act. Too late: the warning has already
  fired. It is also applied to only two of the three new tests.
- `navigation.gating.test.tsx` — uses `await ReactTestRenderer.act(() => create(...))`. The `act`
  is awaited but its **callback is synchronous**, so microtasks never flush inside it.
- `BootSplashScreen.test.tsx` — synchronous `act`, and it renders the real `BrandMark` with
  `isReduceMotionEnabled` **unmocked**. These are the two pre-existing ones.

---

## The fix

### 1. One shared helper, in a proper shared home

Create **`src/shared/testing/renderWithEffects.tsx`** (new directory — additive, nobody else's
in-flight work touches it):

```ts
/** Creates a renderer inside an async act and flushes the microtasks that `BrandMark`'s
 *  reduce-motion probe resolves on, so its `setReduceMotion` is captured by that act instead of
 *  landing outside one. Two ticks, not one: the first settles
 *  `AccessibilityInfo.isReduceMotionEnabled()`'s `.then`, the second lets the resulting state
 *  update flush. */
export async function renderSettled(element: React.ReactElement): Promise<ReactTestRenderer.ReactTestRenderer>
```

Also export a `flushSettled()` for suites that must construct the renderer themselves
(`navigation.gating` builds a navigator).

🔴 **Do not** put this in `src/features/auth/testUtils.ts`. Ten suites across five features
already import from there, which is a cross-feature dependency we should stop growing, and
`src/app/__tests__` suites importing from `features/auth` would be worse still. **Do not** export
it from `src/shared/ui/index.ts` — it is test-only and must never become reachable from app code
or the release bundle.

### 2. Convert the three suites

- `src/features/onboarding/__tests__/OnboardingCarouselScreen.test.tsx` — make `renderCarousel()`
  async and use the helper; delete the now-redundant `flushReduceMotionCheck()`. Every test in the
  file uses it, not two of three.
- `src/app/__tests__/navigation.gating.test.tsx` — make the act callbacks async and flush inside.
- `src/app/__tests__/BootSplashScreen.test.tsx` — same. Closing these two pre-existing ones is
  the point: a suite at "2 known warnings" is a suite where the third goes unnoticed.

Keep every existing `afterEach` unmount exactly as it is. Those exist because a real
`Animated.loop` outliving a test hangs the worker — that hazard is unrelated to this one and its
guard must not be disturbed.

### 3. 🔴 Do not silence, only fix

No `jest.spyOn(console, 'error')`, no console mock, no Jest config that filters warnings, no
`--silent`. Suppressing the console is the obvious cheat here and it is a breach, not a fix: it
would hide the next real one too. If a warning cannot be fixed by the act pattern, leave it and
say so plainly in the report.

### 4. Then evaluate, but do not land, the standing guard

Once the count is zero, report **how many suites would fail** if Jest were configured to fail a
test on any unexpected `console.error`. That is the durable way to hold zero as parts 4/5/6 land.
**Report the number and stop — do not implement it in this commit.** It is Sadin's call whether
that blast radius is worth taking now.

---

## Verification — measure, don't assert

The whole finding here came from a claim that wasn't measured. Run the full suite and count:

```bash
npm test 2>&1 | grep -c "not wrapped in act"        # must print 0
npm test 2>&1 | grep -c "worker process has failed" # must print 0
```

Run it **three times** and report all three counts. `-t`-filtered runs prove nothing about this
and must not be used as evidence either way.

**Mutation-probe the helper** — revert one converted suite to its synchronous `act` and confirm
the warning count rises above zero. A helper that changes nothing when removed isn't the fix.
Report the actual number observed.

---

## Do not

- Change `src/shared/ui/BrandMark.tsx`, or any other production file. This commit is tests only.
- Change any copy, geometry, or styling.
- Remove or weaken any existing `afterEach` unmount.
- Silence the console in any form.
- Add a dependency or an `eslint-disable`.
- Start parts 4/5/6.

---

## Definition of Done

- [ ] `npm run typecheck` clean
- [ ] `npm test` — full unfiltered suite, **653 / 63**, no test count change (this is tests-only
      refactoring, not new coverage)
- [ ] **`grep -c "not wrapped in act"` prints 0, reported for three separate runs**
- [ ] `grep -c "worker process has failed"` prints 0
- [ ] `npm run lint` — 0 errors, report the count (was 111)
- [ ] `npm run bundle:check` + `:release` green both platforms
- [ ] Mutation probe reported with its actual number
- [ ] Suite count for the `console.error` guard reported, guard **not** implemented
- [ ] `git diff --stat` touches test files and the new `src/shared/testing/` helper only
- [ ] Committed; not pushed

---

## The handoff note

```
You are doing a small test-hygiene cleanup on Blue Smoke, a React Native app controlling a
Bluetooth vape device, following the UI-BUILD-E part 3 review. TESTS ONLY — no production code
changes at all. Worth doing now because parts 4/5/6 add nineteen more screens rendering BrandMark,
which is what emits these warnings.

READ FIRST:
  1. CLAUDE.md — the three inviolable rules, commit conventions. NO Claude/Anthropic attribution
     on commits, ever.
  2. docs/execution-briefs/UI-BUILD-E-part3-followup2-act-warnings.md — this brief.
  3. src/shared/ui/__tests__/BrandMark.test.tsx — this suite ALREADY DOES IT RIGHT. Copy its
     pattern.

BRANCH: stay on feature/P0-7.0-brand-mark-and-splash. No PR until part 6.
BASELINE: 653 tests / 63 suites, lint 0 errors / 111 warnings.

THE FACTS (measured, not assumed). The full UNFILTERED suite emits 5 act() warnings,
deterministically — 5 on every one of 5 runs. A previous report called this a "-t filtering
artifact" and the full suite "clean". Both halves are wrong. Across commits:
  3534870 (pre-part-3): 2  — BootSplashScreen only
  1a83fd9 (part 3):     4  — +1 OnboardingCarouselScreen, +1 navigation.gating
  c33b340 (follow-up):  5  — OnboardingCarouselScreen now 2
Two are pre-existing; THREE were introduced by part 3 + its follow-up, because the carousel now
renders BrandMark via FlameIllustration.

MECHANISM: BrandMark's mount effect does
  AccessibilityInfo.isReduceMotionEnabled().then(enabled => { if (mounted) setReduceMotion(enabled) })
That .then resolves on a microtask AFTER a synchronous act(() => create(...)) has closed, so the
setState lands outside any act scope. Not filtering, not teardown, not flaky.

🔴 BrandMark.tsx IS NOT AT FAULT AND MUST NOT BE CHANGED. It already guards with `mounted` and
cleans up correctly. Editing production code to quiet a test-harness warning is the wrong fix.

THE CORRECT PATTERN (already in BrandMark.test.tsx) — create the renderer INSIDE an async act and
flush microtasks in THAT SAME act:
  await act(async () => {
    renderer = ReactTestRenderer.create(<BrandMark size={100} />);
    await Promise.resolve();
    await Promise.resolve();
  });

THE THREE SUITES, each broken differently:
  - OnboardingCarouselScreen.test.tsx — renderCarousel() uses a SYNCHRONOUS act, and its
    flushReduceMotionCheck() runs in a SEPARATE, LATER act. Too late; the warning already fired.
    It's also applied to only 2 of the 3 new tests.
  - navigation.gating.test.tsx — uses `await ReactTestRenderer.act(() => create(...))`. The act is
    awaited but its CALLBACK IS SYNCHRONOUS, so microtasks never flush inside it.
  - BootSplashScreen.test.tsx — synchronous act, renders the real BrandMark with
    isReduceMotionEnabled UNMOCKED. These are the 2 pre-existing ones.

WHAT TO DO:
 1. Create src/shared/testing/renderWithEffects.tsx (new directory, additive):
      export async function renderSettled(element): Promise<ReactTestRenderer.ReactTestRenderer>
    creating the renderer inside an async act and flushing two microtask ticks — the first settles
    isReduceMotionEnabled()'s .then, the second lets the resulting state update flush. COMMENT WHY
    IT IS TWO TICKS; a bare double `await Promise.resolve()` reads as a magic incantation.
    Also export flushSettled() for suites that must build the renderer themselves
    (navigation.gating builds a navigator).

    🔴 DO NOT put this in src/features/auth/testUtils.ts — ten suites across five features already
    import from there and we should stop growing that cross-feature dependency; src/app/__tests__
    importing from features/auth would be worse. DO NOT export it from src/shared/ui/index.ts —
    it is test-only and must never be reachable from app code or the release bundle.

 2. Convert all three suites to the helper. In OnboardingCarouselScreen.test.tsx make
    renderCarousel() async and delete the now-redundant flushReduceMotionCheck(); EVERY test in
    the file uses the helper, not two of three.

    KEEP every existing afterEach unmount exactly as-is. Those exist because a real Animated.loop
    outliving a test hangs the worker — a different hazard, and its guard must not be disturbed.

 3. 🔴 DO NOT SILENCE. No jest.spyOn(console,'error'), no console mock, no Jest config filtering
    warnings, no --silent. Suppressing the console is the obvious cheat and it is a BREACH, not a
    fix — it would hide the next real one too. If something can't be fixed by the act pattern,
    leave it and say so plainly.

 4. Once the count is zero, REPORT HOW MANY SUITES would fail if Jest were configured to fail a
    test on any unexpected console.error. REPORT THE NUMBER AND STOP — do not implement it. It is
    Sadin's call whether that blast radius is worth taking now.

VERIFY BY MEASURING, NOT ASSERTING (this whole finding came from an unmeasured claim):
  npm test 2>&1 | grep -c "not wrapped in act"         → must print 0
  npm test 2>&1 | grep -c "worker process has failed"  → must print 0
  RUN IT THREE TIMES AND REPORT ALL THREE COUNTS. A -t-filtered run proves nothing about this and
  is not evidence either way.

  MUTATION PROBE: revert ONE converted suite to its synchronous act and confirm the count rises
  above zero. A helper that changes nothing when removed is not the fix. Report the actual number.

ALSO REPORT ACTUAL NUMBERS FOR:
  npm run typecheck
  npm test                      (full unfiltered; expect 653 / 63 UNCHANGED — this is tests-only
                                refactoring, not new coverage. If the count moves, explain why.)
  npm run lint                  (0 errors, report the warning count — was 111)
  npm run bundle:check          (both platforms)
  npm run bundle:check:release  (both platforms)
  git diff --stat               (must touch test files + the new src/shared/testing/ helper ONLY)

DO NOT:
  - Change BrandMark.tsx or any other production file.
  - Change any copy, geometry, or styling.
  - Remove or weaken any existing afterEach unmount.
  - Add a dependency or an eslint-disable.
  - Start parts 4/5/6.

Android still cannot be compiled here — no JDK, no ANDROID_HOME. Say so plainly.

Commit in logical chunks. Do not push and do not open a PR until Sadin asks.
```
