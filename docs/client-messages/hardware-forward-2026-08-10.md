# Covering note to the client — forwarding the manufacturer requirements

**Status: DRAFT — not sent.** Short covering email. The substance is the attachment:
[`../hardware/manufacturer-requirements-2026-08-10.md`](../hardware/manufacturer-requirements-2026-08-10.md).

Notes before sending:

- The client has offered to forward to the manufacturer, so **the attachment is written to be
  forwarded unedited** — no internal IDs, no spec references, plain language throughout on the
  assumption it may be read in translation.
- **Do not summarise the attachment in the email body.** If the covering note reads as a complete
  question list, the attachment does not get forwarded.
- The PW200 credit disclosure lives in the attachment, section "Note: the PW200 programmer". The
  client sees it when they forward. **Do not remove it from either place.**
- The auto-lock *duration* is a product decision for the client, not the factory. The attachment asks
  the factory only what the firmware currently does; the duration concern stays in
  [`product-policy-2026-08-10.md`](product-policy-2026-08-10.md). Keep that split.

---

## Message

> **Subject: HQD hardware — what we need from the manufacturer (attached)**

Thanks for offering to pass this on.

Attached is a single document listing everything we need from the manufacturer to build the app
against your hardware. It is written so it can be forwarded as-is — it opens with a one-page summary
table, then gives the detail behind each item and what each answer unblocks on our side.

Three things worth knowing before you send it:

**The board you sent us does not appear over Bluetooth.** We had it on the bench for about forty
minutes with a scanner and it never announced itself once, while every other Bluetooth device in the
building did. It is not a dead board — the LEDs blink and the button responds. It simply never
advertises. That is now item 1 in the document, ahead of everything else, because nothing else can be
tested until it is resolved. Our leading theory is that Bluetooth is suppressed while the device is
on USB power, which is the only way we can currently power it — that should be quick for the factory
to confirm or rule out.

**Item 2 is the next blocker.** The Bluetooth chip on the board is a bare 2×2 mm part, not a
pre-programmed module, so its Bluetooth profile comes from firmware someone wrote for it. That
profile document was not in the archive, and it holds the identifiers our app needs in order to find
and connect to the device. We cannot guess these — a wrong value fails silently, with the app simply
finding nothing.

**Items 9a and 9b are for whoever runs manufacturing, not the firmware team.** They cover the
per-device key and the serial number, both written at the factory. They are the slowest kind of
question to answer because they involve a production process rather than a document, which is why
they are in this round rather than a later one.

If there is any chance of a short call between our engineers and theirs, several of these items are
ten minutes of conversation and weeks of guessing otherwise. We have asked for a contact at the end
of the document.

Two separate messages are coming to different people on your side — one on the commercial items and
one on product policy. This one covers hardware only.

---

## Follow-through after sending

- [ ] Log the send date and recipient in `docs/session-log/anish.md`
- [ ] Record the PW200 credit alongside it, so the count is traceable if it is ever queried
- [ ] Register answers against **OQ-4**, **OQ-9**, **OQ-12**, **OQ-13**, **OQ-14** in
      `TECHNICAL_SPEC.md` §13
- [ ] **Item 1 has no OQ row yet** — register it as its own open question in §13, not folded into
      OQ-13. Different question, quite possibly a different owner
- [ ] **Do not wait on item 10 to retry on battery** if the three wires can be identified from
      schematic sheet 2 (item 6) first — that is the cheapest shot at pre-empting item 1 entirely
- [ ] If 9b comes back "we don't hash it", the salt is ours to choose: close **OQ-12** with the chosen
      value written into `TECHNICAL_SPEC.md` §5.2.3, which currently defines the formula and gives no
      value
- [ ] Item 2h decides whether the middle path targets the YC1012's firmware or the PY32's — record
      against **OQ-13** either way
- [ ] Track this separately from the commercial and product-policy messages. One reply does not imply
      the others are coming
