# Phase 2 — Age & Identity Verification (On-Device)

**PRD effort:** 23.2 person-days / 184 hours · **Roadmap block:** C (Days 13–19, starting D7)
**Spec:** [`../TECHNICAL_SPEC.md`](../TECHNICAL_SPEC.md) · **Roadmap:** [`ROADMAP.md`](ROADMAP.md)

> **Goal (PRD verbatim):** Deliver the 18+ gate entirely on-device: government-ID OCR for date of
> birth plus a selfie-vs-ID face match, with no third-party KYC vendor and no raw data leaving the
> phone. This is the highest-risk phase and includes dedicated accuracy-tuning time.

**Progress:** 0 / 8 tasks · 0 / 74 sub-tasks

---

## 🔴 Read before writing a single line in this phase

Everything under `features/verification/` is 🔴 **never-persisted** data (spec §8.1). Three rules,
enforced by ESLint and by PR review — a breach is an automatic block, not a review comment:

1. **No image, video frame, or biometric embedding is ever written to disk, logged, sent to a crash reporter, or transmitted.** RAM only, zeroised in a `finally` block.
2. **Only `decision.ts` exports outward**, returning exactly `{ passed, method, thresholdVersion, outcomeReason }`. Nothing else escapes the subtree.
3. **The backend receives the flag, never the evidence.**

**⚠️ STRAIN:** `P2-5.0` cannot be honestly completed without physical sample IDs (**OQ-1**). Build
the pipeline and the tuning harness against a synthetic/team-sourced set from Day 13 so that when
real IDs arrive, tuning is hours rather than days. **If OQ-1 is unanswered by Day 13, escalate
formally.** Do not absorb this risk silently.

---

## P2-1.0 — Guided ID Capture UI (Edge Detection)
`Capture` · `Mobile (iOS+Android)` · **Medium** · **2.3 d** · Owner: M2

> Camera UI that guides the user to photograph a government ID, with edge detection and quality
> checks to capture a clean, readable image for OCR.

- [ ] VisionCamera integrated with a frame processor
- [ ] Document rectangle / edge detection with a live overlay
- [ ] **Quality gate — focus** (Laplacian variance threshold)
- [ ] **Quality gate — glare** (blown-highlight ratio)
- [ ] **Quality gate — fill** (document occupies ≥ 60% of frame)
- [ ] **Quality gate — skew** (≤ 10°)
- [ ] Live coaching overlay: "move closer", "reduce glare", "hold steady"
- [ ] Auto-capture when all gates pass, plus a manual shutter fallback
- [ ] Front/back capture flow where the ID type requires it
- [ ] Captured frame held **in RAM only** — no file write, no gallery, no cache
- [ ] Torch toggle for low light
- [ ] Tested on a budget Android device for frame-processor latency

**Assumption:** physical sample government IDs available for testing. *(OQ-1 🔴)*
**Excludes:** supporting every international ID format.
**Risk:** poor lighting / glare reducing capture quality.

---

## P2-2.0 — ID OCR + DOB Extraction (Text + PDF417 / MRZ)
`OCR` · `Mobile (iOS+Android)` · **High** · **4.8 d** · Owner: M2

> On-device text recognition (ML Kit / Apple Vision) plus PDF417/MRZ barcode parsing to reliably
> extract date of birth from the captured ID.

- [ ] **Path A — PDF417** barcode scanning (US/CA driving licences)
- [ ] AAMVA field parsing; `DBB` (date of birth) extracted
- [ ] **Path B — MRZ** detection and parsing (TD1 / TD2 / TD3 formats)
- [ ] MRZ **check-digit verification** — reject on failure rather than trusting a misread
- [ ] **Path C — OCR fallback:** Vision `VNRecognizeTextRequest` (accurate level) on iOS
- [ ] **Path C — OCR fallback:** ML Kit Text Recognition v2 on Android
- [ ] Candidate-date regex extraction across common layouts
- [ ] **Label-proximity scoring** — prefer dates near `DOB` / `Date of Birth` / `Born` / `Naissance`
- [ ] **Exclude candidates near `EXP` / `ISS` labels** — expiry must never be read as DOB (spec §6.2 R6)
- [ ] Path precedence implemented: A → B → C, first confident hit wins
- [ ] Confidence scoring; ambiguous results routed to retry rather than guessed
- [ ] Shared TS interface over both native implementations
- [ ] All intermediate text and buffers zeroised after extraction
- [ ] Table-driven unit tests across sample layouts

**Assumption:** target IDs carry DOB in readable text and/or barcode.
**Excludes:** cloud OCR services.
**Risk:** DOB extraction accuracy across ID layouts and old IDs.
**Note (PRD):** *on-device only — no document leaves the phone.*

---

## P2-3.0 — Age (18+) Computation & Multi-Format DOB Rules
`Age` · `Mobile (iOS+Android)` · **Medium** · **2.0 d** · Owner: M2

> Normalise the extracted DOB across date formats, compute age, and enforce the 18+ requirement
> as a hard gate.

Implements spec §6.2 rules R1–R7. **Table-driven tests are mandatory — one case per rule, minimum.**

