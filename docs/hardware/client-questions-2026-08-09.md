# Draft message to the client — hardware documents, 2026-08-09

> 🔴 **Superseded as the outgoing text, 2026-08-10.** The client has said they will forward our asks
> to the manufacturer directly, so the hardware questions were rewritten as a standalone,
> manufacturer-facing document:
> [`manufacturer-requirements-2026-08-10.md`](manufacturer-requirements-2026-08-10.md), with a
> covering note at [`../client-messages/hardware-forward-2026-08-10.md`](../client-messages/hardware-forward-2026-08-10.md).
>
> **Send those, not this.** This file is kept as the working source: the item-by-item reasoning below
> — especially the notes block on why item 9b does not mention a salt — did not survive the rewrite
> and is not recorded anywhere else. Edit both if an item changes.

**Status: DRAFT — not sent, and now superseded (see above).** Reasoning behind every question is in
[`hqd-device-architecture.md`](hqd-device-architecture.md); this file is only the text to send.

**Updated 2026-08-10 (Day 11): a board arrived and we tried to bring it up. It never advertises.**
That added a **new item 1**, ahead of the service UUID, and pushed every previous item down by one —
if you are diffing against the 08-09 draft, that renumbering is the bulk of the change. It also added
a disclosure we owe the client about the PW200. Full account in
[`bring-up-checklist-2026-08-10.md`](bring-up-checklist-2026-08-10.md) §3.0.

**Updated 2026-08-11 (Day 12): added items 9 and 10** — the manufacturing questions behind **OQ-4**
(who writes `K_dev`, and how the key manifest reaches us) and **OQ-12** (what identifies a device,
and whether the client already hashes it), plus a request for a second board and battery operation.
OQ-4 and OQ-12 were absent from this message entirely while being two of the four 🔴 blockers, and
they go to the same factory people as items 1 and 2 — asking them separately would have cost a
round trip.

Notes before sending:

- **Item 1 now outranks everything**, including the service UUID: a UUID is no use while there is
  nothing on the air to find. Item 2 is the next blocker, and if the reply answers only one *sub*-item
  of it, **2h** is the one that reroutes everything else. The message is ordered accordingly.
- **Item 9 is last in the list but not last in urgency** — it is placed there because it bites at
  integration rather than today, and a reader who stops early should still have hit items 1 and 2.
  It is a factory-process question, which is the slowest kind, so it must not slip further.
- **Item 9b deliberately does not mention a salt.** OQ-12's unresolved half is whether the salt is
  ours to choose or something we must match; asking "do you already hash the serial?" resolves that
  without handing the client an internal design decision to make on our behalf. If the answer is
  "we don't", the salt becomes ours and OQ-12 closes without needing anything further from them.
- **This message covers hardware only.** The commercial asks (Persona sign-off, DPA, per-verification
  cost, store accounts) and the product-policy asks (fallback SLA, markets, brand assets) go to
  different people — see [`../client-messages/`](../client-messages/).
- **Do not edit out the PW200 disclosure** near the end. It costs the client a licence credit and
  they should hear it from us before they find it in their own logs.
- Item 4 (iOS) is a **contract-scope** question, not a technical one. Consider whether it goes in
  this message or in a separate conversation with whoever owns the commercial relationship.
- **Every factual claim about the YC1012 here is traceable to the datasheet the client sent us**
  (`YC1012_JD_Datasheet_V1.0.pdf` — 2×2 mm package p.4/7, OTP and AES-128 p.1, HCI-H5 p.1). Keep it
  that way if the message is edited further: an earlier draft described the part as a
  pre-programmed off-the-shelf module, which the datasheet contradicts, and being wrong about a
  client's own hardware is expensive on the one question that matters most. See
  [`hqd-device-architecture.md`](hqd-device-architecture.md) §4.1.

---

## Message

> **Subject: HQD BLE documents — received, and what we still need to connect**

Thanks for the PCBA archive — we've been through all of it. The schematic in particular answered a
lot, and it also surfaced something we should flag early rather than at integration.

**What we understand now.** The board is a two-chip design: the PY32 application MCU handles the
device, and Bluetooth is a separate YC1012 joined to it by a UART with an AT-command line. From the
datasheet you sent, the YC1012 is a bare 2×2 mm chip rather than a pre-programmed module — so the
Bluetooth service and characteristics come from whatever firmware was written for it, and the
`0x01` / `0x02` commands in your protocol document are application bytes carried over the link
between the two chips.

That is workable for us and probably the cheaper path — we would keep our security design and carry
it as payload bytes over the link you already have, rather than asking for new Bluetooth
characteristics. But we can't write the connection code until we know what the chip advertises.

**Since we drafted this, a board reached us and we tried to bring it up** — which turned up something
that comes before all of the below.

**What we need, in priority order:**

