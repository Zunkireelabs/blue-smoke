# Phase 3 — Proximity Lock/Unlock & Production Hardening

**PRD effort:** 23.75 person-days / 190 hours · **Roadmap blocks:** D (Days 20–25) + E (Days 26–30)
**Spec:** [`../TECHNICAL_SPEC.md`](../TECHNICAL_SPEC.md) · **Roadmap:** [`ROADMAP.md`](ROADMAP.md)

> **Goal (PRD verbatim):** Deliver secure, authenticated lock/unlock plus proximity auto-lock, prove
> it against real firmware, and harden the app for store launch. The device auto-locks itself when
> the phone leaves BLE range; the app is the controller and never relies on the phone alone to keep
> the device locked.

**Progress:** 0 / 8 tasks · 0 / 119 sub-tasks *(audited Day 9, 2026-08-08 — **0 is correct here**,
unlike Phases 0–2. `src/features/ble/proximity.ts`, `commands.ts` and `connection.ts` exist but are
explicit `P0-4.0` scaffolding stubs, each carrying a header naming the task that will implement it
(`P3-3.0`, `P3-2.0`, `P1-7.0`). Nothing in this phase has been started.)*

> **Denominator corrected — it was never 84.** Counting the boxes under the eight PRD tasks gives
> **119**: `P3-1.0` 11 · `2.0` 16 · `3.0` 15 · `4.0` 13 · `5.0` 10 · `6.0` 19 · `7.0` 21 · `8.0` 14.
> This is the largest error of the four phase files — **35 boxes, 42% under** — and it lands on the
> phase with the least schedule slack behind it. Boxes in the Exit Criteria section are deliberately
> outside this count, matching the Phase 0 convention.

---

## 🧭 The authority model — internalise this before writing proximity code

| Layer | Role | Authority |
|---|---|---|
| **Firmware dead-man timer** | Locks on disconnect after `autoLockGraceMs` | **AUTHORITATIVE** |
| **App proximity monitor** | Issues an explicit `LOCK` on RSSI degradation, before disconnect | **ADVISORY** |

The app makes auto-lock feel *fast*. The firmware makes auto-lock *true*. If the app is killed,
backgrounded, crashed, or the phone dies, safety must be unaffected. **Any design that requires
the app to be alive for the device to lock is wrong.** (Spec §7.1.)

---

# Block D — Days 20–25 · Build

## P3-1.0 — First-Time Unlock (Post-Verification Activation)
`Activation` · `Mobile (iOS+Android)` · **Medium** · **2.0 d** · Owner: M1

> Activate a device for the first time only after age verification has passed, transitioning it
> from locked-by-default to a usable state for the verified owner.

- [ ] Activation flow triggered on first bond of a device
- [ ] **Server-side gate enforced** — `issue-device-session` must return a key before activation proceeds (spec §5.4)
- [ ] `ACTIVATE` command (`0x03`) implemented with `activationNonce` payload (spec §4.6)
- [ ] `provisioningState` transition `1 → 2` verified via `deviceInfo`
- [ ] `NOT_ACTIVATED` result handled — `UNLOCK` before `ACTIVATE` is correctly refused
- [ ] Activation is idempotent — re-running on an activated device is safe
- [ ] **Race condition handled:** activation attempted concurrently on two phones
- [ ] Activation failure states surfaced with recovery paths
- [ ] Activation success celebrated in the UI — this is the product's first real moment
- [ ] `audit_log` entry recorded
- [ ] Tested against the mock peripheral

**Assumption:** verification gating from Phase 2 in place.
**Excludes:** activation without verification.
**Risk:** activation race conditions on first connect.

---

## P3-2.0 — Lock/Unlock via BLE Characteristic (Authenticated) 🔴 CRITICAL PATH
`Control` · `Mobile (iOS+Android)` · **High** · **3.0 d** · Owner: M1

> Send authenticated lock and unlock commands to the device over the BLE lockCommand
> characteristic, validated by the pairing token so only the bonded, verified user can command it.

