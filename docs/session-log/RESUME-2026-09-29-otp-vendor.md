# Resume — 2026-09-29, phone-OTP vendor switch (Twilio → ACS) + a public-repo problem

Operational handoff, same convention as [`RESUME-twilio-otp-test.md`](RESUME-twilio-otp-test.md).
The narrative record is in [`sadin.md`](sadin.md), 2026-09-29. **Delete this file once its open
items close.**

---

## 1. 🔴 UNRESOLVED AND MOST URGENT — the repo is PUBLIC

`gh repo view` reports **visibility: PUBLIC** as of 2026-09-29. It was made public to work around
GitHub Actions being blocked by a failed-payment/spend-limit error (which is why PR #36's CI had
been red for a week — the jobs never started).

**What is now world-readable:**

- `docs/hardware/manufacturer-supplied-2026-08-17/H158-itronlib-sdk/**` — the manufacturer's
  proprietary Android SDK, full source
- Three firmware artifacts — `H158_Test_260814_01_.pkg`, `H158_Test_260708_01.pkg`,
  `H158_V0R0_5EDA983B_202607151202.rar`
- Datasheets and the schematic — `YP65-AT` module spec, `YC8612`, `PY32F030`, `YC1012_JD`,
  `H040BLE-SCH-V1.02.pdf`
- The complete BLE transport: frame layout, XOR checksum, and the lock/unlock commands

**Why the last one matters more than it looks.** The device has **no authentication of any kind**
(just-work, unencrypted, no PIN — OQ-16) and **every unit advertises the same Bluetooth name**
(OQ-17, settled by measurement). A public repo documenting the unlock frames is therefore a
working recipe for unlocking any unit within BLE range, and the product's whole age-gating safety
model rests on that lock. The manufacturer's SDK, firmware and datasheets are also very unlikely
to be ours to publish.

**Recommendation made, decision NOT yet taken by the user:** flip back to private and fix the
GitHub billing properly (the original error was a failed payment method — that is the real fix;
going public was the workaround). Going private does not undo exposure — clones, forks and caches
persist — but the window has been hours, not weeks. Worth checking fork/clone traffic and telling
the client.

---

## 2. Where the OTP work stands

### The problem, established by live test — not by reading docs

Twilio Verify is still the configured provider and **cannot send to real numbers at all**. Proven
2026-09-29 by a real `signInWithOtp` against the dev project:

```
sms_send_failed / 422
Error sending confirmation OTP to provider: To send messages or make calls to unverified
numbers, you must have an approved Primary Compliance Profile. ... errors/21608
```

The account is **paid, not trial** ($50 balance, status Active) — so the trial restriction
recorded in `authErrors.ts:10-13` is no longer the cause. The cause is that Trust Hub rejected the
Primary Compliance Profile: business **"Bizmind INC"**, error **`18602`**, *"The Business ID you
provided could not be verified."*

⚠️ **A correction worth not re-deriving:** "Twilio Verify is exempt from the Business Profile" is
**wrong**, and was stated confidently earlier in the session before the live test disproved it.
Verify is exempt from **A2P 10DLC brand + campaign registration** only. The **Primary Compliance
Profile** is required regardless of product. Do not re-run that reasoning.

### The decision

Client team decided (this week, **verbal in a meeting, nothing in writing**) to move SMS delivery
to **Azure Communication Services**. The investigation had first recommended *against* this; it was
overridden same-day on the fact that **the client already has an ACS resource provisioned with a
sender they say is verified**, which removes the 5–6 week provisioning objection. Full reasoning
and the override are in `sadin.md`, 2026-09-29.

### 🔴 The live risk: Nepal

Requirement firmed up to **USA *and* Nepal** (the dev team is in Nepal, so this is also a testing
dependency, not only a market one).

- ACS **direct** SMS is toll-free (US/Canada/Puerto Rico) and short codes (US only). **Nepal is
  not natively supported.**
- Reaching +977 needs **Messaging Connect**, a partner/aggregator layer (Infobip et al.) onboarded
  separately onto the resource.
- Nepal also needs pre-registered alphanumeric sender IDs (Ncell), and is one-way SMS only.

