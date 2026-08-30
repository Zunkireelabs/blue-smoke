# Add-Ons — Out of Base Scope

**Status:** 🟡 **AD-1 COMMISSIONED (2026-08-30).** AD-2, AD-3, AD-4 remain 🅿️ PARKED.
**Spec:** [`../TECHNICAL_SPEC.md`](../TECHNICAL_SPEC.md) · **Roadmap:** [`ROADMAP.md`](ROADMAP.md)

> **Goal (PRD verbatim):** Optional modules quoted separately and not included in the core 4-phase
> delivery. Presented so the client can see the natural extensions of the platform and budget for
> them when ready.

---

## ⛔ Scope discipline

Nothing in this file is built during the 30 days, **except AD-1**, commissioned 2026-08-30 —
it has its own working file, [`TODO-AD-1-admin-panel.md`](TODO-AD-1-admin-panel.md), and is
explicitly post-core, post-30-days track: it does not consume the base build's capacity table.
For everything else here, if a request arrives that resembles one of these items, it goes
through the PRD as a change request — it does not quietly become "a small addition to Phase 3."

The most likely leak vectors, in order of probability:

1. *"Can we just see a list of who's verified?"* → that is **AD-1**, the admin panel, 15 days —
   **now commissioned**. The answer to this specific leak vector is still "aggregate counts, not
   a per-user browser of verification detail" — commissioning AD-1 did not change that boundary,
   it only means the aggregate-counts version is now being built rather than declined outright.
2. *"Can we add Sentry, just for our own debugging?"* → that is **AD-2**, and it also touches the 🔴 verification subtree, where analytics imports are ESLint-blocked by design.
3. *"Can the liveness be a bit stronger?"* → that is **AD-4**, 7.5 days.

---

## AD-1 — Admin Web Panel (Fleet, Verification Audit, User Management)
`Admin` · `Web (Admin Panel)` · **High** · **15.0 person-days / 120 h**

**🟡 COMMISSIONED 2026-08-30 — working file: [`TODO-AD-1-admin-panel.md`](TODO-AD-1-admin-panel.md).**

> Web panel for administrators to view the device fleet, audit verification outcomes (pass/fail
> counts and methods, never raw biometrics), and manage users.

### Added at commissioning, not in the PRD line item

The client asked for these on top of the PRD line, and they are folded into AD-1's scope:
suspend / ban / re-enable an account, delete a user, admin-triggered password reset, and
app-download figures.

🔴 **"Approve/unapprove a user" is account status only, never a verification override.** Today
`persona-webhook` is the only writer of `age_verified` / `provider_status` (spec §6.4.1). There
is no manual "approve this user's age verification" button, and none is being built — a
wrongly-declined user is recovered via a fresh Persona inquiry approved in Persona's own
console, which flows back through the existing signed webhook.

**The 15.0 d / 120 h estimate above predates both the Persona vendor switch and these
additions and owes the client a re-estimate.** It was sized before Persona replaced on-device
OCR/liveness/face-match, and before the account-management additions above were folded in.

**If commissioned, scope would include:**
- [ ] Admin auth with a role separate from customer accounts
- [ ] Device fleet view — registry, ownership, last-seen, key generation
- [ ] Verification audit — **aggregate outcomes only**: pass/fail counts by `outcome_reason`, method, `threshold_version`
- [ ] Funnel analysis: where verification attempts drop off
- [ ] User management — search, view, revoke sessions, unpair devices
- [ ] `audit_log` browser with filtering
- [ ] Admin action audit trail (admins are audited too)
- [ ] RLS + service-role policies for admin access paths

**Assumption:** scope of admin actions agreed with client.
**Excludes:** included in base scope.
**Risk:** audit data must never expose raw ID/biometric material.
**Note (PRD):** *significant standalone module — quoted separately.*

> **Hard constraint if built.** There is no raw ID or biometric material in the system to expose —
> the architecture makes this a design guarantee, not a policy promise. The panel can only ever
> show what §5.2.2 stores: a boolean, a timestamp, a method, a threshold version, and a reason
> code. Any admin request for "let me see the ID they uploaded" has no technical answer, because
> the image never existed outside the user's phone RAM. Say this early, not at delivery.

---

## AD-2 — Analytics & Crash Reporting (Firebase / Sentry)
`Analytics` · `Mobile + Backend` · **Medium** · **3.0 person-days / 24 h**

