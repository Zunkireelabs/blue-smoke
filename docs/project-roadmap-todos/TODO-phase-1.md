# Phase 1 — Accounts & Device Management (BLE)

**PRD effort:** 18.75 person-days / 150 hours · **Roadmap block:** B (Days 7–12)
**Spec:** [`../TECHNICAL_SPEC.md`](../TECHNICAL_SPEC.md) · **Roadmap:** [`ROADMAP.md`](ROADMAP.md)

> **Goal (PRD verbatim):** Deliver the full account lifecycle and the ability to pair and manage
> multiple BLE devices. By the end of this phase a user can register, sign in, discover and bond
> devices, and see live device status that survives reconnects and app backgrounding.

**Progress:** 0 / 8 tasks · 0 / 77 sub-tasks *(P1-1.0 grew +6 sub-tasks — confirmed phone-OTP addition, spec §1.2.1)*

**Depends on:** `P0-3.0` (Supabase + RLS), `P0-4.0` (RN scaffold), `P0-2.0` + mock peripheral

---

## P1-1.0 — Signup / Login / Password Reset + Phone OTP
`Auth` · `Mobile (iOS+Android)` · **Medium** · **~4.5 d** *(was 2.5 d — see spec §1.2.1)* · Owner: M3

> Account creation and secure login via **two** first-class methods — email + password, or phone
> number + OTP — plus email-based password reset. Establishes the verified identity that device
> ownership and age status attach to. Both auth methods resolve to the same `user_id`; business
> logic never branches on which one was used.
>
> Phone OTP was raised as a proposal and **confirmed in team meeting, 2026-08-05** — the ~4.5
> person-day estimate (was 2.5 d, see spec §1.2.1) is the locked figure for this task.

**Method A — Email + password** *(original scope)*
- [ ] Signup screen — email + password, Zod validation
- [ ] Password strength requirements + clear inline feedback
- [ ] Login screen with error handling that does not leak account existence
- [ ] Password reset request + email flow
- [ ] Deep-link handling for the reset link on both platforms

**Method B — Phone number + OTP** *(confirmed addition, spec §1.2.1)*
- [ ] Auth method choice screen — Email or Phone, single decision point before either flow
- [ ] Phone input with country-code picker, validated via `libphonenumber-js`
- [ ] Twilio Verify configured as Supabase Auth's **native** phone provider (no custom bridge)
- [ ] OTP entry screen — segmented 6-digit input, resend cooldown timer
- [ ] Error handling mirrors the email flow — no enumeration, no leaking account existence

**Shared — both methods**
- [ ] Session persistence — refresh token in Keychain/Keystore (🟠 secret-at-rest, spec §8.1)
- [ ] Auto-refresh + graceful expiry handling
- [ ] Sign-out clears all local secrets, including any `K_sess`
- [ ] `profiles` row created on signup, regardless of method
- [ ] Email verification flow (if enabled) handled
- [ ] Account-linking policy enforced: a first-time method with no existing link always creates a
      new account; linking email + phone to one identity only happens as a deliberate
      already-authenticated action, never an automatic merge at verify time (spec §1.2.1)
- [ ] Tested on both platforms, both methods

**Assumption:** BaaS auth supports email/password and reset email flow; Twilio Verify account
provisioned for the phone method (§1.2.1, confirmed 2026-08-05).
**Excludes:** social / SSO login.
**Risk:** email deliverability for reset links. → *Verify Supabase SMTP config early; consider a
custom SMTP provider for prod.* **New risk:** Twilio Verify cost/volume and SMS deliverability by
region — not yet assessed for target markets (relates to OQ-3).

---

## P1-2.0 — Onboarding & Permissions (BLE, Camera) Flow
`Onboarding` · `Mobile (iOS+Android)` · **Low** · **1.5 d** · Owner: M3

> Guided first-run experience that explains the app and requests BLE and camera permissions at
> the right moment, with clear fallback messaging if a permission is denied.

