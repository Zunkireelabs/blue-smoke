# Handoff note — UI-BUILD Phase D, part 1

Devices and pairing, **up to and including device selection**: `DV-1…DV-5` (`F7.1`–`F7.5`, plus
`F7.E1`/`F7.E2`/`F7.E3`), and the wiring that finally gives `ON-4`/`ON-7`/`ON-8`/`ON-9` a real
trigger.

## Why the phase is split here

`SCREEN_MAP.md:279` is the line that decides this: **OQ-12 blocks `DV-6…DV-8` and all of `LK`** —
not `DV-1…DV-5`. The salt is needed at `F7.9` (`serial_hash → issue-device-session → K_sess`), which
is the handshake, not the scan. So everything from the empty state through *selecting* a device is
buildable today against the mock peripheral; everything from *connecting* to it is not.

That boundary is the single most important thing in this brief, because **a guessed salt fails
silently** — the hash is well-formed, the request is accepted, and nothing works. Phase D part 2
starts when OQ-12 lands.

The second reason to run this now: Phase C shipped `BluetoothGateScreen` and `BluetoothPrimingScreen`
as real, tested components that **nothing mounts**. `F7.2` and `F7.E1`/`F7.E2` are their call sites.
This phase turns five gallery-only screens into walkable ones and retires the "walk every denial
combination" box Phase C honestly left unticked.

---

