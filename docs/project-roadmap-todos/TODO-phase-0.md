# Phase 0 — Foundation, Architecture & Integration

**PRD effort:** 18.0 person-days / 144 hours · **Roadmap block:** A (Days 1–6)
**Spec:** [`../TECHNICAL_SPEC.md`](../TECHNICAL_SPEC.md) · **Roadmap:** [`ROADMAP.md`](ROADMAP.md)

> **Goal (PRD verbatim):** Stand up the app skeleton, managed backend, security model, and the
> BLE lock/unlock interface specification before any feature work begins. This phase locks the
> architecture, hands a clear BLE protocol to the client's firmware team, and gets the app
> building on both iOS and Android.

**Progress:** 1 / 7 tasks · 26 / 78 sub-tasks

> **Denominator corrected — it was never 62.** Counting the boxes under the seven PRD tasks
> (`P0-1.0`, `2.0`, `3.0`, `4.0`, `5.0`, `6.0`, `7.0`) gives **76**, and has since this file was
> written; `62` appears to have been an estimate that was never reconciled against the list.
> The two *added* tasks — `P0-2.5` and `P0-4.5`, neither of which is a PRD line item — are
> deliberately outside this count and tracked in their own sections. **`P0-3.0` grew +2** —
> the two Edge Functions (spec §5.4/§5.4.1) were always in scope but missing from this list;
> now **78**.
>
> **Ticked so far:** `P0-1.0` 8 · `P0-4.0` 8 · `P0-2.0` 10 → 26. Only `P0-1.0` is a *completed
> task*. `P0-4.0` holds two physical-device boxes open (no Android toolchain, no iOS simulator
> runtime on the machine it was built on) and `P0-2.0` holds three open pending the firmware
> team (OQ-6). `P0-3.0` itself has real, unreflected progress sitting on the unmerged
> `feature/P0-3.0-baas-setup` branch (schema + RLS + Vault applied and proven on dev and
> staging) — not ticked here yet since nothing on that branch has landed via a PR.

---

## 🔥 Day-1 escalations (not a PRD line item — do them anyway)

- [ ] **OQ-4** raised with client in writing: who burns `K_dev` into device OTP at manufacture, and how is the key manifest delivered to us? 🔴
- [ ] **OQ-1** raised with client in writing: dates for physical device + physical sample IDs 🔴
- [ ] **OQ-2** raised: manual-review fallback policy — owner, channel, SLA 🔴
- [ ] **OQ-6** raised: who is our firmware counterpart, and when can they take a 60-minute §4 walkthrough? 🔴 *(blocks the last three `P0-2.0` boxes and milestone **M2**, which has already slipped — see below)*
- [ ] **OQ-8** raised: Apple + Google developer account ownership and signing assets
- [ ] **§5.1 of the roadmap** raised: "live on stores by Day 30" restated as "submitted by Day 30"
- [ ] Started collecting the labelled face-match test set (§6.3) — do not wait for Day 13

---

## P0-1.0 — System Architecture & Data-Flow Design
`Architecture` · `Mobile + Backend` · **High** · **3.0 d** · Owner: M1 + B1

> Define the full app–backend–BLE-device architecture, including data-flow diagrams, the
> privacy-by-design model (no raw ID/biometric data leaves the device), and the integration
> blueprint for all later phases.

- [x] Component architecture documented (spec §2.1)
- [x] Trust boundaries defined, incl. the three inviolable rules (spec §2.2) *(corrected — audit finding 4)*
- [x] Data flows A (verification), B (activation), C (unlock) documented (spec §2.3) *(corrected — audit findings 1–3)*
- [x] Hardware constraints analysed from the YC1012_JD + Cortex-M0+ datasheets (spec §3)
- [x] Crypto primitive selected and justified — **AES-128-CMAC, not Ed25519** (spec §3.1)
- [x] Key hierarchy designed: `K_dev` (OTP + server) → `K_sess` (app) (spec §4.5)
- [x] Offline-unlock model confirmed: device derives `K_sess`, needs no network
- [x] **Architecture approved by all stakeholders** ← gate for Phase 1 *(approved 2026-08-05; foundational decisions previously confirmed with the client-side stakeholder and recorded in `PROJECT_BRIEF.md` §5)*

**Consistency audit:** [`docs/audits/P0-1.0-consistency-audit.md`](../audits/P0-1.0-consistency-audit.md) — five
cross-checks, four findings, all corrected. Finding 1 was critical: §2.3 Flow B derived `K_sess`
with the wrong HKDF parameters, which would have failed every authentication on real hardware.

