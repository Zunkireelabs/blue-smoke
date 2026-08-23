# Execution brief — UI-BUILD-E part 1, visual foundation

Part 1 of a six-part visual pass over everything from the splash to Home.

**Named `UI-BUILD-E` to avoid colliding with the existing `UI-BUILD-A…D` briefs.** Parts:

| Part | Scope | Surfaces |
|---|---|---|
| **1 — this brief** | Shared primitives. **No screen changes at all.** | 0 |
| 2 | App icons (Step 0b/0c) — iOS `AppIcon.appiconset`, Android mipmaps + adaptive | 2 |
| 3 | Onboarding — `ON-1/2/3` | 3 |
| 4 | Auth — `AU-1/5/6/7/12/13/14` | 7 |
| 5 | Verification surround — `VF-1`, `ON-5`, `VF-2/3/5/6/12`, `VF-7` | 6 |
| 6 | Home | 1 |

Ticks toward **`P0-7.0`**, whose four open wireframe boxes are exactly onboarding, pairing,
verification and lock.

---

## Why part 1 exists

Restyling nineteen screens before the primitives are agreed means restyling them twice. This part
adds the shared pieces every later part consumes and **changes nothing a user can see**. If a
screen looks different at the end of this part, something has gone wrong.

## Branch and merge shape

Continue on **`feature/P0-7.0-brand-mark-and-splash`** — already pushed, 5 commits. Every part
commits to it, and **one PR opens to `stage` only after part 6**. Sadin's call, and it is
deliberately against CLAUDE.md's one-task-one-PR rule: the trade is a large diff in exchange for
never having a half-restyled app on `stage`.

Baseline to hold: **616 tests / 58 suites · lint 0 errors / 111 warnings**.

---

## Ground: option A — brand ground, white content

Decided by Sadin. Screens sit on a full-bleed `#1657D0`, content in white.

**The contrast arithmetic, because it constrains the type:**

- White on `#1657D0` = **6.34:1** → passes AA at body size. Good.
- 🔴 **No alpha for text on the brand ground.** White at 72% falls to ~4.4:1 and fails AA — *and*
  an `rgba()` bypasses the contrast guard entirely, so it would fail **silently**. On-brand
  secondary text is solid white, differentiated by size and weight, never by opacity.

---

## What to build — all additive, all in `src/shared/ui/`

### 1. `BrandGround`

Full-bleed `tokens.color.brand` ground with safe-area padding.

🔴 **Add it; do not touch `GradientGround`.** That component is on eleven live screens and is
additive-only by convention. Nothing consumes `BrandGround` in this part.

### 2. `Button` — pill variant and an on-brand tone

Additive to the existing component; **every current call site must render identically.**

- A pill shape (fully rounded), full-width by default
- An on-brand tone: white pill, `tokens.color.brand` label — for use on `BrandGround`
- A text-link secondary: no fill, no border, solid white label on brand

Touch-target and dynamic-type guards already cover `Button` — they must still pass.

### 3. `PageDots`

Dot page indicator: `count`, `activeIndex`. Replaces the literal `"1 of 3"` string in part 3.

Must expose the same information to screen readers that the string did — a decorative row of dots
with no accessible equivalent is a regression, not a restyle.

### 4. `BackButton`

Floating rounded-square back affordance for use over a coloured ground, rather than a nav-bar
chevron. Meets the existing minimum touch target.

### 5. `ScreenScaffold`

The layout the reference is actually made of, and the reason the later parts are cheap:

```
┌─────────────────────────┐
│ [back]                  │  ← optional slot, top-left
│                         │
│         mark            │  ← `header` slot, upper third
│        wordmark         │
│                         │
│                         │  ← flexible middle. THE SPACE IS THE DESIGN.
│                         │     Do not centre content in it.
│                         │
│   small context line    │
│  ▓▓▓ primary pill ▓▓▓   │  ← `actions` slot, pinned bottom
│    secondary link       │
│    fine print           │  ← `footnote` slot
└─────────────────────────┘
```

Slots: `back`, `header`, `body`, `actions`, `footnote`. The middle flexes; actions sit on the
bottom safe area.

### 6. `BrandMark` — add a `tone` prop

`tone: 'gradient' | 'solid'`, defaulting to `'gradient'` so **every existing render is unchanged**.

On `BrandGround` the gradient top (`#22C1F2`) loses contrast against blue, so the mark inverts:
`'solid'` renders the outer flame in white with the knockout in `tokens.color.brand`. The
`groundColor` prop already carries the knockout — this only changes the outer fill.

---

## Guards

- **`tokenOnlyGuard`** scans all of `src/shared/ui` automatically. No hex literals in any new file.
- **`contrastCompleteness`** — every new token reference must classify as fg, bg, or a *named*
  exemption. If it demands a pairing you think is decorative, fix the declaration, **never** the
  guard. The `fill`/`stroke` exemption is scoped to `BrandMark.tsx` alone and stays that way.
- **`contrast`** — white-on-brand must be declared as a real pair and pass AA.
- **`touchTarget`**, **`dynamicTypeGuard`** — cover the new interactive primitives too.

---

## Boundaries

**Do not** restyle any screen · touch `GradientGround` · change any existing component's default
rendering · add a dark theme or `useColorScheme()` · add a wordmark asset (part 3 decides whether
"BlueSmoke" is set in the UI face) · build illustrations (part 3) · build app icons (part 2).

