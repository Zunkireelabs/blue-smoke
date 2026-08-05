# Blue Smoke — Architecture Sign-Off

**Task:** `P0-1.0` — System Architecture & Data-Flow Design
**Date:** 2026-08-05 · **Status:** approved
**Full technical detail:** [`TECHNICAL_SPEC.md`](TECHNICAL_SPEC.md) — this document is the summary.

---

## 1. What this document is

The architecture for the Blue Smoke app is designed, documented, and internally consistent. This
page is the **record of what we are building and why** — written to be read in ten minutes rather
than the 65 KB specification behind it.

It covers three things that matter to you and are not obvious from a feature list:

1. **The privacy model**, and the product constraints it imposes — some are permanent
2. **Two commitments the architecture requires from your side** — without them it does not work
3. **Three risks we are accepting**, deliberately, with reasons

---

## 2. What we are building

| | Pillar | In one line |
|---|---|---|
| **P1** | Accounts & device management | Users register, sign in, and pair multiple devices. Ownership is enforced on the server, not the phone. |
| **P2** | On-device 18+ age verification | ID capture → date of birth → selfie + liveness → face match, **entirely on the phone**. No third party, nothing uploaded. |
| **P3** | Proximity lock/unlock | Authenticated Bluetooth lock/unlock. The device locks **itself** when the phone leaves range. |

---

## 3. The system

```
┌──────────────────────────────────────────────────────────────────────┐
│                       PHONE  (React Native app)                      │
│                                                                      │
│   ┌──────────────────┐  ┌─────────────────┐  ┌───────────────────┐   │
│   │  Verification    │  │ BLE controller  │  │  Session store    │   │
│   │  ID · selfie ·   │  │ scan · pair ·   │  │  Keychain /       │   │
│   │  face match      │  │ proximity       │  │  Keystore         │   │
│   └────────┬─────────┘  └────────┬────────┘  └─────────┬─────────┘   │
│            │                     │                     │             │
│      pass / fail             Bluetooth            session key        │
│        ONLY                    (§4)                                  │
└────────────┼─────────────────────┼─────────────────────┼─────────────┘
             │                     │                     │
             │  HTTPS / TLS 1.3    │                     │  HTTPS / TLS 1.3
             ▼                     │                     ▼
┌──────────────────────────┐       │       ┌─────────────────────────────┐
│        SUPABASE          │       │       │  Key-issuing function       │
│  Accounts · database ·   │◄──────┼──────►│  Checks age + ownership     │
│  push notifications      │       │       │  BEFORE issuing any key     │
│                          │       │       └─────────────────────────────┘
│  Stores: age-verified    │       │
│    flag, who owns what   │       │
│  NEVER: images, faces    │       │
└──────────────────────────┘       │
                                   ▼
                    ┌──────────────────────────────────┐
                    │      BLUE SMOKE DEVICE           │
                    │      YC1012_JD  +  Cortex-M0+    │
                    │                                  │
                    │   Root key in one-time memory    │
                    │   Auto-lock timer runs on the    │
                    │     device, not the phone        │
                    │   NEVER sees: personal data,     │
                    │     the internet                 │
                    └──────────────────────────────────┘
```

**The single most important property:** the device's auto-lock timer runs **in the device's own
firmware**. It does not depend on the phone being awake, in range, or even still running. That is
what makes the safety behaviour trustworthy.

---

## 4. How it works — the three flows

### Flow A · Age verification (once per user)

```
  ID photo ──► read date of birth ──► 18 or over?  ─┐
                                                    │
  Selfie ──► liveness check ──► face features ──────┤
                                                    ▼
          does the ID face match the selfie face? ──► PASS / FAIL
                                                         │
   ┌─────────────────────────────────────────────────────┤
   │  everything above is ERASED FROM MEMORY here        │
   │  images · face data · date of birth — all gone      │
   └─────────────────────────────────────────────────────┤
                                                         ▼
                                   server stores only: "verified, 18+"
```

**Nothing leaves the phone except the word "pass".** No image is ever uploaded, saved to storage,
or written to a log — not even if the app crashes mid-capture.

### Flow B · First activation of a device (once per device, needs internet)