**Client-facing record:** [`docs/ARCHITECTURE-SIGNOFF.md`](../ARCHITECTURE-SIGNOFF.md) — written, **not yet sent**.
The Day-1 escalation boxes above become tickable when it goes out.

**Assumption:** client confirms BaaS choice and device hardware. → *Supabase confirmed; YC1012_JD confirmed.*
**Excludes:** infrastructure procurement / hosting.
**Risk:** architecture gaps discovered late once firmware constraints are known.

---

## P0-2.0 — BLE Interface Spec (Lock/Unlock + Dead-Man Auto-Lock) 🔴 CRITICAL PATH
`BLE` · `Backend` · **High** · **3.0 d** · Owner: M1

> Author the custom GATT service contract for the firmware team: lockState (read/notify),
> lockCommand (authenticated write), and auth/session pairing token, plus the firmware-side
> auto-lock-on-disconnect behaviour.

- [x] Service + characteristic UUIDs allocated (spec §4.2)
- [x] Advertising format defined, incl. manufacturer data and TX power (spec §4.1)
- [x] `deviceInfo` byte layout defined (spec §4.3)
- [x] `lockState` byte layout defined, incl. battery + lock reason (spec §4.4)
- [x] Auth challenge–response handshake specified (spec §4.5) *(corrected in v1.2 — `info` no longer binds values the device is never sent; `expiresAtDelta` now inside the proof CMAC)*
- [x] `lockCommand` format + all 7 command IDs specified (spec §4.6) *(corrected in v1.2 — tag input is now `N ‖ bytes[0..11]`)*
- [x] `commandResult` + all 10 result codes specified (spec §4.7)
- [x] **Firmware obligations F1–F11 specified** — locked-by-default, dead-man timer, fail-closed, backoff, constant-time compare, connection-scoped command tags (spec §4.8) *(F11 added in v1.2)*
- [x] Connection parameters specified, incl. the deliberate refusal of Long Range PHY (spec §4.9)
- [x] Acceptance tests `FW-01`–`FW-18` written (spec §4.10) *(FW-16/17/18 added in v1.2)*
- [ ] Spec walkthrough session held with the client's firmware team ← **blocked on OQ-6**
- [ ] **Written acknowledgement received from the firmware team** ← M2 milestone — **⚠️ MISSED, was Day 6**
- [ ] `protocolVersion 0x01` frozen; change process agreed ← the change process is written into §4's header; the *freeze* is bilateral and has not happened

**Status: 10 / 13 — the spec is written; the handoff has not happened.**

The ten authoring boxes are ticked against real §4 content, verified section by section. The three
open boxes all need a firmware counterpart nobody has contacted yet — that is **OQ-6**, now added
to the Day-1 escalations above. The review window the roadmap allocated (Days 3–5) has passed
unused, so **M2 has slipped**; it is not recoverable by working harder on our side.

**§4 is not frozen, and that is currently load-bearing.** Version 1.2 corrected three auth defects
in place at `protocolVersion 0x01` — legitimately, because nothing implements `0x01` yet, so a bump
would mint a version no party speaks. **That exemption ends at M2.** Once the firmware team
acknowledges §4, any change requires a version bump and written notice, per §4's header.

**Assumption:** firmware team will implement to our spec and is available for review. *(Unvalidated — OQ-6.)*
**Excludes:** firmware development on the device itself.
**Risk:** spec ambiguity causing firmware/app mismatch at integration. **Now compounded:** every day
§4 goes unacknowledged is a day `P0-2.5`, `P1-4.0` and `P3-2.0` build against an unratified contract.

---

## P0-2.5 — Mock BLE Peripheral 🔥 *(added — not in PRD, highest-leverage item in the plan)*
`BLE` · `Tooling` · **Medium** · **1.0 d** *(absorbed into P0-2.0 buffer)* · Owner: M1

> Not a client deliverable. It is what makes Phases 1 and 3 buildable before hardware exists.
> See spec §11.1.

- [ ] Peripheral implements the full §4 GATT surface
- [ ] Auth handshake implemented, incl. the CMAC path
- [ ] All 7 commands implemented
- [ ] **All failure paths simulable:** `AUTH_FAILED`, `REPLAY`, `RATE_LIMITED`, `SESSION_EXPIRED`, `NOT_ACTIVATED`, `FAULT`
- [ ] Dead-man auto-lock timer simulated on disconnect
- [ ] Battery drain + low-battery flag simulable
- [ ] RSSI variation simulable for proximity testing
- [ ] Documented in the repo README so any dev can run it

