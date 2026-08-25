# What we need from the manufacturer — HQD Bluetooth device

**Prepared by the app development team, 2026-08-10. For forwarding to the manufacturer.**

This document lists everything we need from the factory and firmware side to build the mobile app.
It is written to be forwarded as-is.

Internal reasoning behind each item is in [`hqd-device-architecture.md`](hqd-device-architecture.md)
and [`client-questions-2026-08-09.md`](client-questions-2026-08-09.md). Those two files are for us,
not for sending.

---

## Summary — what we are asking for

| # | What we need | Why we cannot proceed without it |
|---|---|---|
| 1 | How to put the device into a Bluetooth-discoverable state | The board on our bench never appears in a scan. Nothing else can be tested until it does. |
| 2 | The Bluetooth profile of the YC1012 chip (service + characteristic UUIDs, AT command list) | The app cannot find or connect to the device without these values. Guessing produces silent failure. |
| 3 | The `itronlib` library files | The protocol document describes this SDK, but the SDK itself was not supplied. |
| 4 | An iOS SDK, or agreement that we talk to the chip directly on iOS | The supplied SDK is Android-only and uses MAC addresses, which iOS does not allow. |
| 5 | The correct MCU datasheet (PY32C642F) | The datasheet supplied is for a different part (PY32F030). |
| 6 | Schematic sheet 2 of 2, and confirmation of board identity | Only sheet 1 was supplied, and board/schematic carry different product codes. |
| 7 | Which command locks and unlocks the device | The protocol document says locking is supported but does not list the command. |
| 8 | The auto-lock behaviour currently in firmware, and its duration | Not described in any supplied document. It affects the safety design. |
| 9 | Manufacturing process for the per-device key and the device serial number | Both are written at the factory. They take longest to arrange, so we ask early. |
| 10 | A second board, and confirmation of how to run a board on battery | We have one unit and can only power it over USB. |

**If only two items can be answered, make them 1 and 2.** Everything else can proceed in parallel
or be worked around; those two cannot.

---

## Background — what we understand so far

Thank you for the PCBA archive. We have reviewed all of it. The schematic answered a great deal.

The board is a **two-chip design**:

- a **PY32C642F** application MCU, which controls the device, and
- a separate **YC1012** Bluetooth chip, connected to the MCU by a UART link using AT commands.

From the datasheet supplied, the YC1012 is a **bare 2×2 mm chip (QFN2\*2_12L)**, not a
pre-programmed off-the-shelf module. So the Bluetooth service and characteristics come from firmware
that someone wrote for it. The `0x01` and `0x02` commands in your protocol document appear to be
application-level bytes carried over the link between the two chips.

This arrangement works for us, and is probably the cheaper path. We would keep our own security
design and carry it as payload bytes over the link that already exists, rather than asking you to add
new Bluetooth characteristics. But we cannot write the connection code until we know what the chip
advertises.

---

## 1. How does the device become Bluetooth-discoverable?

**This is our most urgent question.** A board reached us on 2026-08-10 and we tried to bring it up.
It never appears over the air.

What we observed:

| | |
|---|---|
| Power | Laptop USB-C only. We have not been able to test on battery. |
| LEDs | Two white LEDs blinking continuously while on USB, indefinitely, pattern unchanging. |
| Board button | Pressed. LEDs continued blinking. No device appeared in any scan afterwards. |
| Scanning | Standard Bluetooth scanner (nRF Connect) on an Android phone, roughly 10 cm from the board, repeated scans over about 40 minutes. The device never appeared once. |

Every device that did appear in the scans was identified and excluded individually — three
air-conditioners, a Bluetooth speaker, a TV, a soundbar. A board 10 cm from the phone would normally
read −30 to −50 dBm and be the strongest signal on the screen by a wide margin. Nothing ever was.

The board is not dead: the LEDs blink and it responds to its button. It simply never announces
itself.

Please tell us:

- **a.** Does the device advertise continuously, or only after a trigger — a button sequence, a puff,
  a long press, a period away from the charger?
- **b.** Does it advertise at all while USB is connected, or is Bluetooth suppressed during charging?
  We can currently only power it over USB, so this is our leading theory and should be quick for you
  to confirm or rule out.
- **c.** Is there a pairing mode, and how is it entered?
- **d.** Is there any condition under which firmware disables the radio entirely — low battery, fault
  state, an unprovisioned device?

This question comes before the service UUID. A UUID is of no use while there is nothing on the air
to find.