- [ ] Onboarding carousel explaining the product and the privacy model
- [ ] BLE permission priming screen, requested **at the moment of need**, not at launch
- [ ] Camera permission priming, requested at the start of verification
- [ ] iOS: `NSBluetoothAlwaysUsageDescription`, `NSCameraUsageDescription` written to justify, not just declare
- [ ] Android: runtime permissions — `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `CAMERA`, and location where required by API level
- [ ] **Denial recovery path** — explanation + deep link to Settings
- [ ] "Permanently denied" state handled distinctly from "denied once"
- [ ] Permission state re-checked on app foreground
- [ ] **No dead ends** — verified by walking every denial combination

**Assumption:** standard OS permission dialogs are acceptable to client.
**Excludes:** custom permission-priming screens beyond the agreed flow.
**Risk:** users denying permissions and getting stuck — needs a recovery path.

---

## P1-3.0 — Device Scan & Discovery
`BLE` · `Mobile (iOS+Android)` · **Medium** · **2.25 d** · Owner: M1

> Scan for nearby Blue Smoke devices over BLE and present discoverable devices to the user for
> selection, filtering to the project's GATT service.

- [ ] Scan **filtered on the service UUID** (spec §4.1) — never present arbitrary peripherals
- [ ] Manufacturer data parsed for pre-connect state hint + battery (spec §4.1)
- [ ] Discovered-device list UI with signal strength indication
- [ ] Scan timeout + explicit "no devices found" state with troubleshooting help
- [ ] Bluetooth-off state detected and handled with a prompt to enable
- [ ] Duplicate-advertisement handling; stable list ordering
- [ ] Scan stopped on screen exit — no battery leak
- [ ] Android OEM scan-reliability differences tested on ≥ 2 vendors
- [ ] Tested against the mock peripheral

**Assumption:** device advertises the agreed BLE service UUID.
**Excludes:** support for non-Blue-Smoke BLE peripherals.
**Risk:** scan reliability differences across Android OEMs.

---

## P1-4.0 — Pairing / Bonding Flow 🔴 CRITICAL PATH
`BLE` · `Mobile (iOS+Android)` · **High** · **3.0 d** · Owner: M1

> Secure BLE bonding plus an app-level device token bound to the verified account, so only the
> bonded, verified user's app can later command the device.

- [ ] LE Secure Connections bonding implemented
- [ ] `deviceInfo` read post-connect; `protocolVersion` compatibility checked (spec §4.3)
- [ ] `serial_hash = SHA-256(deviceUid ‖ salt)` computed — **raw UID never transmitted**
- [ ] `issue-device-session` Edge Function called (spec §5.4)
- [ ] `AGE_NOT_VERIFIED` response handled → routed into the verification flow
- [ ] `DEVICE_OWNED_BY_ANOTHER_USER` handled with a clear message
- [ ] `K_sess` stored in Keychain/Keystore, **biometric-gated** (spec §8.1)
- [ ] **§4.5 auth handshake implemented** — read nonce, compute CMAC, 2-frame `authResponse` write
- [ ] AES-128-CMAC implementation unit-tested against known-answer vectors
- [ ] Handshake failure paths handled: `AUTH_FAILED`, `RATE_LIMITED`
- [ ] Bond-lost recovery path implemented
- [ ] **Verified: a bonded-but-unauthenticated app can read `lockState` and nothing more** (spec §8.2)
- [ ] Tested against the mock peripheral, including every failure path

**Assumption:** firmware supports BLE bonding and token exchange per spec.
**Excludes:** out-of-band / NFC pairing.
**Risk:** bonding edge cases and lost-bond recovery.
**Note (PRD):** *pairing security underpins all lock/unlock authority.*

---

## P1-5.0 — Multi-Device Management (List, Rename, Unpair, Status, Battery)
`Devices` · `Mobile (iOS+Android)` · **Medium** · **3.0 d** · Owner: M3 + M1

> Manage multiple paired devices: list all bonded devices, rename them, unpair, and view live
> connection status and battery level for each.

- [ ] Device list UI showing all bonded devices
- [ ] Live connection status per device
- [ ] Battery level from `lockState` byte 2, with `0xFF`-unknown handled (spec §4.4)
- [ ] Low-battery indicator driven by `flags` bit2, with hysteresis (15% set / 20% clear)
- [ ] Lock state per device, with a **staleness indicator** (spec §9.3)
- [ ] Rename device — local + synced to `device_ownership.nickname`
- [ ] Unpair flow: `FACTORY_UNPAIR` command → drop OS bond → revoke session → clear `K_sess`
- [ ] Unpair confirmation dialog with a clear explanation of consequences
- [ ] Connect/disconnect per device from the list
- [ ] Multi-device connection policy defined — how many concurrent connections, and what happens beyond it
- [ ] Status polling designed for battery efficiency — notify-driven, not polled
- [ ] Tested with ≥ 2 mock peripherals simultaneously

**Assumption:** device exposes battery via the `lockState` characteristic. ✅ *(spec §4.4 byte 2)*
**Excludes:** sharing a device across multiple accounts.
**Risk:** status/battery polling impact on battery and connection.

---

## P1-6.0 — Device ↔ Account Sync to Backend
`Sync` · `Backend` · **Medium** · **2.0 d** · Owner: B1

> Sync paired-device records to the backend so device ownership is enforced server-side and
> survives reinstalls and new devices.

- [ ] `devices` row created/resolved on first bond by `serial_hash`
- [ ] `device_ownership` row created, enforcing one active owner per device
- [ ] Unique constraint `unique (device_id) where (revoked_at is null)` verified under concurrency
- [ ] Unpair sets `revoked_at` rather than deleting — preserves the audit trail
- [ ] Device list hydrated from the backend on login / reinstall
- [ ] **Reinstall flow tested:** devices reappear; `K_sess` must be re-issued (it is not restored)
- [ ] Conflict handling when the same device is re-paired from another account
- [ ] `audit_log` entries for `device_bonded` and `device_unpaired`, **metadata only, no PII**
- [ ] RLS verified — user A cannot see or modify user B's device rows
- [ ] Offline queue for sync operations, with retry

**Assumption:** backend device model defined in Phase 0.
**Excludes:** cross-user device transfer workflow.
**Risk:** sync conflicts when the same device is re-paired elsewhere.

---

## P1-7.0 — Connection Lifecycle (Reconnect, Background Handling)
`BLE` · `Mobile (iOS+Android)` · **High** · **3.0 d** · Owner: M1

> Manage the BLE connection across app states: automatic reconnect after drops and correct
> behaviour when the app is backgrounded or relaunched.

- [ ] Auto-reconnect with exponential backoff and a cap
- [ ] **Re-handshake required on every reconnect** — a session never survives a disconnect (spec §4.5)
- [ ] iOS: state restoration via `CBCentralManagerOptionRestoreIdentifierKey`
- [ ] iOS: background mode `bluetooth-central` configured and working
- [ ] Android: foreground service (type `connectedDevice`) with a clear persistent notification
- [ ] Android: battery-optimisation exemption requested with an honest explanation
- [ ] Connection parameters applied per spec §4.9, incl. the 4000 ms supervision timeout
- [ ] App-state transitions handled: foreground ↔ background ↔ relaunch
- [ ] All BLE operations have explicit timeouts — **no unbounded awaits** (spec §9.3)
- [ ] Findings from the `P0-4.5` spike applied
- [ ] **Force-quit behaviour documented honestly** — and confirmed harmless because the firmware dead-man timer is authoritative (spec §7.1)
- [ ] Tested across all app states on both platforms

**Assumption:** target OS versions allow the required background BLE modes.
**Excludes:** guaranteed connectivity in the OS-killed / terminated state.
**Risk:** iOS background BLE restrictions are a known hard problem. → *De-risked by `P0-4.5`.*
**Note (PRD):** *de-risked further in Phase 3 background work.*

---

## P1-8.0 — Profile & Settings
`Profile` · `Mobile (iOS+Android)` · **Low** · **1.5 d** · Owner: M3

> User profile and app settings: view account details, manage notification preferences, and
> access support/legal links.

- [ ] Profile screen — email, display name, member since
- [ ] Verification status displayed (verified / not verified + date) — **never the DOB**
- [ ] Notification preferences (lock status, low battery)
- [ ] Support contact link — the route used by the manual fallback (spec §6.4)
- [ ] Privacy policy + terms links
- [ ] **A plain-language explanation of the on-device privacy model** — this is the product's core promise; say it where users will read it
- [ ] App version + build number displayed for support purposes
- [ ] Sign out

**Assumption:** profile fields limited to the agreed set.
**Excludes:** in-app account deletion / data-export tooling.
**Risk:** — *(none recorded in PRD)*

---

## ✅ Phase 1 Exit Criteria *(verbatim from client PRD)*

- [ ] User can sign up, sign in, and reset password
- [ ] User can scan, pair, and bond multiple devices
- [ ] Devices can be listed, renamed, and unpaired
- [ ] Live device status and battery shown per device
- [ ] Connection reconnects correctly across app foreground/background states

**Additional internal gates:**
- [ ] RLS audit round 1 passed — verified against a second user's JWT
- [ ] All Phase 1 flows exercised against the mock peripheral, failure paths included
