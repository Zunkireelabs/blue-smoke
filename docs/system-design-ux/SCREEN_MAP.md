# Screen Map — design-reference roster

**Purpose:** one stable ID per designable screen, so a design reference can be attached to it
unambiguously. This is a *view*, not a new source of truth.

| This doc answers | Lives in |
|---|---|
| "What screens exist, what's on them, what's their status" | **here** |
| "What is the user journey / decision logic" | [`USER_FLOWS.md`](USER_FLOWS.md) — flows `F1`–`F9`, node IDs `F6.4` |
| "Show me the journey as a diagram" | [`flows.html`](flows.html) — 13 activity diagrams |
| "What exists in code right now" | [`SCREEN_INVENTORY.md`](SCREEN_INVENTORY.md) + [`../FLOWS.md`](../FLOWS.md) |

**ID scheme.** Section prefix + number (`VF-4`). Section-prefixed rather than global (`S23`) so
inserting a screen never renumbers the rest — design refs stay pinned. Each entry maps to its
`USER_FLOWS.md` node so the two docs stay joined.

**Status.** `BUILT` shipped · `PARTIAL` renders but incomplete · `STUB` placeholder only ·
`ABSENT` no code · `⛔` blocked on a named input.

> 🔴 **Persona owns ID capture and selfie UI. Do not design them, do not supply refs for them.**
> Those screens run inside the vendor's SDK in its own process. Our verification screens are only
> the surfaces *around* it — intro, priming, waiting, outcome. (Inviolable rule 1; `TODO-phase-0.md:312`.)

---

## Navigation structure

Five **mutually exclusive** stacks. No tab bar, no drawer, no nested navigator. Every transition
*between* stacks is implicit — chosen by `selectStack()` (`src/app/navigation.tsx:82`), never by a
screen calling `navigate()`. This is deliberate: an unregistered screen cannot be reached by a bug,
a stale `navigate()`, or a deep link.

```
sessionStatus = hydrating          → boot     SH-1
sessionStatus = signedOut          → auth     AU-1 … AU-8
verification  = verified           → home     DV-*, LK-*, PF-*
verification  = loading | pending  → pending  VF-3
verification  = none | declined    → verify   VF-2
```

Ordering is load-bearing: unknown is **never** treated as verified. The gate is UX only — the real
authority is `issue-device-session` re-reading the DB server-side (inviolable rule 3).

**Deep links:** exactly one route is URL-reachable — `bluesmoke://reset-password` → `AU-8`.

---

## SH · Shell

| ID | Screen | Flow | Status | Task |
|---|---|---|---|---|
| **SH-1** | Boot splash | — | `BUILT` | P0-4.0 |

**SH-1** — spinner while the Keychain session rehydrates. No copy, no controls, by design: showing
the auth stack here would flash a login screen at an already-signed-in user on every cold start.
*Design note: this is the first frame of the app on every launch and is currently an unbranded
`ActivityIndicator`.*

---

## ON · Onboarding & permissions — `ABSENT`, task **P1-2.0** (1/9)

Nothing in this section exists in code. Whole section is greenfield.

| ID | Screen | Flow | Status | CTAs |
|---|---|---|---|---|
| **ON-1** | Welcome | F1.1 | `ABSENT` | Continue |
| **ON-2** | How it keeps you safe | F1.2 | `ABSENT` | Continue · Skip |
| **ON-3** | What we do and don't hold | F1.3 | `ABSENT` | Get started → AU-1 |
| **ON-4** | Bluetooth priming | F7.2 | `ABSENT` | Turn on Bluetooth · Not now |
| **ON-5** | Camera priming | F6.2 | `ABSENT` | Continue · Why do you need this? |
| **ON-6** | Notification priming | — | `ABSENT` | Enable · Not now |
| **ON-7** | Denied once | F1.D1 | `ABSENT` | Try again |
| **ON-8** | Permanently denied | F1.D2 | `ABSENT` | Open Settings |
| **ON-9** | Bluetooth off | F1.D5 | `ABSENT` | Turn on Bluetooth |

**ON-1…3** is a three-card carousel. **ON-2/ON-3** carry the product's core privacy promise —
this is the most copy-sensitive surface in the app.

**ON-4/5/6** are primed **at the moment of need**, never up-front: Bluetooth at first pair,
camera at verification start, notifications after the first successful pair.