---

## P0-3.0 — BaaS Setup: Auth, DB Schema & Push
`Backend` · `Backend` · **Medium** · **2.0 d** · Owner: B1

> Provision the managed backend: authentication, the users/devices/verification-flag database
> schema, and push (FCM/APNs). Backend stores only an age_verified boolean + timestamp/method
> — never raw documents or biometrics.

- [ ] Three Supabase projects provisioned: dev / staging / prod
- [ ] Auth configured: email/password + password-reset email flow
- [ ] Schema written as versioned migrations (spec §5.2) — `profiles`, `verifications`, `devices`, `device_ownership`, `device_keys`, `device_sessions`, `push_tokens`, `audit_log`
- [ ] **`verifications` contains no DOB, name, ID number, image, or embedding column** — verified by schema review
- [ ] RLS enabled on **every** table (spec §5.3)
- [ ] RLS policies written for all tables
- [ ] **`device_keys` has RLS enabled and zero policies** (deny-all to clients) — verified
- [ ] RLS **tested with a second user's JWT** — cross-user reads must fail
- [ ] Supabase Vault configured for `K_dev` wrapping
- [ ] APNs + FCM credentials configured
- [ ] Migration workflow documented; no dashboard schema edits
- [ ] Edge Function `issue-device-session` implemented (spec §5.4) — the sole path from `K_dev`
      to anything outside the database; this is where the server-side `age_verified` gate
      (CLAUDE.md rule 3) actually runs
- [ ] Edge Function `revoke-device-session` implemented (spec §5.4.1)

*(Two boxes above added — spec'd in §5.4/§5.4.1 but missing from this list since the file was
written; flagged in `supabase/README.md` on `feature/P0-3.0-baas-setup` rather than built
silently under the task.)*

**Assumption:** client provides or approves the BaaS account and billing.
**Excludes:** self-hosted backend infrastructure.
**Risk:** vendor limits or quota on auth/push at scale.

---

## P0-4.0 — RN App Scaffold, Navigation & Native Module Wiring
`App` · `Mobile (iOS+Android)` · **Medium** · **2.5 d** · Owner: M3

> Set up the React Native + TypeScript project, navigation structure, and wiring for native
> modules: BLE (react-native-ble-plx), camera (vision-camera), on-device ML, and secure
> storage (Keychain/Keystore).

- [x] RN bare project + TypeScript `strict: true`
- [x] Module layout created per spec §9.2
- [x] React Navigation (native stack) configured
- [x] TanStack Query + Zustand wired
- [ ] `react-native-ble-plx` integrated, building on both platforms *(installed + configured; not build-verified — no JDK/Android SDK/Xcode on this machine, see P0-4.0 report)*
- [ ] `react-native-vision-camera` integrated, building on both platforms *(installed + configured; not build-verified — same reason)*
- [ ] `react-native-keychain` integrated, hardware-backed verified *(installed; hardware-backed accessibility set at call sites in P1-4.0, not build-verified)*
- [x] `@supabase/supabase-js` integrated
- [x] Native ML bridges scaffolded — Swift (Vision) + Kotlin (ML Kit), one shared TS interface *(M2)*
- [x] `features/ble/protocol.ts` created as the single home for all §4 constants
- [x] **ESLint `no-restricted-imports` rule blocking logging/analytics/persistence inside `features/verification/`** (spec §9.2)
- [ ] Runs on a physical iOS device
- [ ] Runs on a physical Android device

**Assumption:** single shared codebase targeting current iOS and Android versions.
**Excludes:** native OS-specific custom UI beyond agreed screens.
**Risk:** native module incompatibilities across RN versions.

---

## P0-4.5 — Background BLE Spike 🔥 *(added — de-risks the PRD's own "known hard problem")*
`BLE` · `Mobile` · **High** · **1.5 d** *(Days 1–3)* · Owner: M1

> `P3-4.0` is flagged in the PRD as "one of the two known hard problems — early spikes
> planned." This is that spike. Doing it in Block A rather than Block D is the difference
> between an adjustment and a crisis.

- [ ] iOS: `bluetooth-central` background mode + state restoration proven working
- [ ] iOS: behaviour after force-quit documented honestly
- [ ] Android: foreground service (type `connectedDevice`) proven working
- [ ] Android: battery-optimisation exemption flow proven
- [ ] Android: behaviour on an aggressive-OEM device (Xiaomi/OnePlus) documented
- [ ] **Written spike report** with what is guaranteed vs. best-effort per platform
- [ ] Findings folded back into spec §7.4 and the client-facing claim