```
  Phone pairs with device over Bluetooth
        │
        ▼
  Phone asks the server for a key
        │
        ├──► server checks: is this user age-verified?     ── no ──► REFUSED
        ├──► server checks: does this user own this device? ── no ──► REFUSED
        │
        ▼
  Server derives a SESSION key from the device's root key
  and sends only the session key to the phone
        │
        ▼
  Phone stores it in secure hardware storage (fingerprint / face gated)
        │
        ▼
  Device is activated
```

The age check happens **on the server**, every time, before any key is issued. A tampered phone
cannot skip it.

### Flow C · Everyday unlock (works with no internet)

```
  Phone connects  ──►  device sends a one-time challenge
        │
        ▼
  Phone proves it holds the session key
        │
        ▼
  Device verifies and unlocks  ──►  reports its state back
        │
        ▼
  ┌──────────────────────────────────────────────────────────┐
  │  Phone walks away / battery dies / app is force-quit     │
  │            ▼                                             │
  │  DEVICE'S OWN TIMER counts down and locks it             │
  │  (default 5 seconds — no phone involvement at all)       │
  └──────────────────────────────────────────────────────────┘
```

Routine unlocking needs **no internet connection**. The device can re-derive the session key
itself, which is why it never needs to be online.

---

## 5. The privacy model — and what it permanently costs

Three rules are absolute in this architecture:

| # | Rule | What it means for the product |
|---|---|---|
| **1** | No ID image, selfie, or face data is ever saved, logged, or transmitted | Held in memory only, erased immediately after the decision |
| **2** | The device's root key never leaves the server | The phone only ever holds a limited, expiring, revocable session key |
| **3** | Age verification is re-checked on the server before any privileged action | A tampered app cannot unlock anything |

> ### ⚠️ Please read this one carefully
>
> Rule 1 means **there is no audit trail of who was verified.** We keep the fact that a user
> passed, when, and by which method — but **no image, no name, no date of birth, no ID number.**
>
> If you are ever asked to *prove* that a specific person was age-checked, the answer is a
> timestamped flag, not a document. That is the direct and permanent cost of the "nothing leaves
> the phone" guarantee you asked for. It cannot be added retroactively — the data was never
> captured.

---

## 6. ⚠️ What the architecture needs from you

**These two are not optional.** The design does not function without them, and neither is
something we can do from our side.

### 6.1 Factory: the root key must be programmed at manufacture

```
   MANUFACTURE                    OUR SERVER                    IN THE FIELD
   ───────────                    ──────────                    ────────────
   root key burned    ──────►     same key stored     ──────►   phone gets only a
   into the chip's                securely, never                short-lived derived
   one-time memory                sent to any phone              key. Device checks it
                                                                 offline.
        │
        └── if this step does not happen, there is nothing to verify against
            and the device cannot be trusted to unlock for the right person
```

**We need:** confirmation of who performs this at the factory, and how the list of
device-key pairs is securely delivered to us. *(Open question **OQ-4**.)*

> This takes longer to arrange than to implement, which is why we are raising it now rather than
> near integration. It is the single item most likely to affect the delivery date.

### 6.2 Firmware: your team implements the Bluetooth specification

We have written the complete Bluetooth interface specification (§4 of the technical spec) —
every command, byte layout, and required behaviour. **Your firmware team implements it.** Firmware
development is not in our scope.

The specification includes ten mandatory safety behaviours, of which these four are the ones that
make the product safe:

| | Requirement |
|---|---|
| **Locked by default** | Any power-on, reset, or battery brownout leaves the device **locked**. Unlocked state is never remembered across a restart. |
| **Auto-lock timer** | On disconnect the device locks itself after a set grace period. The timer runs off the device's own clock and **survives sleep**. |
| **Fails closed** | Any crash, fault, or watchdog reset leaves the device **locked**. |
| **Reconnecting is not enough** | Re-establishing Bluetooth does *not* cancel the countdown. Only a successful key exchange does — so an attacker forcing a reconnect cannot keep it unlocked. |

**We need:** confirmation your firmware team will implement to this specification, and their
availability for a walkthrough. *(Open question **OQ-6**.)*

