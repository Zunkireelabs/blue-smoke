# Draft message to the client — product policy decisions, 2026-08-10

**Status: DRAFT — not sent.**

The third of three messages drafted on Day 11 — see the table in
[`commercial-2026-08-10.md`](commercial-2026-08-10.md) for the split and who each goes to.

Everything here is **cheap for the client to answer and expensive for us to guess**. None of it is
a technical question; all of it is a product decision that only they can make. Collectively these
five answers unblock roughly twenty checkboxes across Phases 2 and 3.

Register entries: **OQ-2**, **OQ-3**, **OQ-5**, **OQ-7**, and the sandbox half of **OQ-1**
(`../TECHNICAL_SPEC.md` §13).

---

## Notes before sending

- **Item 1 is the only one that blocks a phase.** `P2-6.0` cannot be finished without it, because
  the fallback path has no destination to send a rejected user to.
- **Item 2 (markets) has a dependency running the other way** — it also determines the data
  residency terms in [`commercial-2026-08-10.md`](commercial-2026-08-10.md) item 3. If the
  commercial recipient and the product recipient are different people, whoever answers markets
  should be told it affects both.
- **Item 5 (brand) looks like the soft one and is not.** It gates the design system, every store
  asset, and the app's name — and store submission needs finished artwork, not a placeholder.
- Keep the framing as *"we need a decision"*, not *"we need information"*. Each of these has a
  default we will otherwise pick ourselves, and the message says so — a stated default is the most
  reliable way to get a real answer.

---

## Message

> **Subject: Five product decisions we need from you — short answers are fine**

Hi — these are all product calls rather than technical ones, so they are yours rather than ours.
None needs a long answer. Where we have a sensible default we have said what it is, so if you are
happy with our suggestion you can simply say "go with your defaults" and we will get on with it.

### 1. What happens when we wrongly reject a real adult? 🔴

This is the one we most need answered.

Identity checks are very good but not perfect. A legitimate 30-year-old will occasionally be
rejected — bad lighting, a worn ID, an unusual document, a genuine vendor error. It will not be
common, but across your user base it will happen, and when it does that person cannot use a device
they have paid for.

We can build a "contact support" route out of that dead end. What we need from you is **where it
goes**:

- **Who reviews these?** A named person or team on your side, or a shared inbox?
- **How does the user reach them** — an email address, a web form, a phone number? We need the
  actual destination to put in the app.
- **How quickly will they get an answer?** Even a rough commitment. We want to tell the user "we
  will get back to you within two working days" rather than leave them wondering, and we can only
  say that if it is true.
- **What can the reviewer actually do?** Specifically: is there someone able to mark an account as
  verified manually, having satisfied themselves the person is an adult? If nobody has that power,
  the fallback is not a fallback — it is a politer dead end.

**Our default if you have no process yet:** a support email address in the app, a plain
acknowledgement that a human will review it, and no time commitment. That is honest but thin, and
it becomes the first impression for exactly the users who are already annoyed with us.

One related note: because verification now runs through an outside vendor, if that vendor ever has
an outage this same route is where *everyone* lands until it comes back. That makes it worth a
little more thought than a rare edge case would justify on its own.

### 2. Which countries are you launching in?

This determines more than we expected:

- **Which ID documents we accept.** A driving licence, a passport and a national ID card are read
  differently, and coverage varies by country.
- **Whether our verification vendor operates there at all.** Not every provider is licensed in
  every market.
- **Which privacy law applies** — and therefore what we must build. European users bring
  requirements that users elsewhere do not, and it is far cheaper to build for them now than to
  retrofit.

A list of countries for launch, plus any you expect to add within a year, is enough.

**Our default:** we build to the strictest regime we know of (European rules), which is safe
everywhere but adds work we might not need.

### 3. Once someone is verified, are they verified forever?

At the moment, when a user passes the age check we record it and never ask again. That is the
simplest behaviour and probably the right one — a person's age does not stop being over 18.

The alternative is re-checking periodically, which some regulated products do to make sure the
account has not changed hands. It costs a verification fee each time and it annoys users.

**Our default: verified once, permanently**, unless you tell us otherwise. Worth thirty seconds of
your thought because changing it later means a migration rather than a setting.

### 4. Test documents for the verification flow

We need to exercise the verification path repeatedly during testing, including the failure cases.
The vendor's test environment lets us simulate passes and failures without any real document, which
covers most of it.

What would help is **a small number of sample documents of the types your actual customers will
use** — the kind of ID a real user in your launch markets would present. Photographs are fine;
these do not need to be real people's documents, and we would rather they were not. Specimen or
sample cards of the right format are ideal.

This is a nice-to-have, not a blocker. It is the difference between testing that the flow works and
testing that it works on the documents your users will actually hold.

### 5. Brand assets

We are building screens now and using placeholder styling, which we will have to redo once the real
thing arrives. To finish, we need:

- **The app's name**, as it should appear on the App Store and on the phone's home screen
- **Logo and app icon**, in a scalable format if you have one
- **Brand colours and fonts**, or an existing brand guide
- **Store listing copy** — a short description, a long description, and screenshots (we can produce
  the screenshots once the styling is settled)

**This is on the critical path for submission**, more than it looks. The stores will not accept
placeholder artwork, the icon has to be produced in a dozen sizes, and the name has to be checked
for availability — all of which happens after we receive the assets, not in parallel with it.

If a brand guide exists in any form, even a rough one, sending it now is more useful than a polished
one later.

---

Short answers are genuinely fine on all five. Where we have named a default, "your default is fine"
is a complete answer and we will proceed on that basis.

---

## Follow-through after sending

- [ ] Log the send date and recipient in `docs/session-log/anish.md`
- [ ] Item 1 closes **OQ-2** and unblocks `P2-6.0` (5 open boxes). 🔴 **The answer must include a
      real destination** — an email address, not "we'll sort it out". If the reply names no one who
      can manually mark an account verified, say so back explicitly: that is the fallback failing,
      and it should be their decision to accept it, recorded as such
- [ ] Item 2 closes **OQ-3**, and feeds the residency terms in
      [`commercial-2026-08-10.md`](commercial-2026-08-10.md) item 3 — **forward the answer to
      whoever is handling the DPA**, they will not see it otherwise
- [ ] Item 3 closes **OQ-5**. If the answer is "verified permanently", record it in
      `TECHNICAL_SPEC.md` §5.2.2 as a decision rather than leaving it as the current implicit
      behaviour — the difference matters if anyone revisits it
- [ ] Item 4 closes the surviving half of **OQ-1**. The tuning half died with the Persona switch;
      do not let the register keep implying otherwise
- [ ] Item 5 closes **OQ-7** and unblocks `P0-7.0` (6 open boxes) and `P3-8.0` (14). **Chase this
      one on a timer** — it is the item most likely to be treated as unimportant by the recipient
      and it sits in front of store submission
- [ ] If nothing comes back within three working days, escalate items 1 and 5 by name. The rest can
      run on defaults; those two cannot
