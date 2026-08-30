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
| **Recommended team** | **6.2 FTE-equivalent → ~146 person-days capacity** *(was 5.5 / ~128 before M4 joined on Day 10)* |
| Resulting buffer | **1.75×** *(was 1.53×)* — the margin that absorbs integration, rework, and the unknowns |

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
| **M4** | Mobile Dev — app screens, flows, design-system migration | Full, **D10–30** | 18 d |
| | | **Total** | **146.5 d** |

> **M4 was added on Day 10, 2026-08-09** — Manjila joined, on screens and flows. 18 d is the
> 21 remaining calendar days at the same 26-in-30 working-day ratio the rest of this table uses,
> not a full 26 d seat; a mid-project joiner cannot be counted as if they were here on Day 1.
> The 128.5 d total above it is what the plan was budgeted against, so the extra 18 d is
> **buffer, not licence to add scope** — scope is fixed by the client PRD either way.

> **Seats are roles, not people.** This table is the *recommended* staffing model; the actual
> team is four developers covering it between them. As of Day 10 the live mapping is roughly
> **Anish → M1** (BLE, scan/bond, connection lifecycle), **Hardik → B1 + M3-auth** (Supabase,
> Twilio/Resend, OTP delivery), **Manjila → M4** (screens, flows, design system), **Sadin → M3
> + D1 + Q1** (app work, design direction, integration, and chasing the §13 open questions).
> **M2 no longer exists as briefed** — its "native ML modules / face match" content was deleted
> by the Persona pivot (spec v1.5); what remains of Phase 2 is Persona SDK glue and the two
> Edge Functions. Nobody is holding it today. **This mapping is descriptive, not ownership** —
> tasks are still claimed by pushing a branch, per `CLAUDE.md`.

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

M4 SCRN             ██┼─────┼─────┼─────┼─────┤   (joined D10)
                    dead-ends+nav │ design-sys migration │ onboarding │ polish

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
| **C** | 13–19 | Persona verification integration | Phase 2 |
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
| **M5** | **19** | Persona capture flow integrated and passing sandbox end-to-end tests | Forced-pass/forced-fail Simulate runs demonstrated; webhook confirmation wired (`P2-8.0`) |
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
| **M2** | *(runs ahead into Phase 2)* Persona SDK integration — capture-flow screen, native setup. No OCR/quality-gate code to build; Persona's SDK owns capture. |
| **M3** | Signup / login / password reset. Onboarding + permission priming with recovery paths. Profile & settings. |
| **B1** | `issue-device-session` Edge Function (§5.4) — the age gate. Device ↔ account sync. |
| **D1** | Hi-fi designs for the verification flow and lock control. |
| **Q1** | Test Phase 1 against the mock. RLS audit round 1. |

