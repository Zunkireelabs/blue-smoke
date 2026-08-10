# UI-BUILD-A — visual language, primitives, and the device journey

**For:** the executing session (Sonnet)
**From:** Sadin (planning/review)
**Date:** 2026-08-09
**Branches:** one per phase, see each phase. Target `stage`, never `main`.

---

## 1. Why this exists

The app has 62 designable surfaces (`docs/system-design-ux/SCREEN_MAP.md`); 10 are built. Hardware
does not arrive until ~Day 26, and `OQ-12` blocks the real pairing key path. Rather than idle, we
build the **product UI now** so the wider team can see the app come to life and so the UI is not the
thing blocking us on Day 26.

**The visual direction is decided** (§3). **Do not invent visual values beyond what §3 specifies —
raise a question instead.**

### The one architectural rule that makes this worth doing

> **Build against the real interfaces, backed by the mock peripheral. Never against fake UI state.**

`src/features/ble/BleClientContext.tsx` already exists. `tools/mock-peripheral/` already implements
spec §4 including failure paths. The seam is built — it is simply **not wired into
`src/app/providers.tsx`** (that file currently wires only `AuthClientProvider`).

A screen driven by `useBleClient()` over the mock swaps to real hardware by changing a provider.
A screen driven by `useState(fakeDevices)` gets rewritten on Day 26. The first is P1-4.0 progress;
the second is throwaway. **Always the first.**

---

## 2. Non-negotiables

These survive mocking. A mock is not an excuse to relax any of them.

1. 🔴 **Lock state UI is notification-driven, never optimistic** — including against the mock. Never
   render "Unlocked" before the device confirms. `LK-5` is *Unlocking…*, never *Unlocked*. Building
   this optimistically now bakes in a safety defect that a later refactor will not find.
2. 🔴 **Never weaken the age gate.** `selectStack()` ordering is load-bearing; unknown is never
   treated as verified. Mocks live *behind* the existing interfaces. Do not add a dev bypass, a
   "skip verification" flag, or a mock that returns `verified` by default.
3. 🔴 **`K_dev` never leaves the server.** Nothing in UI work should touch key material. If a screen
   seems to need it, stop and ask.
4. 🔴 **No image, video frame, or biometric data enters our process.** Persona owns ID capture and
   selfie UI — do not build, mock, or screenshot those screens. Never log `inquiry_id` next to
   anything that re-identifies a person.
5. **No invented spec values.** Every UUID, byte offset, command ID, result code comes from
   `src/features/ble/protocol.ts`. That file is **append-only** — never rewrite an existing entry.
   If a constant you need is missing, say so; do not guess. A guessed value fails *silently*.
6. **Handle all 10 `commandResult` codes distinctly** (spec §4.7). No generic catch-all.
7. **Every BLE operation has an explicit timeout.** No unbounded `await`.
8. **Verification copy is coaching, never diagnostic.** No scores, no vendor status strings.
9. **No analytics or crash reporting in `src/features/verification/**`.** Ever.
10. **No Amazon/Alexa brand assets.** The reference screenshots are Amazon's product. Take the
    *layout and component language*; never the wordmark, the smile mark, or Amazon's cyan. Reading
    as an Alexa clone is an App Store and trade-dress risk for an age-restricted product.
11. **Token-only styling.** No hex or `rgba()` outside `tokens.ts`. Add each screen you restyle to
    `RESTYLED_SCREENS` in **both** `tokenOnlyGuard.test.ts` and `contrastCompleteness.test.ts`.
12. **No `eslint-disable`.** Lint baseline is **70 warnings, 0 errors**. `no-bitwise` is permitted
    only in `ble`/`crypto`/`byteLayout`.
13. **Never claim something works without running it.** If tests fail, say so with the output.

---

## 3. The visual language

Derived from four Amazon Alexa reference screenshots supplied by Sadin (`temp_ss/`). We are taking
the **structural and component language**, with our own colour.

### Structure

- A **soft blue gradient ground** at the top of the screen, fading to near-white.
- A **large white card/sheet with a big corner radius (~20–24)** that overlaps the gradient — this
  is the dominant motif. Content lives on the sheet, not on the ground.
- **Circular icon buttons** in the header row (44×44 on iOS, 48×48 on Android), on a translucent
  white ground.