1. **What puts the device into a Bluetooth-discoverable state?** We have a board on the bench and it
   never appears over the air. Across about forty minutes of scanning with a standard Bluetooth
   scanner, phone roughly 10 cm from the board, your device never showed up once — while every other
   Bluetooth device in the building did, and we identified and ruled each of them out individually. A
   board that close would normally be the strongest signal on the screen by a wide margin.

   It is not a dead board: two white LEDs blink continuously, and it responds to its button. It
   simply never announces itself.

   So: **does the device advertise continuously, or only after some trigger** — a button sequence, a
   puff, a period away from the charger? And **does it advertise at all while USB is connected**, or
   is Bluetooth suppressed during charging? We have so far only been able to power it over USB, so
   that last one is our own leading theory and easy for you to confirm or kill.

   This sits ahead of item 2 because the service UUID is no use to us while there is nothing to find.

2. **The YC1012's Bluetooth profile — this is the next blocker.** The datasheet you sent is a silicon
   datasheet: it covers pins, power and radio performance, but not what the chip advertises over the
   air. Since the YC1012 is a bare chip rather than a pre-programmed module, that behaviour comes
   from firmware someone wrote for it. **Who programmed it, and can we get the profile definition or
   AT-command manual from them?** Rather than ask for "the manual" in general, here's specifically
   what we need out of it, and what each answer unblocks on our side:

   a. **The advertised service UUID.** Unblocks device scanning — without it our app can't filter
      for your device, and a wrong guess fails silently (the app simply finds nothing, with no error
      to diagnose).
   b. **The write and notify characteristic UUIDs for the data channel.** Unblocks actually opening a
      connection and exchanging bytes once the device is found.
   c. **Maximum message size the link supports.** Our handshake is two 20-byte frames written back to
      back — we need to know if that fits in one write or has to be chunked further.
   d. **Pairing behaviour, and specifically whether the 6-digit PIN can be disabled.** Our design
      authenticates with a challenge–response over a per-device key and has no PIN step at all — a
      device that also insists on its own PIN pairing gives us two competing authentication schemes
      on one link, which is a real conflict to resolve, not a detail to note in passing.
   e. **Whether the service UUID and device name are configurable.** If they are, you may already
      have set your own values, or could set ours — either changes what we build against.
   f. **The AT command list.** This tells us what your own PY32 firmware can change versus what's
      fixed in the YC1012's firmware, which matters directly for item 7 below (lock/unlock) and for
      the auto-lock question in item 8.
   g. **How the chip reports disconnects and reconnects, and the timing involved.** Our proximity
      lock is a UX layer on top of a firmware dead-man timer — the device, not the app, is what makes
      it safe if the phone walks away — so how promptly and reliably a drop is reported shapes that
      design directly.
   h. **Whether the YC1012 runs its own Bluetooth stack, or acts as a controller with the stack on
      the PY32.** The datasheet mentions an HCI-H5 UART, which would imply the second arrangement,
      while the schematic's "AT Command Mode" line implies the first. This decides which chip owns
      the Bluetooth profile — and therefore whose firmware the rest of this question is about. If
      you can only answer one sub-item, this is the one that tells us most.

3. **The `itronlib` library files.** The protocol document is a usage guide for this SDK, but the
   library itself wasn't in the archive.

4. **iOS.** The SDK is Android-only and connects by MAC address, which iOS does not make available
   to apps — so it can't be ported as-is. Is there an iOS SDK, or is one planned? If not, we can
   likely talk to the chip directly from iOS **once we have item 2**, but we'd want to agree that
   approach explicitly since we're building for both platforms.

5. **The correct MCU datasheet.** The schematic specifies **PY32C642F-QFN20**; the datasheet
   supplied is for the **PY32F030**. We'd rather not assume the peripherals carry across.

6. **Schematic identity and completeness.** Two things. The title block of `H040-BT-SCH` says
   "Sheet 1 of 2", and only sheet 1 was in the archive. And the schematic is labelled `H040`
   throughout, while the board photographed in the PW200 guide is silkscreened `AC-H158-V1.01` and
   the firmware file is `H158_Test_260708_01.pkg`. The dates match to the day (`20260702` on the
   board, `260702` in the title block), so we're assuming these are one product under different
   internal codes — but since the schematic is what we're designing against, we'd rather have that
   confirmed than assume it.

7. **Which command locks and unlocks the device?** The protocol document's overview says the SDK
   supports locking and unlocking, but the only commands listed are `0x01` (read device info) and
   `0x02` (`setRecordState`) — and the name of the second suggests puff recording rather than
   locking. We don't want to guess at this one.

8. **Auto-lock — please confirm the intended behaviour and duration.** Our understanding from the
   call is that the device self-locks after 5–10 minutes. Nothing in the documents describes it, and
   we want to raise a concern: our design locks within seconds of the phone leaving range, and the
   command that sets that timeout can't currently express a value above about a minute. A ten-minute
   window is a period in which an unlocked device left on a table is usable by anyone who picks it
   up, which is the exact scenario the age gate exists to prevent. We're happy to implement whatever
   you decide — we'd just want the longer duration confirmed in writing, so it's recorded as a
   deliberate product decision rather than our default.

