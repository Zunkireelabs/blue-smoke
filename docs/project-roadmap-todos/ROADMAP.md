# Blue Smoke — 30-Day Roadmap

**Version:** 1.0 · **Last updated:** 2026-08-05
**Technical contract:** [`../TECHNICAL_SPEC.md`](../TECHNICAL_SPEC.md)
**Commercial contract:** `Project_Bluesmoke - Nepa.works App - PRD - Master Scope - Internal.xlsx`

> **How to read this document.** The client-facing PRD is organised into 4 sequential phases.
> This roadmap delivers the *same scope with the same exit criteria*, but re-cut into
> **parallel tracks across 30 days**, because 83.7 person-days cannot be delivered
> sequentially in 30. Phase identity is preserved everywhere — every task keeps its PRD ID
> (e.g. `P0-2.0`), so ticking a box here maps 1:1 to something the client was sold.
>
> Sections marked **⚠️ STRAIN** are where the compressed timeline is genuinely under
> tension. They are called out rather than smoothed over, because a plan that hides its
> risks is not a plan.

---

## 1. The arithmetic

| | |
|---|---|
| Total committed scope (PRD) | **83.7 person-days** / 668 hours |
| Calendar available | **30 days** |
| Working days assumed | **26** (aggressive 6-day weeks) |
| Minimum FTE to fit | **83.7 ÷ 26 = 3.22 FTE** — with *zero* slack |
| **Recommended team** | **5.5 FTE-equivalent → ~128 person-days capacity** |
| Resulting buffer | **1.53×** — the margin that absorbs integration, rework, and the unknowns |

A 4-person team gives 1.16× buffer. That is not a plan, that is a hope. The fifth and half
seats are what make 30 days real.

### 1.1 Team & capacity

| Ref | Role | Allocation | Capacity |
|---|---|---|---:|
| **M1** | Mobile Lead — BLE, proximity, lock state machine | Full, D1–30 | 26 d |
| **M2** | Mobile Dev — verification pipeline, native ML modules | Full, D1–30 | 26 d |
| **M3** | Mobile Dev — auth, onboarding, device management, UI | Full, D1–30 | 26 d |
| **B1** | Backend / DevOps — Supabase, Edge Functions, CI/CD, push | Full D1–15, 50% D16–30 | 19.5 d |
| **D1** | Designer | Full D1–10, 25% D11–30 | 13 d |
| **Q1** | QA + PM / firmware liaison | 50% D1–20, full D21–30 | 18 d |
| | | **Total** | **128.5 d** |

**Q1 is not optional.** Roughly half that seat is chasing the §13 open questions —
particularly **OQ-1** (sample IDs, physical device) and **OQ-4** (OTP key provisioning).
Those two are answered by the client, not by us, and if nobody owns chasing them daily
they will arrive too late to matter.

---

## 2. Track view — the 30 days

```
        D1    D5    D10   D15   D20   D25   D30
        │     │     │     │     │     │     │
M1 BLE  ████──┼─────┼─────┼─────┼─────┼─────┤
        SPIKE │scaffold│ scan/bond │ lock/unlock │ HW integ
        ▲                                    ▲
        │ bg-BLE spike (D1–3)                │ real firmware (D26–29)
        │ mock peripheral (D2–4)             │
        │ BLE spec → firmware team (D4–6)    │

M2 VERIF      ██████┼─────┼─────┼─────┼─────┼─────┤
        native bridges │ capture+OCR │ liveness+match+TUNE │ QA
                                          ▲
                                          │ ⚠️ needs sample IDs

M3 APP  ██████┼─────┼─────┼─────┼─────┼─────┼─────┤
        scaffold │ design sys │ auth/onboard │ device UI │ lock UI │ polish

B1 BE   ██████┼─────┼─────┼─────┤····┼·····┼·····┤
        supabase+RLS │ CI/CD │ edge fn │ sync │ push │ (50%) hardening

D1 DSGN ██████┼─────┤·····┼·····┼·····┼·····┼·····┤
        design system + wireframes │ hi-fi │ (25%) support

Q1 QA   ░░░░░░┼░░░░░┼░░░░░┼░░░░░┼█████┼█████┼█████┤
        OQ chase + test plan │ (50%) │ full E2E · security · store

        └─ A ─┴── B ──┴─── C ───┴── D ──┴─ E ─┘
```

