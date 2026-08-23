# Execution brief — UI-BUILD-E part 3, onboarding

`ON-1` / `ON-2` / `ON-3` — the three-card carousel, all in
`src/features/onboarding/OnboardingCarouselScreen.tsx` (100 lines).

Part 1 (primitives) is done and merged into the branch. **Part 2 (app icons) is deliberately
skipped for now** — this part runs next.

Baseline to hold: **643 tests / 63 suites · lint 0 errors / 111 warnings**.
Branch: **`feature/P0-7.0-brand-mark-and-splash`**. Still no PR until part 6.

---

## 🔴 The copy does not change. Not one word.

The three cards' words are load-bearing and were written against hard constraints. A visual pass
that "tightens" them is a breach, not an improvement.

- **Card 2 must never imply the *app* does the locking.** The firmware dead-man timer does, and
  the device locks itself whether or not BlueSmoke is running. This is an inviolable rule in
  CLAUDE.md, not a preference.
- **Card 3 must keep "yes or no."** It deliberately does *not* claim an age was "verified as
  18+", because nothing in our code can confirm the vendor's template actually checks age
  (`min_age`). Strengthening that sentence makes it false.

Keep the existing comments above each card — they are why the words are what they are.

---

## What changes

| | Today | After |
|---|---|---|
| Ground | `GradientGround` | `BrandGround` (full-bleed `#1657D0`) |
| Layout | Everything vertically centred | `ScreenScaffold` — illustration in the header slot, actions pinned bottom |
| Illustration | none | one per card, below |
| Progress | the literal string `"1 of 3"` | `PageDots` |
| Buttons | default variant | `shape="pill"`, `variant="onBrand"`; Skip as `variant="textLink"` |
| Gesture | none | swipe left/right, buttons still work |

**Swipe: use React Native's own `ScrollView` with `pagingEnabled`.** No new dependency. The
buttons and the swipe must drive the same index state — a screen where the dots and the content
can disagree is worse than no swipe at all.

---

## The illustrations

Three new components in **`src/shared/ui/illustrations/`** — `FlameIllustration`,
`ProximityIllustration`, `PrivacyIllustration`. All authored on a **100×100 viewBox**, all
**white on the brand ground**, all sized by a `size` prop.

🔴 **They go in `src/shared/ui/` on purpose.** Placed under `features/onboarding` they would fall
outside `contrastCompleteness`'s scan entirely and escape the guard silently. Inside
`src/shared/ui` they are scanned — which means you must extend the **scoped** `fill`/`stroke`
exemption to this directory, named and reasoned, exactly as `BrandMark.tsx` has it. **Do not make
it global.**

### ON-1 · Welcome

No new geometry. `<BrandMark tone="solid" groundColor={tokens.color.brand} />`, large.

### ON-2 · It locks itself

Three arc pairs, centre `(50, 57)`, plus a closed padlock. Stroke `round` caps, no fill.

| Layer | Left arc | Right arc | Width | Opacity |
|---|---|---|---|---|
| r=26 | `M33.99 77.49 A26 26 0 0 1 33.99 36.51` | `M66.01 36.51 A26 26 0 0 1 66.01 77.49` | 3.2 | 0.62 |
| r=35 | `M28.45 84.58 A35 35 0 0 1 28.45 29.42` | `M71.55 29.42 A35 35 0 0 1 71.55 84.58` | 3.2 | 0.38 |
| r=44 | `M22.91 91.67 A44 44 0 0 1 22.91 22.33` | `M77.09 22.33 A44 44 0 0 1 77.09 91.67` | 3.2 | 0.20 |

**Padlock** (all white, knockout in `tokens.color.brand`):

- Shackle: `M41.6 45.98 A8.4 8.4 0 0 1 58.4 45.98`, stroke-width 4.2, round caps, no fill
- Body: rounded rect `x 38.45 → 61.55`, `y 45.98 → 68.03`, radius 4.2, filled
- Keyhole: circle centre `(50, 56.16)`, r 2.94, filled **brand** (knockout)
- Stem: rounded rect `x 48.64 → 51.37`, `y 55.95 → 62.78`, radius 1.37, filled **brand**

