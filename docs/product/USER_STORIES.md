# USER_STORIES.md — scenario walkthroughs

**Purpose:** Step-by-step walkthroughs of what a real person does and what the system does back.
The narrative companion to [`../system-design-ux/USER_FLOWS.md`](../system-design-ux/USER_FLOWS.md),
which is the structural version. Written to be readable by someone who does not read the code.
**Date:** 2026-08-08 (Day 9). **Status:** draft.

---

## Table of contents

1. [The persona](#persona)
2. [Scenario 1 — First run, phone signup, all the way to a paired device](#s1)
3. [Scenario 2 — Verification declined three times, then a person](#s2)
4. [Scenario 3 — Returning user unlocks, then walks away](#s3)
5. [Scenario 4 — Forgotten password](#s4)
6. [Scenario 5 — Second phone, already-owned device](#s5)
7. [Edge cases](#edge)

**Reading the format.** Each step is `User Action` → `System Behavior` → `State After`, and each
step's `State After` is the next step's precondition. `State After` describes rows and app state, so
a step can be checked against the database rather than against a feeling.

> Steps marked **[TARGET]** describe the design, not the build. Steps marked **[TODAY]** describe
> what the code does now. Where they differ, the difference is the work.

---

## The persona {#persona}

**Name:** Marcus Bell
**Age:** 24
**Device:** iPhone 14, iOS 18. Bluetooth on, notifications mostly off.
**Tech comfort:** High for apps, zero patience for setup. Will abandon a flow that stalls twice.
**Context:** Bought a Blue Smoke device in a shop. Wants to use it tonight.
**What he does not care about:** why we need his ID, until we explain it in one sentence.
**What will lose him:** a screen with no button on it.

Marcus is not a beginner. He is impatient, and that is the useful thing about him — every dead end in
`FLOWS.md` §4 is a screen where Marcus force-quits and does not come back.

---

## Scenario 1 — First run to a paired device {#s1}

**Precondition:** App freshly installed. No account, no session.

### Step 1 — Marcus opens the app

**User Action:** Taps the icon.

**System Behavior:**
- `App.tsx` calls `initSessionListener()` once.
- `useSessionStore.status = 'hydrating'` → `selectStack` returns `boot`.
- `supabase.auth.getSession()` resolves with no session → `status = 'signedOut'` → `auth` stack.

**UI Shows:** A brief spinner, then the welcome screen.

**[TARGET]** Onboarding cards F1.1–F1.3 first. F1.3 is the one that matters: *"we never see your ID
photo or selfie."* Marcus reads one line and stops wondering why an app about a vape wants his
passport.

**[TODAY]** No onboarding exists. He lands directly on `AuthChoice`.

**State After:** `sessionStatus = signedOut` · no rows anywhere.

---

### Step 2 — He picks phone

**User Action:** Taps **Continue with Phone**.

**System Behavior:** `navigation.navigate('PhoneInput')` — `AuthMethodChoiceScreen.tsx:37`.

**UI Shows:** Country picker defaulted to US, empty number field.

**State After:** unchanged.

---

### Step 3 — He enters his number

**User Action:** Selects United Kingdom, types `7700 900123`. The field reformats as he types.

**System Behavior:**
- `AsYouType` reformats per keystroke. Changing country cleared the field first — deliberate.
- Parsed to `+447700900123`, validated against `phoneE164Schema`.
- `authClient.requestPhoneOtp('+447700900123')` → `signInWithOtp({ phone })`.
- On success: `navigation.navigate('OtpVerify', { phone })` — `PhoneInputScreen.tsx:76`.

**UI Shows:** Six empty digit boxes, keyboard up, a resend link disabled with a 30-second countdown.

**State After:** OTP in flight. Still `signedOut`.

> **The one success transition in the app.** Every other screen renders a panel and hopes the
> navigator moves the user. See `FLOWS.md` §2.1.

---

### Step 4 — He types the code

**User Action:** Types `123456`. Submits on the sixth digit without pressing anything.

**System Behavior:**
- `verifyPhoneOtp` → `verifyOtp({ phone, token, type: 'sms' })`.
- `ensureProfileRow` writes a `profiles` row.
- Supabase establishes a session → `onAuthStateChange` fires → `status = 'signedIn'`.
- `useVerificationStatus` enables, queries `verifications`, finds nothing → `'none'`.
- `selectStack('signedIn', 'none')` → `verify`.

**Data Created:** `profiles` — `{ id: <uuid>, display_name: null }`.

**UI Shows:** **[TODAY]** A flash of "Signed in" (DE-4) before the navigator swaps the stack. If
`onAuthStateChange` does not fire, that flash is permanent and Marcus is stuck.
**[TARGET]** Nothing. Success is not a screen.

**State After:** `sessionStatus = signedIn` · `verification = none` · stack `verify`.

---

### Step 5 — Age verification

**User Action:** Reads F6.1, taps **Continue**, allows camera, photographs his driving licence and
takes a selfie inside Persona's flow.

**System Behavior — [TARGET]:**
- `create-inquiry` (Edge Function, service role) creates the inquiry bound to `user_id` via
  `reference-id`, writes `verifications` with `provider_status = 'pending'`, returns a handle.
- The SDK launches with that handle. Capture happens **entirely in Persona's process**.
- `onComplete` fires → app shows F6.5. **This status is a UI hint and sets nothing.**
- Persona POSTs the webhook → `persona-webhook` verifies the HMAC signature over the **raw body**,
  compare-and-set on `provider_status = 'pending'`, writes the outcome and an audit row.
- The app's 5-second poll observes the change.

**Data Created:** `verifications` — `{ user_id, inquiry_id, provider_status: 'pending' → 'approved',
age_verified: true, method: 'persona-v1' }`.
**Never stored:** dob · name · id_number · document image · selfie · face embedding · similarity
score.

**System Behavior — [TODAY]:** The app calls `Inquiry.fromTemplate()` **with no user linkage**.
`onComplete` sets local state. **No row is written.** `create-inquiry` returns 501. The webhook would
404 on an inquiry it has no row for. Marcus stays at `'none'` and the app sends him back to the ID
scan, forever. See `FLOWS.md` §5.

**State After — [TARGET]:** `verification = verified` · stack `home`.

> 🔴 **The gap this scenario cannot close.** `approved` means "passed the template's configured
> checks", **not** "is over 18". If the template has no age requirement, Step 5 approves a
> 14-year-old and every line above still executes correctly.

---

### Step 6 — Pairing **[TARGET]**

**User Action:** Taps **Pair a device**, allows Bluetooth, picks `BlueSmoke A31F` from the list.

**System Behavior:**
- Scan filtered by the §4.1 service UUID.
- Connect + bond → `CONNECTED_UNAUTH`.
- Read `deviceInfo` (§4.3) → compatible.
- Auth handshake (§4.5), CMAC, constant-time compare → `AUTHENTICATED`.
- `issue-device-session`: resolves the JWT → **re-reads `age_verified` server-side** → rate-limit
  check → device upsert on `serial_hash` → ownership assert → derive `K_sess` via HKDF → return
  `{ session_id, k_sess, expires_at }`.

**Data Created:** `devices`, `device_ownership`, `device_sessions`.

> 🔴 **Blocked at the upsert.** The `serial_hash` salt is unknown (OQ-12), and a guessed salt fails
> **silently** — well-formed hash, missed lookup, looks like a hardware fault.
> Also expected today: `409 DEVICE_NOT_PROVISIONED`, because nobody has agreed who burns `K_dev`
> into OTP at manufacture (OQ-4).

**UI Shows:** Device card, state `LOCKED`.

**State After:** `verified` · one owned device · `LOCKED`.

---

### Step 7 — First unlock **[TARGET]**

**User Action:** Taps **Unlock**.

**System Behavior:** `UNLOCK` command (§4.6) over the authenticated channel. **The UI moves to
pending and waits.** On the device's `lockState` notification, and only then, it renders `UNLOCKED`.

**UI Shows:** Button → spinner → `UNLOCKED`.

⚠️ **Never render `UNLOCKED` optimistically.** An optimistic flip shows "unlocked" for a device that
is locked — the exact failure the product must not have.

**State After:** `UNLOCKED`.

---

## Scenario 2 — Declined three times, then a person {#s2}

**Precondition:** Marcus is signed in, `verification = none`. His licence is worn and the print is
faint.

| Step | User Action | System Behavior | UI Shows |
|---|---|---|---|
| 1 | Photographs the licence in a dim room | Webhook → `provider_status` terminal-failure | **Attempt 1** coaching: brighter light, dark surface |
| 2 | Tries under a ceiling light | Declined again | **Attempt 2**: glare — tilt the card |
| 3 | Tries at an angle | Declined again | **Attempt 3**: check the document — current, unexpired, fully in frame |
| 4 | Tries his passport | Declined | **Attempt 4** + **Having trouble?** |
| 5 | Taps **Get help** | Fallback screen with a support reference | F6.F |

**What Marcus is never told:** which check failed · any score · that the face match was borderline ·
Persona's reason string. Every message says what to try next.

**Data Updated:** one `verifications` row per attempt; the ladder counter is **server-side**, keyed
on `user_id` — a local counter is defeated by force-quitting.

> 🔴 **BLOCKED — OQ-2.** Step 5 has no owner, channel or SLA. The screen is designed; the
> destination does not exist.

### 🔴 What happens today instead

There is no ladder, no coaching, and no fallback. Marcus lands on the `verify` stack, where the one
screen has **no sign-out, no support, and a Cancel state that promises a retry it does not provide**
(DE-7). `sessionStatus` is `signedIn`, so the auth stack is not mounted.

**He cannot leave the app.** Force-quit and relaunch restores the identical state from the Keychain.
His only recourse is deleting it.

**State After:** `verification = declined` · stack `verify` · **no exit**.

---

## Scenario 3 — Unlock, then walk away {#s3}

**Precondition:** Verified, one paired device, `LOCKED`, phone in pocket.

| Step | User Action | System Behavior | UI Shows |
|---|---|---|---|
| 1 | Opens the app | Scan → connect → bond → handshake → `AUTHENTICATED` → `LOCKED` | Device card, `LOCKED` |
| 2 | Taps **Unlock** | Command sent; UI **pending** | Spinner — not "unlocked" |
| 3 | — | Device notifies | `UNLOCKED` |
| 4 | Walks to the next room | RSSI sampled 1 Hz, median of last 5, drops below −85 dBm for 3 consecutive samples | "Locked — your phone moved out of range" |
| 5 | Walks back | Rises above −75 dBm for 2 consecutive | Reconnected, `LOCKED`. **Not** auto-unlocked |
| 6 | Force-quits the app | **Nothing to show — the firmware locks itself** | — |

**The 10 dBm band between −85 and −75 is what stops it flapping** at the boundary. Values are spec
§7.2 and must not be re-derived.

⚠️ Step 5 does **not** auto-unlock. `UNLOCKED` is reachable only through `AUTHENTICATED` + activated
+ an **explicit user action**.

⚠️ Step 6 is the product's central claim: **the device locks itself when the phone goes away,
regardless of app state.** The app makes that fast; the firmware's dead-man timer makes it true.
Never show distance in metres — RSSI is not calibrated ranging.

---

## Scenario 4 — Forgotten password {#s4}

**Precondition:** Marcus signed up by email months ago. Verified.

| Step | User Action | System Behavior | UI Shows |
|---|---|---|---|
| 1 | Login → **Forgot password?** | `navigate('PasswordReset')` | Email field |
| 2 | Enters his address | `resetPasswordForEmail`, `redirectTo: bluesmoke://reset-password` | *"If an account exists for that address…"* |
| 3 | Opens the email, taps the link | Deep link → `ResetPasswordConfirm`; Supabase establishes a **recovery session** | New-password form |
| 4 | Sets a new password | `updateUser({ password })` | **[TARGET]** "Password updated" **+ Continue** → the gate |

⚠️ **Step 2's wording is deliberate and must not be "improved".** Saying "no account with that
address" turns the reset form into an account-enumeration oracle.

### Two things that break here today

**Step 3 may not work at all (SD-2).** `ResetPasswordConfirm` is registered **only in the auth
stack**, which is mounted only while `signedOut`. The recovery link creates a session → `signedIn` →
the auth stack unmounts. The deep link's target may be gone at the moment it is needed.
**Unverified** — the ordering decides it and nobody has run it on a device. **Test this first once
Track A lands.**

**Step 4 dead-ends (DE-6).** The screen says *"You can now log in with your new password"* and offers
no way to. Because the recovery session leaves him signed in, the right destination is not Login at
all — it is the gate.

---

## Scenario 5 — Second phone, already-owned device {#s5}

**Precondition:** Marcus's device is bonded to his account. His flatmate installs the app and tries
to pair it.

| Step | User Action | System Behavior | UI Shows |
|---|---|---|---|
| 1 | Flatmate signs up, verifies | New `user_id`, own `verifications` row | Home, no devices |
| 2 | Scans, finds the device | BLE bonding succeeds — **bonding is not authorisation** | Pairing… |
| 3 | — | `issue-device-session` finds an active `device_ownership` row for another user → **403 `DEVICE_OWNED_BY_ANOTHER_USER`** | "This device is paired to another account" |

**What the flatmate is not told:** whose account, their email, or anything else about Marcus. The
message says the state and offers support, nothing more.

⚠️ **Step 2 succeeding is the point.** BLE bonding is a transport-layer pairing, not a permission.
Authorisation happens server-side at step 3, where RLS and the ownership check live. A design that
treats "it bonded" as "they may use it" is wrong (spec §8.2).

---

## Edge cases {#edge}

### E1 — Verified user, no network
`useVerificationStatus`'s query errors. **[TODAY]** the hook returns `'none'` and the navigator sends
a verified user back to an ID scan (SD-3). **[TARGET]** F6.X: *"We couldn't check your
verification — this looks like a connection problem."* Retry, not re-scan. The hook already exports
`error` and `refetch` for this; the navigator drops them.

### E2 — Signup email never arrives
Supabase's default mail is rate-limited and **no custom SMTP is configured**, so this is the
*expected* path in development, not an edge case. **[TODAY]** DE-1: a terminal panel with no resend.
**[TARGET]** F2.6a–c: resend, change address, or switch to phone.

### E3 — Mistyped phone number
**[TODAY]** `OtpEntryScreen` imports no `useNavigation` at all (DE-4). There is no back link, so
correcting a digit means force-quitting the app. **[TARGET]** F3.E6, a **Change number** link.

### E4 — Bluetooth denied
Pairing is impossible; **everything else still works**. The device list shows an honest empty state
with a route to Settings — not a blank screen, and not a modal the user cannot dismiss.

### E5 — Session expires mid-command
Re-auth silently, retry once, surface only if that fails. A user pressing Unlock should not be shown
a session-management error for something the app can fix itself.

### E6 — App killed while unlocked
**The device locks itself.** The firmware dead-man timer is the authority; the app being alive is an
optimisation. Nothing to surface, and nothing for the user to do.

### E7 — Client says verified, server disagrees
`age_verified` on the client is a UX hint. `issue-device-session` re-reads the database and returns
**403 `AGE_NOT_VERIFIED`**. That must land on "Verification needed" and route to F6 — **not** a
generic error, and never a silent failure.

---

## What these scenarios establish

Read end to end, Scenarios 1–5 walk every screen the product needs. Two things fall out that are
worth stating plainly:

1. **Scenario 2 is currently unshippable.** A declined user cannot leave the app. Every other finding
   in this document is a missing button; that one is a person trapped in a product.
2. **Scenario 1 cannot be completed by anyone today** — not because of a bug, but because Step 5
   writes no row and Step 6 needs a salt nobody has. Both are external answers, not code.

The fastest way to make this document true rather than theoretical is **Track A** (~20 minutes):
test OTP, apply the two pending migrations, seed a verified row. That gets Steps 1–4 walkable for
real, and settles SD-2 in Scenario 4 — which is the one claim here that source reading cannot.
