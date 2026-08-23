# Splash → Auth → Home — screen roster

**Purpose:** a walkable checklist of every design surface from cold launch to Home, so design
references can be attached per screen.

- **Compiled:** 2026-08-11, Day 12 of 30
- **Source of truth:** read from code on `stage` @ `11c1462` — **not** from `SCREEN_MAP.md`,
  which is stale in several places (see *Known stale docs* at the end).
- **Scope:** the splash → login/signup → homepage path only. Devices (`DV`), Lock (`LK`),
  Profile (`PF`) and System (`SY`) surfaces are out of scope for this pass.
- **Total: 20 design surfaces** — 3 native assets + 1 boot splash + 3 onboarding + 7 auth
  + 5 verification + Home.

> ~~This file lives in `temp_ss/`, which is gitignored. It is a working scratch document, not a
> repo deliverable. Nothing here is committed.~~
>
> **Superseded 2026-08-12 (Sadin).** `temp_ss/` is committed now, so the roster and the design
> references travel with the branch to a second machine. It is still a working document rather
> than a deliverable — treat it as notes, not as spec. Passwords have been redacted; see
> *Only two accounts reach Home* below.

---

## Step 0 — Native launch screen (before any React code runs)

This is the true first thing a user sees. It is currently **100% unbranded stock React Native.**

| # | What | File | Current state |
|---|---|---|---|
| **0a** | iOS launch storyboard | `ios/BlueSmoke/LaunchScreen.storyboard` | 🔴 Renders **"BlueSmoke"** + **"Powered by React Native"** on `systemBackground`. Stock RN boilerplate, shipping today. |
| **0b** | iOS app icon | `ios/BlueSmoke/Images.xcassets/AppIcon.appiconset/` | 🔴 **Empty** — contains only `Contents.json`, zero image assets |
| **0c** | Android launcher icon | `android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/` | 🔴 Stock RN `ic_launcher.png` + `ic_launcher_round.png` across all 5 densities |

**Needs:** logo + wordmark + full icon set.
**Status: unblocked.** OQ-7 (brand) resolved 2026-08-11 — we create the logo ourselves.

---

## Step 1 — Boot splash (first React frame)

| ID | Screen | File | Current state |
|---|---|---|---|
| **SH-1** | Boot splash | 🔴 **no file** — inline `BootSplash()` at `src/app/navigation.tsx:142-148` | A bare centred `<ActivityIndicator size="large" />`. No logo, no wordmark, no background. |

Shown while the Keychain-backed session rehydrates.

**Design constraint — deliberate, do not "fix":** it has no copy and no controls on purpose.
Rendering the auth stack here would flash a login screen at an already-signed-in user on every
cold start. Whatever replaces it must stay decision-free — brand mark and a progress indicator
only.

---

## Step 2 — Onboarding carousel (first launch only)

All three cards live in **one file**, `src/features/onboarding/OnboardingCarouselScreen.tsx`
(100 lines).

| ID | Screen | Card | Status | CTAs |
|---|---|---|---|---|
| **ON-1** | Welcome | 1 of 3 | `BUILT` | Continue |
| **ON-2** | How it keeps you safe | 2 of 3 | `BUILT` | Continue · Skip |
| **ON-3** | What we do and don't hold | 3 of 3 | `BUILT` | Get started → AU-1 |

**ON-2 / ON-3 carry the product's core privacy promise — the most copy-sensitive surface in the
whole app.**

Runs once per install. The flag is in AsyncStorage (chosen over Keychain deliberately, so a
reinstall re-shows onboarding rather than never showing it again).

---

## Step 3 — Authentication

A front door, then **two parallel paths**. There is **no separate signup vs login** — one path
serves a brand-new address and a returning one identically.

### Front door

| ID | Screen | Route | File | Status |
|---|---|---|---|---|
| **AU-1** | Auth method choice | `AuthChoice` | `src/features/auth/AuthMethodChoiceScreen.tsx` (56) | `BUILT` |