- [ ] `lockCommand` frame encoder implemented per spec §4.6 — `commandId | counter | payload | tag`
- [ ] **AES-128-CMAC tag** computed over bytes 0–11, truncated to 8 bytes
- [ ] CMAC implementation validated against known-answer test vectors
- [ ] **Strictly-increasing counter** maintained per session; persisted across app restarts within a session
- [ ] `LOCK` (`0x01`) implemented
- [ ] `UNLOCK` (`0x02`) implemented
- [ ] `SET_AUTOLOCK_GRACE` (`0x04`) implemented, driven by remote config
- [ ] `END_SESSION` (`0x05`) implemented
- [ ] `FACTORY_UNPAIR` (`0x06`) implemented with the `0xDEADBEEF` confirm payload
- [ ] `PING` (`0x07`) keepalive implemented
- [ ] **All 10 `commandResult` codes handled distinctly** (spec §4.7) — no generic error catch-all
- [ ] `SESSION_EXPIRED` triggers re-issuance of `K_sess` when online, clear messaging when offline
- [ ] `RATE_LIMITED` surfaced with a backoff-aware message
- [ ] `lockState` notifications subscribed; UI is notification-driven, never optimistic (spec §9.3)
- [ ] Command timeout handling — no unbounded awaits
- [ ] **Exhaustive testing of every command × every result code** against the mock

**Assumption:** firmware implements authenticated `lockCommand` per spec.
**Excludes:** firmware-side command logic (client team).
**Risk:** auth/token edge cases allowing unintended commands.
**Note (PRD):** *core safety control — exhaustively tested.*

---

## P3-3.0 — Proximity Monitor (RSSI / Connection) + Auto-Lock on Range Loss
`Proximity` · `Mobile (iOS+Android)` · **High** · **4.75 d** · Owner: M1

> Continuously monitor signal strength and connection state; when the phone moves out of range the
> app issues an explicit lock, as a secondary signal to the firmware's own dead-man auto-lock.

- [ ] RSSI sampled at 1 Hz while `UNLOCKED`, piggy-backed on connection events
- [ ] **Median-of-5 smoothing** — median, not mean, to reject outliers (spec §7.2)
- [ ] **Enter-lock:** smoothed RSSI < −85 dBm sustained for 3 consecutive samples
- [ ] **Exit-lock:** smoothed RSSI > −75 dBm sustained for 2 consecutive samples
- [ ] **10 dBm hysteresis band verified to eliminate flapping** at the boundary
- [ ] Immediate lock on disconnect / supervision timeout — no debounce on that path
- [ ] Thresholds served from remote config (spec §10.2)
- [ ] Sampling suspended while `LOCKED` — no battery drain when idle
- [ ] Connection interval switched per spec §4.9: 30–50 ms unlocked, 200–400 ms idle
- [ ] **RSSI never presented to the user as a distance in metres** — it is not calibrated ranging
- [ ] Lock state machine implemented per spec §7.3
- [ ] **Invariant verified: `UNLOCKED` is unreachable except via `AUTHENTICATED` + activated + explicit user action**
- [ ] Battery impact measured across a 4-hour unlocked session
- [ ] Walk-away test repeated ≥ 20 times; lock latency recorded
- [ ] Walk-to-boundary-and-hover test — confirm no flapping

**Assumption:** RSSI thresholds tunable to an agreed range behaviour.
**Excludes:** centimetre-accurate ranging.
**Risk:** RSSI noise causing premature or missed auto-lock. → *Mitigated by median smoothing + hysteresis + N-consecutive-sample requirement.*
**Note (PRD):** *works alongside firmware dead-man auto-lock, not instead of it.*

---

## P3-4.0 — Background BLE Behaviour (iOS + Android, Auto-Lock Out of Range)
`Background` · `Mobile (iOS+Android)` · **High** · **4.0 d** · Owner: M1

> Ensure proximity auto-lock continues to work when the app is backgrounded on both platforms,
> within each OS's background BLE constraints.

- [ ] `P0-4.5` spike findings fully applied
- [ ] iOS: state restoration handling `willRestoreState` correctly
- [ ] iOS: proximity monitoring continues in background within OS throttling
- [ ] iOS: reconnect-and-re-handshake works after a background relaunch
- [ ] Android: foreground service keeps the connection alive reliably
- [ ] Android: persistent notification shows live lock state — useful, not just compliant
- [ ] Android: tested on an aggressive-OEM device (Xiaomi / OnePlus / Huawei)
- [ ] Android: battery-optimisation exemption flow tested end to end
- [ ] **Force-quit test on both platforms** → confirm the *device still locks* via the firmware dead-man timer
- [ ] **Phone-powered-off test** → confirm the device still locks
- [ ] **Airplane-mode test** → confirm the device still locks
- [ ] Background battery consumption measured over 8 hours
- [ ] **Honest capability matrix produced:** what is guaranteed vs. best-effort, per platform — this goes to the client, not just the repo

