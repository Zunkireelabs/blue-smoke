# Handoff note — UI-BUILD Phase A

Paste the block below into a fresh session in `/Users/sadinshrestha/Projects/blue-smoke`.

Scope is **Phase A only**. The session must stop and report before touching Phase B or C — the
tokens and primitives are the decisions all 40 remaining screens inherit, so they get reviewed
while corrections are still cheap.

---

```
You are implementing Phase A of a UI build for Blue Smoke, a React Native app that controls a
Bluetooth vape device.

READ FIRST, IN THIS ORDER:
  1. CLAUDE.md — the three inviolable rules and the commit/branch conventions
  2. docs/execution-briefs/UI-BUILD-A-foundation-and-device-journey.md — your brief
  3. docs/system-design-ux/SCREEN_MAP.md — screen IDs and their CTAs
  4. src/shared/ui/tokens.ts — read the header comment before changing anything

SCOPE: Phase A ONLY (section 4 of the brief). Do NOT start Phase B or Phase C.
Stop when Phase A is done, report, and wait for review.

Phase A is four things:
  A1  Announce, then add react-native-linear-gradient (package.json is a contested shared file —
      see below before you touch it)
  A2  Update src/shared/ui/tokens.ts to the approved palette
  A3  Add six missing primitives + a GradientGround layout piece, each with tests
  A4  Restyle the 10 already-built screens, and fix the three auth dead ends

APPROVED PALETTE — use these exact values, substitute nothing:
  brand         #1657D0   primary action
  brandDark     #0E3E9A   pressed state, gradient end
  brandTint     #E8F0FE   tinted surface
  groundTop     #DCE9FB   gradient start
  groundBottom  #FFFFFF   gradient end
  success       #1E8E5A   unlocked / verified
  successBg     #E3F3EB
Reuse the existing danger* tokens for destructive. Do not add a second red.
Keep every existing semantic token NAME — change values, add new ones, rename nothing.

VISUAL LANGUAGE: soft blue gradient ground at the top fading to near-white; a large white sheet
with ~20-24 corner radius overlapping it; circular icon buttons in the header; full-width pill
CTAs; dashed-border tiles for "add" affordances; list rows as light-grey rounded containers;
bottom sheet with a grab handle. Section 3 of the brief has the detail.

THE RULES THAT MATTER MOST HERE:
  - Token-only styling. No hex or rgba() outside tokens.ts. Add every screen you restyle to
    RESTYLED_SCREENS in BOTH tokenOnlyGuard.test.ts AND contrastCompleteness.test.ts.
  - contrastPairs in tokens.ts needs an entry for EVERY new foreground/background pair you
    render. The completeness guard matches on token NAME, not hex value, and fails the build if
    one is missing.
  - Light theme only. Do not add a dark theme. Do not add useColorScheme() branches anywhere.
  - System font (San Francisco / Roboto). Amazon Ember is licensed and cannot ship. Never set
    allowFontScaling={false}.
  - The design references are Amazon Alexa screenshots. Take the layout and component language.
    Never the wordmark, the smile mark, or Amazon's cyan. This app must not read as an Alexa
    clone — it is an age-restricted product and that is a trade-dress and App Store risk.
  - No eslint-disable, ever. Lint baseline is 70 warnings and 0 errors — do not exceed it.
  - Do not weaken a test to make it pass. Fix the code.
  - No Claude co-authorship trailer on commits. Never --no-verify.

BEFORE ADDING THE GRADIENT DEPENDENCY:
package.json is a contested shared file. Three other developers (Anish, Hardik, Manjila) work on
this repo. CLAUDE.md requires announcing before editing it. You cannot send that announcement —
so STOP and tell Sadin you are ready to add react-native-linear-gradient, and wait for the
go-ahead. Do NOT approximate a gradient with stacked Views; it bands visibly.
Everything else in Phase A can proceed while that is pending.

ALSO IN SCOPE — three one-button fixes, since you are already in these files:
  AU-3  "Check your email" (signup)  → add Resend / Change email address / Use phone instead
  AU-9  "Check your email" (reset)   → add Back to log in
  AU-11 "Password updated"           → add Continue → Login
All three currently render a success message with no button and no navigation import. The only
exit is the native back arrow.

BRANCH: git checkout -b feature/P0-7.0-visual-language
Base it on the current branch (feature/P1-8.0-profile-settings), NOT on main — main is stale by
design. Commit locally as you go. Do NOT push; Sadin decides when to push.

GATES — all four must pass before you report done:
  npm run typecheck
  npm test              (354 tests / 32 suites currently pass — do not regress)
  npm run lint          (must be 0 errors, at most 70 warnings)
  npm run bundle:check
Then run the app: npm run ios, and screenshot the restyled screens. Do not claim it works
without running it. If something fails, say so and paste the output.

WHAT NOT TO DO:
  - Do not build Phase B or Phase C screens.
  - Do not build any Persona ID-capture or selfie UI — vendor-owned, different process.
  - Do not invent a logo, a splash mark, or any colour not listed above. OQ-7 (brand assets) is
    still open. Raise a question instead of filling the gap.
  - Do not touch src/features/ble/protocol.ts except to append.
  - Do not modify src/features/devgallery/** — it is throwaway tooling, not Phase A.

Raising a question beats filling a gap with a plausible value. That instruction outranks
finishing the task.
```

---

## What to check when it reports back

- **Palette applied exactly** — grep for stray hex outside `tokens.ts`.
- **`contrastPairs` extended** — the guard passes, but confirm the new pairs are named, not just
  passing by coincidence because a hex value collides with an existing pair.
- **Lint is still ≤70 with 0 errors**, and no `eslint-disable` appeared anywhere.
- **The three dead ends actually navigate** — tap them in the simulator, don't take it on trust.
- **Nothing reads as Alexa** — no borrowed mark, no cyan.
- **Android** — still uncompiled. If the session claims Android works, ask how it verified.