---

## 7. Risks we are accepting

Stated plainly so there are no surprises later.

| Risk | Why it exists | What reduces it |
|---|---|---|
| **Relay attack** | Someone relaying the Bluetooth signal between a distant phone and the device could hold it unlocked. Fully solving this needs cryptographic distance measurement the chip cannot do. | Short 4-second connection timeout, signal-strength thresholds, and a deliberate refusal to use long-range Bluetooth. |
| **Revocation delay when offline** | If a session is revoked, an offline device keeps accepting it until it expires. | This is the direct cost of offline unlocking, which the product requires. Capped at 90 days — **we recommend 30**, if more frequent online check-ins are acceptable. |
| **On-device matching accuracy** | On-phone face matching will not match a specialist identity vendor. | Your requirement, in exchange for the privacy guarantee. Managed with measured accuracy targets and a manual fallback for wrongly-rejected users. |

> **A note on range.** We deliberately do **not** use long-range Bluetooth, even though the chip
> supports it. Longer range means the device stays unlocked further from its owner. On this
> product, range is a safety setting — not a feature.

---

## 8. Not included

So "out of scope" is unambiguous later. Each is available as a separately-quoted addition.

❌ Firmware development · ❌ Any third-party or government ID-verification service ·
❌ Cloud-based document reading or face matching · ❌ Admin web panel ·
❌ Analytics or crash reporting · ❌ Advanced anti-spoofing ·
❌ Social / single-sign-on login · ❌ Sharing one device between accounts ·
❌ Retaining ID images for audit · ❌ Re-verification scheduling

**One honest limitation:** if the phone's operating system fully terminates the app, we cannot
guarantee the app reacts to going out of range. This is why the device's own auto-lock timer
exists — the safety behaviour never depends on the app being alive.

---

## 9. ⚠️ Scope change requiring your agreement

**Phone number + OTP login**, added alongside email + password.

This was raised and confirmed internally on 2026-08-05, and is **an addition beyond the agreed
project scope**. We are flagging it now rather than at delivery:

| | |
|---|---|
| **What it adds** | Users can sign up and sign in with a phone number and an SMS code, as an alternative to email + password. Both resolve to one account. |
| **Effort** | **+2.0 person-days** (the task grows 2.5 → 4.5) |
| **New dependency** | **Twilio Verify** for SMS delivery — a third-party service with a per-message cost and an account that needs an owner |
| **Blocked by** | **OQ-3, target markets.** SMS deliverability, cost, and regulation are country-specific. This cannot be reliably built until launch countries are confirmed. |

**We need from you:** agreement that the additional effort is accepted, and a decision on who owns
and pays for the Twilio account.

*Security note, for the record:* signing in by phone or email **never automatically merges into an
existing account**. Linking the two is only ever a deliberate action from an already-signed-in
session. This prevents a resold phone number or a compromised mailbox from inheriting someone
else's account.

---

## 10. Sign-off record

| Item | Status |
|---|---|
| Component architecture, trust boundaries, data flows | Documented — §2 of the technical spec |
| Hardware constraints analysed | Documented — §3 |
| Security approach (AES-128-CMAC, chosen for this chip) | Documented and justified — §3.1 |
| Key hierarchy, offline unlock model | Documented — §4.5 |
| Internal consistency audit | Complete — four inconsistencies found and corrected |
| **Stakeholder approval** | **Approved 2026-08-05.** Foundational decisions previously confirmed and recorded in `PROJECT_BRIEF.md` §5. |

### Outstanding, and being chased separately

| | Needed by |
|---|---|
| **OQ-4** Factory root-key programming *(§6.1 — critical)* | Immediately |
| **OQ-6** Firmware team confirmation *(§6.2 — critical)* | Immediately |
| **OQ-1** Physical device and sample IDs | IDs by day 15, device by day 26 |
| **OQ-2** Fallback process for wrongly-rejected users | Before verification ships |
| **OQ-3** Target markets *(also blocks §9)* | Before verification ships |
| **OQ-8** Apple / Google developer accounts | Before first test build |
| §9 Phone + OTP effort and Twilio ownership | Before that work starts |
