# Blue Smoke — What we need from you to build the secure device connection

Prepared for: [Client]
Prepared by: [Your team]
Date: 2026-08-09
Subject: Requirements and open questions after reviewing the HQD PLUS PCBA documents you sent

---

## 1. Background — what we reviewed

Thank you for sending the device documentation package (the HQD PLUS PCBA folder: Bluetooth
protocol notes, firmware files, the PowerWriter programming tool, chip datasheets, and the circuit
schematic). We have gone through all of it in detail and also connected the sample board to the
PowerWriter programmer to inspect it directly.

This document explains, in plain terms, what we learned and **exactly what we need from you (and
from your firmware and factory partners) to deliver the secure lock/unlock feature the product
requires.** We have tried to keep it free of internal jargon — please forward the relevant sections
to your firmware vendor (itron) and your factory as noted.

---

## 2. The core situation (please read this first)

The product's whole safety and age-control promise depends on one idea:

> **The device should only unlock for a verified, adult, authorized owner — and it should lock
> itself automatically when that person's phone moves away.**

To deliver that, the app, our servers, and the **device's firmware** all have to speak a common
secure "language" that we have fully specified in a technical document (we refer to it internally as
our BLE security protocol; we will provide it in full to your firmware team).

**What we found:** the firmware currently on the device does **not** implement this. Today the device
protects its Bluetooth connection with a **6-digit pairing code** and offers only basic commands
(read device info, set a state). A pairing code is not enough for this product, because:

- Anyone who has (or guesses, or is told) the code can unlock the device — including a minor. There
  is no link back to our age-verification and ownership checks.
- There is no evidence the device locks itself when the phone leaves. If safety depends on our app
  being open and running, that is not acceptable for a child-safety feature — phones die, apps get
  closed, the operating system suspends background apps.

We also discovered an important design detail from the schematic: **the Bluetooth is handled by a
separate dedicated chip (the "YC1012") that sits next to the main processor.** This matters (see
Section 4) and adds a question we need your vendors to answer before any firmware timeline is set.

**Bottom line:** we are not asking to change the app or reduce the security design. We are asking
your firmware vendor to build device firmware that implements our secure protocol on this board.
None of our app work can be tested against a real device until that firmware exists.

---

## 3. What we need — Part A: Custom device firmware built to our security specification

This is the main request, and it is for your **firmware vendor (itron)**. We will supply the full
technical specification; this is the plain-language summary of what it must guarantee.

**The three things the firmware must do that it does not do today:**

1. **Lock itself automatically, on its own timer.**
   The device must have a built-in "if I stop hearing from the authorized phone, I lock" timer, in
   the firmware itself. It must NOT depend on our app sending a "lock" command or even being open.
   This is the single most important safety property.

2. **Only unlock after our server has authorized it.**
   Unlocking must require the phone to prove it holds a temporary digital key that our server issued
   — and our server only issues that key after confirming the user passed age verification and owns
   the device. A local Bluetooth pairing code must never, by itself, be able to unlock the device.

3. **Keep the device's permanent secret key on the device forever.**
   Each device is given a unique permanent secret key, programmed in at the factory (see Part D).
   That key must live inside the chip and never be sent out over Bluetooth or any cable. It is used
   only inside the device to recognize the temporary keys our server issues.

Beyond those three, the firmware must implement the specific Bluetooth data channels, the
challenge-and-response security check, the lock/unlock/activate commands, the status reporting, and
the error handling that our specification defines in detail. **Your firmware vendor should implement
our specification exactly as written — the technical values in it are fixed and must not be
substituted or guessed.**

We do **not** expect you or us to write this firmware from scratch or design the security ourselves
— the specification is done. We need itron to implement it on this board.

---

## 4. What we need — Part B: Confirmation that the Bluetooth chip can do this (critical)

Because Bluetooth runs on the separate **YC1012** chip (not the main processor), there is one
question that could affect the whole plan, and it needs answering **before** anyone commits to a
firmware schedule:

> **Can the YC1012 Bluetooth chip be programmed to offer our custom Bluetooth services and data
> channels — or is it limited to a fixed set of built-in features?**

Our security design requires specific, custom Bluetooth channels (with the ability to send live
notifications to the phone). If the YC1012 can only run a fixed, vendor-defined Bluetooth profile,
then our design may need to be adapted — and we must know that now, not late in the build.

**What we need to answer this:** the **YC1012 programming/command manual** (the document that
describes how the main processor controls the Bluetooth chip and what Bluetooth features it can
expose). This is likely held by itron or by the Bluetooth chip's maker (Yichip). We do not have it.

Related design questions for your firmware vendor (they will understand these):
- Where should the security calculations run — on the Bluetooth chip (which has hardware encryption
  support) or on the main processor?