> Integrate analytics and crash reporting to track adoption, drop-off in the verification funnel,
> and stability across devices.

**If commissioned, scope would include:**
- [ ] Crash reporting integrated — **with the `features/verification/` subtree excluded**
- [ ] Analytics events for funnel milestones, carrying **no PII and no verification detail beyond an outcome code**
- [ ] Verification funnel drop-off tracking
- [ ] Performance monitoring: BLE connect time, verification duration, ML inference latency
- [ ] Privacy review of every event before it ships
- [ ] User-facing opt-out

**Assumption:** client selects and provides analytics tooling accounts.
**Excludes:** custom BI dashboards.
**Risk:** analytics must respect the privacy-by-design model.

> **Hard constraint if built.** The ESLint `no-restricted-imports` rule blocking analytics and
> logging inside `features/verification/` (spec §9.2) **stays**. Crash reporters capture memory and
> screenshots; a crash during ID capture must never produce a report containing the ID. This
> exclusion is not negotiable regardless of what the analytics scope becomes.

---

## AD-3 — Firmware Development (YC1012 / Cortex-M0+)
`Firmware` · `Firmware` · **High** · **Effort TBD — separate estimate**

> If the client wants us to build the device firmware (rather than only specifying the BLE
> protocol), this is scoped and estimated separately against the YC1012_JD / Cortex-M0+ target.

**Base scope is spec only.** We author §4; the client's firmware team implements it.

**If commissioned, it would implement:**
- [ ] The full §4 GATT service
- [ ] AES-128-CMAC auth using the hardware AES block
- [ ] HKDF key derivation from `K_dev` in OTP
- [ ] Firmware obligations F1–F10 (spec §4.8), including the dead-man auto-lock timer on RTC/LPTIM
- [ ] Battery measurement via the 12-bit ADC
- [ ] Power management within the 8 KB RAM / 8 KB OTP budget
- [ ] OTP provisioning process for `K_dev` at manufacture *(relates to OQ-4)*
- [ ] All §4.10 acceptance tests passing

**Assumption:** hardware, toolchain, and reference firmware access provided.
**Excludes:** included in base scope (base = spec only).
**Risk:** hardware/firmware unknowns until toolchain access.
**Note (PRD):** *separate estimate — effort TBD after hardware review.*

> **Estimating note.** The 8 KB RAM shared with the BLE stack is the binding constraint, and it
> cannot be assessed from a datasheet alone. Any estimate requires toolchain access and a look at
> the vendor SDK's actual footprint first. Do not quote this blind.

---

## AD-4 — Advanced Liveness (Anti-Spoofing / PAD)
`Verification` · `Mobile (iOS+Android)` · **High** · **7.5 person-days / 60 h**

> Stronger presentation-attack detection on top of the base selfie liveness, to resist
> photo/video/mask spoofing attempts.

**Base scope delivers** (in `P2-4.0`): blink detection, randomised head-yaw challenge, multi-frame
texture variance, bounding-box stability. That defeats casual spoofing — a held-up photo, a
replayed video with a fixed challenge order.

**If commissioned, this would add:**
- [ ] Depth-based liveness where hardware supports it (TrueDepth on iOS, ToF on some Android)
- [ ] Reflection / screen-moiré detection to catch a photo of a screen
- [ ] Texture-based PAD model for print and mask attacks
- [ ] Active challenge expansion — smile, mouth open, randomised sequences
- [ ] Environmental consistency checks across frames
- [ ] PAD-specific accuracy tuning against a dedicated spoof test set
- [ ] Re-tuning of the §6.3 FRR target to account for added strictness

**Assumption:** acceptable accuracy/UX trade-off agreed with client.
**Excludes:** included in base scope.
**Risk:** anti-spoofing increases false rejects if over-tuned.
**Note (PRD):** *recommended if regulatory scrutiny is high.*

> **Recommendation.** Revisit this once the target markets are confirmed (**OQ-3**). If launch
> jurisdictions impose meaningful penalties for underage access, this stops being an add-on and
> starts being risk mitigation. It also requires a spoof test set, which takes real calendar time
> to assemble — so the decision wants making before the core build ends, not after.

---

## ✅ Add-On Exit Criteria *(verbatim from client PRD)*

- [ ] Each add-on quoted and scheduled separately from core delivery
- [ ] Admin panel exposes audit metadata only — never raw biometrics
- [ ] Firmware development estimated after hardware/toolchain review