**ON-7 vs ON-8 must be different screens.** "Denied once" can re-prompt; "permanently denied"
cannot and must deep-link to OS Settings. Rendering one for the other is a dead end.
**ON-9 is distinct again** — Bluetooth *off* is not Bluetooth *denied*, and offering "Open
Settings" to someone who just needs to flip a toggle is wrong.

---

## AU · Authentication — mostly `BUILT`, task **P1-1.0** (15/17)

| ID | Screen | Route | Flow | Status |
|---|---|---|---|---|
| **AU-1** | Auth method choice | `AuthChoice` | F1.4 | `BUILT` |
| **AU-2** | Sign up | `Signup` | F2 | `BUILT` |
| **AU-3** | Check your email — signup | *(state of AU-2)* | F2.6 | `PARTIAL` |
| **AU-4** | Log in | `Login` | F4 | `BUILT` |
| **AU-5** | Phone number | `PhoneInput` | F3.1 | `BUILT` |
| **AU-6** | Country picker | *(modal)* | F3.1 | `BUILT` |
| **AU-7** | OTP entry | `OtpVerify` | F3.5 | `BUILT` |
| **AU-8** | Forgot password | `PasswordReset` | F5.1 | `BUILT` |
| **AU-9** | Check your email — reset | *(state of AU-8)* | F5.3 | `PARTIAL` |
| **AU-10** | Set new password | `ResetPasswordConfirm` | F5.6 | `BUILT` |
| **AU-11** | Password updated | *(state of AU-10)* | F5.7 | `PARTIAL` |

**CTAs as built:** AU-1 → *Continue with Email* → AU-4 · *Continue with Phone* → AU-5.
AU-4 → *Log in* · *Forgot password?* → AU-8 · *New here? Create an account* → AU-2.
AU-2 → *Sign up* · *Already have an account? Log in* → AU-4.
AU-5 → country trigger → AU-6 · *Send code* → AU-7. AU-7 → *Resend code* (30s cooldown), auto-submits at 6 digits.

**🔴 Three dead ends.** AU-3, AU-9 and AU-11 each render a success message with **no button and no
navigation import** — the only exit is the native header back arrow. AU-11 is the worst: a user who
just reset their password is told "Password updated" and left there.
Required: AU-3 → *Resend* · *Change email address* · *Use phone instead*; AU-9 → *Back to log in*;
AU-11 → *Continue* → AU-4.

**Also:** AU-7 has no *change number* CTA, and AU-10 is unreachable for a signed-in user — it lives
in the auth stack, which isn't mounted once you have a session, so tapping a reset link while
signed in goes nowhere.

---

## VF · Age verification — `PARTIAL`, tasks **P2-1.0 / P2-6.0** — 🔴 worst CTA gaps in the app

| ID | Screen | Flow | Status | CTAs |
|---|---|---|---|---|
| **VF-1** | Why we need this | F6.1 | `ABSENT` | Continue → ON-5 |
| **VF-2** | Persona SDK host | F6.4 | `PARTIAL` | *(none — see below)* |
| **VF-3** | Confirming your verification | F6.5 | `PARTIAL` | *(none)* |
| **VF-4** | Taking longer than usual | F6.P | `ABSENT` | We'll notify you · Sign out |
| **VF-5** | Verification paused *(canceled)* | F6.C | `PARTIAL` | Resume · Do this later · Sign out |
| **VF-6** | Something went wrong | F6.E | `PARTIAL` | Try again · Get help · Sign out |
| **VF-7** | Couldn't check verification *(transport)* | F6.X | `ABSENT` | Retry · Sign out |
| **VF-8** | Declined — coaching, attempts 1–3 | F6.D1 | `ABSENT` | Try again |
| **VF-9** | Declined — having trouble, 4–5 | F6.D2 | `ABSENT` | Try again · Having trouble? |
| **VF-10** | Locked out 30 min, 6+ | F6.D3 | `ABSENT` | *(countdown)* · Get help |
| **VF-11** | Manual review fallback | F6.F | `ABSENT` ⛔ | ⛔ **OQ-2** |
| **VF-12** | Not configured *(dev only)* | F6.N | `BUILT` | Sign out |

**🔴 `PersonaVerificationScreen` renders zero controls in all five of its states.** Cancel Persona
and you are permanently stranded: no *Try again* (a `started` ref blocks relaunch), no sign-out, and
no back arrow because it's the only screen in its stack. **This is a confirmed, reproducible trap —
hit during the 2026-08-09 walkthrough.** Fixing it is the highest-value change in this document.