**Please note:** this board has been programmed. See the note on the PW200 at the end of this
document. It did not advertise after a completed firmware flash either, so "unprogrammed board" is
not the explanation.

---

## 2. The YC1012 Bluetooth profile

The datasheet supplied is a **silicon** datasheet — it covers pins, power and radio performance, but
not what the chip advertises over the air. Because the YC1012 is a bare chip rather than a
pre-programmed module, that behaviour comes from firmware written for it.

**Who programmed the YC1012, and can we get the profile definition or AT-command manual from them?**

Specifically, we need the following. We have noted what each one unblocks on our side:

- **a. The advertised service UUID.** Unblocks device scanning. Without it the app cannot filter for
  your device, and a wrong value fails silently — the app simply finds nothing, with no error message
  to diagnose.
- **b. The write and notify characteristic UUIDs for the data channel.** Unblocks opening a
  connection and exchanging bytes once the device is found.
- **c. The maximum message size the link supports.** Our authentication uses two 20-byte frames
  written one after the other. We need to know whether that fits in one write or must be split
  further.
- **d. Pairing behaviour — in particular, whether the 6-digit PIN can be disabled.** Our design
  authenticates with a challenge–response using a per-device key, and has no PIN step. A device that
  also requires its own PIN pairing gives two competing authentication schemes on one link. This is a
  real conflict that needs resolving, not a minor detail.
- **e. Whether the service UUID and the device name are configurable.** If they are, you may already
  have set your own values, or could set values we specify. Either changes what we build against.
- **f. The AT command list.** This tells us what your PY32 firmware can change versus what is fixed in
  the YC1012's firmware. It bears directly on items 7 and 8 below.
- **g. How the chip reports disconnection and reconnection, and the timing involved.** Our proximity
  lock is a convenience layer on top of a firmware timer in the device — the device, not the phone, is
  what makes it safe when the phone goes out of range. How promptly and reliably a disconnect is
  reported shapes that design.
- **h. Does the YC1012 run its own Bluetooth stack, or does it act as a controller with the stack on
  the PY32?** The datasheet mentions an HCI-H5 UART, which would suggest the second arrangement. The
  schematic's "AT Command Mode" label suggests the first. This decides which chip owns the Bluetooth
  profile, and therefore whose firmware the rest of this question concerns. **If you can answer only
  one sub-item, this is the one that tells us most.**

---

## 3. The `itronlib` library files

The protocol document (`HQD_BLE_Protocol_Commands_Android_EN`) is a usage guide for this SDK, but the
library itself was not in the archive. Please send the library files and any accompanying integration
notes.

---

## 4. iOS

The supplied SDK is Android-only, and it connects by MAC address. iOS does not make MAC addresses
available to apps, so the SDK cannot be ported as it stands.

- Is there an iOS SDK, or is one planned?
- If not, we can most likely talk to the chip directly from iOS **once we have item 2**. We are
  building for both platforms, so we would want that approach agreed explicitly rather than assumed.

---

## 5. The correct MCU datasheet

The schematic specifies **PY32C642F-QFN20**. The datasheet supplied is for the **PY32F030**. We would
rather not assume the peripherals are identical across the two parts. Please send the PY32C642F
datasheet.

---

## 6. Schematic completeness and board identity

Two related points:

- The title block of `H040-BT-SCH` says **"Sheet 1 of 2"**, and only sheet 1 was in the archive.
  Please send sheet 2.
- The schematic is labelled **`H040`** throughout. The board photographed in the PW200 guide is
  silkscreened **`AC-H158-V1.01`**, and the firmware file is **`H158_Test_260708_01.pkg`**. The dates
  match to the day (`20260702` on the board, `260702` in the title block), so we assume these are one
  product under different internal codes. Since the schematic is what we are designing against, we
  would rather have that confirmed than assume it.

---

## 7. Which command locks and unlocks the device?

The protocol document's overview states that the SDK supports locking and unlocking. However, the
only commands listed are `0x01` (read device info) and `0x02` (`setRecordState`) — and the name of the
second suggests puff recording rather than locking.

Please tell us the command, its byte layout, and the response format. We do not want to guess at
this one.

---

## 8. Auto-lock behaviour

Our understanding from an earlier call is that the device locks itself after 5–10 minutes. Nothing in
the supplied documents describes this.

Please confirm:

- **a.** Does the current firmware implement an auto-lock timer?
- **b.** What is the duration, and is it configurable from the app?
- **c.** What is the maximum value the timeout command can express? Our reading of the available
  commands suggests it cannot currently express a value above roughly one minute, which does not match
  a 5–10 minute behaviour.

