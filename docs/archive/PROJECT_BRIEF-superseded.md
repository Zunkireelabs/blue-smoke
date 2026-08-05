> # ⚠️ SUPERSEDED — DO NOT BUILD FROM THIS DOCUMENT
>
> **Status:** Archived on 2026-08-05. Retained for historical context only.
>
> This was an **early internal exploration** written before the client-side stakeholder
> locked the architecture. Several of its central proposals were **rejected** and must not
> be reintroduced:
>
> | This doc proposed | Actual locked decision | Where it lives now |
> |---|---|---|
> | Persona (3rd-party KYC vendor) | **On-device ML only** — Apple Vision + Google ML Kit. No KYC vendor, no data leaves the phone. | `../TECHNICAL_SPEC.md` §6 |
> | Node + Fastify + PostgreSQL + Redis, self-hosted on Fly.io | **Supabase** (managed BaaS) | `../TECHNICAL_SPEC.md` §5 |
> | Ed25519 signature verification on the MCU | **AES-128-CMAC** challenge–response. The YC1012_JD has an AES-128 hardware block and no ECC accelerator; Ed25519 is the wrong primitive for this silicon. | `../TECHNICAL_SPEC.md` §4 |
> | We write the device firmware | **We author the BLE GATT interface spec; the client's firmware team implements it.** Firmware development is an out-of-scope add-on. | `../TECHNICAL_SPEC.md` §4 |
> | 12 weeks to pilot | **30 days** | `../project-roadmap-todos/ROADMAP.md` |
> | Backend-signed unlock tokens minted per unlock (device online-dependent) | Server-issued **session key** at activation; unlock works offline in range thereafter | `../TECHNICAL_SPEC.md` §4.5 |
>
> **Two ideas from this document did survive** and were carried into the live spec:
> per-unlock **nonce/challenge replay protection**, and **key rotation** support so a key
> compromise cannot brick the fleet.
>
> The live documents are:
> - `../PROJECT_BRIEF.md` — client-facing brief
> - `../TECHNICAL_SPEC.md` — the build contract
> - `../project-roadmap-todos/ROADMAP.md` — the 30-day plan
>
> ---

# Project Brief — Age-Gated BLE Device + Companion App

> Internal discussion document. Not final spec. Goal: align the team on architecture, stack, and phased plan before we cut code.

---

## 1. What we're building

A consumer hardware product built around the **YC1012_JD** SoC (ARM Cortex-M0+, BLE 5.4 dual-mode, audio I/O) that will not function until the end user passes **government-ID + selfie/liveness age verification** on a companion smartphone app.

The device itself is intentionally "dumb-but-secure": it only unlocks after receiving a cryptographically signed token from our backend, delivered via the phone over Bluetooth.

---

## 2. The constraint that decides the architecture

The YC1012 is a low-power MCU:

- 32-bit Cortex-M0+ @ 24 MHz
- 4 MB internal flash, 8 KB DTCM RAM
- BLE 5.4 (BR/EDR + LE), audio DAC + MIC bias
- No camera, no display, no network

It physically **cannot** run ID OCR, face matching, or liveness. This is not a preference — it is the hard constraint that forces a three-tier design.

---

## 3. Architecture

```
 ┌───────────┐    ID + selfie     ┌──────────────┐
 │ Phone app │ ─────────────────► │ KYC provider │
 └─────┬─────┘  ◄── pass/fail ─── └──────┬───────┘
       │                                 │ webhook
       │                                 ▼
       │                          ┌──────────────┐
       │ ◄── signed unlock token  │   Backend    │
       │                          └──────────────┘
       │ BLE: challenge → token
       ▼
 ┌──────────────┐
 │ YC1012 device│  verifies Ed25519 signature, unlocks
 └──────────────┘
```

**Core principle:** the device never sees PII. The backend stores only a user hash + verification expiry. The KYC vendor holds the ID image. This is our legal-liability firewall.

---

## 4. Recommended tech stack

