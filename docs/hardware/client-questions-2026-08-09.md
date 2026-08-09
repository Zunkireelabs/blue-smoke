# Draft message to the client — hardware documents, 2026-08-09

**Status: DRAFT — not sent.** Reasoning behind every question is in
[`hqd-device-architecture.md`](hqd-device-architecture.md); this file is only the text to send.

Two notes before sending:

- Item 1 is the one that actually stops work. If the reply only answers one thing, it should be
  that. The message is ordered accordingly.
- Item 3 (iOS) is a **contract-scope** question, not a technical one. Consider whether it goes in
  this message or in a separate conversation with whoever owns the commercial relationship.

---

## Message

> **Subject: HQD BLE documents — received, and what we still need to connect**

Thanks for the PCBA archive — we've been through all of it. The schematic in particular answered a
lot, and it also surfaced something we should flag early rather than at integration.

**What we understand now.** The board is a two-chip design: the PY32 application MCU handles the
device, and BLE is a separate YC1012 module joined to it by a UART with an AT-command line. That
means the Bluetooth service and characteristics are defined by the YC1012 module's own firmware, and
the `0x01` / `0x02` commands in your protocol document are application bytes carried over that link.

That is workable for us and probably the cheaper path — we would keep our security design and carry
it as payload bytes over the link you already have, rather than asking for new Bluetooth
characteristics. But we can't write the connection code until we know what the module advertises.

**What we need, in priority order:**

1. **The YC1012 module's AT-command / Bluetooth profile manual.** This is the blocker. It has the
   service UUID and the read/write characteristics of the serial link. The chip datasheet you sent
   is a silicon datasheet and doesn't contain them. Without the service UUID our app cannot filter
   for the device during scanning, and a wrong guess fails silently — the app simply finds nothing,
   with no error to diagnose.

2. **The `itronlib` library files.** The protocol document is a usage guide for this SDK, but the
   library itself wasn't in the archive.

3. **iOS.** The SDK is Android-only and connects by MAC address, which iOS does not make available
   to apps — so it can't be ported as-is. Is there an iOS SDK, or is one planned? If not, we can
   likely talk to the module directly from iOS **once we have item 1**, but we'd want to agree that
   approach explicitly since we're building for both platforms.

4. **The correct MCU datasheet.** The schematic specifies **PY32C642F-QFN20**; the datasheet
   supplied is for the **PY32F030**. We'd rather not assume the peripherals carry across.

5. **Sheet 2 of the schematic** (document `H040-BT-SCH`). The title block says "Sheet 1 of 2" and
   only sheet 1 was in the archive.

6. **Which command locks and unlocks the device?** The protocol document's overview says the SDK
   supports locking and unlocking, but the only commands listed are `0x01` (read device info) and
   `0x02` (`setRecordState`) — and the name of the second suggests puff recording rather than
   locking. We don't want to guess at this one.

7. **Auto-lock — please confirm the intended behaviour and duration.** Our understanding from the
   call is that the device self-locks after 5–10 minutes. Nothing in the documents describes it, and
   we want to raise a concern: our design locks within seconds of the phone leaving range, and the
   command that sets that timeout can't currently express a value above about a minute. A ten-minute
   window is a period in which an unlocked device left on a table is usable by anyone who picks it
   up, which is the exact scenario the age gate exists to prevent. We're happy to implement whatever
   you decide — we'd just want the longer duration confirmed in writing, so it's recorded as a
   deliberate product decision rather than our default.

**One thing we can confirm back to you:** the age-gated unlock you asked about is understood as
required. That does put some work on your firmware side — the device needs a per-device key written
at manufacture and a check in the PY32 firmware before it will unlock — so the sooner we can get
our two firmware teams talking directly, the better. Who's the right person for that?

---

## Follow-through after sending

- [ ] Log the send date and recipient in `docs/session-log/anish.md`
- [ ] Register the answers against **OQ-13** / **OQ-14** (`TECHNICAL_SPEC.md` §13), and update
      **OQ-9** with the auto-lock answer
- [ ] Item 7's answer, if it is 5–10 minutes, needs the written acceptance attached to OQ-9 — a
      verbal confirmation does not close it
- [ ] Item 1's answer unblocks `P1-3.0`; re-plan `P1-3.0` / `P1-7.0` the day it arrives