---

## P0-5.0 — CI/CD + Dev / Staging / Prod Build Pipelines
`DevOps` · `Backend` · **Medium** · **2.5 d** · Owner: B1

> Configure Development, Staging, and Production environments with automated iOS and Android
> build, signing, and deployment pipelines (TestFlight / Play Internal Testing for staging).

- [ ] Three environments configured with distinct bundle IDs (spec §10.1)
- [ ] Env config + secret management, nothing committed
- [ ] Secret-scanning step in CI
- [ ] PR pipeline: typecheck → lint → unit tests → build both platforms
- [ ] iOS signing via App Store Connect API key
- [ ] Android signing via Play service account
- [ ] `main` merge → TestFlight + Play Internal Testing
- [ ] Tag `v*` → production build behind a manual approval gate
- [ ] Remote-config table + client cache implemented (spec §10.2)
- [ ] **Staging verified to mirror production, including RLS policies**

**Assumption:** client provides Apple and Google developer accounts and signing assets. *(OQ-8)*
**Excludes:** ongoing hosting / account cost management.
**Risk:** code-signing and provisioning friction, especially iOS.

---

## P0-6.0 — Privacy & Security Design
`Security` · `Mobile + Backend` · **High** · **2.0 d** · Owner: M1 + B1

> Design the security model: on-device-only processing of ID/selfie/biometrics, encrypted
> secure storage of tokens, HTTPS everywhere, and the deletion policy that runs after each
> verification decision.

- [ ] Data classification defined — 🔴 never-persisted / 🟠 secret-at-rest / 🟡 server-only / 🟢 ordinary (spec §8.1)
- [ ] Secure storage design: Keychain `WhenUnlockedThisDeviceOnly` / Android Keystore, biometric-gated
- [ ] **"Bonding is not authorisation" documented and understood by the whole team** (spec §8.2)
- [ ] Threat model completed (spec §8.3)
- [ ] Key rotation strategy defined given one-time-programmable OTP (spec §8.4)
- [ ] **Residual risks documented and accepted:** relay attack, offline revocation lag, on-device ML accuracy (spec §8.5)
- [ ] Zeroisation policy defined — `finally`-block, no disk, no logs, no crash reports
- [ ] TLS 1.3 enforced; certificate handling reviewed
- [ ] GDPR/CCPA posture documented (spec §8.6)
- [ ] Security review checklist drafted for use in Block E

**Assumption:** on-device ML is sufficient for the verification flow (no KYC vendor).
**Excludes:** third-party / government ID validation APIs.
**Risk:** mishandling of sensitive data if the deletion policy is incomplete.

---

## P0-7.0 — Design System / UI Kit + Key-Screen Wireframes
`Design` · `Mobile (iOS+Android)` · **Medium** · **3.0 d** · Owner: D1

> Produce the design system (colour, type, components) and wireframes for key screens:
> onboarding, device pairing, age verification flow, and lock/unlock control.

- [ ] Brand assets received or agreed *(OQ-7)*
- [ ] Colour, typography, spacing scales defined
- [ ] Core component library: buttons, inputs, cards, sheets, states
- [ ] Loading / empty / error state patterns defined
- [ ] Wireframes — onboarding + permission priming
- [ ] Wireframes — device scan, pairing, device list
- [ ] Wireframes — verification flow (ID capture, selfie, result, retry, fallback)
- [ ] Wireframes — lock/unlock control + device status
- [ ] Coaching-oriented copy for verification failures (spec §6.4) — never diagnostic
- [ ] Accessibility pass: contrast, touch targets, dynamic type
- [ ] **Design system and wireframes approved**

**Assumption:** brand assets provided by client or agreed early.
**Excludes:** full high-fidelity design for add-on / admin screens.
**Risk:** design churn if key flows change after wireframe sign-off.

---

## ✅ Phase 0 Exit Criteria *(verbatim from client PRD)*

- [ ] System architecture document approved by all stakeholders
- [ ] BLE Interface Spec delivered to and acknowledged by the firmware team
- [ ] Backend auth and database live; `age_verified` flag schema in place
- [ ] App builds and runs on both iOS and Android via CI/CD
- [ ] Dev / Staging / Production environments configured
- [ ] Design system and key-screen wireframes approved

**Additional internal gates:**
- [ ] Mock peripheral operational (M1 milestone, Day 4)
- [ ] Background-BLE spike report delivered (M0 milestone, Day 3)
- [ ] OQ-1, OQ-2, OQ-4 formally raised with the client
