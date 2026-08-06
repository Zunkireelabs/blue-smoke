# Client message — architecture sign-off + six blocking questions

**Drafted:** 2026-08-06 (Day 6 of 30) · **Status:** 🔴 **NOT YET SENT — and currently gated, see below**
**Carries:** [`../ARCHITECTURE-SIGNOFF.md`](../ARCHITECTURE-SIGNOFF.md) as the attachment
**Also carries:** the Day-30 wording change and the hardware questions, **neither of which the
sign-off document covers**

---

## ⛔ Do not send until the verification-vendor question is resolved

`feature/P0-6.0-security-design` (commit `6bbe150`, 2026-08-06) records that a **third-party
verification provider** is under consideration, reversing the on-device-only assumption. **Anish is
actively working that question.** It is not settled either way.

**This message cannot go out while that is open**, because the attachment asserts the opposite in
terms that are hard to walk back:

| Attachment says | Where |
|---|---|
| *"entirely on the phone. No third party, nothing uploaded"* | §2, pillar P2 |
| *"Nothing leaves the phone except the word 'pass'"* | §4, Flow A |
| *"No ID image, selfie, or face data is ever saved, logged, or transmitted"* | §5, rule 1 |
| *"there is no audit trail of who was verified … **It cannot be added retroactively**"* | §5, boxed warning |
| *"❌ Any third-party or government ID-verification service"* — listed as out of scope | §8 |

The boxed warning in §5 is the dangerous one. It asks the client to accept a **permanent** loss of
auditability as the price of the privacy guarantee. If we then adopt a vendor, we will have
extracted a concession for a constraint we did not keep — and the client will reasonably ask why
they were told it was permanent.

**Three ways forward, once Anish's work lands:**

1. **Vendor rejected** → send exactly as drafted. Nothing here changes.
2. **Vendor adopted** → the attachment needs reworking before it is fit to send; §5, §8 and the
   Flow A diagram all invert. Do not send the current version with a verbal caveat.
3. **Still genuinely open at send time** → send the six questions and the wording change, but
   **hold the attachment**, and say the architecture summary follows once one open item closes.
   The six asks do not depend on the verification approach, and OQ-6 and OQ-4 are too urgent to sit
   behind an internal decision.

> Option 3 is the one that preserves schedule. OQ-6 has already cost us milestone M2; it should not
> also wait on this.

---

## Why this file exists

The sign-off document has been written since 2026-08-05 and has never been sent. Everything below
is held by that one fact — no engineering work unblocks any of it.

Recording the draft in the repo does three things: it makes the *content* reviewable before it goes
out, it timestamps what we asked and when, and it means the next person to open this can see
whether the answer ever came back.

**Update the status line above the moment it is sent.**

---

## What this message is holding up

| Blocked | By |
|---|---|
| Milestone **M2** (§4 acknowledged by firmware) — **already missed**, Day 6 | OQ-6 |
| The last three `P0-2.0` boxes | OQ-6 |
| The Phase 1 gate | Sign-off itself |
| Six Day-1 escalation boxes in `TODO-phase-0.md` | All of the below |
| `P0-2.5`, `P1-4.0`, `P3-2.0` — all building against an unratified §4 contract | OQ-6 |
| §4.5 trust chain being testable on real hardware at all | OQ-4 |
| `P2-5.0` threshold tuning (largest line item, 5 d) | OQ-1 |
| `P1-1.0` phone-OTP scope | OQ-3 |

---

## ✉️ The message — send from here down

> **Subject:** Blue Smoke — architecture sign-off, and six things we need from you this week

Hi [name],

The architecture for Blue Smoke is complete and internally consistent, and the specification is
ready for your firmware team. The attached **Architecture Sign-Off** is the ten-minute version —
it covers what we are building, the privacy model and what it permanently costs, and the risks we
are accepting deliberately.

We are on **Day 6 of 30**. Everything on our side that can move without you is moving. But six
items can only be answered by you, and three of them are already affecting the schedule. I have
put them in the order they hurt, not the order they appear in the document.

---

**1. Who is our firmware counterpart, and when can they take a 60-minute walkthrough?** 🔴

This is the most urgent item on the project.

We have written the complete Bluetooth interface specification — every command, byte layout, and
required device behaviour. Your firmware team implements it; firmware is not in our scope, as
agreed. But **no firmware engineer has read it yet**, and we had scheduled that review for Days
3–5. That window has passed.

We are continuing to build against the specification, because stopping would cost more than the
risk. The exposure is that three workstreams — device pairing, lock/unlock, and the mock test rig —
are being built against a contract that the party implementing the other half has not agreed to.
Every day this continues, the cost of a change to that contract goes up.

**We need:** a name, and an hour in their calendar this week. The walkthrough itself is 60 minutes.

---

**2. Who burns the device root key at manufacture, and how does the key list reach us?** 🔴

Each device needs a unique root key programmed into its chip's one-time memory during
manufacture. We hold the matching list on our server. Without it there is nothing for the device
to verify against, and it cannot safely unlock for the right person.

This is a factory-process question, not a software one — which is exactly why we are asking on
Day 6 rather than at integration. It takes longer to arrange than to implement, and it is the
single item most likely to move the delivery date.