- **Full-width pill CTAs** (`radii.full`) for primary actions.
- **Dashed-border tiles** for "add new" affordances — the natural treatment for *Pair a device*.
- **Section headings**: bold, generous size, plenty of space above.
- **List rows** as light-grey rounded containers with a leading icon.
- **Bottom sheet** with a grab handle for modals and destructive confirms.

### Colour — extend `tokens.ts`, keep the semantic names

Keep every existing semantic token name so the guards and existing screens keep working. Change
values and **add** the following. ✅ **Approved by Sadin, 2026-08-09 — use these exact values. Do
not substitute, and do not add a colour that is not listed here without asking.**

```
brand            #1657D0   primary action; azure, hue ~219° — deliberately NOT Amazon cyan (#00A8E1)
brandDark        #0E3E9A   pressed state, gradient end
brandTint        #E8F0FE   tinted surface behind brand content
groundTop        #DCE9FB   gradient start for the soft header wash
groundBottom     #FFFFFF   gradient end
success          #1E8E5A   unlocked / verified
successBg        #E3F3EB
```

`danger*` already exists — reuse it for destructive, do not add a second red.

🔴 **`contrastPairs` in `tokens.ts` must gain an entry for every new foreground/background pair you
render.** `contrastCompleteness.test.ts` scans for `tokens.color.<name>` references and fails the
build if a pair is missing. It matches on **token name**, not hex — two tokens sharing a value do
not cover each other.

### Type

**System font** (San Francisco / Roboto). Amazon Ember is licensed and cannot ship. All type goes
through the `Text` primitive so this is swappable later. Keep `allowFontScaling` on — never disable
dynamic type. The refs use heavier weights and larger sizes than our current scale; adjust the scale
in `tokens.ts`, not per-screen.

### Dark theme

**Light only.** Decided 2026-08-09. Do not add a dark theme, and **do not add `useColorScheme()`
branches** — that is the thing that makes light-only expensive to reverse.

---

## 4. Phase A — foundation

**Branch:** `feature/P0-7.0-visual-language`
**Do not start Phase C before this merges.** Building 40 screens before the token system exists
produces 40 inconsistent screens.

### A1 · Gradient dependency — announce first

The gradient ground needs `react-native-linear-gradient`. `package.json` is a **contested shared
file** — announce to Anish, Hardik and Manjila *before* adding it, per CLAUDE.md. Never hand-resolve
a lockfile conflict; delete and regenerate.

If the announcement is blocked, stop and ask — do not approximate a gradient with stacked `View`s,
it bands visibly.

### A2 · Tokens

Update `src/shared/ui/tokens.ts` per §3. Semantic names unchanged; values updated; new tokens added;
`contrastPairs` extended for every new pair. The existing header comment explains why this file is
the single home for visual values — keep that property.

### A3 · The six missing primitives

All in `src/shared/ui/**`, all additive, all exported from `index.ts`:

| Primitive | Needed by | Notes |
|---|---|---|
| `Button` **secondary** + **destructive** variants | every Cancel, `DV-11`, `PF-7` | Extend the existing component; do not fork it. Keep hit area at `tokens.touchTarget` |
| `ListRow` | `DV-4`, `DV-9`, `PF-*`, `CountryPicker` | Leading icon slot, label, optional trailing value/chevron |
| `Badge` | `PF-1` verification status, `LK-*` lock state | May be a `Text` variant if that is cleaner |
| `Toggle` | `PF-4` | Wrap RN `Switch` for token styling |
| `Sheet` | `DV-11`, `PF-7` | Bottom sheet with grab handle |
| `Countdown` | `VF-10`, `AU-7` resend, `F3.E4` | May be a hook rather than a component |

Plus a `GradientGround` layout piece implementing §3's motif, so no screen hand-rolls it.

**Every primitive needs tests matching the existing pattern** — contrast, touch target, dynamic type.

### A4 · Restyle the 10 built screens

Auth (`AU-1…AU-11`), `PF-1`, `DV-1`. Add each to `RESTYLED_SCREENS` in both guard tests.

**While you are in there, fix the three dead ends** — they are one button each:
`AU-3` → Resend · Change email address · Use phone instead ·
`AU-9` → Back to log in · `AU-11` → Continue → `AU-4`.

---

## 5. Phase B — wire the mock seam

**Branch:** `feature/P1-4.0-ble-provider-wiring`

Wire `BleClientProvider` into `src/app/providers.tsx`, alongside `AuthClientProvider`, following the
exact pattern that file already establishes (real implementation by default, injectable for tests).

