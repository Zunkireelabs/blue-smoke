# Handoff note — UI-BUILD Phase B

Paste the block below into a fresh session in `/Users/sadinshrestha/Projects/blue-smoke`.

Scope is **Phase B only** — the BLE seam and the verification surfaces. It must stop and report
before Phase C. Two things are deliberately carved out of scope and the note says why, because
both look like ordinary UI work and neither is.

---

```
You are implementing Phase B of a UI build for Blue Smoke, a React Native app that controls a
Bluetooth vape device. Phase A is merged: palette, primitives, 10 screens restyled.

READ FIRST, IN THIS ORDER:
  1. CLAUDE.md — the three inviolable rules, branch and commit conventions
  2. docs/execution-briefs/UI-BUILD-B-seam-and-verification.md — your brief
  3. docs/system-design-ux/USER_FLOWS.md — flow F6, the verification journey
  4. docs/system-design-ux/SCREEN_MAP.md — screen IDs VF-1 .. VF-12
  5. tools/mock-peripheral/README.md — before wiring the BLE seam

SCOPE: Phase B ONLY. Do NOT start Phase C, D, E or F. Do not build any device or lock UI.
Stop when Phase B is done, report, and wait for review.

Phase B is three things:
  B1  Wire BleClientProvider into src/app/providers.tsx, backed by the mock peripheral in dev
  B2  Build the verification surfaces: VF-1, ON-5, VF-2, VF-3, VF-4, VF-5, VF-6, VF-7, VF-12
  B3  Fix the empty NSLocationWhenInUseUsageDescription in ios/BlueSmoke/Info.plist

THE HEADLINE FIX — VF-2:
PersonaVerificationScreen renders ZERO controls in all five of its states. Cancel Persona and the
user is permanently stranded: no retry (a `started` ref blocks relaunch), no sign-out, and no back
arrow because it is the only screen in its stack. This was reproduced on a real device on
2026-08-09. Every state needs a way out, and the `started` ref must not block a deliberate
user-initiated retry.

F6.Z — EVERY verify and pending screen carries a persistent sign-out. USER_FLOWS calls this "the
single most important change". Sign-out currently exists in exactly one place in the entire
signed-in app (the Profile screen), which a declined user can never reach.

VF-7 MUST NOT LOOK LIKE VF-8. "We couldn't check your verification" (our network failed) and "you
were declined" (the vendor decided) are opposite meanings. Rendering a transport error as a
decline tells a legitimate adult they failed an age check.

TWO THINGS THAT ARE DELIBERATELY OUT OF SCOPE — do not build them, do not "wire them up later":

1. VF-8 / VF-9 / VF-10, the decline ladder. USER_FLOWS.md:355 requires the attempt counter to
   survive a reinstall: "Server-side counting, keyed on user_id." That is a migration plus an Edge
   Function, and supabase/migrations/** is append-only and contested. A local useState counter
   would produce a 30-minute lockout that force-quitting defeats — something that looks like a
   control without being one, which is worse than not having it. Report it as its own task.

2. VF-11, manual review fallback. Blocked on OQ-2 — nobody has said who handles it, through what
   channel, or with what SLA.

🔴 min_age — READ BEFORE WRITING ANY VERIFICATION COPY:
Per TECHNICAL_SPEC.md:1031, Persona's "approved" means "passed the checks the template was
configured with" — NOT "is over 18". A template with no age requirement returns approved for a
minor while every server-side control functions perfectly. The gate rests on Persona dashboard
configuration that no code in this repo can verify. So: do NOT write UI copy asserting the user's
age has been verified as 18+, and do not treat `approved` as semantically "adult" in code or
comments. Call it the vendor's decision. Flag any existing copy that overstates it.

OTHER RULES THAT BITE HERE:
  - Persona owns ID capture and selfie UI. Do not build, mock, restyle or screenshot those
    screens — they run in the vendor's SDK, in its own process.
  - Verification failures are coaching, never diagnostic. No scores, no vendor status strings, no
    reasons that reveal matching internals.
  - Never log inquiry_id beside anything that re-identifies a person.
  - NEVER add analytics or crash reporting to src/features/verification/**. Ever.
  - Do not create any path into the gated stack. No dev bypass, no skip-verification flag, no mock
    defaulting to verified. selectStack() ordering is load-bearing; unknown is never verified.
  - Token-only styling, no hex outside tokens.ts. Add every new screen to RESTYLED_SCREENS in BOTH
    tokenOnlyGuard.test.ts AND contrastCompleteness.test.ts, and extend contrastPairs for every new
    foreground/background pair (the guard matches on token NAME, not hex).
  - Light theme only. No dark theme, no useColorScheme() branches.
  - No eslint-disable. Lint baseline is 70 warnings, 0 errors.

TESTING — this project has shipped "a button that renders but goes nowhere" three times:
Every new CTA needs a test that PRESSES it and asserts the destination mounts, not just that the
label renders. Copy the pattern in src/features/auth/__tests__/deadEndExits.test.tsx.

VERIFYING ON THE SIMULATOR — use tools/dev/simtap.sh, never raw cliclick:
A previous session's blind coordinate click landed on an unrelated WhatsApp window. simtap.sh
raises the Simulator, waits until it is genuinely frontmost, refuses to click if anything else is,
and refuses any point outside the Simulator's window rect. Usage: tools/dev/simtap.sh <x> <y> with
iOS POINTS (screenshot pixels / 3). If it aborts, STOP — do not fall back to raw cliclick.

BRANCH: git checkout -b feature/P2-6.0-verification-surfaces
Base it on the current branch (feature/P0-7.0-visual-language), NOT on main — main is stale by
design. Commit locally. Do NOT push; Sadin decides when to push.

GATES — all four, before you report done:
  npm run typecheck
  npm test              (baseline to beat: 396 tests / 33 suites — do not regress)
  npm run lint          (0 errors, at most 70 warnings)
  npm run bundle:check
Then run it: npm run ios, walk every VF state, and screenshot each one. Do not claim it works
without running it. If something fails, say so and paste the output. Android has never been
compiled on this project — say so rather than implying otherwise.

Raising a question beats filling a gap with a plausible value. That instruction outranks
finishing the task.
```

---

## What to check when it reports back

- **Walk the trap yourself.** Start verification, cancel Persona, and confirm you can get out.
  That is the whole point of the phase.
- **Sign-out on every VF state** — including the pending one, which is where a stuck user waits.
- **`VF-7` and a decline are visibly different screens**, not the same component with new copy.
- **No copy claims "you are over 18"** — only that the check passed.
- **The seam is real**: `useBleClient()` reaches the mock peripheral, with no fake device arrays
  anywhere in the UI layer.
- **`VF-8/9/10` were NOT built.** If they appear, check whether the counter is local state — if it
  is, that is the fake lockout the brief forbids.
- **Tests press CTAs**, not just assert labels. Grep the new test file for `onPress`.