We will implement whatever is decided. We have raised the product question about the duration
separately, because a long unlocked window is a period in which a device left on a table can be used
by anyone who picks it up.

---

## 9. Manufacturing questions

These are the slowest kind of question to answer, because they involve a factory process rather than
a document. We are asking now even though they only matter at production.

### 9a. The per-device key

Age-gated unlock requires each device to carry its own secret value, written once at manufacture and
never changed afterwards.

- **Who writes it, and at what point in the production line?**
- **How does the resulting key list reach us securely?** It cannot travel by email or live in a
  shared spreadsheet. We would want to agree a delivery method with you.

One note that may help: the YC1012 datasheet lists **8 KB of OTP memory and hardware AES-128**, so the
key could live on the Bluetooth chip itself rather than requiring new storage elsewhere on the board.

### 9b. The device serial number

Our app needs to recognise a device it has paired with before. It does this from a unique per-device
identifier rather than the Bluetooth address, because iOS does not expose the Bluetooth address to
apps and some devices randomise it.

- **What uniquely identifies one of your devices, and where does that value live?**
- **Can the app read it over Bluetooth?**
- **Is it guaranteed unique across all production**, or can it repeat between batches?
- **Does anything on your side already hash or transform that serial** before it appears in your own
  systems? If it does, we need to match exactly what you do. If it does not, we will choose our own
  scheme and tell you what it is.

This is not something we can safely assume, because a mismatch produces no error message. Every
device would simply appear brand new to the app, permanently.

---

## 10. A second board, and battery operation

We have one unit, and can currently only power it over USB — which is also our leading theory for
item 1.

- **Three wires (red, blue, black) leave the PCBA to a component we cannot identify from the schematic
  sheet we have. Is that a battery, and is it safe for us to run the board from it?** Red, black and
  blue is equally consistent with a cell carrying a thermistor and with a heater coil, and we do not
  want to guess with a lithium cell.
- **Could we have a second unit?** Testing the phone-walks-away behaviour needs one device and one
  moving phone at minimum, and is difficult with a single board tethered to a laptop.

---

## Note: the PW200 programmer

While trying to get the board talking, we pressed the button on the PW200 once, with it connected to
the board. It showed the green light that slide 9 of the PW200 guide describes as indicating a
successful upgrade, so we take it that a firmware flash completed. The `NG` light never lit.

We had not run the earlier steps in that guide — installing PowerWriter on a PC, loading the `.pkg`,
uploading it to the programmer — so the PW200 arrived with a `.pkg` already loaded. The image written
was therefore the one already on the programmer, not one we chose.

From the same guide we understand this may consume one licensed programming credit. If so, that is
one credit used on 2026-08-10, and we would rather report it than have it found in a log. We have set
the programmer aside since; we have no need to flash anything, only to connect over Bluetooth.

We mention it mainly because it bears on item 1: **the board did not advertise after that successful
flash either.** Its silence does not look like an unprogrammed or half-configured board. It appears to
be what the firmware is meant to do until something happens that we do not know about.

---

## A direct line between engineers

Several of the questions above are ten minutes of conversation between two firmware engineers, and
weeks of guessing otherwise.

**Who is the right person on your side for our firmware and app engineers to talk to directly?** We
are happy to work by email, but a short call would move items 1, 2 and 9 faster than any document
exchange.

We can also confirm one thing back: the age-gated unlock is understood as required and we are
building for it. It does put work on your side — the device needs a per-device key written at
manufacture, and a check before it will unlock. That is what item 9 covers.

---

## Reference — documents already supplied

For avoidance of doubt, we have received and reviewed:

| File | Status |
|---|---|
| `H040BLE-SCH-V1.02.pdf` | Received — **sheet 1 of 2 only** (item 6) |
| `YC1012_JD_Datasheet_V1.0.pdf` | Received — silicon datasheet, no Bluetooth profile (item 2) |
| `PY32F030_datasheet_Rev1.4_EN.pdf` | Received — **wrong part**, we need PY32C642F (item 5) |
| `HQD_BLE_Protocol_Commands_Android_EN` | Received — usage guide only, **library not included** (item 3) |
| `Instructions for using the PW200 update program.pptx` | Received |
| YC1012 Bluetooth profile / AT-command manual | **Not supplied** (item 2) |
| `itronlib` library files | **Not supplied** (item 3) |
| Schematic sheet 2 of 2 | **Not supplied** (item 6) |
