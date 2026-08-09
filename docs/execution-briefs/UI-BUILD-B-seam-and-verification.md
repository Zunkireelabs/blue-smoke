# UI-BUILD-B — the BLE seam, and the verification surfaces

**For:** the executing session (Sonnet)
**From:** Sadin (planning/review)
**Date:** 2026-08-09
**Branch:** `feature/P2-6.0-verification-surfaces`
**Predecessor:** Phase A merged — palette, primitives, 10 screens restyled, 3 dead ends fixed.

---

## 0. The plan for the whole app

Goal: **every screen and every navigation path built.** 62 surfaces; Phase A closed 12.

| Phase | Area | Surfaces | Depends on |
|---|---|---|---|
| ~~A~~ | ~~Foundation, auth restyle~~ | ~~12~~ | ✅ done |
| **B** | **BLE seam · verification `VF` · camera priming `ON-5`** | **10** | ← you are here |
| C | Onboarding & permissions `ON-1…ON-9` | 8 | B (ON-5 pattern) |
| D | Devices & pairing `DV-1…DV-11` | 11 | B (seam), C (`ON-4`) |
| E | Lock & unlock `LK-1…LK-8` | 8 | D |
| F | Profile sections `PF-2…PF-7`, system surfaces `SY`, splash `SH-1` | 10 | — |

### What "nothing missed" can and cannot mean

Every surface will **exist and be navigable**. Eleven cannot be *functionally* finished in UI work,
because they depend on inputs nobody has yet — they will be built as complete UI with the
dependency stubbed behind its real interface, never faked:

`VF-8/9/10` (needs a server-side attempt counter — see §3) · `VF-11`, `PF-5` (OQ-2) ·
`PF-6` (no legal URLs) · `PF-7` (OQ-11d) · `PF-4`, `SY-2/3` (push has no backend) ·
`DV-6/7`, `LK-3…LK-6` (OQ-12 key path) · `SH-1` (no logo, OQ-7).

Do not close a checkbox for these. Build the surface, leave the dependency behind its interface,
and say so.

---

## 1. 🔴 Read this before touching verification

### `min_age` — the age gate may not currently gate anything

`TECHNICAL_SPEC.md:1031` and `USER_FLOWS.md:287`. Persona returns `approved` meaning *"passed the
checks the template was configured with"* — **not** *"is over 18"*. A template with no age
requirement returns `approved` for a minor while every server-side control we built works
perfectly. **The age gate rests on Persona dashboard configuration that no code in this repo can
verify.**

This is not your task to fix and you cannot fix it in the app. But **do not write any UI copy that
asserts the user's age has been verified as 18+** beyond what the existing schema supports, and do
not treat `approved` as semantically "adult" anywhere in code or comment. Refer to it as the
vendor's decision. Flag to Sadin if you see existing copy overstating it.

### The gate is UX; the authority is server-side

`selectStack()` ordering is load-bearing; unknown is never `verified`. Nothing you add may create a
path into the gated stack. No dev bypass, no "skip verification" flag, no mock defaulting to
verified.

---

## 2. Wire the BLE seam

`src/features/ble/BleClientContext.tsx` exists. `src/app/providers.tsx` wires only
`AuthClientProvider`. Add `BleClientProvider` alongside it, following that file's existing pattern
exactly: real implementation by default, injectable for tests.

In dev, back it with `tools/mock-peripheral/` — read its README first; it implements spec §4
**including failure paths**.

**Acceptance:** a screen calling `useBleClient()` can scan, find the mock, connect, and read
`deviceInfo`. No UI-layer fakery anywhere. This unblocks Phase D and is the whole reason the device
screens will not need rewriting when hardware lands.

Do not build device UI in this phase — just the seam and its test.

---

## 3. 🔴 The decline ladder needs a server-side counter — do not build it client-side

`USER_FLOWS.md:355` is explicit: *"F6.D3 needs a lock that survives a reinstall — an attempt counter
in local state is defeated by force-quitting. Server-side counting, keyed on `user_id`."*

So **`VF-8`, `VF-9`, `VF-10` are out of scope for this phase.** They need a schema column or table
plus an Edge Function change first, which is backend work with its own migration and RLS review —
and `supabase/migrations/**` is append-only and contested, requiring an announcement.

**Do not** implement the ladder with a `useState` counter to "wire up later". A 30-minute lockout a
user escapes by force-quitting is worse than none: it looks like a control and is not one.

Raise this to Sadin as its own task. Everything else in `VF` proceeds.

---

## 4. Scope — build these

| ID | Screen | Notes |
|---|---|---|
| `VF-1` | Why we need this | Entry point. Continue → `ON-5` |
| `ON-5` | Camera priming | At verification start, never at launch |
| `VF-2` | Persona SDK host | 🔴 **the stranding trap** — see below |
| `VF-3` | Confirming your verification | Add the persistent sign-out |
| `VF-4` | Taking longer than usual | After ~2 min pending |
| `VF-5` | Verification paused (canceled) | Resume · Do this later · Sign out |
| `VF-6` | Something went wrong | Try again · Get help · Sign out |
| `VF-7` | Couldn't check verification | Transport error — **must differ from a decline** |
| `VF-12` | Not configured (dev only) | Already built; restyle + keep sign-out |