**F6.Z — every verify and pending screen needs a persistent sign-out.** `USER_FLOWS.md` calls this
"the single most important change". Sign-out currently exists in exactly one place in the whole
signed-in app: **PF-1**, which a declined user can never reach.

**VF-7 must be a different screen from VF-8.** "We couldn't check" (our network failed) and "you
were declined" (the vendor decided) are opposite meanings. Rendering a transport error as a decline
tells a legitimate user they failed an age check.

**Copy rule, absolute:** verification failures are **coaching, never diagnostic**. No scores, no
vendor status strings, no reasons that reveal matching internals.

---

## DV · Devices & pairing — `STUB`, tasks **P1-3.0 / P1-4.0 / P1-5.0** — 🔴 critical path

| ID | Screen | Flow | Status | Task |
|---|---|---|---|---|
| **DV-1** | Home / device list | F7.1 | `STUB` | P1-4.0 |
| **DV-2** | No devices — empty state | F7.1 | `STUB` | P1-4.0 |
| **DV-3** | Scanning | F7.3 | `ABSENT` | P1-3.0 |
| **DV-4** | Scan results | F7.4 | `ABSENT` | P1-3.0 |
| **DV-5** | No devices found | F7.E3 | `ABSENT` | P1-3.0 |
| **DV-6** | Connecting / bonding / handshake | F7.6–F7.9 | `ABSENT` | P1-4.0 |
| **DV-7** | Paired — success | F7.10 | `ABSENT` | P1-4.0 |
| **DV-8** | Pairing failures ×11 | F7.E1–E11 | `ABSENT` | P1-4.0 |
| **DV-9** | Device detail | F8 | `ABSENT` | P1-5.0 |
| **DV-10** | Rename device | — | `ABSENT` | P1-5.0 |
| **DV-11** | Unpair confirmation | — | `ABSENT` | P1-5.0 |

**DV-1 is a placeholder** — a hardcoded "No devices paired" card. It is not a device list.

**DV-4** shows signal strength. **DV-8** covers eleven distinct failures, and two are *routing*
decisions rather than errors: `AGE_NOT_VERIFIED` must route into **VF-1**, not show an error; and
`DEVICE_OWNED_BY_ANOTHER_USER` needs its own honest copy. Incompatible firmware **fails closed**.

**DV-9** must show battery (including `0xFF` = unknown), live connection status, and lock state
**with a staleness indicator** — lock state is only ever the last notification received, never a
guess.

---

## LK · Lock & unlock — `ABSENT`, tasks **P3-1.0 … P3-3.0** (0/119 boxes) — the product

| ID | Screen / state | Flow | Machine state | CTA |
|---|---|---|---|---|
| **LK-1** | Device not found | F8.1 | `DISCONNECTED` | Reconnect |
| **LK-2** | Connecting… | F8.2 | `CONNECTED_UNAUTH` | *(transient, bounded)* |
| **LK-3** | Activate this device | F8.3 | `PENDING_ACTIVATION` | Activate |
| **LK-4** | Locked | F8.4 | `LOCKED` | **Unlock** |
| **LK-5** | Unlocking… | F8.5 | *in flight* | *(none)* |
| **LK-6** | Unlocked | F8.6 | `UNLOCKED` | **Lock** |
| **LK-7** | Auto-locked — out of range | F8.A1/A2 | — | Reconnect |
| **LK-8** | Activation success | — | — | Continue |

**🔴 LK-5 is pending, never "unlocked".** Lock state UI is **notification-driven only** — never
render unlocked before the device confirms. An optimistic render here is a safety defect, not a
polish issue.

**LK-1 must state the device is locked.** Disconnected is the *safe* state — the firmware dead-man
timer locks the device when the phone leaves range, whether or not the app is alive.

**LK-8** is called out in the roadmap as "the product's first real moment" — the one place a
celebratory treatment is explicitly wanted.

**Never show RSSI as a distance in metres.** Signal strength is not range.

---

## PF · Profile & settings — 🔴 **no owning PRD task** for 6 of 7 sections

`P1-8.0` covers roughly one of F9's seven sections. The rest is unowned work — flagged in
`SCREEN_INVENTORY.md:45` as `no task exists`.