In dev, back it with `tools/mock-peripheral/`. The mock already implements spec §4 **including
failure paths** — use them. Read its README first.

**Acceptance:** a screen calling `useBleClient()` can scan, find the mock device, connect, and
receive a `deviceInfo` read, with no UI-layer fakery anywhere.

---

## 6. Phase C — the device journey

**Branch:** `feature/P1-3.0-scan-and-pairing-ui` (split further if it grows past ~600 lines)

Build in this order. Each screen's ID, copy, CTAs and constraints are in
`docs/system-design-ux/SCREEN_MAP.md`; the journey logic is `USER_FLOWS.md` F7/F8; the placeholder
in the dev gallery shows the intended layout.

1. `DV-2` empty state → `DV-1` device list
2. `ON-4` Bluetooth priming — at the moment of need, not at launch
3. `DV-3` scanning → `DV-4` results → `DV-5` none found
4. `DV-6` connect/bond/handshake progress → `DV-7` paired
5. `DV-8` the eleven failure states
6. `DV-9` device detail → `DV-10` rename → `DV-11` unpair confirm
7. `LK-1…LK-8` lock and unlock

### Things that are easy to get wrong here

- **`DV-8` — two of the eleven are routing, not errors.** `AGE_NOT_VERIFIED` routes into `VF-1`;
  `DEVICE_OWNED_BY_ANOTHER_USER` gets its own honest copy. Incompatible firmware **fails closed**.
- **`DV-4`/`DV-9` — never present RSSI as a distance in metres.** Signal strength is not range.
- **`DV-9` — battery must handle `0xFF` = unknown**, and lock state needs a **staleness indicator**;
  it is the last notification received, never a guess.
- **`LK-1` must say the device is locked.** Disconnected is the *safe* state — the firmware dead-man
  timer does that, not the app. Any design implying the app must be alive for safety is wrong.
- **`LK-6`'s re-lock hint must be honest** — the firmware relocks, not us.
- **`LK-8`** is the product's first real moment; the roadmap explicitly wants it celebrated.
- **`LK-3`, `LK-4`, `LK-5`, `LK-6`, `DV-6`, `DV-7` are ⛔ blocked on OQ-12** for their *real* key
  path. Build the **UI and state handling** against the mock; leave the `issue-device-session` call
  behind the existing interface. **Do not invent a salt or a `serial_hash`** — a guessed value fails
  silently.

---

## 7. Definition of done — per PR

From spec §12.1, all of it:

- [ ] Merged to `stage` via PR; CI green
- [ ] `npm run typecheck` · `npm test` · `npm run lint` (≤70 warnings, **0 errors**) · `npm run bundle:check`
- [ ] Works on iOS **and** Android — Android has **never been compiled** on this project, so expect
      to be first; a JDK/`ANDROID_HOME` may need installing
- [ ] Touches BLE → tested against the mock, **failure paths included**
- [ ] Touches backend → RLS tested **with a second user's JWT**
- [ ] Every error state has a user-visible recovery path
- [ ] TODO checkbox ticked in the same PR
- [ ] Placeholder deleted from `src/features/devgallery/screenSpecs.ts` as each real screen lands

---

## 8. Do not

- **Do not build the Persona capture UI.** Vendor-owned, different process.
- **Do not build add-ons** — admin panel, analytics, firmware, advanced liveness. See `TODO-addons.md`.
- **Do not add a dark theme** or `useColorScheme()` branches.
- **Do not reskin by adding hex values to screens.** Everything through `tokens.ts`.
- **Do not weaken a test to make it pass.** Fix the code.
- **Do not add a Claude co-authorship trailer** to any commit.
- **Do not `--no-verify`**, and never force-push `main` or `stage`.

---

## 9. Open questions that will block you

| ID | Blocks | Status |
|---|---|---|
| **OQ-7** | brand assets — logo and ratified colour. `SH-1` splash cannot be finished | open; §3 gives direction only |
| **OQ-12** | `serial_hash` salt → `DV-6…8`, all `LK` real key path | 🔴 open |
| **OQ-1 / OQ-4** | physical hardware, ~Day 26 | open |
| **OQ-2** | `VF-11`, `PF-5` support route | 🔴 open |
| **OQ-6** | firmware team never contacted; §4 is an unratified contract | overdue |

**Raise a question rather than filling a gap with a plausible value.** That instruction outranks
finishing the task.
