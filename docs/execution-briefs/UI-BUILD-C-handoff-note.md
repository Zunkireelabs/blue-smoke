# Handoff note — UI-BUILD Phase C

Onboarding and permissions: `ON-1…ON-4`, `ON-6…ON-9` (eight surfaces; `ON-5` shipped in Phase B).

Two decisions in this phase are **not** UI decisions and must not be invented — where the
"onboarding seen" flag lives, and how permission state is actually detected. Both are called out
in the block below with a stop-and-ask.

---

```
You are implementing Phase C of a UI build for Blue Smoke, a React Native app that controls a
Bluetooth vape device. Phases A and B are merged: palette, primitives, auth restyled, BLE seam
wired, verification surfaces built.

READ FIRST, IN THIS ORDER:
  1. CLAUDE.md — the three inviolable rules, branch and commit conventions
  2. docs/execution-briefs/UI-BUILD-B-seam-and-verification.md — §0 has the whole-app phase plan
  3. docs/system-design-ux/USER_FLOWS.md — flow F1 (onboarding) and its denial branches F1.D1-D5
  4. docs/system-design-ux/SCREEN_MAP.md — screen IDs ON-1 .. ON-9
  5. src/app/navigation.tsx — read selectStack() and its header comment before changing it

SCOPE: Phase C ONLY — the eight onboarding and permission surfaces. Do NOT build device,
pairing, lock, or profile UI. Stop when done, report, and wait for review.

  ON-1  Welcome                    carousel card 1 of 3
  ON-2  How it keeps you safe      carousel card 2 of 3
  ON-3  What we do and don't hold  carousel card 3 of 3 → AU-1
  ON-4  Bluetooth priming          shown at first pair, never at launch
  ON-6  Notification priming       shown after first successful pair
  ON-7  Denied once                can re-prompt
  ON-8  Permanently denied         cannot re-prompt, must open OS Settings
  ON-9  Bluetooth off              NOT the same as denied
(ON-5 camera priming already shipped in Phase B — follow its pattern.)

🔴 STOP AND ASK #1 — where does the "onboarding seen" flag live?
ON-1..3 show on first launch, before any account exists, so it cannot live in the database.
Do NOT invent a store. My recommendation, for you to confirm with Sadin before implementing:
AsyncStorage (@react-native-async-storage/async-storage), NOT react-native-keychain.
Reason, learned the hard way in this project on 2026-08-09: Keychain entries SURVIVE an app
uninstall on iOS — a reinstalling user would never see onboarding again, and we already hit
exactly this when a Keychain-persisted Supabase session survived `simctl uninstall`. AsyncStorage
clears with app data, which is the semantics this flag actually wants.
That is a package.json change. package.json is a contested shared file and three other developers
work here (Anish, Hardik, Manjila) — CLAUDE.md requires announcing first. You cannot send that
announcement, so STOP and tell Sadin. Everything else in Phase C can proceed meanwhile.

🔴 STOP AND ASK #2 — how is permission state actually detected?
ON-7 / ON-8 / ON-9 are not three copies of one screen; they are three DIFFERENT STATES and the
whole point is telling them apart:
  ON-9  Bluetooth is OFF        — user flips a toggle, we keep looking. Do NOT send them to Settings.
  ON-7  denied ONCE             — we can re-prompt, so offer Try again.
  ON-8  PERMANENTLY denied      — iOS will not ask again; the only real action is Open Settings.
Rendering the wrong one is itself a dead end, which is the bug class this project keeps shipping.
react-native-ble-plx's BleManager state distinguishes PoweredOff from Unauthorized — use the real
state via the BleClient seam Phase B wired, never a guess or a local flag. If distinguishing
"denied once" from "permanently denied" needs a permissions library, that is another package.json
change: STOP and ask rather than approximating it.

BE HONEST ABOUT WHAT BUTTONS CAN DO:
iOS does not allow an app to turn Bluetooth on programmatically. A button labelled "Turn on
Bluetooth" that cannot is a lie. Either open Settings, or change the copy to instruct and let the
screen react when the state changes. Same for ON-6: push has NO backend yet (SY-2/SY-3 are
unbuilt), so do not request a notification permission we cannot currently use — build the screen
and leave the request behind its interface, and say so in your report.

NAVIGATION — selectStack() is load-bearing, read its header comment first:
ON-1..3 run before auth. Adding an 'onboarding' stack is fine, but the ordering rules must hold:
hydrating wins over everything; signed-out wins over verification; ONLY an explicit 'verified'
reaches home; unknown is NEVER treated as verified. Your new stack must not create any path into
the gated stacks. No dev bypass, no skip flag. Add your routes and touch nothing else in that file.
ON-4/7/8/9 are shown AT THE MOMENT OF NEED during pairing (Phase D), not at launch — build them
as real screens driven by real permission state; Phase D wires the triggers.

OTHER RULES THAT BITE HERE:
  - ON-2 and ON-3 carry the product's core privacy promise — the most copy-sensitive surface in
    the app. ON-2 must NOT imply the app does the locking: the firmware dead-man timer does, and
    the device locks itself even when the app is closed. Any copy implying the app must be alive
    for the device to be safe is wrong.
  - ON-3: we never see or store the ID or the selfie. Do not overstate what we verify — Persona's
    "approved" means "passed the checks the template was configured with", NOT "is over 18"
    (min_age, spec 6.6 item 3, still open). Do not write copy asserting an age was verified as 18+.
  - Token-only styling, no hex outside tokens.ts. Add every new screen to RESTYLED_SCREENS in BOTH
    tokenOnlyGuard.test.ts AND contrastCompleteness.test.ts, and extend contrastPairs for every new
    foreground/background pair (the guard matches on token NAME, not hex value).
  - Light theme only. No dark theme, no useColorScheme() branches.
  - No eslint-disable. Lint baseline is 70 warnings, 0 errors.
  - Do not weaken a test to make it pass. Fix the code.
  - No Claude co-authorship trailer on commits. Never --no-verify.

TESTING — this project has shipped "a button that renders but goes nowhere" three times:
Every new CTA needs a test that PRESSES it and asserts the destination mounts, not just that the
label renders. Copy src/features/auth/__tests__/deadEndExits.test.tsx.
Also test the three permission states resolve to three DIFFERENT screens from real state inputs —
that is the actual risk here, not the layout.

VERIFYING ON THE SIMULATOR — use tools/dev/simtap.sh, never raw cliclick:
A previous session's blind coordinate click landed on an unrelated WhatsApp window. simtap.sh
raises the Simulator, waits until it is genuinely frontmost, refuses to click if anything else is,
and refuses any point outside the Simulator's window rect. Usage: tools/dev/simtap.sh <x> <y> with
iOS POINTS (screenshot pixels / 3). If it aborts, STOP — do not fall back to raw cliclick.
Note you can reach any screen directly via the dev gallery: Home header → "Screens".

BRANCH: git checkout -b feature/P1-2.0-onboarding-and-permissions
Base it on the current branch (feature/P2-6.0-verification-surfaces), NOT on main — main is stale
by design. Commit locally. Do NOT push; Sadin decides when to push.

GATES — all four, before you report done:
  npm run typecheck
  npm test              (baseline to beat: 420 tests / 39 suites — do not regress)
  npm run lint          (0 errors, at most 70 warnings)
  npm run bundle:check
Then run it: npm run ios, walk the carousel and every permission state, screenshot each. Do not
claim it works without running it. If something fails, say so and paste the output. Android has
never been compiled on this project — say so rather than implying otherwise.
Delete each shipped screen's placeholder from src/features/devgallery/screenSpecs.ts, as Phase B did.

Raising a question beats filling a gap with a plausible value. That instruction outranks
finishing the task.
```

---

## What to check when it reports back

- **The three permission states are genuinely three screens**, resolved from real `BleManager`
  state — not one component with a `variant` prop and a guess.
- **No button claims to do something iOS forbids** — nothing "turns on Bluetooth".
- **`ON-2` does not imply the app does the locking.** The firmware timer does; that distinction is
  the product's safety story.
- **`ON-3` does not claim an age was verified as 18+** — `min_age` is still unanswered.
- **Onboarding cannot reach a gated stack.** Re-read `selectStack()` in the diff.
- **Reinstall actually re-shows onboarding** — the whole reason for the AsyncStorage
  recommendation. Test it: `simctl uninstall`, reinstall, confirm the carousel returns.
