# Blue Smoke — Project Brief

> Status: client brief captured. **Technical plan complete — see [`TECHNICAL_SPEC.md`](TECHNICAL_SPEC.md).**
>
> This document is the client-facing summary. For the build contract (architecture, BLE GATT
> spec, data model, security model) read [`TECHNICAL_SPEC.md`](TECHNICAL_SPEC.md).
> For the plan and progress tracking, read [`project-roadmap-todos/ROADMAP.md`](project-roadmap-todos/ROADMAP.md).

## 1. Product summary
A cross-platform (iOS + Android) mobile app that controls a **Bluetooth-enabled vape device**.
The device contains a BLE chip and an MCU (see hardware notes). The app pairs with the
device, enforces **age verification (18+)** before first activation, and locks/unlocks the
device based on Bluetooth proximity.

## 2. Hardware (from client spec images)
- **YC1012_JD** — System-on-Chip integrating a **Bluetooth 5.4 (BLE)** radio, low-power
  ARM core, on-chip memory, audio codec, ADCs, etc. This is the wireless/control SoC.
- **32-bit ARM Cortex-M0+ MCU** — up to 48 MHz, up to 64 KB flash / 8 KB SRAM, timers,
  SPI/USART, ADC. General device control / peripheral MCU.
- Communication between app and device is over **BLE (Bluetooth Low Energy)**.

## 3. Core features
### Accounts & device management
- User creates an account (signup / login).
- A user can pair **multiple devices** to their account.
- Device pairing flow over BLE; device management screen (list, rename, unpair, status).

### Age verification (first-time activation gate) — done ON-DEVICE, no 3rd party
- Triggered when activating a device for the **first time**.
- Steps:
  1. User signs up.
  2. User uploads a photo of their **government-issued ID**.
  3. User takes a **selfie** (live capture, similar to Apple Face ID enrollment UX).
  4. The app verifies **face(ID photo) == face(selfie)** locally, in-app.
  5. The app reads the **date of birth / age** from the ID and confirms **18+**.
- **Constraint:** verification (face match + age extraction) must run inside the app —
  **no third-party verification service.**
- The purpose of verification is strictly **age (18+)** confirmation.

### Device locking / unlocking (proximity-based)
- After age is verified, the user can **unlock** the device for the first time.
- Thereafter the user can **lock/unlock** the device while the phone is **within BLE range**.
- When the phone goes **out of BLE range**, the device **auto-locks itself**.

## 4. Hard constraints
- Must ship on **both iOS and Android**.
- Age + identity matching performed **locally / in-app** (no external KYC vendor).
- Verifying **age ≥ 18** is the goal (DOB on ID must show 18+).
- Lock state tied to BLE proximity; auto-lock on range loss.

## 5. Locked decisions (confirmed with client-side stakeholder)
| Area | Decision |
|---|---|
| App framework | **React Native** (single codebase iOS + Android) |
| Age/identity verification | **On-device ML** — Apple Vision (iOS) + Google ML Kit (Android). No data leaves device, no KYC vendor |
| Backend / accounts | **Supabase** — auth, user/device DB, push. Postgres RLS enforces device ownership server-side |
| Device authentication | **AES-128-CMAC** challenge–response. The YC1012_JD has a hardware AES-128 block and no ECC accelerator |
| Firmware / BLE protocol | **We define** the BLE GATT lock/unlock + dead-man auto-lock spec; **their firmware team implements** it. Firmware dev is out of our base scope |
| Timeline | **30 days** |

See [`TECHNICAL_SPEC.md`](TECHNICAL_SPEC.md) for the full architecture, BLE interface spec, and
security model; [`project-roadmap-todos/ROADMAP.md`](project-roadmap-todos/ROADMAP.md) for the
30-day plan; and `../Project_Bluesmoke - Nepa.works App - PRD - Master Scope - Internal.xlsx` for
the client-facing work breakdown.

## 6. Still-open items to confirm with client

Tracked in full as the open-questions register in
[`TECHNICAL_SPEC.md` §13](TECHNICAL_SPEC.md#13-open-questions-register). The critical ones:

- **OQ-1** 🔴 Physical device + sample government IDs — needed by **Day 15** (IDs) and **Day 26** (device), not week 6.
- **OQ-2** 🔴 Manual-review fallback policy for legitimate verification false-rejects.
- **OQ-4** 🔴 Who burns the per-device root key into OTP at manufacture, and how the key manifest reaches us.
- **OQ-3** Target markets/countries (affects accepted ID types + OCR + privacy law: GDPR/CCPA).
- **OQ-8** Apple + Google developer account ownership and signing assets.

⚠️ Also needing agreement in Week 1: **"live on both stores" by Day 30 restated as "submitted
by Day 30."** Store review is 1–7 days and an age-restricted product draws extra scrutiny — see
[`ROADMAP.md` §5.1](project-roadmap-todos/ROADMAP.md).