- Which chip stores the device's permanent secret key?
- Which chip runs the automatic-lock timer? (It must be the always-on main processor, so it keeps
  working even when Bluetooth disconnects.)
- What is the exact communication method between the main processor and the Bluetooth chip?

---

## 5. What we need — Part C: Correct and complete documentation

1. **Correct main-processor datasheet.** The datasheet you sent is for a chip called **PY32F030**,
   but the actual chip on the board is a **PY32F002B** (24 KB memory, not 64 KB). We have already
   sourced the correct public datasheet ourselves, so this is resolved — we mention it only so your
   team updates their records. If your firmware vendor uses a slightly different part name
   (**PY32C642**), please confirm which is authoritative.

2. **YC1012 Bluetooth chip programming/command manual** — as described in Part B. This is the most
   important missing document.

3. **Confirm the circuit schematic matches the actual device.** The schematic you sent is titled
   **"HQD-H040BT-MAIN-V1.02,"** but the firmware and board sample are labelled **"H158."** Please
   confirm the schematic corresponds to the H158 board we physically have, or send the matching one.

4. **How firmware updates will be delivered.** Confirm that itron will provide us with finished
   firmware files that we can load onto test devices ourselves using the PowerWriter tool (we have
   it working). This lets us test firmware iterations quickly by email rather than shipping devices
   back and forth.

---

## 6. What we need — Part D: Factory / manufacturing setup

These are for your **factory / production partner**. They are quick to decide but nothing downstream
works until they are settled, so please start these conversations early.

1. **Program a unique secret key into each device at manufacture.**
   Every device needs its own unique permanent secret key written into the chip's one-time
   programmable memory during production. The good news: the PowerWriter tool you already use
   supports this, so it is a process/configuration question, not a new-equipment question. We need
   to agree: who runs this step, and **how the list of device keys is delivered to us securely**
   (this list lets our server recognize each device; it must be handled as highly confidential).

2. **Agree one shared identification value ("salt").**
   Our system needs a single secret value, chosen once, that is used together with each device's
   serial number to identify devices in our database. It must be decided at the factory/firmware
   level and shared with us. It is small and quick to set, but if it is wrong or guessed, devices
   will silently fail to be recognized — so it must be a deliberate, communicated decision. We will
   provide the exact technical method; we just need the agreed value and who holds it.

3. **Confirm which on-device value identifies each unit** (for example, the serial number written
   into the chip), so our records match what the factory programs.

---

## 7. What we need — Part E: Access, test units, and working method

1. **A direct line to itron's firmware engineer, and a review meeting.**
   We would like a short technical review call so itron can read our specification and raise any
   concerns while changes are still easy. Two points specifically need their input: the exact order
   of bytes in the security check (we can only verify this against real firmware), and what the
   device should tell the user if the app and firmware versions ever mismatch.

2. **A properly powered test device.**
   The sample we have is a bare board with **no battery**. We were able to inspect the chip, but the
   Bluetooth radio will not run without proper power, so we could not yet test the Bluetooth side. To
   do real testing we need either the device's battery connected, or a fully assembled unit. (This
   is also needed before any integration testing can happen.)

3. **Keep iterating by file transfer.** Once itron provides firmware built to our spec, we can load
   it onto devices here with PowerWriter and test against our app — no shipping delays.

---

## 8. Decisions and answers only you can provide — quick checklist

| # | What we need | Who answers | Why it matters |
|---|---|---|---|
| 1 | Commit itron to build firmware to our security spec, + a review call | Client → itron | Nothing connects to a real device without it |
| 2 | Confirm the YC1012 Bluetooth chip can host our custom Bluetooth services (+ its command manual) | itron / Yichip | Could change the whole design — answer needed first |
| 3 | Confirm the schematic (H040BT) matches the delivered board (H158) | Client / itron | We may be reading the wrong circuit diagram |
| 4 | Confirm main-processor part number (PY32F002B vs PY32C642) | itron | Correctness of our hardware assumptions |
| 5 | Factory to program a unique secret key per device + deliver the key list securely | Client → factory | Core of the security model |
| 6 | Agree the shared identification "salt" value and who holds it | Client → factory | Devices silently unrecognized if wrong |
| 7 | Provide a powered test device / battery / assembled unit | Client | Needed for any Bluetooth or integration testing |
| 8 | Confirm firmware will be delivered as files we can flash ourselves | Client / itron | Lets us test iterations quickly |

---

## 9. Timeline and why we are raising this now

Sample hardware is expected around Day 26, with joint integration planned for the final days of the
schedule. Firmware is now on the critical path — and because it may also depend on what the separate
Bluetooth chip allows (item 2 above), that question in particular needs answering **this week**, not
when hardware arrives. If firmware only begins once physical devices are in hand, integration will
not fit the remaining schedule.

We are happy to join a call with itron directly, or to send them the technical specification
ourselves — whichever is faster for you. Please let us know the best route.
