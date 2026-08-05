# Blue Smoke — Project Brief

> Status: client brief captured. Technical plan to follow.

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
| Backend / accounts | **Managed BaaS** (Supabase or Firebase): auth, user/device DB, push |
| Firmware / BLE protocol | **We define** the BLE GATT lock/unlock + dead-man auto-lock spec; **their firmware team implements** it. Firmware dev is out of our base scope |
| Timeline | **2 months (~8 working weeks)** |

See `../../../.claude/plans/now-give-me-a-precious-dusk.md` for the full architecture, WBS, and
timeline, and `Blue Smoke - WBS - Master Scope.xlsx` for the client-facing work breakdown.

## 6. Still-open items to confirm with client
- Target markets/countries (affects accepted ID types + OCR + privacy law: GDPR/CCPA).
- Manual-review fallback policy for legitimate verification false-rejects.
- Physical device + sample government IDs available for testing by ~week 6.
