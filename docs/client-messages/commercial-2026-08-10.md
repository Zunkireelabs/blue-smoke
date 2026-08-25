# Draft message to the client — commercial and legal, 2026-08-10

**Status: DRAFT — not sent.**

This is one of three messages drafted on Day 11. They go to **different recipients** and should be
sent separately:

| Message | Recipient | Covers |
|---|---|---|
| [`../hardware/client-questions-2026-08-09.md`](../hardware/client-questions-2026-08-09.md) | Firmware / engineering | Discoverability, the BLE profile, the factory key, the serial |
| **this file** | Whoever owns the contract | Persona sign-off, DPA, per-verification cost, store accounts, the Day-30 wording |
| [`product-policy-2026-08-10.md`](product-policy-2026-08-10.md) | Product owner | Fallback SLA, markets, re-verification, brand assets |

Reasoning for everything here is in [`../TECHNICAL_SPEC.md`](../TECHNICAL_SPEC.md) §6, §8.6 and
**OQ-11**; this file is only the text to send.

---

## Notes before sending

- 🔴 **This message must go out before [`../ARCHITECTURE-SIGNOFF.md`](../ARCHITECTURE-SIGNOFF.md)
  does.** That document is written against the *old* on-device design and states, in as many words,
  that verification happens "entirely on the phone. No third party, nothing uploaded" (line 28) and
  that "nothing leaves the phone except the word 'pass'" (line 98). Both are now false. Sending it
  as written would be putting a promise in front of the client that the build no longer keeps.
- **Item 1 is the one that actually blocks us.** Items 2–4 are commercially important but do not
  stop code from being written; item 1 does, because we are shipping a privacy posture the client
  has never agreed to in writing.
- **Do not soften item 2.** A per-verification fee in a fixed-price contract is a cost somebody
  absorbs, and if it is never raised, that somebody is us by default.
- **Item 5 is a wording change, not a scope reduction** — but it stops being credible the later it
  is raised. The roadmap said to agree it in Week 1 (`project-roadmap-todos/ROADMAP.md` §5.1); it is
  Day 11.
- This message asks for **decisions**, not information. Expect it to need a call rather than a
  reply, and offer one.

---

## Message

> **Subject: Age verification — a design change we need your written agreement on, plus four
> commercial items**

Hi — a few things that need a decision from your side rather than ours. The first is the important
one and I'd rather set it out plainly than bury it.

### 1. Age verification no longer happens entirely on the phone, and we need that agreed in writing

**What changed.** The original design did ID scanning and face matching on the handset itself,
using the phone's own machine-learning frameworks. Nothing was uploaded; the only thing that ever
left the device was a pass or fail. We have since moved to **Persona**, a specialist identity
vendor: their software captures the ID and the selfie inside their own app component, uploads it to
their systems, and tells our server the result.

**Why we changed it.** Three reasons, and we still think it is the right call:

- **Accuracy.** On-phone face matching was never going to match a specialist vendor, and the
  original design said so. We were carrying an accuracy risk on the single feature that has legal
  consequences if it is wrong.
- **It removed a scheduling dependency.** The on-phone approach needed a labelled set of real ID
  documents to tune against, by around Day 15. Persona's test environment needs no real ID at all.
- **Liability.** Handling ID images and biometric data is a regulated activity. We now do not hold
  that data at any point, which is a materially better position for both of us.

**What it costs, honestly.** The privacy claim changes. It used to be *"it never leaves your
phone."* It is now *"we never hold it — a specialist vendor does, under contract."* That is still a
strong position, but it is a different promise, and it is **your promise to make, not ours**. It
also contradicts the architecture sign-off document we prepared for you, which we have deliberately
held back rather than send you something we no longer believe.

**What we need:** your written confirmation that you accept ID images and selfies being processed by
a third-party vendor. Not because we expect you to object — because a change of this kind should be
on the record as your decision, and it currently exists only as ours.

If you would rather go back to the on-phone design, that is a legitimate answer and we will make it
work. **We would need to know within the week**, because it reinstates the sample-document
dependency and roughly a fortnight of work we have already stood down.

### 2. Who owns and pays for the Persona account?

Persona charges **per verification** — on the order of **one to two US dollars each time a user
verifies their age**. This is a per-user recurring cost, and it is not in the fixed-price scope we
agreed, because the design it belongs to did not exist when that scope was written.