**We need:** confirmation of who performs this step, and how the device/key list is securely
delivered to us.

---

**3. Dates for the physical device and physical sample IDs** 🔴

Two hard dates, for two different reasons:

| | Needed by | Why that date |
|---|---|---|
| **Sample government IDs** | **15 August** | Face-match accuracy has to be tuned against real documents. We are building the pipeline and the tuning harness against a stand-in set now, so that when real IDs arrive the tuning is hours rather than days — but the tuning itself cannot be faked or skipped. |
| **Physical device** | **26 August** | This is the last date at which joint firmware integration testing still fits before submission. |

If either date is not achievable, we would rather know now and re-plan than discover it in the
final week.

---

**4. The manual-review fallback: who owns it, through what channel, and what response time?**

On-device face matching will occasionally reject a legitimate user — this is inherent to the
approach and to the privacy guarantee, and it is why the sign-off document lists it as an accepted
risk. Those users need somewhere to go.

That route is a business process, not a feature we can design for you. **We need:** who handles
these cases, how the user reaches them, and what response time you want us to state in the app.

---

**5. Which countries are we launching in?**

This blocks a scope decision that is already on the table. Phone-number + SMS login was added
alongside email + password (§9 of the attached document, +2 person-days). SMS delivery, cost, and
regulation are all country-specific, so it cannot be built reliably against unknown markets.

**We need:** target launch countries, and a decision on who owns and pays for the SMS provider
account (Twilio Verify).

---

**6. Apple and Google developer accounts**

We need access, and the signing assets, before we can produce a build that runs on your devices
rather than ours. This is quick to arrange and slow to discover you have not arranged.

**We need:** account ownership confirmed and access granted.

---

### One wording change we need agreed now, not on Day 30

The current Phase 3 exit criterion reads *"App is live on both the App Store and Google Play."*

We control **submission**. We do not control **review**. Apple typically takes 1–3 days and Google
1–7 — and an age-restricted product in a regulated category attracts additional scrutiny, which
your own requirements document flags as a risk.

We propose restating the Day-30 deliverable as **"submitted to both stores, with all compliance
materials complete."** *Live* then falls somewhere around Day 32–37, outside the development
window.

**This is a wording change, not a reduction in scope or effort** — the same work is delivered on
the same day. But it has to be agreed now to be credible. Agreed in Week 1 it is a shared
understanding of how app stores work; raised on Day 30 it sounds like an excuse.

---

### On the hardware you sent us

Thank you — it is already useful. We have identified it as an ICWorkshop PowerWriter PW200
production firmware burner, wired to a PCB with a battery and airflow sensor.

We have deliberately **not** powered or programmed anything, because pressing the burn button may
consume a licence credit, and a failed flash-readout attempt would mass-erase the chip and destroy
the firmware image on it — which we could not restore.

Four questions before we go further:

1. **Are the TX/RX pins wired in the harness?** The serial port opens but the line is silent. We
   want to know whether there is a debug output we should be listening to.
2. **What MCU and Bluetooth chip are on the board?** We can read the markings, but a definitive
   part number from you is faster and settles whether two of our security requirements are
   implementable as written.
3. **Is the firmware currently on the board (V0832) the baseline your §4 firmware will be built
   from**, or is that a separate effort? This changes what "integration" means on 26 August.
4. **Is this board representative of the production device**, including the enclosure and antenna?
   It determines whether the range measurements we take from it will transfer.

---

### What we need back, and by when

| | Item | Needed |
|---|---|---|
| 1 | Firmware contact + walkthrough slot | **This week** |
| 2 | Factory key programming owner + delivery method | **This week** |
| 3 | Sample IDs / device dates | Confirm this week; IDs by **15 Aug**, device by **26 Aug** |
| 4 | Manual-review owner, channel, response time | Before verification ships |
| 5 | Target countries + SMS account owner | Before that work starts |
| 6 | Developer account access | Before the first test build |
| — | "Submitted by Day 30" wording agreed | **This week** |
| — | Hardware questions | When convenient |

Items 1 and 2 are the ones I would like to close this week. The rest have more room, but they all
have a date at which they stop being answerable in time.

Happy to walk through any of it on a call.

Best,
[name]

---

## Notes for whoever sends this — not part of the message

- **Fill in `[name]` twice** and check the greeting matches how you normally address them.
- **Attach `ARCHITECTURE-SIGNOFF.md`** — the message assumes it is attached and does not restate it.
  Consider exporting to PDF; the ASCII diagrams survive Markdown viewers badly.
- **Do not soften item 1.** M2 has already slipped and the honest framing is what makes the ask
  land. It is written to be direct without assigning blame — the review window passing is stated as
  a fact, not a complaint.
- The Day-30 wording change is placed **after** the six questions on purpose. It is the item most
  likely to trigger a defensive read, and it lands better once the message has established that we
  are ahead of the problems rather than making excuses for them.
- The hardware section deliberately leads with thanks and with what we did **not** do. It reads as
  care, and it pre-empts "why haven't you tested it yet".
- **When it is sent:** update the status line at the top of this file, tick the six Day-1
  escalation boxes in `TODO-phase-0.md`, and note it in `session-log/sadin.md`.
