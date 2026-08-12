# Execution brief — UI-BUILD-E part 3 follow-up: swipe width + swipe coverage

Two review findings from part 3 (`1a83fd9`). Small, surgical, one file of source plus tests.
No new geometry, no copy change, no restyling.

Branch: **`feature/P0-7.0-brand-mark-and-splash`**. Still no PR until part 6.
Baseline to hold: **650 tests / 63 suites · lint 0 errors / 111 warnings**.

---

## Finding 1 🟠 — `pageWidth` assumes zero side insets

`OnboardingCarouselScreen` computes:

```ts
const pageWidth = windowWidth - tokens.spacing.xl * 2;
```

But part 3 also changed `ScreenScaffold` so its content box is:

```
windowWidth - insets.left - insets.right - 2 * tokens.spacing.xl
```

The two disagree the instant a side inset is non-zero. On iPhone portrait
`insets.left/right === 0`, so it is correct today — which is exactly why it passed by eye and
why nothing caught it.

**Where it breaks:** Android has no orientation lock at all, and `ios/BlueSmoke/Info.plist`'s
`UISupportedInterfaceOrientations~ipad` permits both landscape orientations. In landscape the side
insets are non-zero, `pageWidth` overshoots the actual viewport, `pagingEnabled` snaps to offsets
that are not page boundaries, and `Math.round(contentOffset.x / pageWidth)` drifts — so the dots
and the visible card disagree. The part 3 brief named that outcome as **worse than no swipe at
all**.

Note this is the *same bug class* part 3 just fixed one file over: "assume the side inset is
zero." That is the argument for fixing it once, in a shared place, rather than patching the
subtraction in the screen.

### The fix — own the formula in one place

`ScreenScaffold` owns the padding, so it should own the width. Export a hook from
`src/shared/ui/ScreenScaffold.tsx`:

```ts
export function useScaffoldContentWidth(): number
```

returning `useWindowDimensions().width - insets.left - insets.right - 2 * tokens.spacing.xl`, and
derive `ScreenScaffold`'s own horizontal padding from the same constants so the two can never
drift. Export it from `src/shared/ui/index.ts`.

Then in `OnboardingCarouselScreen`, replace the local `pageWidth` computation with the hook.
Delete `useWindowDimensions` from the screen if it becomes unused.

🔴 **Do not** solve this by calling `useSafeAreaInsets()` in the screen and repeating the
subtraction there. That leaves the formula written twice, which is the defect, not the fix.
Parts 4, 5 and 6 all consume `ScreenScaffold`; the next horizontally-measured child must inherit
a correct width without having to rediscover this.

---

## Finding 2 🟠 — the swipe has no test at all

`OnboardingCarouselScreen.test.tsx` has five tests and **all five drive buttons**.
`onMomentumScrollEnd` is never invoked and `PageDots`' `activeIndex` is never asserted. The part 3
report described the button path's coverage as covering "the exact same interaction path" — it
does not. The swipe is the headline new interaction of part 3 and is currently verified by
neither test nor eye (the manual simulator walk of the gesture was not cleanly completed).

### The tests to add

`PageDots` already renders `accessibilityLabel={`Page ${activeIndex + 1} of ${count}`}` — assert
against that label. **Do not** reach into dot styles to infer the active index; the label is the
stable contract and it is the same thing a screen reader announces.

1. **Swipe advances the dots.** Fire the pager's `onMomentumScrollEnd` with
   `nativeEvent.contentOffset.x = pageWidth * 2` → the label reads `Page 3 of 3` **and** the CTA
   is `Get started`. Then fire it back at `x = 0` → `Page 1 of 3` and the CTA is `Continue`.
   Asserting both the label and the CTA is the point: it proves one index state drives the dots
   *and* the content, rather than two that happen to agree.
2. **Buttons move the dots too.** Press `Continue` → `Page 2 of 3`. This is the half that has
   silently had no assertion either.
3. **Page width tracks the safe area.** Mock `useSafeAreaInsets` to return a non-zero
   `left`/`right` (landscape-like, e.g. 59/59), render, and assert each page `View`'s width equals
   `windowWidth - left - right - 2 * tokens.spacing.xl`. The stock
   `react-native-safe-area-context/jest/mock` returns zeroes, so this one needs its own explicit
   mock — that zero is precisely why the bug survived.

### Mutation-probe your own tests before reporting

State the result of each in the report:

- Revert `pageWidth` to `windowWidth - tokens.spacing.xl * 2` → **test 3 must fail.**
- Remove the `onMomentumScrollEnd` prop from the `ScrollView` → **test 1 must fail.**
- Freeze `PageDots`' `activeIndex` to `0` → **tests 1 and 2 must fail.**

A test that still passes under its mutation is not coverage. If one does not fail, fix the test,
do not report it as done.

---

## Do not

- Change any copy. Card 2 must never imply the app does the locking; card 3 keeps "yes or no".
- Touch the illustrations, their geometry, or the padlock's static-ness.
- Touch `GradientGround` — other screens still use it.
- Widen the `contrastCompleteness` fill/stroke exemption.
- Add a dependency, an `eslint-disable`, or a `useColorScheme()` branch.
- Start parts 4/5/6.

---

## Definition of Done

- [ ] `npm run typecheck` clean
- [ ] `npm test` — **full suite, no filter.** Baseline 650 / 63. No `worker process failed to
      exit` warning
- [ ] `npm run lint` — 0 errors, report the count (was 111)
- [ ] `npm run bundle:check` + `:release` green both platforms
- [ ] All three mutation probes reported with their actual result
- [ ] Copy byte-identical
- [ ] Committed in logical chunks; not pushed

---

## The handoff note