**Assumption:** required background BLE entitlements/modes are permitted.
**Excludes:** guaranteed behaviour when the OS fully terminates the app.
**Risk:** cross-platform background BLE differences, especially iOS. → *De-risked by the Day 1–3 spike; failure mode is safe because the firmware is authoritative.*
**Note (PRD):** *one of the two known hard problems — early spikes planned.* ✅ *(`P0-4.5`)*

---

## P3-5.0 — Push Notifications (Lock Status, Low Battery)
`Push` · `Mobile + Backend` · **Medium** · **2.0 d** · Owner: B1 + M3

> Push notifications for key device events: lock/unlock status changes and low-battery alerts,
> delivered via FCM/APNs.

- [ ] `push_tokens` registration + refresh on both platforms
- [ ] Edge Function for push dispatch (service role)
- [ ] Lock-status-change notification
- [ ] Low-battery notification driven by `lockState.flags` bit2, with hysteresis so it fires once, not repeatedly
- [ ] **Notification rate limiting / coalescing** — rapid device events must not spam the user
- [ ] Notification preferences from `P1-8.0` respected
- [ ] Deep link from notification → the relevant device screen
- [ ] Foreground / background / cold-start notification handling
- [ ] **No PII in any notification payload**
- [ ] Tested on both platforms across all app states

**Assumption:** push infrastructure from Phase 0 live.
**Excludes:** marketing / promotional push campaigns.
**Risk:** delivery reliability when device events fire rapidly. → *Mitigated by coalescing.*

---

# Block E — Days 26–30 · Harden

## P3-6.0 — Joint Firmware Integration Testing on Real Device 🔴 MILESTONE M7
`Integration` · `Mobile (iOS+Android)` · **High** · **3.0 d** · Owner: M1 + Q1

> Test the app against real firmware on a physical device: pairing, authenticated lock/unlock, and
> firmware-side dead-man auto-lock, jointly with the client's firmware team.

**Run the full §4.10 acceptance suite. Every box is a pass/fail gate.**

- [ ] `FW-01` Correct service UUID advertised; discoverable by filtered scan
- [ ] `FW-02` `deviceInfo` reads pre-auth; `provisioningState` reflects OTP state
- [ ] `FW-03` Valid handshake opens a session; `lockState.flags` bit0 sets
- [ ] `FW-04` Invalid CMAC returns `AUTH_FAILED` and does **not** open a session
- [ ] `FW-05` Replayed `authResponse` from a prior connection rejected
- [ ] `FW-06` Replayed `lockCommand` (same counter) returns `REPLAY`
- [ ] `FW-07` `UNLOCK` before `ACTIVATE` returns `NOT_ACTIVATED`
- [ ] `FW-08` Walking out of range → locks within `autoLockGraceMs` + supervision timeout
- [ ] `FW-09` **Force-killing the app → device locks** (proves the dead-man timer is firmware-side)
- [ ] `FW-10` Power-cycling while unlocked → boots `LOCKED`
- [ ] `FW-11` `SET_AUTOLOCK_GRACE` clamps out-of-range values, returns `INVALID_PARAM`
- [ ] `FW-12` 6 consecutive bad auth attempts → `RATE_LIMITED` for 30 s
- [ ] `FW-13` Battery percentage tracks a discharging cell; low-battery latches at 15%, clears at 20%
- [ ] `FW-14` **Reconnect without a valid handshake does not cancel the dead-man countdown**
- [ ] `FW-15` Watchdog-forced reset leaves the device `LOCKED`, `lastLockReason = 4`
- [ ] **RSSI thresholds re-tuned against the real enclosure** and pushed to remote config
- [ ] `autolock_grace_ms` validated against real-world use *(OQ-9)*
- [ ] Any spec deviations logged and resolved with the firmware team in writing
- [ ] Integration sign-off recorded

**Assumption:** physical device available by ~week 6 for integration. ⚠️ **Under a 30-day plan this means Day 26 at the latest.** *(OQ-1 🔴)*
**Excludes:** firmware development / fixes (client team).
**Risk:** firmware readiness slipping past the integration window.
**Note (PRD):** *mock peripheral used until firmware is ready.* ✅ *(`P0-2.5`, live Day 4)*

---

## P3-7.0 — End-to-End QA, Edge Cases & Security Review
`QA` · `Mobile (iOS+Android)` · **High** · **3.0 d** · Owner: Q1

> Full end-to-end QA across verification, pairing, lock/unlock, and proximity auto-lock, including
> edge cases and a security review before launch.

