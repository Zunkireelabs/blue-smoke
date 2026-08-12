# Manufacturer's reply to `manufacturer-requirements-2026-08-10.md`

**Received:** 2026-08-12 (Day 13) · **Channel:** email, forwarded via the client · **Recorded by:** Anish

The manufacturer replied by answering each numbered item from
[`../manufacturer-requirements-2026-08-10.md`](../manufacturer-requirements-2026-08-10.md) inline.
Their original reply was bilingual (English question restated, Chinese restated, then an English
answer followed by a Chinese answer). This file keeps the English text only, numbered to match the
outgoing document, and drops the duplicate restatements. **Nothing has been reworded or
interpreted here** — analysis and consequences live in
[`../hqd-device-architecture.md`](../hqd-device-architecture.md) and
[`../../TECHNICAL_SPEC.md`](../../TECHNICAL_SPEC.md) §13, not in this file.

**What arrived:** this text only, pasted directly into a Claude Code conversation. The reply
referenced attachments — a Bluetooth module spec PDF and other files — that were in a zip visible
only in the sender's own environment at the time this was recorded. **Those files are not yet in
this repo.** See `MANIFEST.md` in this folder for exactly what's captured vs. outstanding.

**Item 6 (schematic sheet 2 of 2 / `H040` vs `H158` board identity) was not answered.** The
manufacturer's reply covers items 1–5 and 7–10; item 6 has no corresponding answer anywhere in the
text received. Treat it as still open, not as an oversight to quietly re-derive an answer for.

---

## 1. How does the device become Bluetooth-discoverable?

The device will start Bluetooth advertising and become discoverable after either re-soldering the
battery to power it on, or by a single button press. The default Bluetooth device name is typically
`YP65-AT`, with the MAC address appended as a unique identifier to distinguish between devices. If
no connection is established within 10 minutes, Bluetooth will shut down and enter sleep mode to
save power. Bluetooth operates normally while the device is powered via USB.

## 2. The YC1012 Bluetooth profile

Please refer to the document `YP65-AT-BLE-module-spec-v1.3-release.pdf`. It contains both the AT
commands and Bluetooth control commands. The Bluetooth stack runs on the **YC8612** — note that
this is the same chip as the YC1012, just with a different silkscreen marking. We will be switching
to YC8612 in the future.

*(The referenced PDF was not received as part of the pasted text — see `MANIFEST.md`.)*

## 3. The `itronlib` library files

We will provide the latest SDK and demo to assist the client with development this Friday
(2026-08-14).

## 4. iOS

Once the Android SDK version is confirmed, we will provide the iOS SDK.

## 5. The correct MCU datasheet

We will use the PY32C642F for this project, not the PY32F030. The datasheet has been updated in the
document package.

*(The updated datasheet was not received as part of the pasted text — see `MANIFEST.md`.)*

## 6. Schematic completeness and board identity

**Not answered.**

## 7. Which command locks and unlocks the device?

Please refer to the table below:

| Command | Frame | Calc | Match |
|---|---|---|---|
| Lock | `02 02 A1 78 D9 01` | `0x02 ^ 0x02 ^ 0xA1 ^ 0x78 = 0xD9` | ✅ |
| Unlock | `02 02 A1 87 26 01` | `0x02 ^ 0x02 ^ 0xA1 ^ 0x87 = 0x26` | ✅ |
| Read Status | `02 01 A2 A1 01` | `0x02 ^ 0x01 ^ 0xA2 = 0xA1` | ✅ |

## 8. Auto-lock behaviour

There is currently no auto-lock function in the firmware. Once a phone connects, the connection
stays active unless the phone actively disconnects Bluetooth or moves out of range. If disconnected,
Bluetooth will remain in an unconnected state; if no reconnection occurs within 10 minutes, it will
shut down and enter sleep mode.

## 9. Manufacturing questions

### 9a. The per-device key

As previously discussed with the Nepa team during their visit to China regarding the product
definition, a unique MAC address is not required. This means that writing a key to each device is
not involved.

### 9b. The device serial number

The application can read the device's unique identifier, which is the Bluetooth MAC address. This
is unique to each device.

## 10. A second board, and battery operation

Red is battery positive, black is output negative and battery negative, blue is connected to output
positive.

*(No answer given on whether a second board is being sent.)*
