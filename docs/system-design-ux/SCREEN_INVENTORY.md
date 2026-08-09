# SCREEN_INVENTORY.md — every screen, its state, and who owns it

**Purpose:** The per-screen ledger behind Track B2 (design-system migration) and the P0-7.0
wireframes. What exists, what is a placeholder, what is absent, and what each one still needs.
**Date:** 2026-08-08 (Day 9).
**Companions:** [`../FLOWS.md`](../FLOWS.md) (as-built) · [`USER_FLOWS.md`](USER_FLOWS.md) (target).

---

## 1. What exists today

Ten screens. **Two use the design system.** Eight carry raw hex.

| Route | File | State | Kit? | Flow | Notes |
|---|---|---|---|---|---|
| `AuthChoice` | `auth/AuthMethodChoiceScreen.tsx` | EXISTS | ❌ raw hex | F1→F2/F3 | Two `Pressable`s. No error paths. Cheapest migration — start here |
| `Signup` | `auth/SignupScreen.tsx` | EXISTS | ❌ raw hex | [F2](USER_FLOWS.md#f2) | Carries **DE-1, DE-2** |
| `Login` | `auth/LoginScreen.tsx` | EXISTS | ❌ raw hex | [F4](USER_FLOWS.md#f4) | Carries **DE-3** |
| `PhoneInput` | `auth/PhoneInputScreen.tsx` | EXISTS | ✅ | [F3](USER_FLOWS.md#f3) | The only screen that navigates on success |
| `OtpVerify` | `auth/OtpEntryScreen.tsx` | EXISTS | ✅ | [F3](USER_FLOWS.md#f3) | Carries **DE-4**. No `useNavigation` at all |
| `PasswordReset` | `auth/PasswordResetRequestScreen.tsx` | EXISTS | ❌ raw hex | [F5](USER_FLOWS.md#f5) | Carries **DE-5** |
| `ResetPasswordConfirm` | `auth/ResetPasswordConfirmScreen.tsx` | EXISTS | ❌ raw hex | [F5](USER_FLOWS.md#f5) | Carries **DE-6**, and **SD-2** may make it unreachable |
| — | `auth/CountryPicker.tsx` | EXISTS | ❌ raw hex | [F3](USER_FLOWS.md#f3) | Not a route — a `Modal` inside `PhoneInput` |
| `VerifyAge` | `verification/PersonaVerificationScreen.tsx` | EXISTS | ❌ raw hex | [F6](USER_FLOWS.md#f6) | Carries **DE-7**. 5 terminal stages, 0 buttons |
| `VerificationPending` | `devices/HomeScreen.tsx:50` | EXISTS | ❌ raw hex | [F6](USER_FLOWS.md#f6) | Carries **DE-8**. Pure presentational |
| `Home` | `devices/HomeScreen.tsx:13` | **PLACEHOLDER** | ❌ raw hex | [F7](USER_FLOWS.md#f7) | Hard-coded "No devices paired", no query. Holds the app's **only** sign-out |
| *(boot)* | `app/navigation.tsx:98` | EXISTS | n/a | — | `BootSplash`, an `ActivityIndicator` |

**`HomeScreen` is honest, not broken.** Its source comment (`:8-11`) says it shows an honest empty
state rather than pretending at a device list. That was the right call. It becomes F7's empty state.

---

## 2. What is absent

Verified: `src/features/profile/`, `src/features/onboarding/` and `src/features/lock/` contain
**only `.gitkeep`**.

| Area | Screens needed | Flow | Owning task |
|---|---|---|---|
| Onboarding | 3 carousel + 3 priming + 2 denial states | [F1](USER_FLOWS.md#f1) | `P1-2.0` (0/9) |
| Verification surround | intro · pending · 3 decline rungs · cancel · error · transport-error · fallback | [F6](USER_FLOWS.md#f6) | `P2-1.0` / `P2-8.0` |
| Device pairing | empty · priming · scan · results · pairing · 11 failure states | [F7](USER_FLOWS.md#f7) | `P1-4.0` / `P1-6.0` |
| Lock control | device detail across 6 machine states | [F8](USER_FLOWS.md#f8) | `P3-1.0`…`P3-3.0` |
| **Profile & settings** | profile + 7 sections | [F9](USER_FLOWS.md#f9) | 🔴 **no task exists** |

> 🔴 **F9 is unowned.** It resolves the trap in `FLOWS.md` §4.1 — a declined user with no way out of
> the app — so it is not optional, and it currently appears on no roadmap. Raising it rather than
> quietly folding it into another phase.

---

## 3. Track B2 — the migration, and the guard that does not guard

### 3.1 The false green

Both source-scanning guards call `listSourceFiles('src/shared/ui')` — the kit directory only:

- `src/shared/ui/__tests__/tokenOnlyGuard.test.ts:18`
- `src/shared/ui/__tests__/contrastCompleteness.test.ts:20`

**Nothing under `src/features/**` is scanned.** All eight screens can carry raw hex while CI reports
green. Confirmed on the Day-9 audit (Track B3, ticked).

### 3.2 The ordering rule

> **Widen the guard's scope in the same change as the migration, never before it.** Widening first
> fails the build on eight screens at once and produces a red `stage` nobody can merge.

Concretely: migrate a flow's screens → widen the guard to include those paths → both land in one PR.
Or migrate all eight, then widen once at the end. Either works. Widening first does not.

### 3.3 Suggested order — one PR per flow, not one wide diff

| # | PR | Screens | Why this order |
|---|---|---|---|
| 1 | auth entry | `AuthMethodChoiceScreen` | Two buttons, no error states. Proves the pattern cheaply |
| 2 | email auth | `LoginScreen`, `SignupScreen` | Share `TextField` + error patterns. **Needs `Button` secondary first** |
| 3 | password reset | `PasswordResetRequestScreen`, `ResetPasswordConfirmScreen` | Same patterns again |
| 4 | country picker | `CountryPicker` | Needs a list-row; the first real primitive gap |
| 5 | verification | `PersonaVerificationScreen` | 5 terminal states → `ErrorState`/`LoadingState` do most of it |
| 6 | home | `HomeScreen` | Rewritten by F7 anyway — migrate last, or fold into F7's build |
| 7 | widen the guard | — | Only after 1–6 |

⚠️ **This is a structural pass, not a visual one.** OQ-7 is open and `tokens.ts` says the palette is
provisional. The goal is that a later brand swap is a one-file change. **Do not choose colours** — a
colour chosen today gets chosen again when the brand kit lands.

---

## 4. The kit today

`src/shared/ui/` — 8 primitives, all exported from `index.ts`.

| Primitive | Props |
|---|---|
| `Screen` | `children`, `scroll?`, `centered?`, `style?` — KeyboardAvoidingView + optional ScrollView |
| `Text` | `variant?: 'title'\|'body'\|'label'\|'caption'`, `tone?: 'primary'\|'secondary'\|'inverse'\|'danger'\|'link'` |
| `Button` | `label`, `loading?`, `disabled?` — **one variant only** |
| `TextField` | `label?`, `error?`, + TextInputProps |
| `Card` | plain `ViewProps` |
| `EmptyState` | `title`, `body?` |
| `ErrorState` | `title`, `body?`, `onRetry?`, `retryLabel?` |
| `LoadingState` | `message?` |

**Tokens** (`tokens.ts`): `color` (greyscale ramp + one red triple), `spacing` (xs 4 … xxl 32),
`radii`, `typography`, `elevation.card`, `touchTarget` (48 Android / 44 iOS), and `contrastPairs`
driving the WCAG AA guard. **`lightTheme` only — there is no dark theme.**

**Guards that do work**, all in `src/shared/ui/__tests__/`: WCAG AA contrast on every token pair; a
completeness guard so a new pair cannot skip the check; minimum touch target; and a guard that no
component disables dynamic type. These are good and should be kept as the migration proceeds.

---

## 5. Primitive gaps — raised, not invented

A ninth primitive is a **finding to raise**, per the roadmap. These are the gaps found while drawing
[`USER_FLOWS.md`](USER_FLOWS.md). None has been built.

| Gap | Needed by | Severity | Note |
|---|---|---|---|
| **`Button` secondary / destructive variants** | F5.7, F7.4, F9.3, F9.7 | **blocks PR #2** | `Button.tsx:11` states plainly that primary/filled is the only variant because nothing needed a second. Something does now: every "Cancel" and every destructive confirm. The cheapest real gap to close |
| **List row** | F7.4 scan results, F9.3 device list, `CountryPicker` | high | Three call sites already |
| **Badge / status pill** | F9.1 verification status, F8 lock state | medium | Could be a `Text` variant instead of a component |
| **Toggle** | F9.4 notification prefs | medium | Could wrap RN `Switch` for token styling |
| **Sheet / modal** | F7.5, F9.7 destructive confirms | medium | P0-7.0 noted "no sheet component yet — nothing has needed one". F9.7 needs one |
| **Countdown** | F2.6a, F3.E4, F6.D3 | low | Three cooldowns, all with visible timers. May be a hook, not a component |
| **Dark theme** | — | ✅ **decided — light only** | Sadin, 2026-08-09. Not building a dark theme this round. `tokens.ts` stays light-only; screens are migrated against `lightTheme` and nothing branches on colour scheme |

**The light/dark question is closed: light only** (Sadin, 2026-08-09). It was the one structural
decision worth making before PR #1, and it is made — the migration proceeds against `lightTheme`.

Two consequences, so the decision stays cheap to revisit later rather than free-to-ignore now:

1. **Keep consuming semantic token names**, never raw `neutral[…]` or hex, in every screen. That is
   already enforced for `src/shared/ui/**` and the screens listed in `tokenOnlyGuard.test.ts` — the
   guard is what keeps a future dark theme a token-file edit rather than an eight-screen rewrite.
2. **Do not add `useColorScheme()` branches** anywhere. A screen that reads the OS colour scheme is
   the thing that makes this expensive to undo.

The palette itself is still provisional and still waits on **OQ-7**; deciding light-only does not
resolve OQ-7, it only halves what OQ-7 has to answer.