| Block | Days | Theme | Primary PRD phase |
|---|---|---|---|
| **A** | 1–6 | Foundation, spikes, spec handoff | Phase 0 |
| **B** | 7–12 | Accounts & device management | Phase 1 |
| **C** | 13–19 | On-device verification | Phase 2 |
| **D** | 20–25 | Lock/unlock & proximity | Phase 3 (build) |
| **E** | 26–30 | Hardware integration, QA, submission | Phase 3 (harden) |

---

## 3. Milestones

| # | Day | Milestone | Proven by |
|---|---:|---|---|
| **M0** | **3** | Background-BLE spike concluded; feasibility on both platforms known | Written spike report + working demo on both OSes |
| **M1** | **4** | Mock peripheral live, implementing §4 including failure paths | App connects, handshakes, and receives every result code |
| **M2** | **6** | **BLE Interface Spec delivered to and acknowledged by the firmware team** | Written acknowledgement; §4 frozen at `protocolVersion 0x01` |
| **M3** | **6** | Foundation complete — Supabase live with RLS, CI/CD green on both platforms, design system approved | Phase 0 exit criteria demonstrated |
| **M4** | **12** | User can sign up, scan, bond, and manage multiple devices against the mock peripheral | Phase 1 exit criteria demonstrated |
| **M5** | **19** | Verification pipeline passes §6.3 accuracy targets | ROC curve + FAR/FRR report, `threshold_version` pinned |
| **M6** | **25** | Full lock/unlock + proximity auto-lock working against the mock, incl. backgrounded | Phase 3 build exit criteria on mock |
| **M7** | **29** | **Real firmware integration signed off** — all §4.10 `FW-01`–`FW-15` pass | Joint test session with the client's firmware team |
| **M8** | **30** | **Submitted** to App Store and Google Play | Submission receipts |

---

## 4. Block-by-block plan

### Block A — Days 1–6 · Foundation
**PRD:** Phase 0 (18 d) → [`TODO-phase-0.md`](TODO-phase-0.md)

| Track | Work |
|---|---|
| **M1** | **D1–3: background-BLE spike** (iOS state restoration, Android foreground service). **D2–4: build the mock peripheral.** D4–6: finalise §4 and hand off to the firmware team. |
| **M2** | Native module scaffolding — Swift Vision bridge, Kotlin ML Kit bridge, shared TS interface. Prove text recognition and face detection round-trip on both platforms. |
| **M3** | RN + TypeScript scaffold, navigation, native module wiring (ble-plx, vision-camera, keychain). Then implement the design system as it lands. |
| **B1** | Provision all three Supabase projects. Write the §5.2 schema as versioned migrations. Write and **test** every §5.3 RLS policy against a second user's JWT. Stand up CI/CD. |
| **D1** | Design system + wireframes for onboarding, pairing, verification, lock control. |
| **Q1** | **Chase OQ-1 and OQ-4 daily.** Draft the test plan and the §11.3 device matrix. |

> **Why the spike and the mock come first.** These are the two things that, if left until
> the phase that "needs" them, would each blow the timeline on their own. Front-loading
> them converts the two biggest unknowns into known quantities by Day 4.

---

### Block B — Days 7–12 · Accounts & Device Management
**PRD:** Phase 1 (18.75 d) → [`TODO-phase-1.md`](TODO-phase-1.md)

| Track | Work |
|---|---|
| **M1** | Filtered scan & discovery. LESC bonding. §4.5 auth handshake. Connection lifecycle — reconnect, background handling (applying the Block A spike findings). |
| **M2** | *(runs ahead into Phase 2)* Guided ID capture UI + quality gates. PDF417 / MRZ / OCR DOB extraction. |
| **M3** | Signup / login / password reset. Onboarding + permission priming with recovery paths. Profile & settings. |
| **B1** | `issue-device-session` Edge Function (§5.4) — the age gate. Device ↔ account sync. |
| **D1** | Hi-fi designs for the verification flow and lock control. |
| **Q1** | Test Phase 1 against the mock. RLS audit round 1. |

**Parallelism note:** M2 begins Phase 2 work on Day 7, six days before Block C nominally
opens. Verification is the largest phase (23.2 d) and its tuning step has an external
dependency, so it gets the longest runway.

---

### Block C — Days 13–19 · On-Device Verification
**PRD:** Phase 2 (23.2 d) → [`TODO-phase-2.md`](TODO-phase-2.md)