**Functional QA**
- [ ] Full happy path: signup → verify → pair → activate → unlock → walk away → auto-lock
- [ ] Full device matrix exercised (spec §11.3): latest iPhone, iPhone SE, iOS−1, Pixel, Samsung, budget Android, aggressive-OEM Android
- [ ] Multi-device scenarios: 2+ devices paired, connected, switched between
- [ ] Detox E2E suite green against the mock peripheral
- [ ] Offline behaviour: no network at pairing, at unlock, mid-verification
- [ ] Interruption handling: incoming call, low power mode, OS update prompt
- [ ] Reinstall + restore flow
- [ ] Account edge cases: password reset mid-session, sign-out with a device connected

**Security review** *(against the spec §8 checklist)*
- [ ] **RLS audited with a second user's JWT** — every table, every operation
- [ ] **`device_keys` confirmed unreadable by any client** under any policy path
- [ ] `K_dev` confirmed never present in any client response — traffic-captured
- [ ] `K_sess` confirmed hardware-backed and biometric-gated in storage
- [ ] **The three inviolable rules (spec §2.2) verified end to end**
- [ ] Traffic capture across a full verification run — nothing sensitive on the wire
- [ ] Device filesystem inspected post-run — nothing left behind
- [ ] Crash reports inspected — no frames, no embeddings
- [ ] Replay attack attempted manually and confirmed blocked
- [ ] Client-side `age_verified` tamper test — confirmed the server refuses
- [ ] Constant-time comparison confirmed in the app's CMAC path
- [ ] Secret-scanning clean across the repo history
- [ ] Threat model (spec §8.3) walked through as a team; residual risks (spec §8.5) re-confirmed as accepted

**Assumption:** test matrix and devices agreed with client.
**Excludes:** formal third-party penetration test / certification.
**Risk:** late-surfacing edge cases delaying launch.
**Note (PRD):** *security review precedes store submission.*

---

## P3-8.0 — App Store Prep + Submission (iOS + Android)
`Release` · `Mobile (iOS+Android)` · **Medium** · **2.0 d** · Owner: Q1 + M3

> Prepare store listings, assets, and compliance materials and submit to the Apple App Store and
> Google Play, including age-restriction / regulated-product review considerations.

- [ ] Store listing copy — **leading with the on-device privacy model**, which is the strongest position with both reviewers
- [ ] Screenshots for all required device sizes, both platforms
- [ ] App icon, feature graphic, promo assets
- [ ] **Apple privacy nutrition labels** — accurately reflecting that no biometric data is collected
- [ ] **Google Play Data Safety form** — same
- [ ] Age rating declarations completed on both stores
- [ ] Regulated-product / restricted-content declarations completed
- [ ] Privacy policy published and linked; accurately describes the on-device model
- [ ] Terms of service published and linked
- [ ] Reviewer notes written explaining the age-verification flow **and how a reviewer can test it** — this materially reduces rejection risk
- [ ] Demo account + test credentials provided to reviewers
- [ ] Production build signed and uploaded — iOS
- [ ] Production build signed and uploaded — Android
- [ ] **Submitted to both stores** ← M8 milestone, Day 30

**Assumption:** client developer accounts and store assets ready. *(OQ-8)*
**Excludes:** ongoing post-launch store management.
**Risk:** store review delays for an age-restricted product category.
**Note (PRD):** *age-restricted category may draw extra store scrutiny.*

> ### ⚠️ STRAIN — read roadmap §5.1
> The PRD exit criterion says **"App is live on both the App Store and Google Play."**
> We control **submission**; we do not control **review**. Apple typically takes 1–3 days,
> Google 1–7, and an age-restricted regulated-category product attracts extra scrutiny — which
> this very line item flags as its own risk.
>
> **Day 30 deliverable = submitted, with all compliance materials complete.**
> **Live = Day 32–37**, outside the development window.
>
> Agree this restatement with the client in **Week 1**. It is a wording change, not a scope
> reduction — but only if it is made early.

---

## ✅ Phase 3 Exit Criteria *(verbatim from client PRD)*

- [ ] Verified user can lock and unlock the device in range
- [ ] Device auto-locks when the phone leaves BLE range (firmware + app)
- [ ] Auto-lock continues to work when the app is backgrounded
- [ ] Push notifications fire for lock status and low battery
- [ ] App passes end-to-end QA and security review
- [ ] ~~App is live on both the App Store and Google Play~~ → **App submitted to both stores with all compliance materials complete** *(see strain note above — requires client agreement in Week 1)*

**Additional internal gates:**
- [ ] All §4.10 `FW-01`–`FW-15` pass on real hardware (M7)
- [ ] Honest per-platform background-BLE capability matrix delivered to the client
- [ ] Security review checklist fully signed off