CTAs: *Continue with Email* → AU-12 · *Continue with Phone* → AU-5

### Path A — email

| ID | Screen | Route | File | Status |
|---|---|---|---|---|
| **AU-12** | Email entry | `EmailCodeRequest` | `src/features/auth/EmailCodeRequestScreen.tsx` (139) | `BUILT` |
| **AU-13** | Email code entry (6-digit) | `EmailCodeEntry` | `src/features/auth/EmailCodeEntryScreen.tsx` (205) | `BUILT` |
| **AU-14** | Password sign-in | `PasswordSignIn` | `src/features/auth/PasswordSignInScreen.tsx` (113) | `BUILT` |

- AU-12 → *Send code* → AU-13 · *Use password instead* (secondary) → AU-14
- AU-13 auto-submits at 6 digits · *Resend code* on a **60s** cooldown
- AU-14 → *Sign in*. Never navigates manually — the session store's `onAuthStateChange` drives it.

### Path B — phone

| ID | Screen | Route | File | Status |
|---|---|---|---|---|
| **AU-5** | Phone number | `PhoneInput` | `src/features/auth/PhoneInputScreen.tsx` (159) | `BUILT` |
| **AU-6** | Country picker *(modal)* | — | `src/features/auth/CountryPicker.tsx` (150) | `BUILT` |
| **AU-7** | OTP entry | `OtpVerify` | `src/features/auth/OtpEntryScreen.tsx` (201) | `BUILT` |

- AU-5 → country trigger → AU-6 · *Send code* → AU-7
- AU-7 auto-submits at 6 digits · *Resend code* on a **30s** cooldown

### 🔴 Retired IDs — never reuse

**AU-2, AU-3, AU-4, AU-8, AU-9, AU-10, AU-11.**

P1-1.0 replaced email+password with a single 6-digit-code front door, deleting `Signup`, `Login`,
`PasswordResetRequest` and `ResetPasswordConfirm`. Those seven numbers are **retired, not
reassigned** — section prefixes exist so inserting a screen never renumbers the rest, keeping
design refs pinned. Reusing `AU-4` would silently repoint an existing reference from "Log in" to
something else. The jump AU-7 → AU-12 is deliberate, not a gap to tidy away.

---

## Step 4 — Verification gate

Sits between auth and Home and **cannot be skipped**. `selectStack()` routes here for any signed-in
user whose verification state is not `verified`.

| ID | Screen | File | Status |
|---|---|---|---|
| **VF-1** | Why we need this | `src/features/verification/VerifyIntroScreen.tsx` (65) | `BUILT` |
| **ON-5** | Camera priming | `src/features/verification/CameraPrimingScreen.tsx` (62) | `BUILT` |
| **VF-2** | Persona SDK host — "Starting verification…" | `PersonaVerificationScreen.tsx` (178), stage `starting` | `BUILT` |
| **VF-3** | "Confirming your verification…" | ″ stage `pending` | `BUILT` |
| **VF-5** | "Verification paused" (cancelled) | ″ stage `canceled` | `BUILT` |
| **VF-6** | "Something went wrong" | ″ stage `error` | `BUILT` |
| **VF-12** | Not configured *(dev only)* | ″ stage `not_configured` | `BUILT` |
| **VF-7** | "Couldn't check" *(transport)* | `src/features/verification/TransportErrorScreen.tsx` (54) | `BUILT` |
| **VF-3/VF-4** | Confirming / taking longer than usual | `src/features/devices/HomeScreen.tsx` → `VerificationPendingScreen` | `BUILT` |

**VF-2/3/5/6/12 are five states of one file**, not five files.

### Rules binding this section

- ⛔ **Persona's own ID-scan and selfie screens are vendor-owned.** We cannot design, restyle,
  proxy or screenshot them. Do not supply refs for them.
- **Every state carries a persistent sign-out** (F6.Z) — verified present in all five states.
- **VF-7 must stay visually distinct from a decline.** "We couldn't check" (our network failed)
  and "you were declined" (the vendor decided) are opposite meanings.