```
You are implementing Phase D part 1 of a UI build for Blue Smoke, a React Native app that controls
a Bluetooth vape device. Phases A, B and C are done: palette and primitives, BLE seam, verification
surfaces, onboarding and permission screens.

READ FIRST, IN THIS ORDER:
  1. CLAUDE.md — the three inviolable rules, the authority model, branch and commit conventions
  2. docs/system-design-ux/USER_FLOWS.md — flow F7, both the happy path F7.1-F7.10 and the
     error table F7.E1-F7.E11. You are building F7.1 through F7.5 ONLY.
  3. docs/system-design-ux/SCREEN_MAP.md — screen IDs DV-1 .. DV-5, and line 279 (blockers)
  4. docs/TECHNICAL_SPEC.md §4.1 — advertising format. Every constant is already in
     src/features/ble/protocol.ts. Read it; do not add to it in this phase.
  5. src/features/ble/BleClientContext.tsx — the seam. All BLE goes through it.
  6. src/features/onboarding/BluetoothGateScreen.tsx — read its header comment. You are its
     first caller, and it was written for exactly this.

SCOPE — build these five, and nothing past them:

  DV-1  Device list            F7.1  replaces the hardcoded "No devices paired" card in
                                     src/features/devices/HomeScreen.tsx
  DV-2  No devices — empty     F7.1  the zero state, with "Pair a device" as its primary CTA
  DV-3  Scanning               F7.3  MUST tell the user what to do PHYSICALLY to make the
                                     device discoverable — that is the screen's actual job,
                                     not the spinner
  DV-4  Scan results           F7.4  list of discovered devices with signal strength; selecting
                                     one is where this phase STOPS
  DV-5  No devices found       F7.E3 coaching, not an error code: is it charged, is it in
                                     range, is it already paired to another phone. "Scan again"

Plus the trigger wiring, which is the real payoff of this phase:
  F7.2   → mount BluetoothPrimingScreen (ON-4) at the START of pairing, never at launch
  F7.E1  → Bluetooth off resolves to ON-9      } all three already exist and are already
  F7.E2  → permission denied resolves to ON-7  } tested — you are MOUNTING BluetoothGateScreen,
           or ON-8 if permanently denied       } not rebuilding its logic

🔴 HARD BOUNDARY — STOP AT DEVICE SELECTION
Do NOT implement connect, bond, deviceInfo-read, the auth handshake, issue-device-session, or any
of DV-6/DV-7/DV-8. They are blocked on OQ-12, the serial_hash salt, which is unanswered.
NEVER invent, guess, derive, or placeholder a salt. A guessed salt produces a well-formed hash
that is accepted and silently wrong — this is called out in USER_FLOWS.md:390 and in CLAUDE.md.
When the user selects a device in DV-4, the honest thing to do is the thing you can actually do:
hand off to a clearly-marked not-yet-implemented boundary and say so in your report. Do not build
a fake success. Do not build a fake progress screen. If you find yourself needing the salt, you
have crossed the boundary — stop and report instead.

🔴 THE ONE TRAP IN BluetoothGateScreen — read this before you mount it
Its resolve effect depends on [state, onResolved]. If you pass an INLINE ARROW for onResolved, its
identity changes every render, the effect re-fires, and you get a render loop. Pass a stable
callback — useCallback with correct deps, or a module-scope function. This is a real footgun found
during Phase C review and left in place deliberately, because you are the first caller and get to
choose the call pattern. Add a test that mounts it and asserts onResolved fires exactly once for a
poweredOn state across multiple renders.

SCAN DURATION — answered, do not re-raise: 10 SECONDS
USER_FLOWS.md F7.4 says "the empty-after-N-seconds state" and never gives N; it is not in the spec
or in protocol.ts either. It is a UX decision rather than a protocol constant, and Sadin has made
it: 10 seconds, matching the order of the existing BLE timeouts in src/features/ble/auth.ts
(CONNECT_TIMEOUT_MS is 10_000). Long enough for a device waking from advertising-idle, short enough
that DV-5's coaching arrives while the user is still holding the device.
Make it a NAMED constant with a comment recording that it is a UX decision (Sadin, 2026-08-09) and
not a §4 value — never a magic number inline, and do not put it in protocol.ts, which is for spec
constants only.

BLE RULES THAT BITE HERE:
  - Scan MUST filter on BLE_SERVICE_UUID from protocol.ts (§4.2), passed as startDeviceScan's
    serviceUUIDs argument. §4.1 requires the app filter on the service UUID. Never hardcode a
    UUID, never scan unfiltered and filter in JS — that drains battery and picks up noise.
  - protocol.ts is a contested shared file and is APPEND-ONLY. This phase should need nothing
    new in it: BLE_SERVICE_UUID, ADVERTISING_LOCAL_NAME_PREFIX and the manufacturer-data offsets
    are all already there. If you genuinely need a constant that does not exist, STOP and ask
    rather than adding one — three other developers work in that file.
  - EVERY BLE operation has an explicit timeout. No unbounded await. That includes the scan.
  - ALWAYS stopDeviceScan — on unmount, on navigating away, on timeout, on selection. A scan
    left running is a battery bug the user cannot see. Do it in a cleanup that runs on the
    exception path too.
  - Test against the mock peripheral (tools/mock-peripheral, P0-2.5). Real hardware is ~Day 26.
    Failure paths included, not just the happy path.
  - Battery from the advert may be 0xFF, which means UNKNOWN, not 255%. If you surface battery
    at all in DV-4, handle 0xFF distinctly. If that is awkward, leave battery out of this phase —
    DV-4 only requires signal strength.

NAVIGATION — do not touch selectStack()
DV screens live INSIDE the existing 'home' stack, which is already gated on an explicit 'verified'.
You are adding routes to a stack that is already behind the age gate, so you should not need to
change selectStack() at all. If you think you do, stop and ask — that function is load-bearing and
its ordering rules (hydrating wins over all; signed-out wins over verification; ONLY explicit
'verified' reaches home; unknown is NEVER verified) are the thing this project guards hardest.
DV-1 currently carries the Profile header action, which is the ONLY affordance into PF-1. Replacing
the placeholder card must not remove it.

OTHER RULES:
  - Token-only styling, no hex outside tokens.ts. Add every new screen to RESTYLED_SCREENS in BOTH
    tokenOnlyGuard.test.ts AND contrastCompleteness.test.ts, and extend contrastPairs for every
    new foreground/background pair — the guard matches on token NAME, not hex value.
  - Light theme only. No dark theme, no useColorScheme() branches.
  - No eslint-disable, anywhere, for any reason. Lint baseline is 70 warnings / 0 errors.
  - Do not weaken a test to make it pass. Fix the code.
  - DV-5's copy is coaching, never diagnostic. "We couldn't find your device" and three things to
    check — never an error code or a scan-internals dump.
  - No Claude co-authorship trailer on commits. Never --no-verify. Do not push.

TESTING — this project has shipped "a button that renders but goes nowhere" three times:
  - Every new CTA gets a test that PRESSES it and asserts the destination mounts. Copy the
    pattern in src/features/auth/__tests__/deadEndExits.test.tsx.
  - Assert the scan actually filters: that startDeviceScan is called WITH BLE_SERVICE_UUID.
  - Assert stopDeviceScan is called on unmount and on timeout. This is the leak that no
    screenshot will ever show you.
  - Assert the scan timeout produces DV-5, using fake timers.
  - Assert BluetoothGateScreen's onResolved fires exactly once across re-renders (the trap above).

DEV GALLERY — close the loop Phase C opened:
src/features/devgallery/realPreviews.tsx exists because ON-4/6/7/8/9 had no real trigger and would
otherwise have been unreachable. Its header says to delete an entry the moment its real trigger
exists. You are creating that trigger for ON-4, ON-7, ON-8 and ON-9 — so remove those four from
REAL_PREVIEWS and delete their screenSpecs.ts placeholders, exactly as Phase B did for VF. Leave
ON-6 alone; notification priming is F7.9, which is past the boundary. Update the screen-count
assertion in screenGallery.test.tsx to match.

BRANCH: git checkout -b feature/P1-3.0-device-scan-and-results
Base it on feature/P1-2.0-onboarding-and-permissions (the current branch), NOT on main or stage —
both are far behind and will mislead you. I checked the remote: nothing claims P1-3.0, P1-4.0 or
P1-5.0 today. Note DV-3/4/5 are P1-3.0 while DV-1/2 are P1-4.0 in SCREEN_MAP; the branch is named
for the majority of the work, and DV-1/DV-2 ride along because DV-2's "Pair a device" CTA is what
starts the scan. Say so in your PR body. Commit locally. Do NOT push; Sadin decides that.

GATES — all four, before you report done:
  npm run typecheck
  npm test              (baseline to beat: 463 tests / 46 suites — do not regress)
  npm run lint          (0 errors, at most 70 warnings)
  npm run bundle:check
Then run it: npm run ios, and actually walk it — the empty state, the priming screen, a scan, the
no-devices-found timeout, and every permission denial you can reach. Screenshot each. Reaching a
signed-in session needs the dev test accounts (+14152127777 / +14152127778, OTP 123456); if OTP
rate-limits, say so rather than silently skipping the walk, and use the dev gallery (Home header →
"Screens") to reach what you can. Android has never been compiled on this project — say so rather
than implying otherwise.

Use tools/dev/simtap.sh for simulator taps, never raw cliclick: a previous session's blind
coordinate click landed on an unrelated WhatsApp window. simtap.sh refuses unless the Simulator is
genuinely frontmost and the point is inside its window rect. If it aborts, STOP.

Do not claim anything works that you have not run. If a gate fails, say so and paste the output.
Raising a question beats filling a gap with a plausible value. That instruction outranks
finishing the task.
```

