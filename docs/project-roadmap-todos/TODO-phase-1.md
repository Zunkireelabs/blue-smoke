# Phase 1 — Accounts & Device Management (BLE)

**PRD effort:** 18.75 person-days / 150 hours · **Roadmap block:** B (Days 7–12)
**Spec:** [`../TECHNICAL_SPEC.md`](../TECHNICAL_SPEC.md) · **Roadmap:** [`ROADMAP.md`](ROADMAP.md)

> **Goal (PRD verbatim):** Deliver the full account lifecycle and the ability to pair and manage
> multiple BLE devices. By the end of this phase a user can register, sign in, discover and bond
> devices, and see live device status that survives reconnects and app backgrounding.

**Progress:** 0 / 8 tasks · **20 / 91 sub-tasks** *(audited Day 9, 2026-08-08: `P1-1.0` 15 ·
`P1-2.0` 1 · `P1-4.0` 4. Was `15 / 91`, which pre-dated all of P1-4.0.)*

> **Denominator corrected — it was never 77.** Counting the boxes under the eight PRD tasks gives
> **91**: `P1-1.0` 17 · `2.0` 9 · `3.0` 9 · `4.0` 13 · `5.0` 12 · `6.0` 11 · `7.0` 12 · `8.0` 8.
> The `77` came from the same unreconciled estimate as Phase 0's `62` (see `TODO-phase-0.md`), and
> the "+6 for phone OTP" adjustment was applied on top of a number that was already wrong. Boxes in
> the Exit Criteria section are deliberately outside this count, matching the Phase 0 convention.
> The numerator (**15**, all under `P1-1.0`) comes from that task's own ticks; only the denominator
> was wrong, so the two edits compose rather than conflict.

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
- [x] Signup screen — email + password, Zod validation
- [x] Password strength requirements + clear inline feedback *(8-char floor — placeholder, not a
      spec value; flagged in schemas.ts to confirm against the Supabase project's own Auth
      password policy once P0-3.0 exists)*
- [x] Login screen with error handling that does not leak account existence
- [x] Password reset request + email flow
- [x] Deep-link handling for the reset link on both platforms *(config only — bluesmoke:// scheme
      registered in Info.plist/AndroidManifest.xml + RN linking config; unrunnable on this
      machine, brief §2 — unverified on a device, not untested-in-principle)*

**Method B — Phone number + OTP** *(confirmed addition, spec §1.2.1)*
- [x] Auth method choice screen — Email or Phone, single decision point before either flow
- [x] Phone input with country-code picker, validated via `libphonenumber-js`
- [x] Twilio Verify configured as Supabase Auth's **native** phone provider (no custom bridge)
      *(dev only, 2026-08-07 — Verify Service `bluesmoke-dev`, SMS channel, Fraud Guard on.
      Staging and prod still unconfigured. Twilio account is on the 30-day trial, so SMS only
      reaches numbers verified in the Twilio console — a trial limit, not a misconfiguration.
      Config lives in the Supabase dashboard, not this repo; see `supabase/README.md` on
      `feature/P0-3.0-baas-setup`)*
- [x] OTP entry screen — segmented 6-digit input, resend cooldown timer
- [x] Error handling mirrors the email flow — no enumeration, no leaking account existence

**Shared — both methods**
- [x] Session persistence — refresh token in Keychain/Keystore (🟠 secret-at-rest, spec §8.1)
- [x] Auto-refresh + graceful expiry handling
- [ ] Sign-out clears all local secrets, including any `K_sess` *(`K_sess` doesn't exist until
      P1-4.0 — clearing it is that task's job; today's `signOut()` only clears the Supabase
      session, which is all there is to clear yet)*
- [x] `profiles` row created on signup, regardless of method
- [x] Email verification flow (if enabled) handled
- [x] Account-linking policy enforced: a first-time method with no existing link always creates a
      new account; linking email + phone to one identity only happens as a deliberate
      already-authenticated action, never an automatic merge at verify time (spec §1.2.1)
      *(enforced by omission — no client, mock or real, attempts a merge anywhere in this feature)*
- [ ] Tested on both platforms, both methods *(no physical device or simulator on this machine,
      brief §2 — unit/typecheck/lint only; genuinely deferred, not faked)*

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