**If the client's sender cannot reach Nepal, revisit the vendor decision rather than working
around it.** Nobody in Nepal can run the live test otherwise.

### State of play

| Thing | Where |
|---|---|
| Branch | `feature/P1-1.0-acs-sms-hook`, pushed, off `stage`, at `ba29aff` |
| The plan | `docs/execution-briefs/P1-1.0-acs-sms-hook.md` — complete, committed |
| Implementation | A **separate Sonnet window** is doing it, working from that brief |
| Its status at handoff | Had reviewed the brief, raised two good objections (both answered and folded into the brief/log), then went idle — it never registered the `Go ahead.` and produced no code |
| Credentials | **Not yet received.** Client questions sent 2026-09-29, awaiting reply |

### Questions sent to the client, awaiting answers

1. ACS endpoint, 2. access key, 3. sender number (E.164)
4. Sender type (toll-free / short code / 10DLC / alphanumeric)
5. Toll-free verification status — **the one that silently blocks everything**
6. Which countries the sender delivers to
7. 🔴 **Does it reach Nepal (+977)? Is Messaging Connect enabled, and via which partner?**
8. Spending cap / quota, 9. business name to appear in the OTP text

---

## 3. Recommended parallel track — not yet started

**Fix the Twilio `18602` rejection at the same time.** It is client-side paperwork, not
engineering, so it costs the ACS branch nothing, and if Nepal turns out to be unreachable on ACS
then Twilio is needed anyway — better to have the ~48h compliance review already running.

The question that decides it: **which legal entity has a verifiable US EIN?** The rejected profile
said "Bizmind INC" while the contact address is `@nepawholesale.com`. Documented causes of `18602`:

- Registration authority must be **EIN or DUNS**, 9 digits, no spaces or dashes
- Legal name must match the EIN **exactly as on the CP 575 EIN Confirmation Letter** — *not* the
  W2/W9 name, which commonly differs. This is the most frequent cause.
- A **newly issued EIN takes 30–90 days** to propagate into validation databases. If Bizmind INC's
  EIN is recent, resubmitting cannot work and the path is an appeal with documents.
- Appeal route: trusthub-verify@twilio.com; Twilio Ops accept documentary proof.

---

## 4. Other open items (carried, not part of this thread)

- **PR #36** (`fix/h158-auto-reconnect`) — auto-reconnect, verified on real hardware, unmerged.
  CI red **only** because billing killed the runners; **re-runnable now the repo is public**. Not
  yet re-run.
- **PR #35** (`docs/resume-2026-09-10`) still open.
- **Two PATs from 2026-09-01** — containment verified, **revocation never confirmed**. Needs a
  human at <https://github.com/settings/tokens>. Now more pressing given §1.
- **Support email domain mismatch** — users see `info@nepawholesale.com`, mail sends from
  `noreply@ble.everestdeploy.com`. Worse phishing signal than before. Resend/DNS change, not code.
- **iOS** — blocked on Apple Developer Program enrolment ($99/yr), no TestFlight, so the ACS work
  will be Android-verified only.

---

## 5. Prompt for a fresh session

```
I'm Sadin, on the Blue Smoke React Native app at
/Users/urbishrestha/Desktop/Project/nepa-project

Read docs/session-log/RESUME-2026-09-29-otp-vendor.md first — it is the state of play and
will save you re-deriving several things that were settled the hard way.

Then read CLAUDE.md, and docs/session-log/sadin.md's 2026-09-29 entry.

Context in one line: phone-OTP SMS delivery is being moved from Twilio Verify to Azure
Communication Services, on branch feature/P1-1.0-acs-sms-hook, implemented by a separate
window from docs/execution-briefs/P1-1.0-acs-sms-hook.md. I'm waiting on client answers
(ACS credentials + whether their sender reaches Nepal).

Two things I especially don't want re-litigated from scratch:
- Twilio Verify is NOT exempt from the Primary Compliance Profile. Proven by live test,
  error 21608. It is exempt from A2P 10DLC only.
- ACS has no native Nepal coverage. That is the live risk against the whole plan.

Tell me where things stand and what you'd do next. Don't start work until I say so.
```