---

## What to check when it reports back

- **The boundary held.** No salt, anywhere, in any form. No connect/bond/handshake code. Grep the
  diff for `serial_hash`, `salt`, `K_sess`, `issue-device-session` — all should be absent.
- **The scan is filtered and always stopped.** `startDeviceScan` called with `BLE_SERVICE_UUID`;
  `stopDeviceScan` on unmount, timeout, and selection, with a test for each. This is the defect a
  simulator walk cannot reveal.
- **`protocol.ts` untouched.** It should have needed nothing.
- **`selectStack()` untouched**, and the Profile header action on DV-1 still present — it is the
  only route into PF-1.
- **`BluetoothGateScreen` is mounted with a stable callback**, with the once-only test. If it is
  mounted with an inline arrow, that is a render loop waiting for a real device.
- **DV-5 is coaching, not diagnostics** — three physical things to check, no error codes.
- **The four `realPreviews.tsx` entries are gone**, along with their `screenSpecs.ts` placeholders.
  If they are still there, the trigger wiring did not really happen.
- **Re-run all four gates yourself.** 463/46 is the floor.

## What this phase deliberately leaves open

`DV-6`, `DV-7`, `DV-8` and all of `LK` remain blocked on **OQ-12**. This brief routes around that
blocker; it does not remove it. The road ends at `DV-5`, and the next 119 `LK` boxes plus the three
`DV` pairing screens do not start until the salt lands.