### `VF-2` — the headline fix

`PersonaVerificationScreen` renders **zero controls in all five of its states**. Cancel Persona and
the user is stranded: no retry (a `started` ref blocks relaunch), no sign-out, no back arrow because
it is the only screen in its stack. **Reproduced on a real device on 2026-08-09.**

Fixing it means: the `started` ref must not permanently block a deliberate user-initiated retry, and
every state needs a way out.

### `F6.Z` — every verify and pending screen carries a persistent sign-out

`USER_FLOWS.md` calls this *"the single most important change"*. Sign-out currently exists in exactly
one place in the whole signed-in app — `PF-1` — which a declined user can never reach.

### `VF-7` must not look like a decline

*"We couldn't check"* (our network failed) and *"you were declined"* (the vendor decided) are
opposite meanings. Rendering a transport error as a decline tells a legitimate adult they failed an
age check. Different screen, different copy, different action.

### Copy rule, absolute

Verification failures are **coaching, never diagnostic**. No scores, no vendor status strings, no
reasons that reveal matching internals. Never log `inquiry_id` beside anything identifying.

**Persona owns ID capture and selfie UI.** Do not build, mock, restyle, or screenshot those screens.

---

## 5. Also in this phase

**Fix `ios/BlueSmoke/Info.plist`.** `NSLocationWhenInUseUsageDescription` is an **empty string**.
Xcode warns on every build (`warning: The value ... must be a non-empty string`) and App Store
review rejects it. iOS BLE does not require location, unlike older Android — so **delete the key**
unless something actually needs it. If you believe something does, ask rather than writing copy for
a permission we may not need.

---

## 6. Verifying on the simulator — use the safe tap wrapper

A previous session's blind `cliclick` at screen coordinates landed a click on an unrelated
**WhatsApp window**. Do not click blind.

Use `simtap.sh` (in the session scratchpad; copy it into `tools/` if you prefer). It raises the
Simulator, polls until it is genuinely frontmost, refuses to click if any other app is, and refuses
any point outside the Simulator's own window rectangle. It also uses a slow press, because iOS
`ScrollView` delays touch delivery and swallows a fast synthetic click.

If it aborts, **stop** — do not fall back to raw `cliclick`.

---

## 7. Definition of done

- [x] `npm run typecheck` · `npm test` · `npm run lint` (**0 errors**, ≤70 warnings) · `npm run bundle:check`
      — all four green: typecheck clean, lint 0 errors/70 warnings (unchanged baseline), both
      iOS and Android Metro bundles built successfully.
- [x] Current baseline to beat: **396 tests / 33 suites**. Do not regress. — now 420 tests / 39 suites.
- [x] Every new screen added to `RESTYLED_SCREENS` in **both** guard tests
- [x] `contrastPairs` extended for every new fg/bg pair — the guard matches on token **name**
      — no new pairs needed: every new screen composes `Text`/`Button`/`GradientGround`, none
      reference `tokens.color.*` directly.
- [x] **A test that presses each new CTA and asserts the destination**, not just that it renders.
      See `src/features/auth/__tests__/deadEndExits.test.tsx` — a button that renders but goes
      nowhere is the exact bug this project already shipped three times
- [~] Run it: `npm run ios`, walk every `VF` state, screenshot each — ran on the iPhone 17 Pro
      simulator with a fresh test-OTP account (`14152127778`). Walked and screenshotted live:
      VF-1 → ON-5 → VF-2 (genuinely launched Persona's real sandbox SDK) → cancel → **VF-5,
      confirming the headline fix** (Resume relaunches Persona, Do this later returns to ON-5,
      Sign out returns to the signed-out auth stack — all three exits work). VF-3/VF-4 (glimpsed
      mid-transition, sign-out visible), VF-6, VF-7, and VF-12 were **not** walked live — reaching
      them needs either a forced Persona SDK error, a forced backend read failure, or a missing
      `PERSONA_TEMPLATE_ID`, none of which this session could safely stage against the real dev
      backend (direct DB mutation to fake a state was correctly blocked by the permission
      classifier). All five are covered by `PersonaVerificationScreen.test.tsx` and
      `transportErrorAndPending.test.tsx`, which press every CTA on those states and assert the
      destination — see the session report for the full breakdown.
- [x] Placeholder deleted from `src/features/devgallery/screenSpecs.ts` per real screen shipped
- [ ] TODO checkboxes ticked in the same PR — **except** the eleven listed in §0 — not yet done;
      see the session report.
- [x] Android: still never compiled. Say so rather than implying otherwise — true here too;
      only iOS was run.

---

## 8. Do not

- Do not build `VF-8/9/10` (see §3), `VF-11` (OQ-2), or any device UI.
- Do not add a dark theme or `useColorScheme()` branches.
- Do not add hex outside `tokens.ts`.
- Do not add analytics or crash reporting to `src/features/verification/**`. Ever.
- Do not weaken a test to make it pass.
- Do not add a Claude co-authorship trailer. Never `--no-verify`.
- **Raise a question rather than filling a gap with a plausible value.** That outranks finishing.
