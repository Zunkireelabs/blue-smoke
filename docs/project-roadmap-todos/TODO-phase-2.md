# Phase 2 — Age & Identity Verification (Persona, third-party vendor)

**PRD effort:** 23.2 person-days / 184 hours · **Roadmap block:** C (Days 13–19, starting D7)
**Spec:** [`../TECHNICAL_SPEC.md`](../TECHNICAL_SPEC.md) · **Roadmap:** [`ROADMAP.md`](ROADMAP.md)

> **Goal (PRD verbatim):** Deliver the 18+ gate entirely on-device: government-ID OCR for date of
> birth plus a selfie-vs-ID face match, with no third-party KYC vendor and no raw data leaving the
> phone.
>
> **This goal changed.** Anish + Sadin decided to move age/identity verification to Persona (a
> third-party vendor) instead of building OCR, liveness, and face-match on-device — recorded in
> `docs/session-log/anish.md` (commit `6bbe150`). **Written client confirmation of this change is
> still outstanding.** The PRD text above is left verbatim rather than rewritten, because it's the
> client's original instruction and the thing that needs their sign-off to actually change.

**Progress:** 0 / 4 tasks · 0 / 30 sub-tasks

> **Denominator re-derived for the vendor architecture — it was 97 (Sadin's correction of the
> original 74) under the on-device design; it is not 97 under this one.** `P2-1.0` is now Persona
> SDK integration (12 boxes, replacing on-device capture UI). `P2-2.0`–`P2-5.0` (OCR, age
> computation, selfie liveness, face-match tuning) are struck — Persona's SDK performs all of it,
> nothing to build in-app. `P2-6.0` and `P2-7.0` shrink from 12 each to 6 and 4 — most of their
> boxes existed to secure biometric data that no longer reaches app memory. `P2-8.0` is unchanged
> at 8 (webhook ingestion, schema, gating — not part of this branch). Total: 12 + 6 + 4 + 8 = 30.
> Recorded here rather than silently re-cut, same convention as the Phase 0 and Sadin's Phase 1–3
> corrections.

---

## 🔴 Read before writing a single line in this phase

`src/features/verification/**` is **no longer a no-network zone.** Under the old on-device design,
raw ID/selfie frames crossed into JS and the ESLint guard existed to stop them leaving the device.
Persona's SDK now captures and uploads the ID/selfie itself — our code never receives the raw
image, DOB, or a biometric embedding, so there's nothing left in this subtree for that guard to
protect, and it's been removed. What still applies:

1. **`PersonaInquiryView`'s `onComplete` status is a UI hint only.** The backend webhook (Increment
   2, `P2-8.0`) is the only thing allowed to write an authoritative verification result.
2. **The backend receives an `inquiry_id` and a status, never the evidence.** Same principle as
   before, enforced by Persona's architecture rather than by our own code path.

---

## P2-1.0 — Persona SDK Integration — Capture Flow (ID + Selfie)
`Capture` · `Mobile (iOS+Android)` · **Medium** · Owner: M2

> Embed Persona's React Native SDK so the app opens the back camera to scan a government ID, then
> the front camera for a selfie, and submits both to Persona for verification. Persona's SDK does
> its own capture UI, auto-capture, and liveness checks — we integrate and wire the result, we
> don't build camera/OCR/liveness code ourselves.

- [ ] `react-native-persona` installed
- [ ] Android: Persona Maven repo added, `compileSdkVersion ≥ 33` and AGP8 confirmed
- [ ] iOS: `Podfile` minimum deployment target 13.0, `pod install` run clean
- [ ] `NSCameraUsageDescription` text corrected — no longer claims "nothing leaves your phone"
      now that data is sent to Persona; this was an App Store compliance issue, not cosmetic
- [ ] `PersonaVerificationScreen` renders `PersonaInquiryView` via `Inquiry.fromTemplate(...)`
      against `Environment.SANDBOX`
- [ ] `onComplete` navigates to a pending/result screen; status treated as UI-only, never written
      as an authoritative verification result (inviolable rule 3)
- [ ] `VerifyAge` route registered in `src/app/navigation.tsx` (route added only, nothing else
      touched — contested file)
- [ ] `PERSONA_TEMPLATE_ID` / `PERSONA_ENVIRONMENT` added to env config, same lazy-throw-if-missing
      pattern as `getSupabaseClient()`
- [ ] End-to-end sandbox test: back-camera ID capture completes without a real document, via
      Persona's file-upload capture method and/or Simulate
- [ ] End-to-end sandbox test: front-camera selfie + liveness challenge completes
- [ ] Forced-pass and forced-fail Simulate runs both handled without a crash
- [ ] Dead on-device scaffolding removed: `capture/`, `facematch/`, `liveness/`, `ocr/` stubs,
      `decision.ts`, the native Vision/ML Kit bridge files, `react-native-vision-camera` dependency

**Assumption:** Persona sandbox account + a Government ID + Selfie template exist (manual
prerequisite, not something buildable in code).
**Excludes:** server-side inquiry creation and webhook confirmation — that's `P2-8.0`, Increment 2.
**Risk:** none of the old accuracy/liveness risk — that's now Persona's problem, not ours.

---

## P2-2.0 — ID OCR + DOB Extraction ~~(Text + PDF417 / MRZ)~~
**Owned by Persona — not built in-app.** Persona's SDK performs document classification, barcode/
MRZ parsing, and DOB extraction as part of the Government ID step. See `P2-1.0`.