| Track | Work |
|---|---|
| **M1** | Multi-device management BLE plumbing — status, battery, per-device state. |
| **M2** | Selfie capture + liveness. ID-portrait vs selfie face match. **Threshold tuning against the labelled set.** Secure deletion + zeroisation. |
| **M3** | Device management UI — list, rename, unpair, live status, battery. Verification flow UI. |
| **B1** | Push infrastructure (APNs/FCM via Edge Function). Verification status persistence + server-side gating. |
| **Q1** | Build and run the §6.3 accuracy harness. Ramping to full-time from D21. |

> **⚠️ STRAIN — this is the highest-risk block.** `P2-5.0` (face match + tuning) is the
> single largest line item at 5 person-days, and it cannot be honestly completed without
> **physical sample IDs (OQ-1)**. Mitigation: build the pipeline and the tuning harness
> against a synthetic/team-sourced set from Day 13 so that when real IDs arrive the tuning
> run is hours, not days. If OQ-1 is still unanswered by **Day 13**, escalate to the client
> as a formal timeline risk — do not absorb it silently.

---

### Block D — Days 20–25 · Lock/Unlock & Proximity
**PRD:** Phase 3 build → [`TODO-phase-3.md`](TODO-phase-3.md)

| Track | Work |
|---|---|
| **M1** | First-time activation. Authenticated lock/unlock commands (§4.6). Proximity monitor with RSSI hysteresis (§7.2). Background BLE behaviour on both platforms. |
| **M2** | Result handling, retries, failure states, manual fallback. Verification gating of first activation. Accuracy regression suite. |
| **M3** | Lock/unlock UI + state machine rendering. Push notification handling. Store assets. |
| **B1** | *(50%)* Session revocation. Production hardening. |
| **Q1** | Full-time. End-to-end QA on the mock. Security review begins. |

---

### Block E — Days 26–30 · Integration, QA, Submission
**PRD:** Phase 3 harden → [`TODO-phase-3.md`](TODO-phase-3.md)

| Track | Work |
|---|---|
| **M1** | **Joint firmware integration on real hardware.** Drive §4.10 `FW-01`–`FW-15`. Tune RSSI thresholds against the real enclosure. |
| **M2** | Re-tune τ against real IDs if they arrived late. Accuracy regression. |
| **M3** | Polish, edge cases, store listing assets and copy. |
| **B1** | Production cutover, monitoring. |
| **Q1** | Full device matrix (§11.3). Security review sign-off. Store submission. |

---

## 5. ⚠️ Where the 30 days actually strain

Five honest flags. Four are manageable. One is not fully within our control.

### 5.1 🔴 "Live on both stores" is not achievable by Day 30 — and no plan can make it so

The PRD's Phase 3 exit criterion reads *"App is live on both the App Store and Google Play."*

We control **submission**. We do not control **review**. Apple review typically runs 1–3
days, Google 1–7 — and an **age-restricted product in a regulated category attracts extra
scrutiny**, which the PRD itself flags as a risk (`P3-8.0`).

**Recommendation:** restate the Day-30 deliverable as **"submitted to both stores, with all
compliance materials complete"**, and treat *live* as a Day 32–37 event outside the
development window. Agree this with the client in **Week 1**, not on Day 30. This is a
wording change, not a scope reduction — but it has to be made early to be credible.

### 5.2 🔴 OQ-1 — hardware and sample IDs

The PRD assumes physical hardware around week 6 of an 8-week plan. Ported naïvely to 30
days, that is *after we finish*. Two deliverables depend on it: §6.3 threshold tuning and
every §4.10 firmware acceptance test.

**Mitigation:** the mock peripheral (Day 4) removes the dependency for everything except
final sign-off. Real hardware is needed by **Day 26** at the absolute latest for M7 to hold.
Sample IDs are needed by **Day 15** for honest tuning.

### 5.3 🔴 OQ-4 — OTP key provisioning

If `K_dev` is not burned into device OTP at manufacture and the key manifest is not
delivered to us, the entire §4.5 trust chain is untestable on real hardware. This is a
factory-process question that takes longer to answer than to implement, so it must be
raised on **Day 1**.

### 5.4 🟠 Face-match tuning is time-boxed by reality, not by effort

5 person-days is the right estimate *given samples*. No amount of engineering compresses
the collection of a labelled test set. Start collecting on Day 1 — team members, willing
volunteers, any legitimately obtainable IDs — so the set is not empty on Day 13.

### 5.5 🟠 Two hard problems land in the same tracks