We are not trying to reopen the commercial terms. We do need to know:

- **Whose account is it, and whose card is on it?** Our strong recommendation is that the account
  is yours, opened in your company's name. It holds your users' identity data and, in the long run,
  you should not be dependent on us to reach it.
- If the account is to be ours, we need an agreed arrangement for passing the cost through.

Right now the integration is running against a **developer-owned test account**, which is fine for
building and wrong for launching. Moving it later is straightforward; noticing at launch that nobody
owns it is not.

### 3. The data processing agreement, and where the data lives

Because ID images now go to a vendor, there is a **data processing agreement** to sign with Persona.
This did not exist as an obligation under the old design.

- **Who signs it?** Our view is that it should be you, as the party whose users these are. We can
  handle the mechanics.
- **Which countries may the data be stored in, and how long may the vendor keep it?** These are
  configurable, and the right answer depends on where you are launching — which is a question we
  have also asked your product side.

### 4. Deleting a user's data is no longer something we can do entirely on our own

If a user asks to be deleted, we can remove everything in our systems immediately. But their ID
images sit at Persona, and erasing those means calling the vendor's deletion interface as well.

That is a piece of work — modest, but real, and it is not in the current plan because the design it
belongs to is newer than the plan. **We would like to add it.** Under GDPR it is not optional if you
have European users, which loops back to the markets question. Please confirm you want it built, and
we will slot it in.

### 5. Two administrative things

**a. The Apple and Google developer accounts.** We need to know who owns them and who holds the
signing credentials. Our recommendation, for the same reason as the Persona account, is that both
are registered to your company with us added as developers. If they do not exist yet, **please
start now** — Apple's organisation enrolment involves a legal-entity check that regularly takes one
to two weeks, and it sits directly in front of our release pipeline and the submission itself.

**b. What "delivered" means on day 30.** We will have the app **submitted to both stores with all
compliance materials complete** by the end of the window. What we cannot commit to is it being
**live** — that is review time, which sits with Apple and Google and not with us. Typically one to
three days for Apple and up to a week for Google, and an age-restricted product in a regulated
category attracts additional scrutiny, so we would plan for the longer end.

We would like to record the day-30 deliverable as **"submitted"** rather than "live", with live
expected a few days after. This is not a reduction in what you get. We are raising it now, in the
middle of the build, precisely so it does not look like an excuse manufactured at the end.

Happy to take all of this on a call if that is easier — items 1 and 2 in particular are quicker
talked through than written.

---

## Follow-through after sending

- [ ] Log the send date and recipient in `docs/session-log/anish.md`
- [ ] Item 1's answer closes **OQ-11(a)**. 🔴 **Until it lands,
      [`../ARCHITECTURE-SIGNOFF.md`](../ARCHITECTURE-SIGNOFF.md) must not be sent** — and if the
      answer is "go back to on-device", that is a v1.6 spec reversal, not a tweak: reinstates OQ-1's
      sample-document half and un-deletes `P2-2.0`–`P2-5.0` (67 struck boxes in
      `project-roadmap-todos/TODO-phase-2.md`)
- [ ] Item 2 closes **OQ-11(b)**. Whatever the answer, the Persona template currently in use is on a
      developer-owned account — record the migration as a task the day an account is agreed
      (`TECHNICAL_SPEC.md` §6, and the note at line ~1059)
- [ ] Item 3 closes **OQ-11(c)**; record the residency and retention terms in `TECHNICAL_SPEC.md`
      §8.6, which currently states them as unknown
- [ ] Item 4 closes **OQ-11(d)**. If confirmed, it is **new scope** — add it to
      `TODO-phase-2.md` under `P2-8.0` and say so in the same breath as agreeing it, not later
- [ ] Item 5a closes **OQ-8** and unblocks `P0-5.0` (10 open boxes) and `P3-8.0`
- [ ] Item 5b is the `ROADMAP.md` §5.1 restatement. **Get it in writing** — a verbal "sure, that's
      fine" on a call is exactly what gets forgotten on day 30. Update the Phase 3 exit criteria in
      `TODO-phase-3.md` once it is confirmed
- [ ] Item 3's residency answer depends on the markets question in
      [`product-policy-2026-08-10.md`](product-policy-2026-08-10.md) — if that message has not been
      answered, chase it before assuming a DPA can be finalised