- **Copy rule, absolute:** verification failures are **coaching, never diagnostic**. No scores,
  no vendor status strings, no reasons that reveal matching internals.

### Not built, deliberately

`VF-8/9/10` (the decline ladder: attempts 1–3 / 4–5 / 30-min lockout) need a **server-side**
attempt counter — a local counter is a lockout a force-quit defeats. `VF-11` (manual review) is
blocked on **OQ-2**. Both are backend/policy work.

---

## Step 5 — Home

| ID | Screen | Route | File | Status |
|---|---|---|---|---|
| **—** | Home | `Home` | `src/features/devices/HomeScreen.tsx` (142) | `BUILT` |

- Header title: `BlueSmoke`
- `headerRight` → *Profile* (plus *Screens* when `__DEV__`)
- Home is the **entire** signed-in stack — Profile, SetPassword and all four pairing screens push
  from it. There is no tab bar and no drawer anywhere in the app.

---

## Walking this yourself — two gotchas

### 1. The dev Screen Gallery will mislead you

Home → **"Screens"** (dev-only) looks like a screen browser. It is not.

- `src/features/devgallery/realPreviews.tsx` has **exactly one** real preview: `ON-6`. Every
  other entry renders a **text spec placeholder**, not the actual screen.
- `src/features/devgallery/screenSpecs.ts` is stale: it still lists the **retired** AU-2, AU-3,
  AU-4, AU-8, AU-9, AU-10, AU-11 as `built`/`partial`, and contains **no AU-12/13/14 at all**.

**Walk the real app, not the gallery.**

### 2. Only two accounts reach Home

> 🔑 **Passwords redacted.** This file is committed now (2026-08-12), so the dev-account
> passwords that used to sit in this table are not written here. They are unchanged — look them
> up in your own notes. Everything else about these accounts is below.

| Account | Credential | Notes |
|---|---|---|
| `sadinshrestha001@gmail.com` | password *(redacted)* | email path |
| `+14152127779` | the standing Supabase test-OTP code | phone-only; its email is the **empty string** |

Everything else lands on the verification gate permanently and can never reach Profile.

- 🔴 `+14152127777` and `+14152127778` are **bricked** by the `create-inquiry` idempotency-key
  burn — they cannot start verification at all. Use `7779`.
- `+14152127780` has a password too *(redacted)*.
- **Do not delete the dev-seed `verifications` row** — it is what puts the email account on Home.
- Test OTPs expire **2026-08-31**.
- Email testing: `info.zunkireelabs+<tag>@gmail.com`.
- `tools/dev/simtap.sh <x> <y>` drives the simulator (iOS points = screenshot px ÷ 3). Keep the
  Simulator on the **built-in display**. Two silent failure modes: it accepts negative coordinates
  it cannot act on, and an interrupted `dd:`/`du:` pair leaves the mouse **held down**, poisoning
  every later tap. Both have produced a false defect report before — suspect them before
  concluding a screen is broken.

---

## Navigation model (why screens can't just link to each other)

Five **mutually exclusive** stacks, chosen by `selectStack()` in `src/app/navigation.tsx:116`.
No tab bar, no drawer, no nested navigator. Every transition *between* stacks is implicit — never
a screen calling `navigate()`.

```
sessionStatus = hydrating              → boot            SH-1
signedOut + onboarding unseen          → onboarding      ON-1…ON-3
signedOut + onboarding seen            → auth            AU-1, AU-5/6/7, AU-12/13/14
signedIn + verification = verified     → home            Home, Profile, DV-*
signedIn + verification = loading|pending → pending      VF-3 / VF-4
signedIn + verification = error        → transportError  VF-7
signedIn + verification = none|declined → verify         VF-1, ON-5, VF-2/3/5/6/12
```

A screen that isn't registered **cannot be reached** — not by a bug, a stale `navigate()`, or a
deep link. There are **no deep links at all**; every screen is URL-unreachable.