- [ ] **R1** — barcode/MRZ formats bypass ambiguity logic entirely
- [ ] **R2** — component > 12 forces the assignment (`13/07/1990` → DD/MM)
- [ ] **R3** — genuine ambiguity resolves to the **younger** age. *Fails safe: ambiguity never admits a minor.*
- [ ] **R3** — issuing-region hint used first where the document type is known
- [ ] **R4** — 2-digit year windowing + sanity range age ∈ [10, 120]
- [ ] **R5** — future dates and implied age > 120 rejected
- [ ] **R6** — labelled DOB preferred over unlabelled candidates
- [ ] **R7** — `min_age` read from remote config, default 18 (spec §10.2)
- [ ] Age computed correctly across leap years and birthday boundaries
- [ ] Timezone handling — age computed against local date, no off-by-one at midnight
- [ ] **Comprehensive table-driven test suite covering R1–R7**
- [ ] DOB zeroised immediately after the age boolean is derived

**Assumption:** 18+ threshold confirmed with client.
**Excludes:** region-specific minimum-age variations.
**Risk:** date-format ambiguity (e.g. MM/DD vs DD/MM). → *Mitigated by R3's fail-safe direction.*
**Note (PRD):** *threshold is configurable if client needs 21+ in some regions.* ✅ *(R7)*

---

## P2-4.0 — Selfie Capture with Liveness (Face-ID Style)
`Selfie` · `Mobile (iOS+Android)` · **High** · **3.3 d** · Owner: M2

> Guided selfie capture with basic liveness detection (blink/turn/multi-frame) to confirm a live
> person is present before face matching.

- [ ] Front-camera capture UI, Face-ID-enrolment style guidance
- [ ] Face detection + positioning guidance (centre, distance, lighting)
- [ ] **Liveness — blink detection** (eye-open probability crosses < 0.2 then > 0.8)
- [ ] **Liveness — head yaw challenge**, turn left/right
- [ ] **Challenge order randomised** — defeats replay of a recorded video
- [ ] **Liveness — multi-frame texture variance** — rejects a flat printed photo
- [ ] **Liveness — bounding-box stability** across frames
- [ ] All four signals must pass; partial passes are failures
- [ ] Timeout with a retry path if challenges are not completed
- [ ] Accessibility consideration for users who cannot complete a yaw challenge → manual fallback route
- [ ] Frames held in RAM only; zeroised after embedding
- [ ] **Liveness FRR ≤ 8% measured, including on a budget Android device** (spec §6.3)

**Assumption:** device front cameras meet a baseline quality bar.
**Excludes:** advanced anti-spoofing / presentation-attack detection. *(add-on — see [`TODO-addons.md`](TODO-addons.md))*
**Risk:** liveness false rejects on lower-end devices.
**Note (PRD):** *advanced anti-spoofing available as an add-on.*

---

## P2-5.0 — ID-Photo vs Selfie Face Match + Threshold Tuning ⚠️ LARGEST LINE ITEM
`Face Match` · `Mobile (iOS+Android)` · **High** · **5.0 d** · Owner: M2

> Extract face embeddings from the ID photo and the selfie, compare similarity against a tuned
> threshold, and decide a match — fully on-device. Includes dedicated tuning time.

- [ ] ID portrait detection + crop from the captured ID image
- [ ] iOS face embedding via Vision
- [ ] Android face embedding via ML Kit + embedding model
- [ ] Cosine similarity computed between the two embeddings
- [ ] Handling for the low-quality-ID-photo case (many IDs carry poor, old, or greyscale portraits)
- [ ] **Labelled test set built:** ≥ 40 genuine pairs across skin tones, ages, glasses/no-glasses, lighting *(start Day 1)*
- [ ] All cross-pairs generated as impostor pairs
- [ ] **ROC sweep harness** built and runnable in CI
- [ ] **τ selected meeting FAR ≤ 0.1%**, resulting FRR reported
- [ ] **FRR ≤ 5% achieved** and recorded (spec §6.3)
- [ ] τ tuned **independently per platform** — `facematch_tau_ios`, `facematch_tau_android`
- [ ] τ served from remote config (spec §10.2)
- [ ] **`threshold_version` pinned** and written into every `verifications` row — decisions must be reproducible after the fact
- [ ] Accuracy regression test wired into CI as a gate
- [ ] Embeddings zeroised immediately after the comparison

**Assumption:** on-device face embedding models are sufficiently accurate.
**Excludes:** server-side / vendor biometric matching.
**Risk:** false rejects from poor ID photos — **the single biggest accuracy risk**.
**Note (PRD):** *largest line item by design — accuracy tuning is critical.*
**⚠️ Blocked by OQ-1** for honest completion.

---

## P2-6.0 — Result Handling, Retries, Failure States & Manual Fallback Policy
`Flow` · `Mobile (iOS+Android)` · **Medium** · **2.3 d** · Owner: M2 + M3

> Orchestrate the end-to-end decision: pass requires (age ≥ 18) AND (face match ≥ threshold).
> Handle retries, clear error states, and an agreed manual-review fallback for legitimate edge cases.

