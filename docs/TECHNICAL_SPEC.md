# Blue Smoke — Technical Specification

**Version:** 1.3
**Status:** Authoritative build contract
**Last updated:** 2026-08-06
**Supersedes:** `archive/PROJECT_BRIEF-superseded.md`

> This document is the **single source of technical truth** for Blue Smoke. If this document
> and any other artefact disagree, this document wins — except for commercial scope and
> deliverable wording, where `Project_Bluesmoke - Nepa.works App - PRD - Master Scope - Internal.xlsx`
> is authoritative.
>
> **Cross-team contract:** §4 (BLE GATT Interface Spec) is the deliverable handed to the
> **client's firmware team**. It is versioned independently. Do not change §4 without
> bumping `protocolVersion` and notifying the firmware team in writing.

---

## Table of contents

1. [Scope, non-goals & superseded decisions](#1-scope-non-goals--superseded-decisions)
2. [System architecture](#2-system-architecture)
3. [Hardware reality & what it forces](#3-hardware-reality--what-it-forces)
4. [BLE GATT Interface Spec v1.0 — firmware contract](#4-ble-gatt-interface-spec-v10--firmware-contract)
5. [Backend — Supabase data model & contract](#5-backend--supabase-data-model--contract)
6. [On-device age & identity verification pipeline](#6-on-device-age--identity-verification-pipeline)
7. [Proximity & lock state machine](#7-proximity--lock-state-machine)
8. [Security & privacy model](#8-security--privacy-model)
9. [Mobile app architecture](#9-mobile-app-architecture)
10. [Environments, config & CI/CD](#10-environments-config--cicd)
11. [Testing strategy](#11-testing-strategy)
12. [Definition of Done & release process](#12-definition-of-done--release-process)
13. [Open questions register](#13-open-questions-register)
14. [Glossary](#14-glossary)

---

## 1. Scope, non-goals & superseded decisions

### 1.1 What we are building

A React Native (iOS + Android) companion app for a **Bluetooth-enabled vape device**, delivering three pillars:

| # | Pillar | One-line definition |
|---|---|---|
| **P1** | Accounts & multi-device BLE management | A user registers, signs in, and pairs/manages multiple devices; ownership is enforced server-side. |
| **P2** | On-device 18+ age verification | Gov-ID capture → DOB extraction → selfie + liveness → face match, **entirely on the phone**. No third party, no upload. |
| **P3** | Proximity lock/unlock | Authenticated BLE lock/unlock; the device auto-locks itself when the phone leaves range. |

### 1.2 Locked decisions

| Area | Decision | Rationale |
|---|---|---|
| App framework | **React Native + TypeScript**, bare workflow (Expo Dev Client for tooling only) | Single codebase; native modules required (BLE, camera, ML, secure storage) rule out Expo Go. |
| Backend | **Supabase** | Postgres + Row Level Security maps 1:1 onto server-side ownership enforcement. Edge Functions for privileged key issuance. No lock-in on the data model. |
| Verification | **On-device ML only** — Apple Vision (iOS) + Google ML Kit (Android) | Client hard constraint. Also the product's core privacy selling point. |
| Device auth crypto | **AES-128-CMAC** challenge–response | The YC1012_JD has an AES-128 **hardware** block and no ECC accelerator. See §3. |
| Firmware | **We author the BLE spec (§4); the client's firmware team implements it** | Firmware development is an add-on, quoted separately. |
| Timeline | **30 days** | See `project-roadmap-todos/ROADMAP.md`. |
| Push | **Supabase → FCM (Android) / APNs (iOS)** via Edge Function | Avoids adding Firebase as a second BaaS. |
| Auth methods | **Email + password, and Phone + OTP** (Twilio Verify, native Supabase provider) — see §1.2.1 | Confirmed in team meeting, 2026-08-05. Users choose either at signup/login; both resolve to the same `auth.users.id`. A third method, **Email + Code** (passwordless), is proposed — see §1.2.2, not yet confirmed. |

> ### 1.2.1 Phone + OTP authentication — second auth method
> **Status: confirmed in team meeting, 2026-08-05.** Raised during Phase 1 auth planning as a
> proposal; the team confirmed it in meeting. `P1-1.0`'s effort estimate (§5.5 below and
> `TODO-phase-1.md`) is locked at ~4.5 person-days on this basis.
>
> `P1-1.0` and §5.5 below now assume **two** first-class auth methods — users choose **either** at
> signup/login:
>
> | | |
> |---|---|
> | **Method A — Email + password** | Existing, `supabase.auth` native. Unchanged. |
> | **Method B — Phone number + OTP** *(new)* | **Twilio Verify**, configured as Supabase Auth's **native phone provider** — Supabase Auth calls Twilio Verify's `VerificationCheck` endpoint directly and issues the session itself. **No custom Edge Function bridge required.** |
>
> **Unified identity:** both methods resolve to the same `auth.users.id`. The app never branches
> business logic on which method a user signed in with.
>
> **Account linking policy:** a first-time signup/login via either method with no existing link
> **always creates a new account.** Linking email + phone to one identity is only ever a
> deliberate action taken from an already-authenticated session (e.g. "add a phone number" in
> settings) — **never** an automatic merge at verify time. This closes an account-takeover vector
> (a reused/resold phone number or compromised email shouldn't silently inherit another user's
> account).
>
> **New dependency:** Twilio Verify (SMS OTP delivery + verification). `libphonenumber-js` for
> client-side phone validation/formatting.
>
> **Effort impact:** `P1-1.0` grows from **2.5 → ~4.5 person-days** — see the updated sub-task
> list in `project-roadmap-todos/TODO-phase-1.md`.
>
> **Does not affect:** §2–§14 of this spec. This is additive to the account/auth layer only —
> device trust model, verification pipeline, BLE spec, and crypto are all untouched.

> ### ⚠️ 1.2.2 Proposed scope addition — Email + Code (passwordless) authentication
> **Status: proposed, not yet team/client-confirmed.** Raised after §1.2.1 was locked in.
>
> Adds a **third** first-class auth method alongside the two confirmed in §1.2.1 — users choose
> **any one** of the three at signup/login:
>
> | | |
> |---|---|
> | **Method A — Email + password** | Existing, confirmed. Unchanged by this proposal. |
> | **Method B — Phone + OTP** | Existing, confirmed (§1.2.1). Unchanged by this proposal. |
> | **Method C — Email + Code** *(new)* | **Passwordless.** User enters only their email; Supabase Auth (`signInWithOtp`, email) sends a 6-digit code through the **same SMTP path** Method A's password-reset email already uses, just a different email template. User enters the code to authenticate. No password is ever set or required for an account that only ever uses this path. |
>
> **Relationship to Method A's password reset:** shares SMTP as the delivery mechanism, but is a
> fully independent login path — Method C requires no password, and using it does not create one.
> Whether Method A's *own* password-reset email should also switch from a link to a code (for UX
> consistency with Method C's code-entry screen) is a **separate, still-open question**, not
> decided by this proposal — today Method A stays link-based.
>
> **Unified identity:** resolves to the same `auth.users.id` as Methods A and B. The same
> account-linking policy from §1.2.1 applies unchanged: a first-time login via Method C with no
> existing link creates a new account; linking to an existing identity is only ever a deliberate
> already-authenticated action, never an automatic merge at verify time.
>
> **New dependency:** none beyond what Method A already requires. This is the same Supabase Auth
> + SMTP path as Method A's emails, just a different template (OTP code instead of a
> confirmation/magic link). Does **not** need Twilio or any other new service.
>
> **SMTP impact:** raises SMTP from blocking 1 of 2 confirmed methods to blocking 2 of 3 methods
> if this is confirmed (Methods A and C both depend on it; Method B does not — it uses Twilio).
>
> **Effort impact:** not yet estimated — pending confirmation, so not counted in `P1-1.0`'s
> ~4.5 person-day figure. Rough shape: a new code-entry screen (near-identical to Method B's OTP
> screen, so low incremental UI cost), one new `supabase.auth.signInWithOtp` (email) call, and the
> existing no-enumeration error-handling pattern extended to a third path. See the proposed
> sub-tasks in `project-roadmap-todos/TODO-phase-1.md`.
>
> **Does not affect:** §2–§14 of this spec, same as §1.2.1. Additive to the account/auth layer
> only.

### 1.3 Explicit non-goals (base scope)

- ❌ Firmware development on the YC1012_JD / Cortex-M0+ *(add-on; base scope is spec only)*
- ❌ Any third-party or government ID-validation API
- ❌ Cloud OCR or server-side biometric matching
- ❌ Admin web panel *(add-on)*
- ❌ Analytics / crash reporting *(add-on)*
- ❌ Advanced anti-spoofing / presentation-attack detection *(add-on)*
- ❌ Social / SSO login
- ❌ Sharing one device across multiple accounts
- ❌ Guaranteed BLE behaviour when the OS **fully terminates** the app *(mitigated by firmware dead-man auto-lock — see §7.4)*
- ❌ Retaining ID images or selfies for audit
- ❌ Re-verification scheduling / expiry policy *(flagged — see §13 OQ-5)*

### 1.4 Superseded — do not reintroduce

`PROJECT_BRIEF-temp.md` has been archived to `archive/PROJECT_BRIEF-superseded.md`. These proposals from it are **dead**: Persona/KYC vendor, Node+Fastify+Postgres self-hosted backend, Fly.io, Ed25519 on-MCU verification, per-unlock backend-minted tokens, 12-week timeline, us writing firmware.

Two ideas from it **were carried forward** and are live in this spec: **nonce-based replay protection** (§4.5) and **key rotation without bricking the fleet** (§8.4).

---

## 2. System architecture

### 2.1 Component view

```
┌───────────────────────────────────────────────────────────────────────┐
│                      PHONE  (React Native app)                        │
│                                                                       │
│  ┌─────────────────────┐   ┌──────────────────┐   ┌────────────────┐  │
│  │ Verification engine │   │  BLE controller  │   │ Session store  │  │
│  │  Vision / ML Kit    │   │  ble-plx         │   │ Keychain/      │  │
│  │  OCR · liveness ·   │   │  scan · bond ·   │   │ Keystore       │  │
│  │  face match         │   │  proximity       │   │ (K_sess)       │  │
│  └──────────┬──────────┘   └────────┬─────────┘   └───────┬────────┘  │
│             │                       │                     │           │
│      pass/fail ONLY          BLE GATT (§4)          K_sess (§4.5)     │
│             │                       │                     │           │
└─────────────┼───────────────────────┼─────────────────────┼───────────┘
              │                       │                     │
              │ HTTPS/TLS 1.3         │                     │ HTTPS/TLS 1.3
              ▼                       │                     ▼
┌───────────────────────────────┐     │     ┌─────────────────────────────┐
│         SUPABASE              │     │     │  Edge Function              │
│  Auth · Postgres+RLS · Push   │◄────┼────►│  issue-device-session       │
│                               │     │     │  (service role, checks      │
│  Stores: age_verified flag,   │     │     │   age_verified + ownership) │
│  device ownership, sessions   │     │     └─────────────────────────────┘
│  NEVER: images, biometrics    │     │
└───────────────────────────────┘     │
                                      ▼
                        ┌──────────────────────────────┐
                        │   BLUE SMOKE DEVICE          │
                        │   YC1012_JD (BLE 5.4)        │
                        │   + Cortex-M0+ MCU           │
                        │                              │
                        │   K_dev in OTP · AES-128 HW  │
                        │   dead-man auto-lock timer   │
                        │   NEVER sees: PII, network   │
                        └──────────────────────────────┘
```

### 2.2 Trust boundaries

| Boundary | What crosses it | What must never cross it |
|---|---|---|
| Camera → Verification engine | Raw ID image, raw selfie (RAM only) | — |
| Verification engine → rest of app | `{ passed, method, thresholdVersion, outcomeReason }` — exactly these four (§9.2 rule 2) | Images, face embeddings, DOB, name, ID number, similarity score |
| App → Supabase | `age_verified`, `verified_at`, `method`, `threshold_version`, `outcome_reason`, `app_version`, `platform` (§5.2.2), device serial **hash** | Images, embeddings, DOB, name, ID number, raw serial |
| Supabase → App | `K_sess` (derived session key), ownership records | `K_dev` (root device key) — **never leaves the server** |
| App → Device | Auth handshake, lock/unlock commands | Any PII whatsoever |
| Device → App | Lock state, battery, fault codes | — (device holds no PII) |

> **Note on `outcome_reason`.** It is deliberately coarse (`pass` · `under_18` · `face_mismatch` ·
> `ocr_failed` · `liveness_failed`) and it *does* cross to the server (§5.2.2). `under_18` is a
> derived age fact, not a DOB — it records that a check failed, never by how much and never the
> underlying date. Keep it coarse: adding granularity here would turn a support signal into
> stored personal data.

**The three inviolable rules.** Any PR that breaks one of these is rejected on sight:

1. **No image, video frame, or biometric embedding is ever written to disk, logged, or transmitted.** In-memory only, zeroised after the decision.
2. **`K_dev` never leaves the server.** The app receives only a derived, scoped, expiring `K_sess`.
3. **`age_verified` is validated server-side before any privileged action.** A client-side boolean is a hint, never an authority.

### 2.3 Primary data flows

**Flow A — Age verification (P2, one-time)**
```
User → capture ID → OCR/PDF417 → DOB → age ≥ 18?
                                          │
User → capture selfie → liveness → embed  │
                                          ▼
       ID face embed ─── cosine sim ≥ τ? ─┴─► PASS/FAIL
                                              │
                    zeroise all images+embeds │
                                              ▼
                        POST { age_verified, verified_at, method } → Supabase
```

**Flow B — Device activation (P1→P3, one-time per device, requires network)**
```
App: bond (LE Secure Connections) → read deviceInfo → serial_hash
App → Supabase Edge Fn: issue-device-session { serial_hash, requested_ttl_days }
     Edge Fn asserts: age_verified == true AND ownership valid
     Edge Fn: K_sess = HKDF-SHA256(ikm  = K_dev,
                                   salt = session_id,            ← salt, not info
                                   info = "bluesmoke-session-v1" | key_generation)
              ↑ info holds ONLY what the device also receives in the handshake (§4.5).
                user_id / expires_at must never enter it — the device is never told them.
     Edge Fn → App: { session_id, K_sess, expires_at, key_generation }
App: store K_sess in Keychain/Keystore (biometric-gated)
App → Device: auth handshake (§4.5) → ACTIVATE command
```

**Flow C — Routine unlock (P3, works offline)**
```
App: connect → read authChallenge (nonce N)
App: proof = CMAC(K_sess, 0x01 | protoVer | N | session_id[0..3] | expiresAtDelta)
                                                 ↑ first 4 bytes only
App: write authResponse as TWO ordered frames (§4.5) — frame order is mandatory;
     an out-of-order frame resets the handshake
Device: derive K_sess from K_dev + session_id + key_generation (all in frame 1),
        recompute, compare in constant time, open authenticated session
App: write lockCommand UNLOCK (counter-protected; tag = CMAC over N | bytes[0..11],
     so the frame is valid for THIS connection only)
Device: unlock, notify lockState
[phone leaves range] → firmware dead-man timer fires → device locks itself
```

---

## 3. Hardware reality & what it forces

From the client-supplied datasheets:

**YC1012_JD (radio/control SoC)**
- Bluetooth **5.4** compliant 2.4 GHz transceiver; LE 1M / **2M** / Long Range (S2, S8)
- 24 MHz 32-bit proprietary MCU (PHY/link-layer management)
- **8 KB data RAM** (4 KB with retention) · **8 KB OTP** · 8 KB patch RAM
- **AES-128 hardware encryption block**
- +8 dBm TX; −96.5 dBm RX sensitivity @ 1 Mbps
- RTC; 32 kHz low-power oscillator; sleep 1.2 µA / 6 µA (12 KB retention)
- 9-ch 12-bit ADC · 24 GPIO · I²C · SPI · UART(HCI-H5)

**Companion MCU — 32-bit ARM Cortex-M0+**
- Up to 48 MHz · up to 64 KB flash · up to 8 KB SRAM
- IWDG/WWDG watchdogs · RTC · LPTIM (wake from stop) · hardware CRC-32 · unique UID

### 3.1 What this forces on the design

| Hardware fact | Design consequence |
|---|---|
| **AES-128 HW block, no ECC accelerator** | Auth is **AES-128-CMAC**, not Ed25519/ECDSA. Free, constant-time, no RAM cost. This is the single biggest correction versus the archived brief. |
| **8 KB RAM total, shared with the BLE stack** | Every GATT payload is fixed-size and small (≤ 20 bytes, fits default 23-byte ATT MTU). No fragmentation, no dynamic allocation, no JSON on the wire. |
| **8 KB OTP** | `K_dev` (16 bytes) is burned at manufacture. **OTP is one-time** — key rotation cannot overwrite it, so rotation is handled by derivation and revocation server-side (§8.4). |
| **Unique UID on the M0+** | Device serial derives from the hardware UID; the app only ever transmits `SHA-256(UID ‖ salt)`. |
| **RTC + LPTIM, wake from stop** | The firmware can run the **dead-man auto-lock timer while asleep**. This is what makes auto-lock trustworthy without the phone. |
| **IWDG watchdog** | Firmware must fail **closed** (locked) on watchdog reset. Specified in §4.7. |
| **No display, no network, no camera** | The device can never verify age itself. All trust is delegated, which is why §4.5 exists. |
| **BLE 5.4 → LE Secure Connections available** | Bonding uses LESC. Note: bonding is **transport** security, not authorisation — see §8.2. |

---

## 4. BLE GATT Interface Spec v1.0 — firmware contract

> **Audience:** the client's firmware team.
> **Status:** contract. Changes require a `protocolVersion` bump and written notice.
> **`protocolVersion` for this document: `0x01`.**

### 4.1 Advertising

| Item | Value |
|---|---|
| Advertised service UUID | `42530001-1E5B-4A9C-9D3F-7C6E1B2A5D80` (128-bit, in AD type `0x07`) |
| Local name | `BlueSmoke-XXXX` where `XXXX` = last 4 hex of device UID |
| Advertising interval | 100 ms fast (30 s after wake/button), then 1 s slow |
| Manufacturer data | 4 bytes: `[protocolVersion(1) | stateHint(1) | battery(1) | flags(1)]` — lets the app filter and show state pre-connect |
| TX power | +0 dBm advertising (calibrated; see §7.2 RSSI baselining) |

The app **must** filter scan results on the service UUID. It must not present arbitrary BLE peripherals.

### 4.2 Service & characteristic table

**Service: Blue Smoke Device Service** — `42530001-1E5B-4A9C-9D3F-7C6E1B2A5D80`

| # | Characteristic | UUID | Properties | Len | Notes |
|---|---|---|---|---|---|
| C1 | `deviceInfo` | `4253**0002**-1E5B-4A9C-9D3F-7C6E1B2A5D80` | Read | 20 B | Readable **before** auth |
| C2 | `authChallenge` | `4253**0003**-1E5B-4A9C-9D3F-7C6E1B2A5D80` | Read, Notify | 16 B | Fresh nonce per connection |
| C3 | `authResponse` | `4253**0004**-1E5B-4A9C-9D3F-7C6E1B2A5D80` | Write (with response) | 20 B | CMAC proof |
| C4 | `lockState` | `4253**0005**-1E5B-4A9C-9D3F-7C6E1B2A5D80` | Read, Notify | 8 B | Readable pre-auth (state only, no secrets) |
| C5 | `lockCommand` | `4253**0006**-1E5B-4A9C-9D3F-7C6E1B2A5D80` | Write (with response) | 20 B | **Requires authenticated session** |
| C6 | `commandResult` | `4253**0007**-1E5B-4A9C-9D3F-7C6E1B2A5D80` | Read, Notify | 4 B | Result of the last command |

All multi-byte integers are **little-endian**.

### 4.3 `deviceInfo` (C1) — 20 bytes, read, unauthenticated

| Offset | Len | Field | Notes |
|---|---|---|---|
| 0 | 1 | `protocolVersion` | `0x01` for this spec |
| 1 | 1 | `hwRevision` | Vendor-assigned |
| 2 | 2 | `fwVersion` | `major(1) | minor(1)` |
| 4 | 12 | `deviceUid` | Raw MCU unique ID |
| 16 | 1 | `provisioningState` | `0`=unprovisioned (no `K_dev`), `1`=provisioned, `2`=activated |
| 17 | 1 | `keyGeneration` | `K_dev` generation, for rotation (§8.4) |
| 18 | 2 | `reserved` | Zero-filled |

### 4.4 `lockState` (C4) — 8 bytes, read + notify

| Offset | Len | Field | Values |
|---|---|---|---|
| 0 | 1 | `state` | `0`=LOCKED · `1`=UNLOCKED · `2`=LOCKED_PENDING_ACTIVATION · `3`=FAULT |
| 1 | 1 | `flags` | bit0 authenticated session active · bit1 charging · bit2 low battery (<15%) · bit3 dead-man timer armed · bit4 session expired |
| 2 | 1 | `batteryPercent` | `0–100`, `0xFF` = unknown |
| 3 | 1 | `lastLockReason` | `0`=user command · `1`=range loss (dead-man) · `2`=session expiry · `3`=power-on default · `4`=fault/watchdog · `5`=revoked |
| 4 | 2 | `secondsSinceStateChange` | uint16, saturates at `0xFFFF` |
| 6 | 1 | `protocolVersion` | `0x01` |
| 7 | 1 | `reserved` | Zero |

**Notify** on every `state` change, every `lastLockReason` change, and on battery crossing the 15% low-battery threshold (with hysteresis: clears at 20%).

### 4.5 Authentication — challenge–response (the security spine)

#### Key hierarchy

```
K_dev  (16 B, AES-128)
  ├── Burned into device OTP at manufacture
  ├── Stored server-side in Supabase `device_keys` (RLS: deny all clients)
  └── NEVER transmitted to the phone, ever
        │
        ▼  HKDF-SHA256, server-side, at activation
K_sess (16 B, AES-128)
  = HKDF(ikm = K_dev,
         salt = session_id (16 B random),
         info = "bluesmoke-session-v1" ‖ keyGeneration (1 B))
  ├── Issued to the app over TLS by the `issue-device-session` Edge Function
  ├── Stored in iOS Keychain / Android Keystore (hardware-backed, biometric-gated)
  └── Device derives the SAME K_sess on demand from K_dev + the parameters the app
      supplies in the handshake — so the DEVICE NEVER NEEDS NETWORK ACCESS.
```

This is the load-bearing idea: the phone gets a **scoped, expiring, revocable** key; the device holds only the **root** key and can re-derive. Unlock therefore works offline, indefinitely, in range — while revocation and rotation stay a server-side decision.

> **Derivation inputs are exactly what the handshake transmits — this is a hard constraint,
> not a style note.** Every term in the HKDF call above is either burned into the device
> (`K_dev`) or sent by the app in §4.5's handshake (`session_id` as the salt, `keyGeneration`
> in frame 1). Nothing else may enter `info`. In particular `user_id` and an absolute
> `expires_at` **must not** be bound into the derivation: the device is offline, has no
> wall clock, and cannot be told either value — binding them would make `K_sess` underivable
> device-side and the handshake would fail with no diagnostic. Which *user* a `K_sess` belongs
> to is enforced by the server at issuance (§5.4), which is the only party that can check it;
> the device cannot distinguish users and gains nothing from the binding. Session lifetime is
> carried instead by the authenticated `expiresAtDelta` (§4.5), expressed as **seconds relative
> to the handshake** so that a monotonic uptime counter suffices and no time sync is required.

#### Handshake (per BLE connection)

```
1. App connects. (LE Secure Connections bonding already established.)
2. App reads authChallenge (C2) → 16-byte nonce N.
      Firmware MUST generate N from the hardware RNG, fresh per connection,
      and MUST invalidate it after one use or after 30 s, whichever is first.

3. App computes:
      proof = AES-128-CMAC(K_sess,
                 0x01 ‖ protocolVersion ‖ N ‖ session_id[0..3] ‖ expiresAtDelta)
      (truncated to 16 bytes)

      → expiresAtDelta is INSIDE the CMAC input. It sets sessionExpiry in step 5c,
        so leaving it unauthenticated would let a compromised app self-extend its
        own session to the 90-day cap regardless of what the server issued.

4. App writes to authResponse (C3), 20 bytes:
      [ session_id (16 B) | keyGeneration (1 B) | reserved (3 B) ]
   ...then a second write with:
      [ proof (16 B) | expiresAtDelta (4 B, uint32 seconds from now) ]

      → Implemented as a 2-frame write to stay inside the 20-byte ATT payload.
        Frame order is mandatory; an out-of-order frame resets the handshake.
        Both terms the proof covers from frame 2 travel in frame 2, so the
        firmware holds everything it needs the moment frame 2 lands.

5. Firmware:
      a. Derives K_sess' = HKDF(ikm  = K_dev,
                                salt = session_id,          ← frame 1
                                info = "bluesmoke-session-v1" ‖ keyGeneration)
                                                            ← frame 1
         Every input is either in OTP or in frame 1. No network, no clock.
      b. Recomputes proof' and compares in CONSTANT TIME
      c. On match → opens an authenticated session for this connection,
         records sessionExpiry = uptime_now + expiresAtDelta (capped at 90 days).
         uptime_now is the monotonic RTC/LPTIM counter — NOT wall-clock time.
         The device never learns the absolute date and does not need to.
      d. On mismatch → writes AUTH_FAILED to commandResult, applies backoff (§4.8)

6. Session is valid for the connection lifetime OR until sessionExpiry, whichever first.
   Disconnect ALWAYS ends the session. There is no session resumption in v1.
```

**Replay protection is three-layered:** (a) per-connection single-use nonce `N`, which is bound into both the handshake proof above **and** every subsequent command tag (§4.6) — so a command captured in one session is cryptographically useless in any other; (b) a strictly-increasing command counter inside the session (§4.6), which stops replay *within* a connection; (c) `sessionExpiry` enforced against the device's monotonic counter.

> **Why (a) must cover commands, not just the handshake.** `K_sess` is stable for up to 90 days
> and the command counter only ever increases *within* a session, resetting on each new
> connection. Without `N` in the command tag, an `UNLOCK` frame captured at counter 7 today
> would verify perfectly in any later session whose counter has not yet passed 7 — the sniffer
> would not need the key at all. Binding `N` makes every command frame valid for exactly one
> connection.

### 4.6 `lockCommand` (C5) — 20 bytes, write, authenticated

| Offset | Len | Field |
|---|---|---|
| 0 | 1 | `commandId` |
| 1 | 4 | `counter` (uint32, **strictly increasing** within the session) |
| 5 | 7 | `payload` (command-specific, zero-padded) |
| 12 | 8 | `tag` = first 8 bytes of `AES-128-CMAC(K_sess, N ‖ bytes[0..11])` |

> `N` is the 16-byte `authChallenge` nonce from **this** connection's handshake (§4.5). It is
> not transmitted in the frame — both sides already hold it — so the frame stays 20 bytes and
> the ATT MTU budget in §4.9 is unchanged. Its only job here is to scope the tag to one
> connection, which is what defeats cross-session replay (§4.5).

**Command IDs**

| ID | Command | Payload | Notes |
|---|---|---|---|
| `0x01` | `LOCK` | — | Always permitted in an authenticated session |
| `0x02` | `UNLOCK` | — | Rejected with `NOT_ACTIVATED` if `provisioningState != 2` |
| `0x03` | `ACTIVATE` | `activationNonce (4 B)` | First-time only. Sets `provisioningState = 2`. Irreversible except by `0x06`. |
| `0x04` | `SET_AUTOLOCK_GRACE` | `graceMs (uint16)` | Clamped by firmware to **1000–30000 ms**. Values outside → `INVALID_PARAM`. |
| `0x05` | `END_SESSION` | — | Locks, drops session, requires re-handshake |
| `0x06` | `FACTORY_UNPAIR` | `confirm (4 B) = 0xDEADBEEF` | Clears bonds + activation. `K_dev` in OTP survives. |
| `0x07` | `PING` | — | Keepalive; refreshes the dead-man timer |

**Firmware rules, non-negotiable:**
- Any write to C5 without an authenticated session → `UNAUTHENTICATED`, command discarded.
- `counter` ≤ last accepted counter → `REPLAY`, command discarded, backoff applied.
- Bad `tag` → `AUTH_FAILED`, command discarded, backoff applied.
- Commands are processed **atomically**; no partial application.

### 4.7 `commandResult` (C6) — 4 bytes, read + notify

| Offset | Len | Field |
|---|---|---|
| 0 | 1 | `commandId` echoed |
| 1 | 1 | `resultCode` |
| 2 | 2 | `counter` low 16 bits, echoed |

**Result codes**

| Code | Meaning |
|---|---|
| `0x00` | `OK` |
| `0x01` | `UNAUTHENTICATED` — no valid session |
| `0x02` | `AUTH_FAILED` — CMAC mismatch |
| `0x03` | `REPLAY` — counter not increasing |
| `0x04` | `NOT_ACTIVATED` |
| `0x05` | `SESSION_EXPIRED` |
| `0x06` | `INVALID_PARAM` |
| `0x07` | `BUSY` |
| `0x08` | `FAULT` — hardware fault; device is in `state = 3` |
| `0x09` | `RATE_LIMITED` — backoff active (§4.8) |

### 4.8 Firmware-side behavioural requirements

These are **firmware obligations**, not app behaviour. The app cannot enforce them.

| # | Requirement | Detail |
|---|---|---|
| **F1** | **Locked by default** | On any power-on, reset, or brownout the device boots to `LOCKED`. Unlock state is **never** persisted across a reset. |
| **F2** | **Dead-man auto-lock** | On BLE disconnect (any cause, including link supervision timeout) start a countdown of `autoLockGraceMs` (default **5000 ms**, range 1000–30000). On expiry → `LOCKED`, `lastLockReason = 1`. The timer runs off the RTC/LPTIM and **must survive sleep**. |
| **F3** | **Timer is not cancellable by disconnect-reconnect alone** | Reconnection only cancels the countdown after a **successful auth handshake**. An attacker who forces a reconnect without the key cannot keep the device unlocked. |
| **F4** | **Fail closed** | Watchdog reset, fault, or unhandled exception → `LOCKED`, `lastLockReason = 4`, `state = 3` if unrecoverable. |
| **F5** | **Session expiry enforced** | If `uptime_now > sessionExpiry` → immediate `LOCKED`, `lastLockReason = 2`, session dropped. `uptime_now` is the monotonic RTC/LPTIM counter, not wall-clock time — the device has no time source and none is required (§4.5). |
| **F11** | **Command tags are connection-scoped** | The `lockCommand` tag is verified against `N ‖ bytes[0..11]` using **this** connection's nonce (§4.6). A command frame captured in an earlier connection must fail tag verification here, even if its `counter` is higher than the current one. |
| **F6** | **Auth backoff** | After 5 consecutive auth failures: reject all auth attempts for 30 s. After 10: 5 min. Counter resets on success or power cycle. Return `RATE_LIMITED`. |
| **F7** | **Constant-time comparison** | All CMAC/tag comparisons must be constant-time. No early-exit `memcmp`. |
| **F8** | **RNG quality** | `authChallenge` nonces come from the hardware RNG. Never a counter, never RTC-seeded PRNG alone. |
| **F9** | **One bond at a time** | v1 supports a single bonded central. A new bond requires `FACTORY_UNPAIR` or a physical button sequence. |
| **F10** | **No PII storage** | The device stores no name, DOB, email, or biometric material. Ever. |

### 4.9 Connection parameters

| Parameter | Requested value | Notes |
|---|---|---|
| Connection interval | 30–50 ms while unlocked; 200–400 ms while locked/idle | Balances proximity responsiveness against battery |
| Slave latency | 0 while unlocked; 4 while idle | Proximity detection needs prompt link events |
| Supervision timeout | **4000 ms** | Upper bound on how long "out of range" goes undetected at the link layer |
| ATT MTU | Default 23 (no MTU exchange required) | Every payload in §4.2 fits. Keeps the 8 KB RAM budget safe. |
| PHY | 1 Mbps (LE 2M optional) | Long Range not used in v1 — it would *extend* unlock range, which is the wrong direction for a safety product |

> **Deliberate design note for the firmware team:** we specifically do **not** want BLE Long Range / S8 coding on this product. Greater range means the device stays unlocked further from its owner. Range is a safety parameter here, not a feature.

### 4.10 Firmware acceptance tests

The firmware is accepted against §4 when all of the following pass on real hardware:

- [ ] `FW-01` Device advertises the correct service UUID and is discoverable by the app's filtered scan
- [ ] `FW-02` `deviceInfo` reads correctly pre-auth; `provisioningState` reflects OTP state
- [ ] `FW-03` A valid handshake opens a session; `lockState.flags` bit0 sets
- [ ] `FW-04` An invalid CMAC returns `AUTH_FAILED` and does **not** open a session
- [ ] `FW-05` A replayed `authResponse` from a previous connection is rejected
- [ ] `FW-06` A replayed `lockCommand` (same counter) returns `REPLAY`
- [ ] `FW-07` `UNLOCK` before `ACTIVATE` returns `NOT_ACTIVATED`
- [ ] `FW-08` Walking out of range → device locks within `autoLockGraceMs` + supervision timeout
- [ ] `FW-09` Force-killing the app → device locks (proves F2 is firmware-side, not app-side)
- [ ] `FW-10` Power-cycling while unlocked → device boots `LOCKED`
- [ ] `FW-11` `SET_AUTOLOCK_GRACE` clamps out-of-range values and returns `INVALID_PARAM`
- [ ] `FW-12` 6 consecutive bad auth attempts → `RATE_LIMITED` for 30 s
- [ ] `FW-13` Battery percentage tracks a discharging cell; low-battery flag latches at 15%, clears at 20%
- [ ] `FW-14` Reconnect without a valid handshake does **not** cancel the dead-man countdown
- [ ] `FW-15` Watchdog-forced reset leaves the device `LOCKED` with `lastLockReason = 4`
- [ ] `FW-16` A `lockCommand` frame **captured in one connection and replayed in a later one** returns `AUTH_FAILED` — even when its `counter` exceeds the current session's last accepted counter (proves F11; `FW-06` only covers replay *within* a session)
- [ ] `FW-17` An `authResponse` whose `expiresAtDelta` is altered in transit returns `AUTH_FAILED` and opens no session (proves `expiresAtDelta` is inside the proof CMAC, §4.5)
- [ ] `FW-18` A device that has never had a time sync completes a full handshake and enforces `sessionExpiry` correctly (proves the derivation needs no wall clock, §4.5)

---

## 5. Backend — Supabase data model & contract

### 5.1 Why Supabase

Postgres **Row Level Security** is the mechanism that makes "device ownership is enforced server-side" a database guarantee rather than an application convention. Combined with Edge Functions running under the service role for the one privileged operation (session key issuance), this gives a small, auditable trust surface. Data model stays portable Postgres.

### 5.2 Schema

```sql
-- Every table below has RLS ENABLED. No exceptions.

-- 5.2.1 Profile (1:1 with auth.users)
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 5.2.2 Verification result — FLAG ONLY. No images. No DOB. No name.
create table verifications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  age_verified       boolean not null,
  verified_at        timestamptz not null default now(),
  method             text not null,          -- 'ondevice-mlkit-v1' | 'ondevice-vision-v1'
  threshold_version  text not null,          -- e.g. 'facematch-tau-0.62'
  app_version        text not null,
  platform           text not null,          -- 'ios' | 'android'
  outcome_reason     text                    -- 'pass' | 'under_18' | 'face_mismatch' |
                                             -- 'ocr_failed' | 'liveness_failed'
  -- DELIBERATELY ABSENT: dob, name, id_number, document_image, selfie_image,
  --                      face_embedding, similarity_score
);
create index on verifications (user_id, verified_at desc);

-- 5.2.3 Device registry
create table devices (
  id           uuid primary key default gen_random_uuid(),
  serial_hash  text not null unique,   -- SHA-256(deviceUid || server_salt). Raw UID never stored.
  model        text not null default 'YC1012_JD',
  hw_revision  int,
  key_generation int not null default 1,
  first_seen_at timestamptz not null default now()
);

-- 5.2.4 Ownership — the authority for "may this user command this device?"
create table device_ownership (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   uuid not null references devices(id) on delete cascade,
  nickname    text,
  bonded_at   timestamptz not null default now(),
  revoked_at  timestamptz
);

-- One active owner per device. This MUST be a partial unique INDEX, not an inline
-- `unique (...) where (...)` table constraint — Postgres has no such constraint form and
-- the migration will fail to parse. The index is what makes the §5.4 step-4 ownership
-- assertion race-safe, so it is load-bearing, not cosmetic.
create unique index device_ownership_one_active_owner
  on device_ownership (device_id)
  where (revoked_at is null);

-- 5.2.5 Root device keys — SERVICE ROLE ONLY. RLS denies every client.
create table device_keys (
  device_id      uuid primary key references devices(id) on delete cascade,
  k_dev_wrapped  bytea not null,      -- K_dev, encrypted at rest with Supabase Vault
  key_generation int not null default 1,
  provisioned_at timestamptz not null default now()
);

-- 5.2.6 Issued session keys — metadata only, never the key material
create table device_sessions (
  id           uuid primary key default gen_random_uuid(),
  session_id   bytea not null unique,   -- the 16-byte salt used in HKDF
  user_id      uuid not null references auth.users(id) on delete cascade,
  device_id    uuid not null references devices(id) on delete cascade,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index on device_sessions (user_id, device_id, expires_at desc);

-- 5.2.7 Push registration
create table push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text not null,            -- 'ios' | 'android'
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

-- 5.2.8 Audit log — metadata only
create table audit_log (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete set null,
  device_id  uuid references devices(id) on delete set null,
  event      text not null,            -- 'verification_submitted' | 'session_issued' |
                                       -- 'session_revoked' | 'device_bonded' | 'device_unpaired'
  metadata   jsonb,                    -- must NEVER contain PII or biometrics
  created_at timestamptz not null default now()
);
```

### 5.3 Row Level Security policies

```sql
alter table profiles         enable row level security;
alter table verifications    enable row level security;
alter table devices          enable row level security;
alter table device_ownership enable row level security;
alter table device_keys      enable row level security;
alter table device_sessions  enable row level security;
alter table push_tokens      enable row level security;
alter table audit_log        enable row level security;

-- Own rows only.
create policy own_profile on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Verifications: users may INSERT their own and READ their own. Never UPDATE or DELETE.
create policy read_own_verifications on verifications
  for select using (user_id = auth.uid());
create policy insert_own_verifications on verifications
  for insert with check (user_id = auth.uid());

-- Devices: visible only if you own them.
create policy read_owned_devices on devices for select using (
  exists (select 1 from device_ownership o
          where o.device_id = devices.id
            and o.user_id = auth.uid()
            and o.revoked_at is null)
);

-- Ownership: clients may READ their own rows, and may rename or release a device they
-- already hold. They may NOT create ownership — that is service-role only, because
-- creating it is exactly the decision §5.4 step 4 exists to make.
--
-- The earlier `for all ... with check (user_id = auth.uid())` was unsafe: WITH CHECK only
-- constrained user_id, so any authenticated user could INSERT a row naming ANY unclaimed
-- device_id, take the one active-owner slot, and lock the legitimate owner out of the
-- Edge Function forever — without ever obtaining K_sess. Denying client INSERT closes it.
create policy read_own_ownership on device_ownership
  for select using (user_id = auth.uid());

create policy update_own_ownership on device_ownership
  for update using (user_id = auth.uid() and revoked_at is null)
           with check (user_id = auth.uid());

-- No INSERT policy and no DELETE policy → both denied for every client role.
-- Deleting is denied deliberately: releasing a device sets revoked_at, so the history
-- survives for the audit trail.
--
-- WITH CHECK cannot see the OLD row, so it alone cannot stop a user repointing their own
-- row at someone else's device_id. Column privileges close that at the grant layer:
revoke update on device_ownership from authenticated;
grant  update (nickname, revoked_at) on device_ownership to authenticated;

-- device_keys: NO POLICY AT ALL. RLS enabled + zero policies = deny all.
-- Only the service role (Edge Function) can read it. This is intentional and load-bearing.

create policy read_own_sessions on device_sessions
  for select using (user_id = auth.uid());
-- INSERT on device_sessions is service-role only.

create policy manage_own_push on push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy read_own_audit on audit_log
  for select using (user_id = auth.uid());
```

### 5.4 Edge Function: `issue-device-session`

The **only operation that hands out key material**, and the server-side chokepoint that makes §2.2 rule 3 real. Two other endpoints run as service role — `revoke-device-session` (§5.4.1) and the push dispatcher (§5.5) — but neither derives, reads, or returns `K_dev` or `K_sess`. The rule that matters is narrower than "only privileged operation" and worth stating exactly: **`issue-device-session` is the sole path from `K_dev` to anything outside the database.**

```
POST /functions/v1/issue-device-session
Authorization: Bearer <supabase user JWT>
Body: { "serial_hash": "<hex>", "requested_ttl_days": 90 }

Server logic (service role):
  1. Resolve user_id from the JWT. Reject if absent/expired.
  2. SELECT latest verifications WHERE user_id AND age_verified = true.
     → if none: 403 { error: "AGE_NOT_VERIFIED" }              ← THE GATE
  3. Resolve device by serial_hash (insert if first-seen).
  4. Assert device_ownership: active row for (user_id, device_id),
     or no active owner at all (first bond → INSERT ownership as service role;
     clients cannot create ownership themselves, see §5.3).
     → else: 403 { error: "DEVICE_OWNED_BY_ANOTHER_USER" }
     The INSERT races against a concurrent first bond by another user. Do NOT
     pre-check-then-insert; let device_ownership_one_active_owner arbitrate and
     translate a 23505 unique violation into the same 403. The index is the
     authority here, not the SELECT.
  5. Load k_dev_wrapped, unwrap via Supabase Vault.
  6. session_id = randomBytes(16)
     expires_at = now() + min(requested_ttl_days, 90 days)
     K_sess = HKDF-SHA256(ikm=K_dev, salt=session_id,
                          info="bluesmoke-session-v1" || key_generation)
     // info binds ONLY values the device can also see (§4.5). user_id and expires_at
     // are enforced HERE, at issuance — the server is the only party that can check
     // them, and the offline device could never verify them anyway. expires_at is
     // still returned to the app and still recorded in device_sessions; it reaches
     // the device as the authenticated RELATIVE expiresAtDelta in the handshake.
  7. INSERT device_sessions (metadata only — K_sess is NOT stored).
  8. Rate limit: max 10 issuances per user per hour.
  9. audit_log: 'session_issued'
 10. Respond 200 {
        session_id:  "<hex 16B>",
        k_sess:      "<hex 16B>",     // over TLS 1.3 only
        expires_at:  "<iso8601>",
        key_generation: 1
     }
```

### 5.4.1 Edge Function: `revoke-device-session`

Listed in §5.5 but previously unspecified. It runs as service role because `device_sessions`
has no client UPDATE policy (§5.3), but it handles **no key material** — it only marks rows.

```
POST /functions/v1/revoke-device-session
Authorization: Bearer <supabase user JWT>
Body: { "session_id": "<hex 16B>" }   // omit to revoke every active session for the caller

Server logic (service role):
  1. Resolve user_id from the JWT. Reject if absent/expired.
  2. UPDATE device_sessions SET revoked_at = now()
       WHERE session_id = $1 AND user_id = <caller> AND revoked_at is null
     The user_id predicate is the authorisation check — a caller can never revoke
     another user's session, and a session_id they do not own is indistinguishable
     from one that does not exist.
  3. Affected 0 rows → 404 { error: "SESSION_NOT_FOUND" }.  Do not leak whether the
     session_id exists under a different user.
  4. audit_log: 'session_revoked'
  5. Respond 200 { revoked: <count>, revoked_at: "<iso8601>" }

Idempotent: revoking an already-revoked session is a 404, not an error state.
```

**What revocation does and does not do.** It stops the *server* from re-issuing, and the app
refuses to use a revoked session on its next online check. It does **not** reach the device:
a device holding a valid `K_sess` keeps honouring it until `sessionExpiry` elapses, because
the device is offline by design. Re-issuance after revocation is therefore also blocked —
§5.4 step 4 must treat a revoked ownership row as "no active owner", and a revoked *session*
does not entitle the holder to a fresh one without passing the §5.4 gate again.

Practical bound on exposure is `expires_at` (≤ 90 days; **30 days recommended**, see §8.5).
This is the accepted, documented trade-off for offline unlock.

### 5.5 API contract summary (app ↔ backend)

| Operation | Mechanism | Auth |
|---|---|---|
| Sign up / sign in / password reset | `supabase.auth` | — |
| Sign up / sign in via phone OTP *(§1.2.1)* | `supabase.auth` with Twilio Verify as the native phone provider | — |
| *(proposed, §1.2.2)* Sign up / sign in via email code | `supabase.auth.signInWithOtp` (email) | — |
| Submit verification result | `INSERT verifications` (RLS) | User JWT |
| Read own verification status | `SELECT verifications` (RLS) | User JWT |
| List / rename / unpair devices | SELECT + UPDATE(`nickname`, `revoked_at`) on `device_ownership` (RLS). **Not INSERT** — ownership is created service-side by `issue-device-session` only (§5.3) | User JWT |
| **Issue device session key** | Edge Function `issue-device-session` (§5.4) | User JWT → service role |
| Revoke session | Edge Function `revoke-device-session` (§5.4.1) | User JWT → service role |
| Register push token | `UPSERT push_tokens` (RLS) | User JWT |
| Send push | Edge Function → APNs/FCM | Service role |

---

## 6. On-device age & identity verification pipeline

**Hard constraint:** everything in this section runs on the phone. No network call carries an image, a frame, an embedding, a DOB, a name, or a document number.

### 6.1 Pipeline

```
 ┌─ STAGE 1: ID CAPTURE ──────────────────────────────────────────┐
 │ VisionCamera + rectangle/edge detection overlay                 │
 │ Quality gates: focus (Laplacian variance), glare (blown-highlight│
 │ ratio), fill (doc occupies ≥ 60% of frame), skew (≤ 10°)         │
 │ Output: single high-res frame → RAM only, never to disk          │
 └────────────────────────────┬────────────────────────────────────┘
                              ▼
 ┌─ STAGE 2: DOB EXTRACTION ──────────────────────────────────────┐
 │ Path A (preferred): PDF417 barcode (US/CA licences) → AAMVA     │
 │   field DBB/DBL = DOB. Deterministic, near-100% when present.   │
 │ Path B: MRZ (passports/ID cards, TD1/TD2/TD3) → parse + verify  │
 │   the MRZ check digit. Deterministic.                           │
 │ Path C (fallback): OCR text recognition                          │
 │   iOS: Vision VNRecognizeTextRequest (accurate level)            │
 │   Android: ML Kit Text Recognition v2                            │
 │   → regex candidate dates + label proximity scoring              │
 │ Order: A → B → C. First confident hit wins.                     │
 └────────────────────────────┬────────────────────────────────────┘
                              ▼
 ┌─ STAGE 3: AGE COMPUTATION ─────────────────────────────────────┐
 │ Normalise DOB across formats (§6.2). Compute age at today.      │
 │ HARD GATE: age ≥ 18 (threshold configurable, see §6.2)          │
 └────────────────────────────┬────────────────────────────────────┘
                              ▼
 ┌─ STAGE 4: ID PORTRAIT EXTRACTION ──────────────────────────────┐
 │ Face detection on the ID image → crop the portrait → embedding  │
 │   iOS: Vision VNDetectFaceRectangles + VNFaceObservation         │
 │   Android: ML Kit Face Detection + face embedding model          │
 └────────────────────────────┬────────────────────────────────────┘
                              ▼
 ┌─ STAGE 5: SELFIE + LIVENESS ───────────────────────────────────┐
 │ Guided multi-frame capture, Face-ID-enrolment style.            │
 │ Liveness signals (all must pass):                               │
 │   • Blink detected (eye-open probability crosses <0.2 then >0.8)│
 │   • Head yaw challenge (turn left/right, randomised order)      │
 │   • Multi-frame texture variance (rejects a flat printed photo) │
 │   • Face bounding-box stability across frames                    │
 │ Randomised challenge order prevents replaying a recorded video.  │
 └────────────────────────────┬────────────────────────────────────┘
                              ▼
 ┌─ STAGE 6: FACE MATCH ──────────────────────────────────────────┐
 │ cosine_similarity(embed(ID portrait), embed(selfie)) ≥ τ        │
 │ τ tuned per platform against the internal test set (§6.3)       │
 └────────────────────────────┬────────────────────────────────────┘
                              ▼
 ┌─ STAGE 7: DECISION + ZEROISATION ──────────────────────────────┐
 │ PASS  ⇔  (age ≥ 18) AND (similarity ≥ τ) AND (liveness passed)  │
 │ Then, UNCONDITIONALLY, in a finally-block:                       │
 │   overwrite + release all image buffers, embeddings, DOB, and    │
 │   any derived strings. Nothing survives the function scope.      │
 │ Emit to backend: { age_verified, verified_at, method,            │
 │                    threshold_version, outcome_reason }           │
 └─────────────────────────────────────────────────────────────────┘
```

### 6.2 DOB normalisation rules

Date-format ambiguity is a **correctness bug that fails safe in only one direction**, so the rules are explicit:

| Rule | Detail |
|---|---|
| **R1** | Barcode (AAMVA) and MRZ carry unambiguous formats — always prefer them and skip the ambiguity logic entirely. |
| **R2** | For OCR dates, if either component is > 12 the assignment is forced (e.g. `13/07/1990` → DD/MM). |
| **R3** | If genuinely ambiguous (e.g. `07/08/1990`), resolve using the document's detected issuing region if known; otherwise **choose the interpretation that yields the YOUNGER age**. Fail safe: never let ambiguity admit a minor. |
| **R4** | 2-digit years: `YY ≤ (current year mod 100)` → 20YY, else 19YY. Then sanity-check age ∈ [10, 120]; outside → reject the candidate. |
| **R5** | Reject any date in the future, or an implied age > 120. |
| **R6** | Prefer a date labelled `DOB` / `Date of Birth` / `Born` / `Naissance` over an unlabelled candidate. Expiry and issue dates must never be mistaken for DOB — explicitly exclude candidates near `EXP` / `ISS` labels. |
| **R7** | The 18 threshold lives in remote config (`min_age`), so a 21+ region can be served without a rebuild. Default **18**. |

### 6.3 Accuracy targets & threshold tuning

Face-match threshold tuning is the single largest line item in the plan (P2-5.0, 5 person-days) precisely because "tune it" without a target is not a task.

| Metric | Target | Measured on |
|---|---|---|
| **FRR** (genuine user wrongly rejected) | **≤ 5%** | Internal test set, per platform |
| **FAR** (impostor wrongly accepted) | **≤ 0.1%** | Internal test set, cross-pairs |
| DOB extraction success | **≥ 95%** | Supported ID types, good lighting |
| DOB extraction **accuracy when it does extract** | **100%** | A wrong DOB is worse than no DOB — prefer failing to extract |
| Liveness FRR | ≤ 8% | Includes low-end Android devices |
| End-to-end verification duration (p50) | ≤ 60 s | Mid-range device |

**Tuning method.** Build a labelled internal set: ≥ 40 genuine (ID + matching selfie) pairs across skin tones, ages, glasses/no-glasses, and lighting; plus all cross-pairs as impostors. Sweep τ, plot the ROC, pick the τ meeting FAR ≤ 0.1% and report the resulting FRR. Record the chosen τ in `threshold_version` so any decision is reproducible after the fact.

> **Dependency risk:** this requires **physical sample IDs**. The PRD assumes availability around week 6 of an 8-week plan — under a 30-day plan that is *after the project ends*. This is escalated as **OQ-1** in §13 and is the top-ranked risk in the roadmap.

### 6.4 Retry & manual-fallback policy

| Attempt | Behaviour |
|---|---|
| 1–3 | Retry freely, with progressive coaching ("move to brighter light", "remove glare", "hold steady") |
| 4–5 | Retry with a stricter capture guide and an explicit "having trouble?" affordance |
| 6+ | Lock the flow for 30 minutes; surface the **manual fallback** route |

**Manual fallback** = a support contact route (email/in-app form) carrying **only** the user ID and the `outcome_reason`. No images. The client must agree the operational policy behind it — **OQ-2**.

Failure states must be honest and non-leaky: tell the user *what to fix* ("we couldn't read the date on your ID") but never *why the match failed numerically*, which would help an attacker tune an attack.

---

## 7. Proximity & lock state machine

### 7.1 Authority model — read this before touching proximity code

| Layer | Role | Authority |
|---|---|---|
| **Firmware dead-man timer** | Locks on disconnect after `autoLockGraceMs` | **AUTHORITATIVE.** This is what actually makes the product safe. |
| **App proximity monitor** | Issues an explicit `LOCK` on RSSI degradation *before* disconnect | **ADVISORY.** A responsiveness optimisation. |

The app makes auto-lock feel *fast*. The firmware makes auto-lock *true*. If the app is killed, backgrounded, crashed, or the phone's battery dies, safety must be unaffected. Any design that requires the app to be alive for the device to lock is wrong.

### 7.2 RSSI monitoring — hysteresis and debounce

Raw RSSI is noisy; naïve thresholding produces lock/unlock flapping, which is both a terrible UX and a battery drain.

```
Sampling:      1 Hz while UNLOCKED (piggy-backed on connection events)
Smoothing:     median of the last 5 samples  (median, not mean — rejects outliers)
Enter-lock:    smoothed RSSI < -85 dBm  sustained for 3 consecutive samples
Exit-lock:     smoothed RSSI > -75 dBm  sustained for 2 consecutive samples
               (10 dBm hysteresis band → no flapping at the boundary)
Immediate:     disconnect / supervision timeout → LOCK immediately, no debounce
```

RSSI ↔ distance is **not** calibrated ranging and must never be presented to the user as metres. Thresholds are tuned empirically per enclosure during integration and stored in remote config.

### 7.3 Lock state machine (app-side model)

```
                    ┌──────────────────────────┐
       app start    │   DISCONNECTED           │
   ───────────────► │   UI: "Device not found" │
                    └────────────┬─────────────┘
                                 │ scan + connect + bond
                                 ▼
                    ┌──────────────────────────┐
                    │   CONNECTED_UNAUTH       │◄───────┐
                    │   lockState readable     │        │ auth failure
                    └────────────┬─────────────┘        │ (backoff)
                                 │ handshake §4.5       │
                                 ▼                      │
                    ┌──────────────────────────┐        │
              ┌────►│   AUTHENTICATED          │────────┘
              │     └──────┬────────────┬──────┘
              │            │            │
              │  not activated      activated
              │            │            │
              │            ▼            ▼
              │  ┌──────────────┐  ┌──────────────┐
              │  │ PENDING_     │  │   LOCKED     │◄──────┐
              │  │ ACTIVATION   │  └──────┬───────┘       │
              │  │              │         │ UNLOCK cmd    │
              │  │ needs        │         ▼               │
              │  │ age_verified │  ┌──────────────┐       │
              │  └──────┬───────┘  │  UNLOCKED    │───────┤ user LOCK
              │         │          └──────┬───────┘       │ RSSI < -85 (3×)
              │  ACTIVATE (§4.6         │                 │ session expiry
              │  0x03, gated on         └─────────────────┘ disconnect
              │  server age_verified)                       (→ firmware
              │         │                                    dead-man)
              └─────────┘
```

**Invariant:** `UNLOCKED` is reachable **only** through `AUTHENTICATED` + activated + an explicit user action. There is no path from `DISCONNECTED` or `CONNECTED_UNAUTH` to `UNLOCKED`.

### 7.4 Background BLE — the known hard problem

Flagged in the PRD as one of two hard problems. Honest constraints:

**iOS**
- Requires the `bluetooth-central` background mode + `NSBluetoothAlwaysUsageDescription`
- State restoration via `CBCentralManagerOptionRestoreIdentifierKey` lets iOS relaunch the app for BLE events
- Background execution is opportunistic and throttled; scanning in background requires explicit service UUIDs and runs at a reduced duty cycle
- **If the user force-quits the app, state restoration does not apply.** The app will not run again until manually opened.

**Android**
- Foreground service (type `connectedDevice`) with a persistent notification for reliable long-lived connections
- Battery optimisation exemption significantly improves reliability; must be requested with a clear explanation
- OEM-specific aggressive process killing (Xiaomi, Huawei, OnePlus, Samsung) is a real and unfixable-by-us variable

**How we ship anyway.** The firmware dead-man timer (§4.8 F2) means every one of these failure modes degrades to *"the device locks itself"* — the safe direction. We do **not** claim guaranteed background operation. We claim: **the device always locks when the phone goes away, regardless of app state**, and the app makes it lock faster when it is running.

This must be spiked in **Days 1–3**, not discovered at integration.

---

## 8. Security & privacy model

### 8.1 Data classification

| Class | Examples | Storage rule |
|---|---|---|
| 🔴 **Never persisted** | ID image, selfie frames, face embeddings, DOB, name, ID number | RAM only, zeroised in a `finally` block. Never logged, never in crash reports, never in analytics. |
| 🟠 **Secret at rest** | `K_sess`, `session_id`, Supabase refresh token | iOS Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`) / Android Keystore, hardware-backed, biometric-gated where available |
| 🟡 **Server-only secret** | `K_dev` | Supabase Vault, service role only, RLS deny-all. Never transmitted to a client under any circumstance. |
| 🟢 **Ordinary data** | `age_verified`, device nickname, battery, lock state | Postgres with RLS |

### 8.2 Bonding is not authorisation

BLE bonding establishes an encrypted **transport**. It answers "is this link private?" — never "is this user allowed to unlock?"

Authorisation is the §4.5 CMAC handshake, which transitively proves the server confirmed `age_verified` at activation. A bonded-but-unauthenticated central can read `lockState` and nothing else. **Never gate a privileged operation on bond status alone.**

### 8.3 Threat model

| Threat | Mitigation |
|---|---|
| Passive BLE sniffing | LE Secure Connections encryption; and nothing sensitive traverses BLE regardless |
| Replay of a captured unlock command | The connection nonce `N` is bound into the command tag itself (§4.6 F11), so a captured frame is valid only inside the connection that produced it; plus a strictly-increasing counter within the session and `sessionExpiry` (§4.5) |
| Relay / range-extension attack | Not fully mitigated in v1. Reduced by short supervision timeout (4 s), RSSI thresholds, and no Long Range PHY. Documented residual risk — see §8.5. |
| Stolen phone | `K_sess` is biometric-gated in the Keychain/Keystore; remote session revocation; `sessionExpiry` bounds exposure |
| Rooted / jailbroken device extracting `K_sess` | Bounded blast radius: `K_sess` is per-device, per-user, expiring, and revocable. `K_dev` is unaffected, so the fleet is unaffected. |
| Minor using an adult's ID | Liveness + face match is exactly this defence. Advanced PAD is the add-on that hardens it. |
| Printed-photo spoof of the selfie | Multi-frame texture variance + blink + randomised yaw challenge. Full PAD is an add-on. |
| Tampering with the client-side `age_verified` flag | Irrelevant — the server re-checks in `issue-device-session` before issuing any key (§5.4 step 2) |
| Firmware key compromise (single device) | Per-device `K_dev`; one device's compromise does not affect any other |
| Malicious app command flooding | Firmware auth backoff (§4.8 F6) + server rate limit on session issuance |

### 8.4 Key rotation

The OTP is one-time-programmable, so `K_dev` cannot be overwritten in the field. Rotation is therefore handled where it *can* be:

- `keyGeneration` is exposed in `deviceInfo` and stored in `devices` / `device_keys`, so a fleet can carry mixed generations without an app change.
- Future hardware revisions may be provisioned with a new generation; the server selects the derivation by generation.
- **Session-level rotation is the day-to-day mechanism:** `K_sess` is re-derived on every activation and expires within 90 days, so the practically-exposed key material rotates continuously without touching firmware.
- Compromise response for a single device: revoke sessions, mark the device, require re-activation.

### 8.5 Documented residual risks

1. **Relay attack.** An attacker relaying BLE between a distant phone and the device could hold it unlocked. Full mitigation needs cryptographic distance bounding, which this silicon does not support. Accepted for v1; reduced by the short supervision timeout and the deliberate refusal to use Long Range PHY.
2. **Offline revocation lag.** A revoked session remains usable by an offline device until `sessionExpiry`. This is the direct cost of offline unlock, which the product requires. Bounded at 90 days; recommend 30 days if the client accepts more frequent online check-ins.
3. **On-device ML accuracy vs. a specialist vendor.** On-device models will not match a dedicated KYC vendor's accuracy. This is a client-mandated trade-off in exchange for the privacy guarantee. Managed via the §6.3 targets and the manual fallback.

### 8.6 Compliance posture

- **GDPR/CCPA:** the architecture minimises exposure to near-zero — no biometric or document data is ever processed by us as a controller/processor, because it never leaves the user's device. `age_verified` + timestamp is the entire personal-data footprint beyond account identity.
- **Data subject deletion:** cascade-deleting `auth.users` removes everything. There is no image store to purge.
- Target markets are still unconfirmed (**OQ-3**), which is the one thing that could add requirements here.

---

## 9. Mobile app architecture

### 9.1 Stack

| Concern | Choice |
|---|---|
| Framework | React Native (bare) + TypeScript, `strict: true` |
| Navigation | React Navigation (native stack) |
| Server state | TanStack Query |
| Client state | Zustand (small, explicit stores) |
| BLE | `react-native-ble-plx` |
| Camera | `react-native-vision-camera` + frame processors |
| ML | Native modules — Apple Vision (Swift) / ML Kit (Kotlin), one shared TS interface |
| Secure storage | `react-native-keychain` (hardware-backed) |
| Backend client | `@supabase/supabase-js` |
| Forms | React Hook Form + Zod |
| Testing | Jest + React Native Testing Library; Detox for E2E |

### 9.2 Module layout

```
src/
  app/                 navigation, providers, entry
  features/
    auth/              signup, login, reset
    onboarding/        permissions priming + recovery
    verification/      ⚠️ the 🔴 zone — see rules below
      capture/         ID + selfie camera UI
      ocr/             DOB extraction, normalisation (§6.2)
      facematch/       embedding + threshold
      liveness/
      decision.ts      the single PASS/FAIL orchestrator
    devices/           scan, pair, list, rename, unpair
    ble/
      connection.ts    lifecycle, reconnect, background
      auth.ts          §4.5 handshake
      commands.ts      §4.6 command encoding + CMAC
      proximity.ts     §7.2 RSSI hysteresis
      protocol.ts      §4 constants — ONLY place UUIDs are defined
    lock/              lock/unlock UI + state machine (§7.3)
    profile/
  native/
    ios/  VisionVerification.swift
    android/ MLKitVerification.kt
  shared/  ui/ · hooks/ · lib/ · config/
```

**Rules for `features/verification/`:**
1. No import of any logging, analytics, or persistence module inside this subtree. Enforced by an ESLint `no-restricted-imports` rule.
2. Only `decision.ts` may export outward, and its return type is exactly `{ passed: boolean; method: string; thresholdVersion: string; outcomeReason: string }`. Nothing else escapes.
3. Every buffer-holding function ends in a `finally` block that zeroises and releases.

**Rules for `features/ble/protocol.ts`:** every UUID, command ID, offset, and result code from §4 is defined here once, with a comment citing its §4 subsection. No magic bytes anywhere else in the codebase.

### 9.3 Error handling & UX principles

- Every BLE operation has an explicit timeout; there are no unbounded awaits.
- Permission denial always has a recovery path (deep link to Settings + explanation). Users must never be able to get stuck.
- Lock state shown in the UI is only ever the **last received `lockState` notification**, with a staleness indicator. The app never optimistically renders "unlocked" before the device confirms.
- All user-facing verification failures are coaching-oriented, never diagnostic (§6.4).

---

## 10. Environments, config & CI/CD

### 10.1 Environments

| Env | Supabase project | App identifier | Distribution |
|---|---|---|---|
| Development | `bluesmoke-dev` | `com.bluesmoke.app.dev` | Local / simulator |
| Staging | `bluesmoke-staging` | `com.bluesmoke.app.staging` | TestFlight / Play Internal Testing |
| Production | `bluesmoke-prod` | `com.bluesmoke.app` | App Store / Google Play |

Staging must mirror production configuration exactly, including RLS policies. Migrations are versioned SQL in `supabase/migrations/` and applied dev → staging → prod in order. Never edit schema in the dashboard.

### 10.2 Remote config (Supabase table, cached locally)

| Key | Default | Why it's remote |
|---|---|---|
| `min_age` | `18` | Region-specific 21+ without a rebuild (§6.2 R7) |
| `facematch_tau_ios` | TBD after tuning | Tunable post-launch as accuracy data arrives |
| `facematch_tau_android` | TBD after tuning | Platforms tune independently |
| `rssi_lock_threshold` | `-85` | Tuned per enclosure at integration |
| `rssi_unlock_threshold` | `-75` | Hysteresis band partner |
| `autolock_grace_ms` | `5000` | Pushed to firmware via `SET_AUTOLOCK_GRACE` |
| `session_ttl_days` | `90` | Lower it to shorten revocation lag (§8.5) |

### 10.3 CI/CD

GitHub Actions:
- **On PR:** typecheck → lint → unit tests → build both platforms. All four must pass to merge.
- **On merge to `main`:** staging build → TestFlight + Play Internal.
- **On tag `v*`:** production build → store submission (manual approval gate).

Secrets in GitHub Actions secrets; signing via App Store Connect API key and a Play service account. **No secret is ever committed**, and CI runs a secret-scanning step.

---

## 11. Testing strategy

### 11.1 The mock peripheral — build this on Day 2

Physical hardware is not available until roughly the end of the project (**OQ-1**). Waiting for it would serialise the whole plan behind a dependency we do not control.

So: a **BLE mock peripheral** implementing §4 exactly — a Node script using `bleno`, or a second phone acting as a peripheral. It must support the full §4 surface *including the failure paths* (`AUTH_FAILED`, `REPLAY`, `RATE_LIMITED`, dead-man auto-lock, fault states).

This is the highest-leverage item in the entire plan. It de-risks Phases 1 and 3 and turns hardware integration from *discovery* into *confirmation*.

### 11.2 Test layers

| Layer | Scope | Tooling |
|---|---|---|
| Unit | DOB normalisation (§6.2 — table-driven, every rule R1–R7), CMAC encoding, RSSI hysteresis, state machine transitions | Jest |
| Integration | App ↔ mock peripheral: full handshake, all commands, all result codes | Jest + mock peripheral |
| Verification accuracy | The §6.3 labelled set; ROC sweep; FAR/FRR regression gate | Custom harness |
| E2E | Signup → verify → pair → unlock → walk away → auto-lock | Detox + mock peripheral |
| Hardware integration | §4.10 `FW-01`–`FW-15` against real firmware | Manual, joint with the firmware team |
| Security review | RLS policy audit, secret handling, the §2.2 three rules, threat-model walkthrough | Manual checklist |

### 11.3 Device matrix (minimum)

- **iOS:** latest iPhone, iPhone SE (small screen + older silicon), one iOS-1 device
- **Android:** Pixel (reference), Samsung (largest install base), one budget device ≤ 4 GB RAM, one aggressive-battery-management OEM (Xiaomi/OnePlus)

Android budget devices are where on-device ML latency and liveness FRR will hurt. Test there early, not at the end.

---

## 12. Definition of Done & release process

### 12.1 Definition of Done (per task)

A task is Done when **all** of these hold:

- [ ] Code merged to `main` via reviewed PR
- [ ] Typecheck, lint, and unit tests pass in CI
- [ ] Works on **both** iOS and Android on a physical device
- [ ] If it touches 🔴 data: verified no disk write, no log, no network payload
- [ ] If it touches BLE: tested against the mock peripheral including failure paths
- [ ] If it touches the backend: RLS policy written **and** tested with a second user's JWT
- [ ] Edge cases and error states handled with a user-visible recovery path
- [ ] The corresponding checkbox in `project-roadmap-todos/TODO-phase-N.md` is ticked

### 12.2 Definition of Done (per phase)

Every exit-criterion listed in the phase's TODO file — copied verbatim from the client PRD — is demonstrated, not asserted. Demonstration means a live walkthrough or a recorded video, not a checkbox.

### 12.3 Release gates

| Gate | Requirement |
|---|---|
| G1 | All §4.10 firmware acceptance tests pass on real hardware |
| G2 | §6.3 accuracy targets met and recorded, with `threshold_version` pinned |
| G3 | Security review checklist complete; RLS audited against a second-user JWT |
| G4 | Full device matrix (§11.3) exercised |
| G5 | Store listings, privacy nutrition labels, and age-rating declarations complete |
| G6 | Privacy policy accurately describes the on-device model |

> **Store-review note:** an age-restricted product in a regulated category will attract additional scrutiny from both stores. Budget for at least one rejection round and lead with the privacy story — "verification happens entirely on-device, no biometric data is collected or transmitted" is a strong position with both reviewers. Submit as early as the build allows.

---

## 13. Open questions register

| ID | Question | Blocks | Owner | Severity |
|---|---|---|---|---|
| **OQ-1** | When are **physical sample IDs** and a **physical device** available? The PRD assumes ~week 6 of 8 — under a 30-day plan that is after delivery. | §6.3 threshold tuning; all §4.10 firmware acceptance tests | Client | 🔴 **Critical** |
| **OQ-2** | What is the **manual-review fallback policy** for legitimate false rejects? Who handles it, through what channel, with what SLA? | §6.4 | Client | 🔴 Critical |
| **OQ-3** | **Target markets / countries** at launch? Determines accepted ID types, OCR coverage, and privacy regime. | §6.2 OCR scope; §8.6 | Client | 🟠 High |
| **OQ-4** | Who **provisions `K_dev` into OTP** at manufacture, and how is the key manifest securely delivered to us for `device_keys`? | §5.2.5; the whole §4.5 trust chain | Client + factory | 🔴 **Critical** |
| **OQ-5** | Is there a **re-verification cadence**, or is `age_verified` permanent once set? (Currently out of scope.) | §5.2.2 | Client | 🟠 High |
| **OQ-6** | Confirmed **firmware team availability** for spec review (Days 3–5) and joint integration (Days 25–29)? | §4; integration | Client | 🟠 High |
| **OQ-7** | **Brand assets** — logo, palette, app name, store copy. | Design system | Client | 🟡 Medium |
| **OQ-8** | Who owns the **Apple and Google developer accounts** and signing assets? | §10.3 CI/CD | Client | 🟠 High |
| **OQ-9** | Is the ~5 s default `autolock_grace_ms` right for the product's real-world use? Needs a physical trial. | §4.8 F2 | Both | 🟡 Medium |

> **OQ-1 and OQ-4 are the two that can break the 30-day plan.** Without OTP-provisioned keys there is no §4.5 trust chain to test, and without sample IDs there is no defensible §6.3 tuning. Both must be answered in Days 1–3.

---

## 14. Glossary

| Term | Meaning |
|---|---|
| **AAMVA** | American Association of Motor Vehicle Administrators — the PDF417 barcode standard on US/Canadian driving licences |
| **CMAC** | Cipher-based Message Authentication Code; AES-128-CMAC is our authentication primitive |
| **Dead-man timer** | The firmware countdown that locks the device after BLE disconnect, without the app's involvement |
| **FAR / FRR** | False Accept Rate / False Reject Rate |
| **GATT** | Generic Attribute Profile — the BLE service/characteristic data model |
| **HKDF** | HMAC-based Key Derivation Function; derives `K_sess` from `K_dev` |
| **`K_dev`** | Per-device root key, 16 bytes, in device OTP and server-side only |
| **`K_sess`** | Derived, scoped, expiring session key held by the app |
| **LESC** | LE Secure Connections — BLE 4.2+ pairing with ECDH |
| **MRZ** | Machine Readable Zone — the `<<<`-style lines on passports and ID cards |
| **OTP** | One-Time Programmable memory — write-once, hence §8.4 |
| **PAD** | Presentation Attack Detection — advanced anti-spoofing (add-on) |
| **RLS** | Row Level Security — Postgres per-row access policies |
| **RSSI** | Received Signal Strength Indicator — our proximity proxy |
| **τ (tau)** | The tuned cosine-similarity threshold for face match |

---

## Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-08-05 | Initial specification. Supersedes `archive/PROJECT_BRIEF-superseded.md`. BLE protocol `v0x01`. Corrected device auth from Ed25519 to AES-128-CMAC following review of the YC1012_JD datasheet. Backend locked to Supabase. Timeline set to 30 days. |
| 1.1 | 2026-08-05 | **P0-1.0 consistency audit** — see [`audits/P0-1.0-consistency-audit.md`](audits/P0-1.0-consistency-audit.md). Four §2 corrections, no protocol change, `protocolVersion` unchanged at `0x01`. **§2.3 Flow B:** HKDF parameters were wrong — `session_id` belongs in `salt` not `info`, and `info` carries `expires_at` not `session_id`; now matches §4.5/§5.4/§5.2.6. Request/response fields aligned (`serial_hash`, `requested_ttl_days`, `key_generation`). **§2.3 Flow C:** CMAC input is `session_id[0..3]` not the full 16 bytes; `authResponse` is a mandatory two-frame ordered write. **§2.2:** boundary table completed — verification engine exports four fields incl. `outcomeReason`; App→Supabase row now lists every §5.2.2 column; note added fixing `outcome_reason` as deliberately coarse. All four divergences were in §2; §4/§5/§8/§9 already agreed. |
| 1.2 | 2026-08-06 | **§4 pre-freeze security corrections.** `protocolVersion` **unchanged at `0x01`**: §4 has not yet been handed to the firmware team (OQ-6 open, review Days 3–5) and the freeze is milestone **M2, Day 6** — no implementation of `0x01` exists, so bumping would mint a version nothing speaks. **After M2 this exemption ends** and the header's bump-and-notify rule applies in full. Three defects fixed. **(1) §4.5 `K_sess` was underivable device-side:** `info` bound `user_id` and absolute `expires_at`, neither of which the handshake transmits (step 5a concealed this with an ellipsis). `info` is now `"bluesmoke-session-v1" ‖ keyGeneration` — every HKDF input is in OTP or in frame 1. This supersedes the v1.1 note that `info` carries `expires_at`. `sessionExpiry` now derives from a **monotonic uptime counter**, not wall clock, so no time sync / `SET_TIME` command is needed. **(2) §4.6 cross-session command replay:** the tag covered `bytes[0..11]` only, so a captured `UNLOCK` replayed in any later session whose counter had not passed it. Tag input is now `N ‖ bytes[0..11]`; frame size unchanged at 20 B, ATT MTU budget unaffected. New obligation **F11**. **(3) §4.5 `expiresAtDelta` was unauthenticated** yet set `sessionExpiry`, letting a compromised app self-extend to the 90-day cap; it is now inside the proof CMAC. New acceptance tests **FW-16/17/18**. |
| 1.3 | 2026-08-06 | **§5 backend corrections.** No protocol change; `protocolVersion` unchanged. **(1) §5.2.4 would not have migrated:** `unique (device_id) where (revoked_at is null)` is not valid Postgres as an inline table constraint. Replaced with the partial unique index `device_ownership_one_active_owner`. **(2) §5.3 ownership-squat hole closed:** `manage_own_ownership … for all` constrained only `user_id` in its `WITH CHECK`, so any authenticated user could INSERT an ownership row for any *unclaimed* `device_id`, take the single active-owner slot and permanently lock out the real owner — without ever obtaining `K_sess`. Client INSERT and DELETE are now denied outright (ownership is created service-side by §5.4 step 4, which is where that decision belongs); SELECT and a column-restricted UPDATE on `nickname`/`revoked_at` remain, with `revoke`/`grant` at the column layer because `WITH CHECK` cannot see the OLD row. **(3) §5.4.1 `revoke-device-session` now specified** — it was listed in the §5.5 API table and defined nowhere. Request shape, the `user_id` authorisation predicate, 404-not-403 to avoid leaking session existence across users, idempotency, and the explicit statement that revocation never reaches an offline device. **(4) §5.4's "only privileged operation" claim narrowed** to the accurate one: `issue-device-session` is the sole path from `K_dev` to anything outside the database. **(5) §5.4 step 4 race** made explicit — let the unique index arbitrate a concurrent first bond and map `23505` to the existing 403, rather than check-then-insert. |