```
You are implementing a small follow-up to UI-BUILD-E part 3 for Blue Smoke, a React Native app
controlling a Bluetooth vape device. Part 3 landed and was reviewed; these are two findings from
that review. Surgical scope: one source file's width calculation, one shared hook, and tests.
No new geometry, no copy change, no restyling, no new screens.

READ FIRST:
  1. CLAUDE.md — the three inviolable rules, commit conventions. NO Claude/Anthropic attribution
     on commits, ever.
  2. docs/execution-briefs/UI-BUILD-E-part3-followup-swipe-width.md — this brief.
  3. src/shared/ui/ScreenScaffold.tsx and src/features/onboarding/OnboardingCarouselScreen.tsx.

BRANCH: stay on feature/P0-7.0-brand-mark-and-splash. No PR until part 6.
BASELINE: 650 tests / 63 suites, lint 0 errors / 111 warnings.

FINDING 1 — pageWidth assumes zero side insets.
The screen computes `pageWidth = windowWidth - tokens.spacing.xl * 2`, but ScreenScaffold's
content box is `windowWidth - insets.left - insets.right - 2 * tokens.spacing.xl`. They agree only
because iPhone portrait has zero side insets. Android has NO orientation lock and the iPad
Info.plist permits landscape — there the side insets are non-zero, pageWidth overshoots the
viewport, pagingEnabled snaps to non-page offsets, and Math.round(contentOffset.x / pageWidth)
drifts, so THE DOTS AND THE VISIBLE CARD DISAGREE. The part 3 brief called that outcome worse
than no swipe at all. It is the same bug class part 3 just fixed in ScreenScaffold: "assume the
side inset is zero."

  FIX: export `useScaffoldContentWidth(): number` from src/shared/ui/ScreenScaffold.tsx,
  returning windowWidth - insets.left - insets.right - 2 * tokens.spacing.xl, and derive
  ScreenScaffold's own horizontal padding from the same constants so the two cannot drift.
  Export it from src/shared/ui/index.ts. Use it in OnboardingCarouselScreen in place of the local
  pageWidth. Drop useWindowDimensions from the screen if it becomes unused.

  🔴 DO NOT fix this by calling useSafeAreaInsets() in the screen and repeating the subtraction
  there. Writing the formula twice IS the defect. Parts 4/5/6 all consume ScreenScaffold and the
  next horizontally-measured child must inherit a correct width without rediscovering this.

FINDING 2 — the swipe has NO test.
OnboardingCarouselScreen.test.tsx has five tests and ALL FIVE drive buttons.
onMomentumScrollEnd is never invoked and PageDots' activeIndex is never asserted anywhere. The
part 3 report claimed the button tests covered "the exact same interaction path" — they do not.
The swipe is part 3's headline interaction and is currently verified by neither test nor eye.

  PageDots already renders accessibilityLabel={`Page ${activeIndex + 1} of ${count}`}. ASSERT
  AGAINST THAT LABEL. Do not reach into dot styles to infer the active index — the label is the
  stable contract and is what a screen reader announces.

  Add three tests:
   1. Fire the pager's onMomentumScrollEnd with nativeEvent.contentOffset.x = pageWidth * 2 →
      label reads "Page 3 of 3" AND the CTA is "Get started". Then fire it at x = 0 → "Page 1 of
      3" and CTA "Continue". Assert BOTH label and CTA — that is what proves ONE index state
      drives the dots and the content, not two that happen to agree.
   2. Press Continue → label reads "Page 2 of 3". (This half has had no assertion either.)
   3. Mock useSafeAreaInsets to a non-zero left/right (landscape-like, e.g. 59/59), render, and
      assert each page View's width === windowWidth - left - right - 2 * tokens.spacing.xl. The
      stock react-native-safe-area-context/jest/mock returns ZEROES — that zero is exactly why
      this bug survived — so this test needs its own explicit mock.

MUTATION-PROBE YOUR OWN TESTS AND REPORT EACH RESULT:
   - Revert pageWidth to `windowWidth - tokens.spacing.xl * 2`  → test 3 MUST fail.
   - Remove onMomentumScrollEnd from the ScrollView             → test 1 MUST fail.
   - Freeze PageDots' activeIndex to 0                          → tests 1 and 2 MUST fail.
  A test that still passes under its mutation is not coverage. If one does not fail, fix the
  test — do not report it as done.

DO NOT:
  - Change any copy. Card 2 must NEVER imply the APP does the locking (the firmware dead-man
    timer does). Card 3 must keep "yes or no".
  - Touch the illustrations, their geometry, or the padlock's static-ness.
  - Touch GradientGround — other screens still use it.
  - Widen the contrastCompleteness fill/stroke exemption.
  - Add a dependency, an eslint-disable, or a useColorScheme() branch.
  - Start parts 4/5/6.

WHEN DONE, run and report ACTUAL numbers — never "should pass":
  npm run typecheck
  npm test                      🔴 RUN THE FULL SUITE, NOT A FILTERED SUBSET. Baseline is
                                650 tests / 63 suites. A previous report quoted numbers from a
                                partial run of the 4 jest projects and drew a false conclusion
                                from it. Must NOT emit "worker process has failed to exit
                                gracefully".
  npm run lint                  (0 errors, report the warning count — was 111)
  npm run bundle:check          (both platforms)
  npm run bundle:check:release  (both platforms)
  Plus the three mutation probes above, each with its actual result.

Android still cannot be compiled here — no JDK, no ANDROID_HOME. Say so plainly.
If the simulator gesture walk is not cleanly achievable, say so plainly too rather than
describing button coverage as if it were swipe coverage.

Commit in logical chunks. Do not push and do not open a PR until Sadin asks.
```