- [ ] `decision.ts` orchestrator — the single source of the PASS/FAIL verdict
- [ ] **PASS ⇔ (age ≥ min_age) AND (similarity ≥ τ) AND (liveness passed)** — all three, no exceptions
- [ ] `outcomeReason` classified: `pass` / `under_18` / `face_mismatch` / `ocr_failed` / `liveness_failed`
- [ ] Retry policy — attempts 1–3 free with progressive coaching (spec §6.4)
- [ ] Attempts 4–5: stricter guide + "having trouble?" affordance
- [ ] Attempt 6+: 30-minute lockout, manual fallback surfaced
- [ ] **Failure copy is coaching, never diagnostic** — "we couldn't read the date on your ID", never a similarity score
- [ ] Manual fallback route implemented — carries **only** user ID + `outcomeReason`, never images
- [ ] Manual fallback operational policy agreed with client *(OQ-2 🔴)*
- [ ] Interrupted-flow recovery (app backgrounded mid-capture, call received)
- [ ] Under-18 result handled with dignity and a clear, final explanation
- [ ] Every path through the flow walked and verified to have an exit

**Assumption:** manual fallback policy (e.g. support contact) agreed with client. *(OQ-2 🔴)*
**Excludes:** automated human review queue / back-office tooling.
**Risk:** edge-case users blocked with no recourse if the fallback is undefined.
**Note (PRD):** *manual fallback policy must be agreed before build.*

---

## P2-7.0 — Secure Handling + Deletion of ID / Selfie / Biometrics
`Privacy` · `Mobile + Backend` · **Medium** · **2.0 d** · Owner: M2 + B1

> Process all images and embeddings in memory / secure storage and delete them immediately after
> the pass/fail decision. Backend receives only the age_verified flag plus timestamp/method.

**This task is the product's core promise. Treat a failure here as a P0 defect, not a bug.**

- [ ] Every image and embedding buffer released and **overwritten** in a `finally` block
- [ ] `finally`-block zeroisation verified to run on the exception path too, not only the happy path
- [ ] **No file writes anywhere in `features/verification/`** — verified by audit
- [ ] **No image or biometric data in any log statement** — verified by audit
- [ ] **Crash reporter excluded from the verification subtree** — a crash must not capture a frame
- [ ] ESLint `no-restricted-imports` rule active and passing in CI (spec §9.2)
- [ ] Camera cache / temp directories explicitly cleared after each session
- [ ] Screenshot prevention on verification screens (`FLAG_SECURE` on Android; iOS screenshot obscuring)
- [ ] Network payload audited — **only** `{ age_verified, verified_at, method, threshold_version, app_version, platform, outcome_reason }` transmitted
- [ ] Backend schema re-verified: no column exists that could hold an image, DOB, or embedding
- [ ] **Manual verification with a proxy tool** — capture all traffic during a full run and confirm nothing sensitive crosses the wire
- [ ] Device filesystem inspected after a full run — nothing left behind

**Assumption:** security design from Phase 0 finalised.
**Excludes:** retaining ID/selfie for audit.
**Risk:** incomplete deletion leaving sensitive data on device.
**Note (PRD):** *no raw documents or biometrics are ever stored or transmitted.*

---

## P2-8.0 — Verification Status Persisted; Gates First Activation
`Gating` · `Mobile + Backend` · **Low** · **1.5 d** · Owner: B1 + M3

> Persist the verified status and use it to gate first-time device activation — an unverified user
> cannot activate or unlock any device.

- [ ] `verifications` row inserted on decision (pass **and** fail — failures are useful signal, minus the evidence)
- [ ] RLS verified: insert-own and select-own only; no update, no delete
- [ ] Verification status surfaced in the app UI
- [ ] **Server-side gate live** — `issue-device-session` returns `AGE_NOT_VERIFIED` when no passing verification exists (spec §5.4 step 2)
- [ ] **Client-side flag is a UX hint only** — the server is the authority (spec §2.2 rule 3)
- [ ] **Tamper test:** modify the client-side flag and confirm activation still fails server-side
- [ ] Unverified user attempting activation is routed into the verification flow, not shown an error
- [ ] `audit_log` entry `verification_submitted`, metadata only

**Assumption:** `age_verified` flag schema available from Phase 0.
**Excludes:** re-verification scheduling / expiry policy. *(OQ-5)*
**Risk:** flag tampering if not validated server-side. → *Mitigated by the tamper test above.*

---

## ✅ Phase 2 Exit Criteria *(verbatim from client PRD)*

- [ ] Valid 18+ ID with a matching selfie results in a pass
- [ ] Under-18 ID or mismatched selfie is blocked
- [ ] DOB extracted correctly across supported ID formats
- [ ] Images and biometrics deleted after the decision
- [ ] Backend stores only the `age_verified` flag (+ timestamp/method)
- [ ] First device activation is gated on verification

**Additional internal gates:**
- [ ] §6.3 accuracy targets met and recorded: FRR ≤ 5% @ FAR ≤ 0.1%
- [ ] `threshold_version` pinned and reproducible
- [ ] Proxy-captured traffic audit confirms no sensitive data leaves the device