**Motion — arcs only.** Each of the three pairs is its own `<Svg>` in its own `Animated.View`;
opacity pulses between its base value and ~35% of it, staggered 0.4s, ~3s cycle, looping,
`useNativeDriver: true`.

🔴 **The padlock never moves, and never opens.** Animating it opening would say "it unlocks by
itself" — the opposite of the card's meaning, and alarming on a child-safety feature. A closed
lock under a signal that comes and goes is precisely the message: the device's resting state is
locked.

Reduced motion: render at base opacities, start nothing.

### ON-3 · What we hold — static, no animation

Motion on a privacy promise reads as decoration. This one holds still.

- **ID card:** rounded rect `x 13 → 47`, `y 27 → 51`, radius 3.5, stroke 3, no fill
  - photo: circle centre `(22.5, 37.5)`, r 4.5, stroke 2.4
  - lines: `(31, 35.5) → (42, 35.5)` · `(31, 41) → (39, 41)` · `(18, 46) → (39, 46)`, stroke 2.4
- **Selfie:** head circle centre `(29.5, 65.5)`, r 7.5, stroke 3; shoulders arc, box
  `x 15 → 44`, `y 71 → 96`, from 200° to 340°, stroke 3
- **Boundary:** vertical dashed line at `x = 57`, `y 18 → 86`, stroke 2.4, opacity 0.62,
  4.5-on / 4-off
- **Verdict:** circle centre `(76, 53)`, r 12, stroke 3; tick `(70, 53) → (74.5, 58) → (82, 47)`,
  stroke 3.4, round caps and joins

The reading is the architecture: **the documents stay on their side of the line; only a verdict
crosses.** Do not add an arrow, a cloud, a server, or a vendor logo — the line is the point.

---

## Also in this part

**Add the missing `ScreenScaffold` test from part 1's review.** Its flexible middle is correct in
code but nothing enforces it: deleting `flex: 1` from the `middle` style leaves all three tests
passing. Add one asserting the middle keeps its flex **with `body` absent**. Parts 4, 5 and 6 all
consume `ScreenScaffold`, so a collapse there silently reshapes nineteen screens.

---

## Guards

- `tokenOnlyGuard` scans `src/shared/ui` — no hex literals in the illustrations.
- `contrastCompleteness` — extend the **scoped** `fill`/`stroke` exemption to
  `src/shared/ui/illustrations/`, named and reasoned. **Never global.**
- `contrast` — white-on-brand is already a declared pair from part 1.
- `dynamicTypeGuard` — the carousel's text must still scale.
- `OnboardingCarouselScreen.tsx` is already in `RESTYLED_SCREENS`; keep it there.

---

## Definition of Done

- [ ] `npm run typecheck` clean
- [ ] `npm test` — **run the full suite, not a filtered subset.** Baseline 643 / 63. No
      `worker process failed to exit` warning.
- [ ] `npm run lint` — 0 errors, report the count (was 111)
- [ ] `npm run bundle:check` + `:release` green both platforms
- [ ] `npm run ios` — walk all three cards by button **and** by swipe; dots track both
- [ ] Copy byte-identical to before
- [ ] Committed in logical chunks; not pushed

---

## The handoff note