| Layer | Pick | Why |
|---|---|---|
| KYC / ID + face | **Persona** | Best DX, flexible flows, fair startup pricing, multi-jurisdiction. Stripe Identity if cost-sensitive; Veriff / Onfido / Incode for heavily regulated verticals. |
| Mobile app | **React Native + Expo Dev Client** | One codebase, native BLE works, fast hiring. (Vanilla Expo Go won't work — we need native modules.) |
| BLE on phone | `react-native-ble-plx` | Mature, well-supported. |
| Backend | **Node + TypeScript (Fastify) + PostgreSQL + Redis** | Lean, fast, easy to hire for. |
| Signing | **Ed25519** via libsodium | Small signatures, fast verify, fits MCU RAM budget. |
| Firmware | **C on YC1012 vendor SDK + monocypher** for Ed25519 verify | Audited crypto, minimal RAM footprint. |
| Hosting | **Fly.io** to start; AWS if compliance forces it | Cheap, scales fine for pilot. |
| App ↔ backend auth | Email/phone OTP + device-bound session | No password storage. |

---

## 5. The unlock flow (security spine)

1. Phone pairs to device over BLE.
2. Device sends a fresh **nonce** (challenge).
3. Phone forwards nonce → backend.
4. Backend checks the user's current KYC status, signs `{deviceId, userHash, nonce, expiry}` with Ed25519.
5. Phone delivers signed token over BLE.
6. Device verifies signature with the embedded public key, unlocks until `expiry`.

Properties:

- **Replay-proof** (per-unlock nonce)
- **PII-free on device** (only a hash)
- **Key-rotatable** — we will embed **two** public keys in v1 firmware so we can rotate without bricking the fleet

---

## 6. Phased plan (12 weeks to pilot)

| Phase | Weeks | Deliverable |
|---|---|---|
| 0. Legal scope | 1 | Vertical + jurisdictions locked. Drives KYC vendor, retention, re-verification cadence. **Do not skip.** |
| 1. Mobile + KYC prototype | 2–4 | RN app → Persona flow → backend stub mints fake token. No hardware. |
| 2. Backend + signing service | 3–5 (parallel) | Token format, key management, audit log. |
| 3. Firmware BLE + verify | 4–8 | Custom GATT service, Ed25519 verify, pair/unlock on dev kit. |
| 4. Integration | 8–10 | End-to-end on real hardware. |
| 5. Closed pilot + cert prep | 10–12 | Beta users, FCC/CE/BQB prep for BLE. |

GA target: 4–6 months after pilot, gated by certification.

---

## 7. Decisions we need to make now

1. **Vertical + jurisdictions** (legal) — drives every downstream choice.
2. **Re-verification cadence.** Options:
   - Once at pairing (weakest)
   - Pair + every 30/60/90 days (recommended)
   - Every session (strongest, most annoying)
   - **Recommendation:** pair-time + 90-day re-check.
3. **Account model.** One user per device, or transferable?
   - **Recommendation:** one user, transferable only via re-KYC.
4. **Offline policy.** Does the device keep working without the phone after first unlock?
   - **Recommendation:** yes, until token `expiry`, then locks.
5. **Vendor lock-in tolerance** for KYC (Persona vs. self-hostable alternative).

---

## 8. Team & rough cost

**Team (pilot phase):**

- 1 × Mobile (React Native)
- 1 × Backend (Node/TS)
- 1 × Firmware (C / BLE)
- 1 × PM + legal liaison
- Fractional designer

**Costs (order of magnitude):**

- KYC: ~$1–2 per verification (Persona)
- Hosting: <$200/mo at pilot scale
- BLE certification (BQB): ~$8–15k one-time
- FCC/CE: varies by hardware

---

## 9. Top risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Wrong legal cadence | Fines, pulled from market | Lawyer engaged in week 1; jurisdiction matrix before code |
| Key rotation impossible on shipped firmware | One key leak bricks the fleet | Dual-key support in v1 firmware |
| BLE pairing mistaken for auth | Anyone in range bypasses | Signed-token gate is mandatory; never trust pairing alone |
| KYC vendor outage | Users can't unlock | Cache verified status server-side; fail-closed but with grace window |
| PII on device | GDPR/CCPA exposure | Architecturally impossible — device only ever sees hashes |

---

## 10. Open questions for the team

- What is the product vertical? (Determines regulatory regime.)
- Which markets at launch?
- Is there an offline-first requirement we need to design around?
- Hardware reference design — do we have a dev kit for the YC1012_JD yet?
- Are we building our own enclosure / PCB, or partnering with an ODM?
- Branding / app name?

---

## 11. The recommendation in one paragraph

Lock the vertical and jurisdictions this week. Pick **Persona** for KYC, **React Native + Expo Dev Client** for the app, **Node/Fastify + Postgres** for the backend, and **C + monocypher** on the YC1012 for Ed25519 signature verification. Build the mobile + backend tracks in parallel weeks 2–5, firmware track weeks 4–8, integrate weeks 8–10, pilot at week 12. The device never sees PII; trust flows from KYC → backend signature → on-device verify. This is the lowest-risk, fastest-to-market, most legally defensible path.