Background BLE (M1) and face-match accuracy (M2) are both flagged "known hard" in the PRD,
and both are load-bearing. They are deliberately assigned to *different people* and
*front-loaded*: the BLE spike on Days 1–3, verification bridges from Day 1. Neither is
allowed to be discovered late.

---

## 6. Dependency map

```
OQ-4 (OTP keys) ─────────────────────────► §4.5 handshake on real HW ──► M7
OQ-1 (sample IDs) ───────────────────────► P2-5.0 tuning ─────────────► M5
OQ-1 (physical device) ──────────────────► P3-6.0 integration ───────► M7
OQ-8 (developer accounts) ───────────────► P0-5.0 CI/CD ────────────► M3
OQ-7 (brand assets) ─────────────────────► P0-7.0 design system ────► M3

P0-4.0 RN scaffold ──► everything mobile
P0-3.0 Supabase+RLS ──► P1-1.0 auth ──► P1-6.0 sync ──► P2-8.0 gating ──► P3-1.0 activation
P0-2.0 BLE spec ──► mock peripheral ──► P1-3.0 scan ──► P1-4.0 bond ──► P3-2.0 lock/unlock
                                                                    └──► P3-3.0 proximity
P2-2.0 OCR ──► P2-3.0 age rules ──┐
P2-4.0 liveness ──► P2-5.0 match ─┴──► P2-6.0 decision ──► P2-7.0 deletion ──► P2-8.0 gating
```

**Critical path:** `P0-2.0 BLE spec → mock peripheral → P1-4.0 bonding → P3-2.0 authenticated
lock/unlock → P3-6.0 firmware integration → M7`. Everything on this line is M1's, which is
why M1 carries no secondary responsibilities.

---

## 7. Working agreements

- **Daily standup**, 15 min, tracks report blockers only. Open questions are read aloud every day until closed.
- **Definition of Done** is §12.1 of the technical spec. A ticked box means every criterion, not "the happy path works."
- **Ticking a box here is a claim.** Milestones M0–M8 are demonstrated live or on video, never asserted.
- **Branching:** `feature|fix|hotfix|chore|docs/*` → PR → **`stage`** → promote `stage` → `main` → tag for release. CI must be green to merge; `promotion-guard` enforces the order. See `CLAUDE.md`.
- **The three inviolable rules** (§2.2 of the spec) are checked in every PR touching verification. A breach is an automatic block, not a review comment.
- **Scope changes** go through the PRD. Add-ons stay in [`TODO-addons.md`](TODO-addons.md) and do not leak into the base build.

---

## 8. Progress at a glance

Update this table at the end of each block.

| Block | Days | Phase | Tasks | Done | Status |
|---|---|---|---:|---:|---|
| A | 1–6 | Phase 0 | 7 | 1 | 🟡 In progress — `P0-1.0` done; `P0-2.0` and `P0-4.0` part-done |
| B | 7–12 | Phase 1 | 8 | 0 | ⬜ Not started |
| C | 13–19 | Phase 2 | 8 | 0 | ⬜ Not started |
| D | 20–25 | Phase 3 (build) | 5 | 0 | ⬜ Not started |
| E | 26–30 | Phase 3 (harden) | 3 | 0 | ⬜ Not started |
| | | **Total** | **31** | **1** | |

### 8.1 ⚠️ Sub-task totals were understated by 23%

Re-counting the boxes under the PRD tasks in each phase file, against the method audited in
`TODO-phase-0.md`:

| Phase | Header claimed | Actual | Delta |
|---|---:|---:|---:|
| 0 | 76 | **76** ✅ | — *(corrected earlier, was `62`)* |
| 1 | 77 | **91** | +14 |
| 2 | 74 | **97** | +23 |
| 3 | 84 | **119** | +35 |
| **Total** | **311** | **383** | **+72 (+23%)** |

All four originals appear to trace to the same unreconciled estimate. **This does not change the
PRD's 83.7 person-days** — the person-day figures are the commercial commitment and are unaffected.
What it changes is the *granularity signal*: a burn-down against 311 would have read ~23% ahead of
reality throughout, and the error is worst in **Phase 3**, which carries the least slack and the
hardware dependency. Treat sub-task progress as a completeness check, not a schedule forecast.

**Open questions:** 9 open / 0 closed — see [`../TECHNICAL_SPEC.md` §13](../TECHNICAL_SPEC.md#13-open-questions-register)
**Critical open questions:** OQ-1, OQ-2, OQ-4 🔴