9. **Two questions for whoever runs manufacturing.** These are the slowest kind of question to
   answer — they involve a factory process, not a document — so we are asking now even though they
   only bite at integration.

   a. **The per-device key.** Age-gated unlock needs each device to carry its own secret, written
      once at manufacture and never changed. **Who writes it, at what point in the line, and how
      does the resulting key list reach us securely?** It cannot travel by email or live in a
      spreadsheet — we would want to agree a delivery method. One note that may help: the YC1012
      datasheet lists 8 KB of OTP memory and hardware AES-128, so the key could live on the
      Bluetooth chip itself rather than needing new storage elsewhere on the board.

   b. **The device serial number.** Our app needs to recognise a device it has paired with before,
      and it does that from a unique per-device identifier rather than the Bluetooth address (which
      iOS does not expose to apps, and which some devices randomise). So: **what uniquely
      identifies one of your devices, where does that value live, and can the app read it over
      Bluetooth?** Also — **is it guaranteed unique across production**, or does it repeat across
      batches? And **does anything on your side already hash or transform that serial** before it
      appears in your own systems? If it does, we need to match exactly what you do; if it doesn't,
      we will choose our own scheme and tell you what it is. Either way this is not something we
      can safely assume, because a mismatch produces no error — every device would simply look
      brand new to the app, forever.

10. **A second board, and how to run one off the charger.** We have one unit and can currently only
    power it over USB, which is also our leading theory for item 1. Three wires (red, blue, black)
    leave the PCBA to a component we can't identify from the schematic sheet we have — **is that a
    battery, and is it safe for us to run the board from it?** A second unit would also let us test
    the phone-walks-away behaviour, which needs one device and one moving phone at minimum, and is
    hard to do with a board tethered to a laptop.

**One thing to flag from our side.** While trying to get the board talking, we pressed the button on
the PowerWriter once, with it connected to the board. It showed the green light your PW200 guide
describes on slide 9 as indicating a successful upgrade — so we take it a firmware flash completed.
We had not run the earlier steps in that guide, so the PW200 evidently arrived from you with the
`.pkg` already loaded. From the same guide we understand this may consume one of your licensed
programming credits; if so, that is one credit used on 2026-08-10, and we would rather you heard it
from us than found it in a log. We have set the programmer aside since — we have no need to flash
anything, only to connect over Bluetooth.

We mention it mainly because it bears on item 1: **the board did not advertise after that successful
flash either.** So its silence does not look like an unprogrammed or half-configured board — it
appears to be what your firmware is meant to do until something we don't know about happens.

**One thing we can confirm back to you:** the age-gated unlock you asked about is understood as
required, and we are building for it. It does put work on your side — the device needs a per-device
key written at manufacture and a check before it will unlock, which is what item 9 is about. The
sooner we can get our two firmware teams talking directly, the better — **who's the right person for
that?** Several of the questions above are ten minutes of conversation between engineers and weeks
of guessing otherwise.

---

## Follow-through after sending

- [ ] Log the send date and recipient in `docs/session-log/anish.md`
- [ ] Register the answers against **OQ-13** / **OQ-14** (`TECHNICAL_SPEC.md` §13), and update
      **OQ-9** with the auto-lock answer
- [ ] Item 8's answer, if it is 5–10 minutes, needs the written acceptance attached to OQ-9 — a
      verbal confirmation does not close it
- [ ] **Item 1's answer is what lets bench bring-up resume at all.** Until it lands there is no GATT
      dump to be had, whatever else we know — see
      [`bring-up-checklist-2026-08-10.md`](bring-up-checklist-2026-08-10.md) §3.0. Register it as a
      new open question in `TECHNICAL_SPEC.md` §13 rather than folding it into OQ-13; they are
      different questions with, quite possibly, different owners
- [ ] **Before chasing item 1, retry on battery power** — it is the cheapest way to pre-empt the
      answer, and if the device turns out to advertise off-charger, item 1 shrinks to a footnote
- [ ] Item 2's answer unblocks `BLE_SERVICE_UUID`; re-plan the wire-level half of `P1-3.0` /
      `P1-7.0` the day it arrives (the transport-independent parts already landed — see
      [`hqd-device-architecture.md`](hqd-device-architecture.md) §8)
- [ ] Item 2h's answer decides whether §6.2's middle path targets the YC1012's firmware or the
      PY32's — record it against **OQ-13** either way
- [ ] Item 6's answer closes `hqd-device-architecture.md` §5.1; if the boards differ, **re-check
      every §4-adjacent claim derived from the schematic** before writing more BLE code
- [ ] Record the PW200 credit in `docs/session-log/anish.md` alongside the send date, so the count is
      traceable if the client ever queries it
- [ ] **Item 9a closes OQ-4; item 9b closes OQ-12** — register both answers in `TECHNICAL_SPEC.md`
      §13. If 9b comes back "we don't hash it", record that the salt is ours to choose and close
      OQ-12 with the chosen value written into §5.2.3, which currently defines the formula and gives
      no value
- [ ] Item 10's answer unblocks the battery retry in
      [`bring-up-checklist-2026-08-10.md`](bring-up-checklist-2026-08-10.md) — but do not wait on it
      if the wires can be identified from sheet 2 (item 6) first
- [ ] The two sibling messages in [`../client-messages/`](../client-messages/) should go out the same
      day. They have different recipients, so one reply does not imply the others are coming —
      **track the three separately**