| ID | Screen | Flow | Status | Notes |
|---|---|---|---|---|
| **PF-1** | Account | F9.1 | `PARTIAL` | identifier, display name, verification status, member since, sign out |
| **PF-2** | Security | F9.2 | `ABSENT` | change password · sign out of all devices |
| **PF-3** | Devices | F9.3 | `ABSENT` | → DV-9 · rename · unpair |
| **PF-4** | Notifications | F9.4 | `ABSENT` | ⛔ push has no client code |
| **PF-5** | Help & support | F9.5 | `ABSENT` | ⛔ **OQ-2** |
| **PF-6** | Legal | F9.6 | `ABSENT` | ⛔ no privacy/terms URLs exist |
| **PF-7** | Danger zone | F9.7 | `ABSENT` | ⛔ **OQ-11(d)** · delete account, two-step confirm |

**PF-1 is built** and reachable from a *Profile* header action on **DV-1**. Its error state has no
sign-out — worth fixing, since sign-out is the app's only escape hatch.

---

## SY · System surfaces

| ID | Surface | Status | Task |
|---|---|---|---|
| **SY-1** | Android foreground-service notification | `ABSENT` | P1-7.0 |
| **SY-2** | Push — lock state change | `ABSENT` | P3-5.0 |
| **SY-3** | Push — low battery | `ABSENT` | P3-5.0 |

**SY-1** must show **live lock state** — useful, not merely compliant. **SY-2/3** deep-link to the
relevant device screen, coalesce, and carry **no PII**.

---

## Roll-up

`Blocked` is counted separately from `Absent`: both are unwritten, but a blocked screen cannot be
started even with a design, because a named input is missing.

| Section | Screens | Built | Partial/Stub | Blocked | Absent |
|---|---|---|---|---|---|
| SH Shell | 1 | 1 | — | — | — |
| ON Onboarding | 9 | — | — | — | 9 |
| AU Auth | 11 | 8 | 3 | — | — |
| VF Verification | 12 | 1 | 4 | 1 | 6 |
| DV Devices | 11 | — | 2 | 2 | 7 |
| LK Lock | 8 | — | — | 4 | 4 |
| PF Profile | 7 | — | 1 | 4 | 2 |
| SY System | 3 | — | — | — | 3 |
| **Total** | **62** | **10** | **10** | **11** | **31** |

---

## What blocks design work

**OQ-7 (brand assets) blocks all visual work** and is unanswered. `tokens.ts` is an explicitly
provisional grayscale placeholder chosen only to be legible — every colour in the app today is a
stand-in. **Supplying design references is what resolves OQ-7.** Until then no wireframe box in
`P0-7.0` can be ticked (all four are open).

**Missing UI primitives** — needed before most of the above can be built:
`Button` secondary + destructive variants · list row · badge · toggle · sheet/modal · countdown.

**Dark theme: decided — light only** (Sadin, 2026-08-09). Design refs are needed for the light
theme only. `tokens.ts` stays `lightTheme`-only and no screen branches on colour scheme. Keep using
semantic token names so this stays reversible later; do not add `useColorScheme()` branches.

**Other blockers by screen:** `min_age` → all of VF · OQ-2 → VF-11, PF-5 · OQ-12 → DV-6…DV-8, all
LK · OQ-1/OQ-4 → DV, LK (hardware ~Day 26) · OQ-11(d) → PF-7 · SMTP → AU-3, AU-9.

---

## Out of scope — do not supply refs

From `TODO-addons.md`: **AD-1 Admin Web Panel** (15 d — fleet view, verification audit, user
management, audit-log browser), **AD-2** analytics beyond a user-facing opt-out, **AD-3** firmware,
**AD-4** advanced liveness. And, again: **all Persona ID-capture and selfie screens** — vendor-owned.

---

## How to give feedback

Reference the screen ID. `VF-5: <ref>` or `LK-4: make the unlock control fill the width`.
For a specific state, name it: `AU-2 error state: …`.

Priority order suggested, highest value first:

1. **VF-2 / VF-5 / VF-6** — the stranding trap. Users cannot leave the app today.
2. **LK-3 … LK-6** — the core product; nothing exists and it's 0/119 boxes.
3. **DV-1 … DV-8** — critical path, blocks everything downstream.
4. **ON-1 … ON-3** — carries the privacy promise.
5. **AU-3 / AU-9 / AU-11** — three one-button fixes that remove three dead ends.