---

## P2-3.0 — Age (18+) Computation & Multi-Format DOB Rules ~~(on-device)~~
**Owned by Persona — not built in-app.** Age/DOB-rule logic (equivalent to spec §6.2 R1–R7) is
Persona's configured verification logic, not ours to implement. See `P2-1.0`.

---

## P2-4.0 — Selfie Capture with Liveness ~~(Face-ID Style)~~
**Owned by Persona — not built in-app.** Persona's Selfie step includes its own liveness checks.
See `P2-1.0`.

---

## P2-5.0 — ID-Photo vs Selfie Face Match + Threshold Tuning ~~⚠️ LARGEST LINE ITEM~~
**Owned by Persona — not built in-app.** No on-device face embedding, no τ tuning, no ROC sweep —
Persona performs the match and returns a verdict. This was the largest line item in the original
plan; it no longer exists as in-app work. See `P2-1.0`.

---

## P2-6.0 — Result Handling & Manual Fallback Policy
`Flow` · `Mobile (iOS+Android)` · **Low** · Owner: M2 + M3

> Shrunk from the on-device version: Persona's SDK handles its own retry/coaching UI during
> capture. What's still ours: showing the confirmed result, and the manual-fallback path for users
> Persona can't verify.

- [ ] Pending/result screen surfaces `provider_status` from the webhook-confirmed row
      *(Increment 2 dependency — `P2-8.0`)*
- [ ] Manual fallback route implemented — carries only user ID, never images
- [ ] Manual fallback operational policy agreed with client *(OQ-2 🔴, unrelated to the vendor
      change — still open)*
- [ ] Interrupted-flow recovery — confirm `onCanceled`/`sessionToken` resume behaviour is handled
- [ ] Declined result handled with dignity and a clear, final explanation
- [ ] Every path through the flow walked and verified to have an exit

**Assumption:** manual fallback policy agreed with client. *(OQ-2 🔴)*
**Excludes:** automated human review queue / back-office tooling.

---

## P2-7.0 — Secure Handling of What Little Data Reaches the App
`Privacy` · `Mobile + Backend` · **Low** · Owner: M2 + B1

> Shrunk from the on-device version: no raw ID image, selfie, or biometric embedding ever reaches
> app memory now — Persona's SDK holds and transmits that internally. What's still ours: making
> sure our own code doesn't accidentally log or persist what little it does see (`inquiry_id`,
> status, any prefilled fields the template returns).

- [ ] Confirmed which fields (if any) `PersonaInquiryView`'s `onComplete` returns for the
      configured template, and that none of them are logged or persisted
- [ ] No image or biometric data in any log statement — verified by audit
- [ ] Backend schema re-verified: `verifications` holds no column that could carry an image, DOB,
      or embedding *(Increment 2 dependency — `P2-8.0`'s migration)*
- [ ] Screenshot prevention active while `PersonaInquiryView` is presented (`FLAG_SECURE` on
      Android; iOS screenshot obscuring)

**Assumption:** security design from Phase 0 finalised.
**Excludes:** retaining ID/selfie for audit; auditing Persona's own infrastructure (covered by
their compliance program, not ours to verify).

---

## P2-8.0 — Verification Status Persisted; Gates First Activation
`Gating` · `Mobile + Backend` · **Low** · **1.5 d** · Owner: B1 + M3

> Unchanged from the original plan in shape, but the mechanism is now async: a webhook confirms
> the result rather than an on-device decision. **Increment 2 — not part of the `P2-1.0` branch.**
> Depends on Sadin's `feature/P0-3.0-baas-setup` being synced first (schema conflict already
> flagged separately).

- [ ] `verifications` row inserted `pending` on inquiry creation, updated by the webhook (pass
      **and** decline — declines are useful signal, minus the evidence)
- [ ] RLS verified: insert-own and select-own only; no client update, no delete; webhook write
      goes through the service role
- [ ] Verification status surfaced in the app UI
- [ ] **Server-side gate live** — `issue-device-session` returns `AGE_NOT_VERIFIED` when no
      approved verification exists (spec §5.4 step 2)
- [ ] **Client-side flag is a UX hint only** — the server is the authority (spec §2.2 rule 3)
- [ ] **Tamper test:** modify the client-side flag and confirm activation still fails server-side
- [ ] Unverified user attempting activation is routed into the verification flow, not shown an
      error
- [ ] `audit_log` entry `verification_submitted`, metadata only

**Assumption:** `verifications` schema updated for the async/provider flow (Increment 2 migration).
**Excludes:** re-verification scheduling / expiry policy. *(OQ-5)*
**Risk:** flag tampering if not validated server-side. → *Mitigated by the tamper test above.*

---

## ✅ Phase 2 Exit Criteria *(re-derived from client PRD intent, not verbatim — vendor changes the mechanism, not the outcome)*

- [ ] Valid 18+ ID with a matching selfie results in a pass
- [ ] Under-18 ID or mismatched selfie is blocked
- [ ] Backend stores only the verification result (+ timestamp/method/provider), never the
      document or biometric
- [ ] First device activation is gated on verification

**Additional internal gates:**
- [ ] Webhook signature verification + idempotency proven (Increment 2)
- [ ] Traffic audit confirms our own app never transmits or logs a raw ID/selfie/embedding
      (Persona's own SDK traffic is out of this audit's scope — their compliance program covers it)