**Input (Day 9): the flow is designed — build against [`F1`](../system-design-ux/USER_FLOWS.md#f1),
drawn in [`flows.html`](../system-design-ux/flows.html).** It covers all nine boxes below, including
the denial matrix item 9 asks you to walk. Two things it settles that are easy to get wrong: item 7's
"denied once" and "permanently denied" are **different screens** (a re-prompt on a permanently-denied
permission is a button that silently does nothing), and denying Bluetooth must leave **the rest of
the app working** — account, profile and verification are all reachable without it.

- [x] Onboarding carousel explaining the product and the privacy model *(P1-2.0, ON-1..3 —
      walked live on the iOS simulator; `simctl uninstall` + reinstall confirmed the AsyncStorage
      flag clears and the carousel returns, rather than the Keychain-survives-uninstall trap this
      project hit on 2026-08-09)*
- [x] BLE permission priming screen, requested **at the moment of need**, not at launch *(P1-2.0,
      `BluetoothPrimingScreen`/ON-4 — real component, no launch-time mount anywhere; the actual
      pairing-flow call site is P1-4.0/Phase D's job, tracked there, not invented here)*
- [x] Camera permission priming, requested at the start of verification *(ON-5, shipped P2-6.0 —
      correcting this box now since it was never ticked when built)*
- [x] iOS: `NSBluetoothAlwaysUsageDescription`, `NSCameraUsageDescription` written to justify, not
      just declare *(both present in `Info.plist` and both genuinely justificatory — the camera one
      names Persona, the Bluetooth one explains the proximity behaviour)*
- [ ] Android: runtime permissions — `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `CAMERA`, and location
      where required by API level *(**partial.** `requestAndroidBluetoothPermission()` (P1-2.0,
      `src/features/ble/bluetoothPermission.ts`) now does the real `PermissionsAndroid.requestMultiple`
      call for `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` — but nothing calls it yet (Phase D), CAMERA
      is Persona's own SDK's concern not ours, and Android has still never been compiled on this
      project (no JDK) so none of this has actually been run. Leaving unticked rather than
      claiming something unrun.)*
- [x] **Denial recovery path** — explanation + deep link to Settings *(P1-2.0, ON-8/ON-9 —
      `Linking.openSettings()`, real, tested; not a placeholder button)*
- [x] "Permanently denied" state handled distinctly from "denied once" *(P1-2.0 — `BluetoothGateScreen`
      resolves ON-7 vs ON-8 vs ON-9 from real `BleManager` state, proven by
      `BluetoothGateScreen.test.tsx` against real iOS/Android state strings, not a shared
      component behind a variant prop. iOS never reaches ON-7 — see that file's own note on why)*
- [x] Permission state re-checked on app foreground *(P1-2.0 — `BluetoothGateScreen`'s `AppState`
      listener, tested)*
- [ ] **No dead ends** — verified by walking every denial combination *(**mostly done; one gap, and
      it is Android.** Both original blockers are gone: P1-3.0 gave these screens a real trigger
      (`Home` → "Pair a device" → ON-4 → gate), and the signed-in session walks fine now. On
      2026-08-11 all five radio states were driven live on the iOS simulator through that real
      trigger, by forcing `createDevBleManager`'s fixture state: `PoweredOn` → resolves to
      DeviceScan · `PoweredOff` → ON-9 · `Unauthorized` → ON-8 · `Unsupported` → ON-10 · `Unknown`
      → bounded spinner → timeout screen, whose "Try again" was pressed and re-armed a fresh
      timeout rather than sticking. ON-10's header back chevron was pressed and genuinely exits.
      **Still not walked: ON-7 (denied once).** iOS never reaches it by design — it needs Android,
      which has still never been compiled on this project (no JDK). **ON-6 also still has no real
      trigger** (notification priming is F7.9, past P1-3.0's pairing boundary). Leaving unticked
      for those two rather than rounding up.)*

**Assumption:** standard OS permission dialogs are acceptable to client.
**Excludes:** custom permission-priming screens beyond the agreed flow.
**Risk:** users denying permissions and getting stuck — needs a recovery path.

---

## P1-3.0 — Device Scan & Discovery
`BLE` · `Mobile (iOS+Android)` · **Medium** · **2.25 d** · Owner: M1

> Scan for nearby Blue Smoke devices over BLE and present discoverable devices to the user for
> selection, filtering to the project's GATT service.

- [x] Scan **filtered on the service UUID** (spec §4.1) — never present arbitrary peripherals
- [ ] Manufacturer data parsed for pre-connect state hint + battery (spec §4.1) — deliberately
      skipped this round: DV-4 only requires signal strength (decision recorded in
      `DeviceScanScreen.tsx`), and `0xFF`-unknown battery handling has no UI to attach to without
      it. Revisit alongside DV-9 (P1-5.0), which actually needs battery.
- [x] Discovered-device list UI with signal strength indication
- [x] Scan timeout + explicit "no devices found" state with troubleshooting help
- [x] Bluetooth-off state detected and handled with a prompt to enable
- [x] Duplicate-advertisement handling; stable list ordering
- [x] Scan stopped on screen exit — no battery leak
- [ ] Android OEM scan-reliability differences tested on ≥ 2 vendors — cannot be attempted;
      Android has never been compiled on this project (no JDK/ANDROID_HOME), unchanged from
      Phase 0/1's state. Not specific to this task.
- [x] Tested against the mock peripheral

**Assumption:** device advertises the agreed BLE service UUID.
**Excludes:** support for non-Blue-Smoke BLE peripherals.
**Risk:** scan reliability differences across Android OEMs.

---

## P1-4.0 — Pairing / Bonding Flow 🔴 CRITICAL PATH
`BLE` · `Mobile (iOS+Android)` · **High** · **3.0 d** · Owner: M1

> Secure BLE bonding plus an app-level device token bound to the verified account, so only the
> bonded, verified user's app can later command the device.

- [ ] LE Secure Connections bonding implemented *(hardware — OQ-1)*
- [x] `deviceInfo` read post-connect; `protocolVersion` compatibility checked (spec §4.3)
      *(Part 2a, `a328da6` + `c48cd4a`; `src/features/ble/deviceInfo.ts`)*
- [ ] `serial_hash = SHA-256(deviceUid ‖ salt)` computed — **raw UID never transmitted** *(🔴 OQ-12)*
- [ ] `issue-device-session` Edge Function called (spec §5.4) *(🔴 OQ-12 — the **server** half is
      built and ticked under `P0-3.0`; nothing in the app can call it until the salt is known)*
- [ ] `AGE_NOT_VERIFIED` response handled → routed into the verification flow *(🔴 OQ-12)*
- [ ] `DEVICE_OWNED_BY_ANOTHER_USER` handled with a clear message *(🔴 OQ-12)*
- [ ] `K_sess` stored in Keychain/Keystore, **biometric-gated** (spec §8.1) *(🔴 OQ-12 — nothing to
      store until a real `K_sess` flows)*
- [x] **§4.5 auth handshake implemented** — read nonce, compute CMAC, 2-frame `authResponse` write
      *(Part 1, `39da3cb` → `3d15000` → `6bad269`; `src/features/ble/auth.ts`)*
- [x] AES-128-CMAC implementation unit-tested against known-answer vectors
      *(independent implementation, RFC 4493 / FIPS-197 vectors; `src/features/ble/crypto.ts`)*
- [x] Handshake failure paths handled: `AUTH_FAILED`, `RATE_LIMITED`
- [ ] Bond-lost recovery path implemented *(hardware — OQ-1)*
- [ ] **Verified: a bonded-but-unauthenticated app can read `lockState` and nothing more** (spec §8.2)
      *(hardware — OS/radio-level, the mock cannot prove it)*
- [ ] Tested against the mock peripheral, including every failure path *(partial — the handshake and
      `deviceInfo` paths are, exhaustively and by mutation; bonding/session paths are unbuilt, so the
      box stays open until the whole surface is covered)*

> ⚠️ **Convention changed on the Day-9 audit: done sub-task boxes are now ticked when they are done.**
> This task previously held its boxes closed "until the whole task is", which is not what `CLAUDE.md`
> says ("tick the TODO box in the same PR that completes the work") and which produced exactly the
> failure it was meant to avoid — for three commits this list read `0/13` while three boxes were
> finished and reviewed. The **task** counter (`0 / 8 tasks`) is what stays closed until a task is
> whole; the sub-task boxes are the progress signal and must be honest. *(The note below also said
> "12" where the list has always had **13** boxes — corrected.)*
>
> **Part 1 landed on `chore/integrate-auth-db-persona` (`39da3cb`, `3d15000`, `6bad269`) — 3 boxes,
> now ticked.** Done: the §4.5
> handshake (read nonce → CMAC proof → two-frame `authResponse`), the independent AES-128-CMAC
> against RFC 4493 / FIPS-197 vectors, and the `AUTH_FAILED` / `RATE_LIMITED` failure paths. Also
> landed underneath them: the `BleClientContext` seam, `byteLayout`, and 19 handshake tests, every
> property verified by mutation.
>
> **Part 2 is not one task and must not be briefed as one** — it splits three ways by what blocks it:
>
> - **Blocked on 🔴 OQ-12 (the `serial_hash` salt, spec §13):** `serial_hash`, the
>   `issue-device-session` call, `AGE_NOT_VERIFIED` / `DEVICE_OWNED_BY_ANOTHER_USER` handling, and
>   biometric-gated `K_sess` Keychain storage (nothing to store until a real `K_sess` flows). A
>   guessed salt fails *silently* — every device misses its row and looks permanently unseen — so
>   this waits for an answer rather than a plausible value.
> - **Blocked on UI + hardware:** the pairing/bonding screen (and wiring `BleClientProvider` into
>   `providers.tsx`), LESC bonding, bond-lost recovery, and the §8.2 "bonded-but-unauthenticated app
>   can read `lockState` and nothing more" check. The last three are OS/radio-level — the mock
>   cannot prove them, so they are genuinely gated on hardware (OQ-1, ~Day 26), not on effort.
> - **Ready now:** the `deviceInfo` read + `protocolVersion` compatibility check (§4.3) — a
>   characteristic read against the seam Part 1 already built. No salt, no UI, no hardware. Briefed
>   in `docs/execution-briefs/P1-4.0-part2a-deviceinfo-protocol-version.md`.
>
> *(This note was required by `P1-4.0-bonding-seam-and-handshake.md` §7 and was missed in the Part 1
> PR — so for three commits this list read as 0/12 while 3 were done. Added on review, Day 9.)*
>
> **Part 2a landed and was reviewed on `chore/integrate-auth-db-persona` (`a328da6`)** — the
> `deviceInfo` read and `protocolVersion` compatibility report (`src/features/ble/deviceInfo.ts`),
> 10 tests, all 8 briefed mutations independently re-run and killed. **This is the 4th of 13 boxes,
> now ticked** — 9 remain, and every one of them is blocked (🔴 OQ-12 for five, hardware for three,
> and the "tested against the mock" box waits on both).
>
> **Two review gaps were found by mutations the brief didn't name, and are now closed** (`c48cd4a`,
> briefed in `P1-4.0-part2a-followup-two-unpinned-properties.md`). Both were test-side — the
> production code was correct in each case, just unpinned:
>
> 1. ✅ The exact-length check was only tested from below, so weakening `!==` to `<` left the suite
>    green and a 21-byte `deviceInfo` would have parsed. §4.2 says exactly 20, and an over-length read
>    is what a firmware that extends the characteristic would actually produce. **Both** directions of
>    the bound are now pinned independently.
> 2. ✅ `protocolVersion` and `provisioningState` held the same value in both main fixtures (`1`/`1`,
>    then `2`/`2`), so swapping their offsets died only because a third fixture happened to use
>    `provisioningState: 3` for unrelated reasons. Fixtures corrected; each of the two tests now fails
>    on its own under that swap.
>
> **Knowingly left unpinned:** `READ_TIMEOUT_MS`. That the read times out at all is pinned; the value
> `3000` is an app-level choice nobody has ruled on, so a millisecond-exact test would assert a number
> rather than a property. Recorded so it isn't re-discovered and "fixed".
>
> **Correction to the earlier note here: OQ-6 does *not* block the rest of Part 2.** The mismatch
> policy (§4.3 defines a version-bump process but never client behaviour) affects one *branch* of the
> pairing screen and has a safe default available today — **fail closed**, refuse to proceed, tell
> the user the device needs an update. Firmware input shapes the message, not the refusal. The
> binding constraint on everything remaining is 🔴 **OQ-12** (`salt → serial_hash →
> issue-device-session → K_sess → the Part 1 handshake has a real key to consume`) and, separately,
> hardware. Chase OQ-12; OQ-6 is still overdue for the §4 walkthrough but is not what stops the next
> commit.

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
- [ ] `device_ownership` row created **service-side by `issue-device-session`** (§5.4 step 4) — clients have no INSERT policy (§5.3)
- [ ] Partial unique index `device_ownership_one_active_owner` verified under concurrency — two simultaneous first bonds, one wins, the loser gets 403 `DEVICE_OWNED_BY_ANOTHER_USER` from a translated `23505`, not a 500
- [ ] **Ownership-squat path tested with user B's JWT:** B cannot INSERT an ownership row for a device B has never bonded, and cannot repoint their own row's `device_id` (column grants, §5.3)
- [ ] Unpair sets `revoked_at` rather than deleting — preserves the audit trail
- [ ] Device list hydrated from the backend on login / reinstall
- [ ] **Reinstall flow tested:** devices reappear; `K_sess` must be re-issued (it is not restored)
- [ ] Conflict handling when the same device is re-paired from another account
- [ ] `audit_log` entries for `device_bonded` and `device_unpaired`, **metadata only, no PII**
- [ ] RLS verified — user A cannot see or modify user B's device rows
- [ ] Offline queue for sync operations, with retry

> **Nothing here is ticked, but the *server* half of several boxes already exists** and is ticked
> under `P0-3.0`: `issue-device-session` resolves the `devices` row, inserts `device_ownership`
> service-side, lets the `device_ownership_one_active_owner` partial unique index arbitrate a race,
> translates the `23505` into a 403 `DEVICE_OWNED_BY_ANOTHER_USER` rather than a 500, and writes
> `audit_log`. These boxes stay open because **no client has ever called it** — that is `P1-4.0`'s
> job and it is blocked on 🔴 OQ-12 — so none of the behaviour is exercised end-to-end and the
> concurrency and reinstall boxes are unproven in the only way that counts.

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

- [x] Profile screen — email, display name, member since
- [x] Verification status displayed (verified / not verified + date) — **never the DOB**
- [ ] Notification preferences (lock status, low battery) — ⛔ **blocked:** `push_tokens` exists but §5.5 push has no client code; this is a build, not a checkbox
- [ ] Support contact link — the route used by the manual fallback (spec §6.4) — ⛔ **blocked on OQ-2** (owner, channel, SLA all unanswered)
- [ ] Privacy policy + terms links — ⛔ **blocked:** no URLs exist in the repo or the spec; inventing them is prohibited
- [ ] **A plain-language explanation of the on-device privacy model** — this is the product's core promise; say it where users will read it — ⚠️ **copy is stale:** v1.5 moved capture into Persona's SDK, so there is no *on-device* model to describe. Rewrite against the vendor architecture before building
- [ ] App version + build number displayed for support purposes — ⛔ **blocked:** needs a new dependency (`react-native-device-info` or equivalent); `package.json` is a contested shared file, announce first
- [x] Sign out — moved here from `HomeScreen`, reachable via the Home header

**Assumption:** profile fields limited to the agreed set.
**Excludes:** in-app account deletion / data-export tooling.
**Risk:** — *(none recorded in PRD)*

**Partially delivered** on `feature/P1-8.0-profile-settings`: `src/features/profile/{ProfileScreen,useProfile}.tsx|ts`,
reachable from a `Profile` header action on Home. Display name is editable (RLS `own_profile`
already permits it, and nothing else ever writes the column, so read-only would leave it
permanently blank). The four ⛔ items each need an input that does not exist yet — none is a
coding problem. Also fixed here: `HomeScreen` rendered a blank identifier for every phone-only
account (`email ?? …` never fires when GoTrue returns `''`), now covered by
`src/shared/lib/__tests__/accountIdentifier.test.ts`.

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