**Parallelism note:** M2 begins Phase 2 work on Day 7, six days before Block C nominally opens.
**The 23.2 d effort figure below is stale** — it was sized for building OCR/liveness/face-match
in-app, which no longer happens (Persona's SDK does it). A re-estimate for the vendor-integration
shape of Phase 2 hasn't been done yet; treat the day range in this block as provisional until it
is, rather than assuming it still costs 23.2 person-days.

---

### Block C — Days 13–19 · Persona Verification Integration
**PRD:** Phase 2 (effort stale, see note above) → [`TODO-phase-2.md`](TODO-phase-2.md)

| Track | Work |
|---|---|
| **M1** | Multi-device management BLE plumbing — status, battery, per-device state. |
| **M2** | Persona SDK capture-flow screen (`P2-1.0`). Result/fallback handling (`P2-6.0`). What little data reaches the app secured (`P2-7.0`). |
| **M3** | Device management UI — list, rename, unpair, live status, battery. Verification flow UI. |
| **B1** | Push infrastructure (APNs/FCM via Edge Function). Create-inquiry + webhook Edge Functions, verification status persistence + server-side gating (`P2-8.0`). |
| **Q1** | Ramping to full-time from D21. |

> **STRAIN status changed — this is no longer the highest-risk block.** The old risk was
> `P2-5.0` (on-device face-match tuning), which needed physical sample IDs (**OQ-1**) to
> honestly complete and couldn't be if OQ-1 slipped. That task doesn't exist anymore — Persona
> performs the match, and its **sandbox needs no real ID at all** (Simulate + file-upload
> capture cover testing). OQ-1 drops out of this block's dependency chain entirely; it may
> still matter elsewhere (e.g. physical hardware, `P3-6.0`), but not here.

---

### Block D — Days 20–25 · Lock/Unlock & Proximity
**PRD:** Phase 3 build → [`TODO-phase-3.md`](TODO-phase-3.md)

| Track | Work |
|---|---|
| **M1** | First-time activation. Authenticated lock/unlock commands (§4.6). Proximity monitor with RSSI hysteresis (§7.2). Background BLE behaviour on both platforms. |
| **M2** | Result handling, manual fallback (`P2-6.0`). Verification gating of first activation. |
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
OQ-1 (physical device) ──────────────────► P3-6.0 integration ───────► M7
OQ-8 (developer accounts) ───────────────► P0-5.0 CI/CD ────────────► M3
OQ-7 (brand assets) ─────────────────────► P0-7.0 design system ────► M3

P0-4.0 RN scaffold ──► everything mobile
P0-3.0 Supabase+RLS ──► P1-1.0 auth ──► P1-6.0 sync ──► P2-8.0 gating ──► P3-1.0 activation
P0-2.0 BLE spec ──► mock peripheral ──► P1-3.0 scan ──► P1-4.0 bond ──► P3-2.0 lock/unlock
                                                                    └──► P3-3.0 proximity
P2-1.0 Persona SDK capture ──► P2-6.0 result handling ──► P2-7.0 data audit ──► P2-8.0 gating
```

*(OQ-1, sample IDs, dropped out of this graph — it fed `P2-5.0` on-device tuning, which no
longer exists. Persona's sandbox needs no real ID.)*

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

## 7.1 AD-1 — Admin Web Panel (commissioned 2026-08-30, post-core track)

**This is not one of the 30 days.** AD-1 is a separately-quoted add-on that started work on
2026-08-30, well after this roadmap's Day-30 window closes. It must not consume the §1.1
capacity table's seats while Blocks D/E are open — nobody staffed on M1/M2/M3 of the core build
picks up AD-1 work at the expense of the critical path in this document.

**Shape:** three milestones, each split into briefs, executed and reviewed one at a time —
`docs/project-roadmap-todos/TODO-AD-1-admin-panel.md` is the working file:

- **M1 — Foundation + read-only.** Commission docs, `admin_users`/`admin_audit_log` +
  auth spine (M1a, this brief), then the read actions + `web-admin` wiring (M1b). Nothing
  mutating ships.
- **M2 — Dashboards + user management.** The mutating milestone: suspend/ban/reactivate,
  delete, password reset, session revocation, device unpair. Enables TOTP (deferred from M1,
  see below).
- **M3 — Verification audit + adoption.** Aggregate-only reporting views in a schema never
  exposed to the Data API, funnel/adoption reads, manual download entry.

**Two-repo split:** the SPA is a separate Vite + React + TS repo (`web-admin`), talking to three
new Edge Functions (`admin-query`, `admin-mutate`, `admin-admins`) that live here, in
`supabase/functions/`, beside this project's one ordered migration sequence. Docs stay in this
repo; `web-admin`'s README only links back.

**Two touches into shipped core code, both in M2, both need announcing before they land:**
`issue-device-session` gains an `account_status` check (a suspended/banned user must not obtain
new key material), and `revoke-device-session`'s session-revocation logic is extracted into a
shared, behaviour-neutral module so `admin-mutate` can call the same code path a user's own
revoke request uses — re-proved with `revoke_session_proof.sql` unchanged.

**Three things AD-1 does not do, by design, not by oversight:**

1. **Write `age_verified`.** `persona-webhook` remains the sole writer (inviolable rule 3).
   "Approve/unapprove" in the panel is account status only.
2. **Show a real per-step verification funnel.** The data to support one doesn't exist without
   client-side instrumentation, which is AD-2 territory (`src/app/navigation.tsx`), not this
   add-on. What AD-1 *can* honestly show — inquiry counts, approve/decline rates, retry
   pressure — is not the same claim as "where in the flow people drop off."
3. **Show an ID or a selfie.** The image never exists outside Persona's own SDK process; there
   is no raw material anywhere in this system for a panel to expose.

---

## 8. Progress at a glance

Update this table at the end of each block.

| Block | Days | Phase | Tasks | Done | Status |
|---|---|---|---:|---:|---|
| A | 1–6 | Phase 0 | 7 | 1 | 🟡 In progress — `P0-1.0` done; `P0-2.0` and `P0-4.0` part-done |
| B | 7–12 | Phase 1 | 8 | 0 | ⬜ Not started |
| C | 13–19 | Phase 2 | 4 | 0 | ⬜ Not started |
| D | 20–25 | Phase 3 (build) | 5 | 0 | ⬜ Not started |
| E | 26–30 | Phase 3 (harden) | 3 | 0 | ⬜ Not started |
| | | **Total** | **27** | **1** | |

### 8.1 ⚠️ Sub-task denominators — a recount, then a scope change

**Two separate things happened to these numbers, and collapsing them into one loses both.** The
first is a counting error we found; the second is a deliberate re-scope. Read them in order.

**(1) The original headers were undercounted.** Re-counting the boxes under the PRD tasks in each
phase file, against the method audited in `TODO-phase-0.md`:

| Phase | Header claimed | Recount | Delta |
|---|---:|---:|---:|
| 0 | 76 | **76** ✅ | — *(corrected earlier, was `62`)* |
| 1 | 77 | **91** | +14 |
| 2 | 74 | **97** | +23 |
| 3 | 84 | **119** | +35 |
| **Total** | **311** | **383** | **+72 (+23%)** |

All four originals appear to trace to the same unreconciled estimate.

**(2) Then the v1.5 Persona switch removed most of Phase 2.** `P2-2.0`–`P2-5.0` (OCR, age rules,
liveness, face match + threshold tuning) are struck out entirely — **67 of those 97 boxes**. Phase 2
now holds **30** boxes across **4** live tasks: `P2-1.0` 12 · `P2-6.0` 6 · `P2-7.0` 4 · `P2-8.0` 8.
This is removed scope, not outstanding work; see `TODO-phase-2.md` for the per-task basis.

**Current denominators — use these, not the recount column above:**

| Phase | Tasks | Sub-tasks |
|---|---:|---:|
| 0 | 7 | 76 |
| 1 | 8 | 91 |
| 2 | **4** | **30** |
| 3 | 8 | 119 |
| **Total** | **27** | **316** |

**This does not change the PRD's 83.7 person-days** — the person-day figures are the commercial
commitment and are unaffected. The Phase 2 *effort* re-estimate is a separate open item (see the
Block C note above). What the recount changes is the *granularity signal*: a burn-down against 311
would have read ahead of reality in Phases 1 and 3, and the error is worst in **Phase 3**, which
carries the least slack and the hardware dependency. Treat sub-task progress as a completeness
check, not a schedule forecast.

**Counting convention**, so the next recount agrees with this one: only boxes under **PRD line-item
tasks** count. Deliberately outside the denominator — Exit Criteria blocks, the 🔴/🧭 phase
preambles, the 🔥 Day-1 escalations block, and the two non-PRD added tasks `P0-2.5` (mock
peripheral) and `P0-4.5` (background BLE spike), which are tracked in their own sections.

**Open questions:** 9 open / 0 closed — see [`../TECHNICAL_SPEC.md` §13](../TECHNICAL_SPEC.md#13-open-questions-register)
**Critical open questions:** OQ-1, OQ-2, OQ-4 🔴