> 🔴 **This gate is UX, not security.** It decides which screen a user sees. It does **not** decide
> whether a privileged action is permitted — that is `issue-device-session` re-reading the database
> server-side. Never move an authorisation decision into the navigator because "it already checks".

---

## Brand tokens (OQ-7 — RESOLVED 2026-08-11)

The client liked our palette and wants to keep the blue. **The existing tokens are the real
palette now** — they were never a grayscale placeholder and are no longer provisional.

| Token | Value |
|---|---|
| brand | `#1657D0` |
| brand dark | `#0E3E9A` |
| tint | `#E8F0FE` |
| gradient ground | `#DCE9FB → #FFFFFF` |

- **App name: BlueSmoke** — already `CFBundleDisplayName`, bundle id `com.bluesmoke.app`
  (effectively permanent once either store listing publishes).
- **Logo: we create it.** Nothing exists yet.
- **Store copy: still open.** Blocks submission, not screen building.
- **Dark theme: decided — light only** (2026-08-09). `tokens.ts` stays `lightTheme`-only; no
  screen branches on colour scheme. Keep semantic token names so this stays reversible.

**UI primitives that already exist** (docs claim these are missing — they are not): list row,
badge, toggle, sheet, countdown, and `Button` secondary + destructive variants.

---

## Known stale docs — correct these, don't trust them

| Doc | What it wrongly claims | Truth |
|---|---|---|
| `SCREEN_MAP.md` §VF | VF-2/3/5/6 are `PARTIAL` with "*(none)*" CTAs; "renders zero controls"; fixing it is "the highest-value change in this document" | **Fixed 2026-08-09 by commit `1177c01` (P2-6.0)**, on `stage`. All five states carry sign-out; Resume / Try again / Do this later all work. Mutation-probed 2026-08-11 — the guards are real. |
| `SCREEN_MAP.md` "What blocks design work" | "OQ-7 blocks all visual work"; `tokens.ts` is "an explicitly provisional grayscale placeholder" | OQ-7 **resolved**. Palette was never grayscale and is no longer provisional. |
| `SCREEN_MAP.md` missing-primitives list | list row · badge · toggle · sheet · countdown are missing | **All exist today.** |
| `SCREEN_MAP.md` priority item 5 | "AU-3 / AU-9 / AU-11" | **Retired IDs.** Dead entry — those screens no longer exist. |
| `CLAUDE.md` "Current state" | `stage` = `ee143ac`, 578 tests / 54 suites | `stage` = `11c1462`, **604 tests / 56 suites** |
| `CLAUDE.md` team section | Lists Manjila on app screens and flows | Sadin took over that workstream 2026-08-11 |
| `devgallery/screenSpecs.ts` | AU-2/3/4/8/9/10/11 are `built`/`partial` | Retired and deleted; AU-12/13/14 absent from the registry |
| `USER_FLOWS.md` | F2 (signup) and F4 (login) are separate flows | Collapsed into one by the code path; AU-12/13 point at F1.4 as a placeholder. Reconciliation is its own docs task. |

---

## Verified baseline (2026-08-11, re-run independently)

| Gate | Result |
|---|---|
| `stage` HEAD | `11c1462`, working tree clean |
| `npm run typecheck` | clean (3 projects) — ⚠️ does **not** cover `supabase/functions/**` |
| `npm test` | **604 passed / 56 suites** |
| `npm run lint` | **0 errors, exactly 111 warnings** (all `no-bitwise` in exempt dirs — an `eslint-disable` to move that number is a breach, not a fix) |
| `npm run bundle:check` | green, iOS + Android |
| `npm run bundle:check:release` | green both; dev BLE mock confirmed absent |

---

## How to give references

Reference by screen ID. For a specific state, name the state.

```
AU-1: <ref>
ON-2: <ref>
VF-5 error state: make the Resume button full-width
0a: <logo ref>
```

**Suggested starting point: Step 0 + SH-1 as one unit.** The logo drives the launch screen, the
app icon and the boot splash together, and nothing else in the app can look finished until it
exists.