```
You are implementing UI-BUILD-E part 3 for Blue Smoke, a React Native app controlling a Bluetooth
vape device. Part 1 (shared primitives) is done. You are restyling the onboarding carousel and
building three illustrations. Part 2 (app icons) is skipped for now — do not build icons.

READ FIRST:
  1. CLAUDE.md — the three inviolable rules, commit conventions. NO Claude/Anthropic attribution
     on commits, ever.
  2. docs/execution-briefs/UI-BUILD-E-part3-onboarding.md — this brief. The illustration
     geometry tables are exact; do not improvise a single number.
  3. src/features/onboarding/OnboardingCarouselScreen.tsx — what you are restyling.
  4. src/shared/ui/ — ScreenScaffold, BrandGround, PageDots, Button, BrandMark from part 1.

BRANCH: stay on feature/P0-7.0-brand-mark-and-splash. No PR until part 6.

🔴 THE COPY DOES NOT CHANGE. NOT ONE WORD. The three cards' text is load-bearing:
  - Card 2 must NEVER imply the APP does the locking. The firmware dead-man timer does, and the
    device locks itself whether or not BlueSmoke is running. Inviolable rule, not a preference.
  - Card 3 must keep "yes or no". It deliberately does NOT claim an age was "verified as 18+",
    because nothing in our code can confirm the vendor template actually checks age. Making that
    sentence stronger makes it FALSE.
  Keep the existing comments above each card — they explain why the words are what they are.

WHAT CHANGES: GradientGround -> BrandGround. Centred layout -> ScreenScaffold (illustration in
the header slot, actions pinned bottom). No illustration -> one per card. The literal "1 of 3"
string -> PageDots. Default buttons -> shape="pill" variant="onBrand", Skip as variant="textLink".
No gesture -> swipe.

SWIPE: use React Native's own ScrollView with pagingEnabled. NO new dependency. Buttons and swipe
must drive THE SAME index state — a screen where the dots and the content can disagree is worse
than no swipe at all.

THE ILLUSTRATIONS — three new components in src/shared/ui/illustrations/:
FlameIllustration, ProximityIllustration, PrivacyIllustration. 100x100 viewBox, white on the
brand ground, sized by a `size` prop.

🔴 THEY GO IN src/shared/ui/ ON PURPOSE. Under features/onboarding they would fall outside
contrastCompleteness's scan entirely and escape the guard SILENTLY. Inside src/shared/ui they are
scanned — so you must extend the SCOPED fill/stroke exemption to that directory, named and
reasoned, exactly as BrandMark.tsx has it. DO NOT MAKE IT GLOBAL.

  ON-1: no new geometry. <BrandMark tone="solid" groundColor={tokens.color.brand} />, large.

  ON-2: three arc pairs centred (50,57) plus a closed padlock. Exact paths in the brief's table —
  copy them. Motion: ARCS ONLY. Each pair is its own <Svg> in its own Animated.View; opacity
  pulses between its base and ~35% of it, staggered 0.4s, ~3s cycle, useNativeDriver: true.

    🔴 THE PADLOCK NEVER MOVES AND NEVER OPENS. Animating it opening would say "it unlocks by
    itself" — the opposite of the card's meaning, and alarming on a child-safety feature. A closed
    lock under a signal that comes and goes IS the message: the resting state is locked.

    Reduced motion: render at base opacities, start nothing.

  ON-3: STATIC, no animation — motion on a privacy promise reads as decoration. Exact geometry in
  the brief. The reading is the architecture: the documents stay on their side of the line, and
  only a verdict crosses. Do NOT add an arrow, a cloud, a server, or a vendor logo. The line is
  the point.

ALSO: add the missing ScreenScaffold test from part 1's review. Its flexible middle is correct in
code but nothing enforces it — deleting `flex: 1` from the `middle` style leaves all three tests
passing. Add one asserting the middle keeps its flex WITH `body` ABSENT. Parts 4/5/6 all consume
ScreenScaffold, so a collapse there silently reshapes nineteen screens.

DO NOT:
  - Change any copy.
  - Build app icons (part 2), or touch auth/verification/Home screens (parts 4/5/6).
  - Touch GradientGround — other screens still use it.
  - Make the fill/stroke contrast exemption global.
  - Add a new dependency for the pager.
  - Add a dark theme or a useColorScheme() branch.
  - Add an eslint-disable, or weaken a guard to make something pass.

WHEN DONE, run and report ACTUAL numbers — never "should pass":
  npm run typecheck
  npm test                      🔴 RUN THE FULL SUITE, NOT A FILTERED SUBSET. Baseline is
                                643 tests / 63 suites. Last report quoted 432/48 from a partial
                                run and called a fixed leak a "pre-existing flake" because of it.
                                Must NOT emit "worker process has failed to exit gracefully".
  npm run lint                  (0 errors, report the warning count — was 111)
  npm run bundle:check          (both platforms)
  npm run bundle:check:release  (both platforms)
  npm run ios                   (walk all three cards by BUTTON and by SWIPE; dots track both)

Android still cannot be compiled here — no JDK, no ANDROID_HOME. Say so plainly.

Commit in logical chunks. Do not push and do not open a PR until Sadin asks.
```