---

## Definition of Done

- [ ] `npm run typecheck` clean
- [ ] `npm test` — ≥616 tests, no `worker process failed to exit` warning
- [ ] `npm run lint` — 0 errors, report the warning count (was 111)
- [ ] `npm run bundle:check` + `:release` green both platforms
- [ ] **Every existing screen renders exactly as before** — this is the part's defining property
- [ ] New primitives have tests, including the `PageDots` accessibility equivalent
- [ ] Committed in logical chunks; not pushed until asked

---

## The handoff note

```
You are implementing UI-BUILD-E part 1 for Blue Smoke, a React Native app controlling a Bluetooth
vape device. This is the foundation part of a six-part visual pass from the splash to Home.

READ FIRST:
  1. CLAUDE.md — the three inviolable rules, commit conventions. NO Claude/Anthropic attribution
     on commits, ever.
  2. docs/execution-briefs/UI-BUILD-E-part1-visual-foundation.md — this brief, in full.
  3. src/shared/ui/tokens.ts and src/shared/ui/index.ts — what exists today.
  4. src/shared/ui/BrandMark.tsx — you are adding one prop to it.

BRANCH: stay on feature/P0-7.0-brand-mark-and-splash (already pushed, 5 commits). Every part of
this visual pass commits here; ONE PR opens to stage only after part 6. Do not open a PR.

🔴 THE DEFINING PROPERTY OF THIS PART: NOTHING A USER CAN SEE CHANGES. You are adding shared
primitives that later parts consume. If any existing screen renders differently at the end of
this, you have overreached. Part 1 exists so that nineteen screens don't get restyled twice.

GROUND DECISION (settled, do not reopen): option A — screens sit on a full-bleed brand ground
(#1657D0) with white content.

  🔴 NO ALPHA FOR TEXT ON THE BRAND GROUND. White on #1657D0 is 6.34:1 and passes AA. White at
  72% is ~4.4:1 and FAILS — and an rgba() bypasses the contrast guard entirely, so it fails
  SILENTLY. On-brand secondary text is solid white, differentiated by size and weight only.

BUILD — all additive, all in src/shared/ui/:

  1. BrandGround — full-bleed tokens.color.brand with safe-area padding.
     🔴 ADD IT. DO NOT TOUCH GradientGround — it is on eleven live screens and is additive-only
     by convention. Nothing consumes BrandGround in this part.

  2. Button — add a pill variant (fully rounded, full-width by default), an on-brand tone (white
     pill, brand-coloured label), and a text-link secondary (no fill, no border, solid white
     label). EVERY EXISTING CALL SITE MUST RENDER IDENTICALLY.

  3. PageDots — count + activeIndex. Replaces the literal "1 of 3" string in part 3.
     It must expose the same information to screen readers that the string did. A decorative row
     of dots with no accessible equivalent is a regression, not a restyle.

  4. BackButton — floating rounded-square back affordance for use over a coloured ground, not a
     nav-bar chevron. Meets the existing minimum touch target.

  5. ScreenScaffold — slots: back, header, body, actions, footnote.
     Layout: back top-left; header (mark/wordmark) in the upper third; a FLEXIBLE MIDDLE; actions
     pinned to the bottom safe area; footnote below them.
     🔴 The middle is empty space on purpose — THE SPACE IS THE DESIGN. Do not centre content in
     it, and do not collapse it when body is empty.

  6. BrandMark — add tone: 'gradient' | 'solid', DEFAULTING TO 'gradient' so every existing
     render is unchanged. 'solid' renders the outer flame in white with the knockout in
     tokens.color.brand — needed because the gradient's #22C1F2 top loses contrast on blue.
     The existing groundColor prop already carries the knockout; only the outer fill changes.

GUARDS:
  - tokenOnlyGuard scans all of src/shared/ui automatically — NO hex literals in any new file.
  - contrastCompleteness — classify every new token reference as fg, bg, or a NAMED exemption.
    If it demands a pairing you believe is decorative, fix the declaration, NEVER the guard.
    The fill/stroke exemption is scoped to BrandMark.tsx alone and stays that way.
  - contrast — declare white-on-brand as a real pair; it must pass AA.
  - touchTarget and dynamicTypeGuard must cover the new interactive primitives.

DO NOT:
  - Restyle any screen. Not one.
  - Touch GradientGround, or change any existing component's default rendering.
  - Add a dark theme or a useColorScheme() branch.
  - Add a wordmark asset — part 3 decides whether "BlueSmoke" is set in the UI face.
  - Build illustrations (part 3) or app icons (part 2).
  - Add an eslint-disable, or weaken a guard to make something pass.

WHEN DONE, run and report ACTUAL numbers — never "should pass":
  npm run typecheck
  npm test                      (baseline 616 tests / 58 suites; must NOT emit a
                                 "worker process has failed to exit gracefully" warning)
  npm run lint                  (0 errors, report the warning count — was 111)
  npm run bundle:check          (both platforms)
  npm run bundle:check:release  (both platforms)
  npm run ios                   (confirm every existing screen looks UNCHANGED)

Android still cannot be compiled here — no JDK, no ANDROID_HOME. Say so plainly.

Commit in logical chunks. Do not push and do not open a PR until Sadin asks.
```
