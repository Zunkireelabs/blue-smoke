# The HQD device is a two-chip design, and it changes what §4 can be

**Recorded:** 2026-08-09 (Day 10) · **Author:** Anish · **Branch:** `feature/ble-connectivity`
**Status:** first-hand reading of client-supplied documents. Conclusions marked **verified** are
printed in those documents; conclusions marked **inferred** are mine and need client confirmation.

> **Read this before writing any BLE scan, connect, or GATT code** — and read **§8 with it**, which
> states precisely what is blocked (one constant, plus the wire-level half of the §4.5 handshake) and
> what is not. Most of `P1-3.0`/`P1-7.0` is neither, and landed on Day 10 against the mock. An
> earlier version of this line said the two tasks "have not started"; that was true for about six
> hours and then stalled an execution attempt that read it and stopped. Source documents are in
> [`client-supplied-2026-08-09/`](client-supplied-2026-08-09/MANIFEST.md).
>
> Companion record: [`client-supplied-hardware.md`](client-supplied-hardware.md) covers the PW200
> burner and the PCB itself *(that file currently lives only on the unmerged
> `docs/hardware-record-client-supplied` branch — merge it and these two sit side by side)*.
>
> **Day 12 update:** the manufacturer answered most of §7's questions —
> [`manufacturer-supplied-2026-08-12/manufacturer-response-2026-08-12.md`](manufacturer-supplied-2026-08-12/manufacturer-response-2026-08-12.md)
> — and, later the same day, **the actual BLE profile PDF surfaced** (§3.2.1), closing most of OQ-13:
> the real service is `0xFFF0` with five generic characteristics `0xFFF1`–`0xFFF5`, not the invented
> 128-bit UUID in `protocol.ts` today. Two other answers are more urgent than the ones they closed:
> **no per-device key is written at manufacture**, and **no firmware auto-lock timer exists**. Both
> are recorded in §6.3/§6.4 below and escalated in
> [`../client-messages/architecture-escalation-2026-08-12.md`](../client-messages/architecture-escalation-2026-08-12.md) —
> read that section before assuming §4.5 or §4.6 can be implemented against real hardware as
> currently specified. Also: the Bluetooth chip on this board is now marketed as **YC8612** — same
> YC1012 silicon, different silkscreen only, confirmed by its own datasheet (§4.1). Treat "YC8612"
> anywhere below or elsewhere as the same part, not a second unresolved chip.

---

## 1. The finding in one paragraph

The client sent us their device's BLE documentation so that our app can talk to their device. That
direction matters: **we are building to their hardware, not waiting for them to implement
[`TECHNICAL_SPEC.md` §4](../TECHNICAL_SPEC.md).** What they sent describes a device whose BLE stack
lives on a **second chip** — a separate Bluetooth SoC (YC1012), joined to the application MCU by a
2-wire UART, running its own firmware. Our §4 defines six custom GATT characteristics on a custom
128-bit service. On this hardware those characteristics would have to be defined in that second
chip's firmware, which we do not have and whose author we have not identified. **Our §4 GATT layout
is probably not implementable as written**, and the fix is an architectural one, not a sprint task.

**Corrected 2026-08-09, later the same day.** An earlier version of this paragraph called the
YC1012 an "off-the-shelf module running a third-party vendor's firmware" and treated that as
settled. Reading the datasheet properly (§4.1) shows it is a **bare 2×2 mm SoC**, not a
pre-programmed module — so the firmware on it was written by *someone*, and who that someone is
is an open question rather than an answered one. It may well be the client's own contractor. The
distinction matters commercially: it decides whether the document blocking us is a third party's
to release or the client's to hand over.

---

## 2. What the schematic shows — the decisive evidence

`H040BLE-SCH-V1.02.pdf`, doc `H040-BT-SCH`, HQD TECH, 2026-07-02. **Verified — this is printed on
the sheet.**

Two processors:

| Part | Role |
|---|---|
| **PY32C642F-QFN20** | Application MCU. Heater control, button, RGB LEDs, MEMS microphone (puff detection), BM9073 charge management. |
| **YC1012** | Bluetooth SoC. Nothing else. QFN 2×2 mm, 12 pins — see §4.1. |

They are joined by:

- a **2-wire UART**,
- a net labelled to select **"AT Command Mode"**,
- an interrupt line labelled **"BLE Module Wake-up MCU"**.

Also on the board: `BM9073` charger, `S087A` MEMS microphone, RGB LEDs, a button, heater drive, and
an SWD header whose pinout matches the PW200 burner already in our possession.

### 2.1 What that implies (**inferred**, but hard to read another way)

An AT-command line and a wake interrupt are the signature of a **radio you configure, not a stack
you compile**. The GATT table — service UUID, characteristic UUIDs, properties, MTU behaviour —
is defined by **the firmware running on the YC1012**, and HQD's application firmware on the PY32
sends and receives **bytes over a serial-over-BLE pipe**; it does not define characteristics.

**Who wrote that YC1012 firmware is not established.** The AT-command line suggests stock
configure-by-command firmware, which usually comes from the silicon vendor. But the part is a bare
SoC with 8 KB of OTP and a serial-wire debug port (§4.1) — it is programmable by anyone with the
toolchain, and the protocol document in the same archive was authored at `@itron.com.cn`, a third
party who evidently writes software for this device. Both readings fit the evidence. §7 question 1
asks directly rather than assuming.

Which explains the protocol document exactly (§3): HQD's `0x01` and `0x02` are **application-layer
command bytes inside that pipe**, not GATT characteristics. They were never the same kind of thing
as our C1–C6.

---

## 3. What the protocol document actually is

`HQD_BLE_Protocol_Commands_Android_EN.md`, v1.0.0, 2026-06-09, marked *"Ongoing Update"*.
**Verified — all of the following is what the document does and does not contain.**

It is a **usage guide for an Android SDK called `itronlib`**. It is not a GATT specification.

**What is absent:** service UUID, characteristic UUIDs, byte layouts, frame formats, result codes,
MTU, notification semantics. Everything §4 is made of.

**The library itself is not in the archive.** So we have neither the wire protocol nor the code that
speaks it.

### 3.1 Its security model vs. ours

| | HQD document | `TECHNICAL_SPEC.md` §4 |
|---|---|---|
| Pairing | **6-digit PIN**, entered on first connect | BLE bonding + §4.5 challenge/response |
| Device authentication | none beyond the PIN | `K_dev` in OTP → HKDF → `K_sess`, AES-128-CMAC proof |
| Replay protection | none documented | nonce `N` + monotonic counter, tag over `N ‖ bytes[0..11]` (§4.6) |
| Session expiry | none documented | `expiresAtDelta`, authenticated inside the proof |
| Age gating | none documented | server-issued, `age_verified` checked server-side |

A 6-digit PIN is a **pairing** mechanism. It is not device authentication and it does nothing for
inviolable rule 3 — anyone who can pair can unlock. Our security model is not an embellishment of
theirs; the two do not overlap.

### 3.2 Its command set

Two commands, total:

| Command | SDK call | Returns |
|---|---|---|
| `0x01` | `readDeviceInfo()` | `DeviceInfo` — **Device SN, Device Lock Status** |
| `0x02` | `setRecordState(state: Boolean)` | `DeviceStatusMessage(state: Boolean)` |

The document's own overview claims the SDK "supports … unlocking and locking devices". **No
lock/unlock command is documented.** `0x02` is the only writable command and its name says
*record*, which reads as puff-recording, not locking. **Do not assume `0x02` is unlock** — that is
an unverified hypothesis and it is question 6 in §7 below.

Note what `DeviceInfo` *does* return: **SN and lock status**. Those are the two fields our pairing
flow most needs, which is mildly encouraging about the middle path in §6.

**Day 12 addition — do not conflate with the above.** The manufacturer's reply to §7 question 6
supplied three frames directly, described as the lock/unlock/read-status commands, each carrying an
XOR checksum:

| Command | Frame | Checksum |
|---|---|---|
| Lock | `02 02 A1 78 D9 01` | `0x02 ^ 0x02 ^ 0xA1 ^ 0x78 = 0xD9` ✅ |
| Unlock | `02 02 A1 87 26 01` | `0x02 ^ 0x02 ^ 0xA1 ^ 0x87 = 0x26` ✅ |
| Read Status | `02 01 A2 A1 01` | `0x02 ^ 0x01 ^ 0xA2 = 0xA1` ✅ |

These are **not** the `itronlib` SDK's `0x01`/`0x02` calls above — they were supplied directly by
the manufacturer, not read from the protocol document, and their relationship to `readDeviceInfo()`
/ `setRecordState()` is not yet established. **The profile PDF (§3.2.1 below) confirms the container
but not the placement**: these bytes travel as the payload of a write to one of the module's five
generic `0xFFF1`–`0xFFF5` characteristics, opaque to the module itself — but *which* of the five
HQD's PY32 firmware actually uses for this traffic is not stated anywhere received so far. **Not yet
promoted into `protocol.ts`** for that reason — treat as manufacturer-supplied data pending
verification, not as confirmed wire format.

### 3.2.1 The real profile, Day 12 — this is what closes most of OQ-13

`YP65-AT-BLE-module-spec-v1.3-release.pdf` (v1.3, 壹原理科技/YIPRINCIPLE, built on a YiChip BLE SoC)
arrived later the same day as the manufacturer's text reply, in
[`manufacturer-supplied-2026-08-12/`](manufacturer-supplied-2026-08-12/). **This is the document §7
question 1 has been asking for since Day 9.** It is a real GATT profile, not a usage guide like
`HQD_BLE_Protocol_Commands_Android_EN.md` — and it describes a module, the **YP65AT**, that is
narrower and more generic than anything either prior document implied.

**The service.** Private service **`0xFFF0`** (a standard 16-bit Bluetooth SIG-style short UUID,
not the invented 128-bit `42530001-…` in `protocol.ts`), with five identical-shaped characteristics:

| UUID | Properties | Handle |
|---|---|---|
| `0xFFF1` | Notify + Write No Response | `0x002a` |
| `0xFFF2` | Notify + Write No Response | `0x002d` |
| `0xFFF3` | Notify + Write No Response | `0x0030` |
| `0xFFF4` | Notify + Write No Response | `0x0033` |
| `0xFFF5` | Notify + Write No Response | `0x0036` |

There is **no per-characteristic function split** — the module is a generic multi-pipe serial
transport, exactly as §6.2's "middle path" recommendation assumed. Our six purpose-built C1–C6
characteristics never existed on this hardware; §4's message types would become payload bytes inside
whichever of these five pipes HQD's firmware picked, framed however HQD's firmware frames them (the
lock/unlock/read-status bytes in §3.2 above are a first, unconfirmed data point on that framing).

**Also present, and unrelated to lock/unlock: a standard HID service `0x1812`** (`0x2A4D` Report,
`0x2A4C` HID Control Point, etc.), used for volume/screen-off/media-navigation keys via a documented
HID-over-GATT report format. **Do not confuse this with the security design** — it's a consumer
remote-control feature the module supports independently, sharing the radio but nothing else with
whatever channel carries HQD's lock commands.

**What this closes:**
- **§7 question 1a/1b (service + characteristic UUIDs):** ✅ answered — `0xFFF0` / `0xFFF1`–`0xFFF5`.
- **§7 question 1c (max message size):** ✅ answered — default local MTU is 185 B (§12.1.3's notes),
  comfortably larger than §4.5's two 20-byte frames.
- **§7 question 1g (disconnect reporting):** ✅ answered — explicit `AT+CONNECT` / `AT+DISCONN` UART
  events to the host MCU, not something the app needs to infer from GATT alone.
- **§7 question 1h (which chip runs the stack):** ✅ confirmed — the module owns the full BLE stack;
  the PY32 talks to it over UART as a black box, matching the AT-command reading over the HCI-H5
  reading.
- **§7 question 1e (configurability):** ✅ partially — `AT+NAME=` and `AT+ADVDA=` exist, so name and
  advertising data are configurable; the *service* UUID itself is not shown as configurable (no
  `AT+` command sets it), so `0xFFF0` reads as fixed by the module's firmware.

**What is still not closed:**
- **§7 question 1d (can the 6-digit PIN be disabled):** the profile document has **no PIN, pairing,
  or bonding AT command anywhere in it.** Re-checked 2026-08-12 by searching the full text
  extraction for `PIN`, `pair` and `bond` — **no hit anywhere in the document**, so this is confirmed
  absent by search rather than missed on a skim. Either this module doesn't implement the PIN pairing
  the `itronlib` protocol document described, or it's handled at a layer this document doesn't cover.
  Unresolved — the two documents don't agree and neither says so explicitly.
- **Which of `0xFFF1`–`0xFFF5` HQD's firmware actually uses**, and the exact framing of the
  lock/unlock/read-status bytes within it — not stated by this document, since it documents the
  generic module, not HQD's application firmware built on top of it.
- **Who wrote HQD's firmware that decides all of the above** is still, strictly, the same open
  question as before — this PDF documents the *module* IPRINCIPLE/YiChip supply, not HQD's own
  firmware layered on it.

### 3.2.2 The same PDF, read properly — the module as hardware (Day 13)

**Why this section exists.** §3.2.1 was written from a first pass that took the GATT table and
stopped. `pdftotext` **drops this document's Chinese body text entirely** — only Latin tokens,
tables and command literals survive — so the hardware and AT-command sections looked empty and were
skipped. A second pass recovered what follows. **Do not assume even this exhausts the document:**
the prose around every table below is still unread, and §8 (the mechanical drawing) is an image that
neither `pdftotext` nor `pdfimages` could reach on this machine.

**🔴 The headline: `YP65` is a 5-pin module, not the bare QFN12.** §4's pin table:

| Pin | Name | Type | Function |
|---|---|---|---|
| 1 | *(name did not extract)* | | |
| 2 | `GND` | — | |
| 3 | `IO4` / `IO6` | DIO | BLE-TX / BLE-RX |
| 4 | `IO5/ICE` | DIO | Wakeup IO; selects **AT vs DATA** mode |
| 5 | `VIN` | PWR | 1.8–4.3 V |

That is a precise match for the schematic's three annotations — the 2-wire UART, the net labelled
"AT Command Mode", and the "BLE Module Wake-up MCU" interrupt (§2). **But the schematic draws a bare
`YC1012` QFN12, and this document describes a module.** Both cannot be literally true of the same
board. This is now the live form of the remaining OQ-13 question and it is **not resolved here** —
it decides what to physically look for on a board (a 5-pin castellated module with its own antenna
is far more findable than a 2 × 2 mm QFN, see §5.1) and whether §4.1's chip-level facts apply
directly or through a module wrapper.

**Electrical and RF** (§5–§7): `VIN` 1.8–4.3 V, `VIN/HVIN` to 5.5 V, ambient −15…+85 °C. Current:
sleep **1.5 µA**; sniff @110 ms interval **135 µA**; discoverable **356 µA** @100 ms ADV interval,
**40 µA** @1000 ms. TX **+5 dBm**, RX sensitivity **−97 dBm** @1 Mbps. Note these differ from the
YC8612 datasheet's +8 dBm / −96.5 dBm (§4.1) — consistent with module-versus-bare-silicon, and
another small pointer at the discrepancy above.

**Boot timing** (§10): after `VIN`, the module boots ~**50 ms** then loads a UART patch ~**100 ms**;
the host MCU must not talk to it before that completes. Worth knowing at bring-up before concluding
a module is dead.

**UART framing** (§12.1.3, §12.2.2): host→module is `handle_lo handle_hi` + payload, little-endian —
`2a 00 01 01 02 03` writes payload `01 01 02 03` to handle `0x002a` (= `0xFFF1`). Events return the
same shape. **The consequence worth stating plainly: the handle prefix is UART-side only.** HQD's
`02 02 A1 78 D9 01` lock frame (§3.2) therefore appears on the BLE side **unchanged** — what a
sniffer or `nRF Connect` sees is the manufacturer's bytes exactly as supplied, with no module
wrapper around them. Also confirmed here: **MTU 185**.

**AT command surface.** Commands: `AT`, `AT+RX`, `AT+RESET`, `AT+STATE`, `AT+VERSION`, `AT+NAME=`
(≤29 bytes; the name is carried in the **scan response**), `AT+ADDR=`, `AT+TXPWR=`
(`0`→+5 dBm, `1`→0, `2`→−5, `3`→−10 dBm), `AT+BAUD=`, `AT+ADVDA=`, `AT+ADVINT=` (32–16000 ×
0.625 ms; default 320 = 200 ms), `AT+ADVEN=0|1`, `AT+RTCEN=0|1`, `AT+RTCDA=`, `AT+SLEEP=0|1|2`,
`AT+HIDEN=0|1`. Events: `AT+CONNECT`, `AT+DISCONN`, `AT+POWERDWN`, `AT+IAMREADY`.

Three of those change something we are actively tracking:

1. **`AT+ADVEN=0` disables advertising outright.** So a board that never advertises is not
   necessarily broken or unpowered — HQD's firmware may hold the radio silent by design until some
   trigger. This is a **third** explanation for the bench silence, independent of wrong-board and
   no-battery; recorded in `bring-up-checklist-2026-08-10.md` §3.0b.
2. **Default advertising data is `02 01 06` — Flags only, no service UUID** — and the name lives in
   the scan response. **The scanner cannot filter on `0xFFF0`**; it must match on the name prefix
   `YP65-AT`. This settles the open worry in the bring-up checklist's §3.1 note and is the input
   `scanner.ts` needs.
3. **`AT+ADDR=334455667788` sets the Bluetooth MAC** — see §6.4, where this matters a great deal
   more than it does here.

**And a real-time clock.** `AT+RTCEN=0|1` enables it; `AT+RTCDA=6955F140` sets it, annotated in the
document itself as `1,767,240,000` = `2026-01-01 12:00:00` — a standard Unix epoch (arithmetic
checked: `0x6955F140` is exactly 1,767,240,000). Also see §6.4.

### 3.3 The platform problem

The SDK is **Android-only**, and it connects by **MAC address** (`connectDevice(mac: String)`).

iOS does not expose BLE MAC addresses to applications — CoreBluetooth gives you an opaque,
per-installation `CBPeripheral.identifier`. **An API keyed on MAC cannot be ported to iOS.** No iOS
SDK appears anywhere in the archive, and none is mentioned.

We are contracted for **both platforms** (Definition of Done: "works on **both** iOS and Android, on
a **physical** device"). This is a scope problem, not a porting inconvenience.

---

## 4. Chip capabilities — what the silicon can actually support

**Verified from the datasheets supplied.**

### 4.1 YC1012_JD — read properly, 2026-08-09

`YC1012_JD_Datasheet_V1.0.pdf`, 13 pages, Yichip Microelectronics. Page numbers are the PDF's own.

**Day 12 — same chip, new name, confirmed by its own datasheet.** The manufacturer stated the
Bluetooth stack runs on this part, now marketed as **YC8612**; `YC8612_Datasheet_V1.0.pdf` (received
the same day, in
[`manufacturer-supplied-2026-08-12/`](manufacturer-supplied-2026-08-12/)) confirms it byte-for-byte
against the YC1012 datasheet above — identical `QFN2*2_12L` package, 8 KB OTP, AES-128 HW, HCI-H5
UART, 24 MHz core. Same silicon, different silkscreen marking, with future board revisions switching
to the YC8612 label. This also answers §4.2's open question below in favour of the AT-command
reading, now doubly confirmed by the module profile in §3.2.1 — the module owns the full BLE stack;
the PY32 is a UART client, not a host running its own Bluetooth stack.

| Fact | Page | Why it matters |
|---|---|---|
| **`QFN2*2_12L`** — package code printed under the part number in the pinout diagram; the pin table numbers 1–12 and stops | 7, 8 | **A bare SoC, not a module.** This is the correction; everything below follows from it |
| **8 KB OTP** with internal charge pump | 1 | Somewhere to put `K_dev` — **OQ-4** |
| **AES-128 hardware encryption** | 1 | The primitive §4.5/§4.6 need, in silicon |
| **Pin 7 = `RF ANT port`**, "integrated balun … direct connection to antenna" | 1, 8 | **No antenna inside the part.** The host PCB must carry a trace or chip antenna |
| **Pins 5/6 = `XTAL_OUT`/`XTAL_IN`** | 8 | A crystal must sit beside it — BLE timing tolerance rules out running on the internal RC alone |
| **1 × UART (RTS/CTS) with HCI-H5**, up to 3.25 Mbps | 1 | See §4.2 — this is the one that could change the architecture |
| Bluetooth 5.4, +8 dBm TX, −96.5 dBm RX @ 1 Mbps | 1 | Ample for a proximity-lock product |
| 24 MHz 32-bit core, 8 KB RAM, serial-wire debug | 1 | Programmable by anyone with the toolchain |

**On the millimetres.** What is *printed* is the package code `QFN2*2_12L`. The 2 × 2 mm reading is
the industry convention for that code, not a dimension anyone here has measured — page 13's
dimension drawing is an **image**, so text extraction returns only its caption and the actual
figures were not read. The convention is reliable, but this document's whole reason for existing is
that an inference got recorded as a fact once already. If an exact footprint ever matters, open
page 13 in a viewer.

**Identifying it on a board.** At that size it is smaller than many of the passives and easy to miss
entirely — it was not identifiable in the client's PW200 photos, and **its absence from those photos
is not evidence of anything.** Look instead for the **trio**: a ~2 mm 12-pin part, a small crystal
beside it (pins 5/6), and a thin track running from one corner (pin 7) to a clear area at the board
edge. Recorded so the next person reads this table instead of the 13-page PDF.

**Document wart, noted so it isn't mistaken for a finding.** Page 7's pin table carries a stray
column header reading `QFN40` above a table that lists twelve pins. It appears to be editing debris
from another part's datasheet. The diagram label and the pin count agree on 12; the `QFN40` is
ignored deliberately, not overlooked.

The datasheet contains **no UUID information and no AT-command reference.** It is a silicon
datasheet, not a protocol manual. **That protocol manual is the single document that would unblock
`BLE_SERVICE_UUID`.**

### 4.2 The HCI-H5 line, and why it is worth asking about

The datasheet advertises a UART speaking **HCI-H5** — the standard Bluetooth host/controller
interface. If the YC1012 is wired as an HCI *controller*, the GATT profile is defined by a host
stack running on the **PY32**, not on the radio at all, and the profile question points at a
completely different chip and a completely different team.

That is not what the schematic's "AT Command Mode" net suggests, and a PY32C642F is a modest part to
host a full BLE stack on — so the AT-command reading remains more likely. But the two architectures
put the answer we need in two different places, and one question settles it. **§7 question 1h.**

### 4.3 PY32

**PY32F030** (see §5 — wrong part, but adjacent family):

- **LPTIM** ✅ (wake from stop mode) and **IWDG** ✅ and **RTC** ✅ — i.e. the primitives for the
  §4.8 F2 **dead-man timer** exist. This corrects an earlier uncertain note that said they might
  not; a lossy first pass at the PDF had missed them.
- **No AES block.** If crypto ends up on the application MCU it is software AES on a part with no
  accelerator — a performance question worth asking early, though the YC1012's hardware AES may
  make it moot.

---

## 5. The wrong datasheet was supplied

The schematic says **PY32C642F-QFN20**. The datasheet supplied is **PY32F030**.

All 62 pages of the PY32F030 datasheet were searched for the string `C642`: **not present**. These
are different parts in the same family. Peripheral availability, memory sizes and pin counts do not
carry across on trust — the §4.8 dead-man-timer claim in §4 above rests on the F030 document and
must be re-checked against the correct one.

Also missing: the schematic's title block reads **"Sheet 1 of 2"** and only sheet 1 was sent.

### 5.1 `H040` vs `H158` — three names, unresolved

**Observed 2026-08-09, not resolved.** Three artefacts in the same archive carry three designators:

| Artefact | Designator | Evidence |
|---|---|---|
| The schematic | **`H040`** | `H040-BT-SCH`, `HQD-H040BT-MAIN-V1.02-260702`. Verified by text extraction — `H158`, `H138` and `AC-` appear **nowhere** in it |
| The firmware | **`H158`** | `H158_Test_260708_01.pkg` |
| The board in the PW200 guide | **`AC-H158-V1.01`**, dated `20260702` | Read off the silkscreen in the guide's photographs |

Two of the three agree, and **the outlier is the schematic — the document our §4 reasoning is
derived from.**

**Probably benign.** The board's `20260702` and the schematic's `260702` are the same day, and
separate codes for the electrical design, the assembled board and the firmware build are ordinary
manufacturing practice. **But it is not verified**, and the failure mode if it is wrong — reasoning
about pin assignments and part choices from a drawing of a different board — is quiet and expensive.
One sentence of confirmation closes it; **§7 question 5.**

A caution on the evidence: an earlier pass read the silkscreen as `AC-H1388` from a low-resolution
crop and built a different conclusion on it. The reading above comes from a sharper photograph and
is corroborated by the firmware filename, but it is still text read off a photograph.

#### Day 13 — the physical board, photographed

The board actually in our hands was photographed on 2026-08-12, both sides. What it shows:

| Observation | Reading |
|---|---|
| Silkscreen `AC-H158-V1.01`, `20260702` | Matches the PW200 guide's board exactly — row 3 of the table above |
| Pads labelled `B−` `/B−` `T` `B+`, plus a separate `5V` / `GND` header and a USB-C connector | Battery positive/negative, pack **thermistor**, and a 5 V input rail — the standard labelling of a **charge-and-protection board** |
| Microphone is a **can type on flying red/blue leads** | The schematic's `S087A` MEMS mic is an **on-board** part (§2) |
| **No crystal** on either side | The BLE SoC needs one on pins 5/6; BLE timing tolerance rules out the internal RC (§4.1) |
| **No trace antenna** — no edge meander, no ground keep-out | The SoC has no internal antenna (§4.1, pin 7), so the host PCB must carry one |

**Reading: this is a separate charge/protection + microphone board, not the Bluetooth board.** That
supports the **two-board** interpretation of the three names above, over "one product, three internal
codes."

**Two things make that more than a guess.** The schematic's title block reads **"Sheet 1 of 2"** and
only sheet 1 was supplied (§5). And requirements **item 6 — sheet 2, plus this very `H040`/`H158`
question — is the single item the manufacturer did not answer at all** (§7 row 5). A product built
on two boards, with the charge board separately numbered, explains the missing sheet and the name
mismatch with one fact.

**Held as a hypothesis, not a conclusion**, for two reasons. These are hand-held photographs, not
macro: a 2 × 2 mm QFN12 could still hide in them, and the absent crystal and antenna are doing most
of the work. And §3.2.2's finding that `YP65` is documented as a **5-pin module** cuts the other way
on what to look for — a castellated module with its own antenna would be conspicuous, and its
absence here is easier to be confident about than the absence of a bare SoC. Confirming needs either
a macro shot of the IC cluster, or the second board.

---

## 6. What this costs us, and the way through

### 6.1 At risk if we build to the HQD protocol as documented

| Artefact | Size | Exposure |
|---|---|---|
| `tools/mock-peripheral` (`P0-2.5`) | ~2,500 lines, 51 tests | Models §4's GATT table. A serial pipe is a different shape. |
| `P1-4.0` Part 1 (§4.5 handshake + CMAC) and Part 2a (§4.3 `deviceInfo`) | done, reviewed | The **crypto** survives; its **transport** may not. |
| `src/features/ble/protocol.ts` | all §4 constants | Service/characteristic UUIDs become fiction. Byte layouts may survive. |
| `issue-device-session`, `revoke-device-session`, `device_keys`, Vault | backend | Survive — they never depended on GATT shape. |

### 6.2 The middle path (**recommendation**)

**Keep §4's security design; move it from GATT characteristics into payload bytes over the existing
serial-over-BLE pipe.**

C1–C6 stop being characteristics and become **message types inside HQD's command byte space**,
alongside their `0x01`/`0x02`. The nonce, the CMAC proof, the counter, the result codes, the framing
discipline — all of it is byte-layout work that is transport-agnostic and largely already written.
What changes is the addressing layer.

Why this is the cheap path: **it requires no change to whatever is running on the YC1012.** Getting
custom characteristics added there means changing that chip's firmware — and until §7 question 1 is
answered we do not know whose firmware that is. If it turns out to be the silicon vendor's stock
build, it is a supply-chain negotiation with a third party who has no contract with us and no reason
to prioritise a 30-day project. Adding command bytes to HQD's own PY32 firmware, by contrast, is a
normal firmware request to a team we are already meant to be talking to (**OQ-6**) — and it stays a
normal request under *either* answer, which is precisely what makes it the safe recommendation to
carry into the conversation.

What it still needs, and what it does not solve:

- the YC1012's **profile / AT-command manual**, to know the pipe's UUIDs and MTU — **§7 question 1**;
- an **iOS story** — the pipe is reachable from CoreBluetooth once we know its UUIDs, so this is
  survivable *if* the profile is a standard serial-over-BLE service, but not if the app is expected
  to use `itronlib`;
- **HQD firmware work on the PY32**, which is now on the critical path for age gating (§6.3).

### 6.3 Two client decisions confirmed on Day 10

**Age-gated unlock: CONFIRMED REQUIRED.** This converts firmware scope from optional to mandatory.
It needs (a) a per-device key provisioned at the factory — **this makes OQ-4 critical-path, not
merely critical**; (b) a check in HQD's PY32 firmware; (c) our server issuing time-limited
approvals. All of it can ride the serial pipe; none of it exists in the documents supplied.

**Auto-lock: the client plans device self-lock after 5–10 minutes.** Nothing in any supplied
document describes auto-lock behaviour. ⚠️ **Our spec's grace period is 5 s by default with a
1–30 s range** (`AUTOLOCK_GRACE_MS_DEFAULT = 5000`, `MIN = 1000`, `MAX = 30000`). 5–10 minutes is
**10–20× outside the permitted range** — not a tuning difference, a different product decision, and
a ten-minute window in which an unattended unlocked vape is usable by whoever is holding it. It is
also **not representable on the wire**: §4.6 `SET_AUTOLOCK_GRACE` carries `graceMs` as a **uint16**,
so 65,535 ms (~65 s) is the arithmetic ceiling and ten minutes (600,000 ms) cannot be sent at all
without a protocol change. This is **OQ-9**. Recommendation: implement inside the spec range, measure on real hardware, and do not
commit to 5–10 minutes without written risk acceptance from the client.

### 6.4 🔴 Day 12 — two answers that need escalation, not just closing the OQ

The manufacturer answered both of the above directly. Neither answer is a number to plug in — each
one contradicts a premise the security design depends on.

**Auto-lock (OQ-9): there is no firmware timer.** Their words: *"There is currently no auto-lock
function in the firmware. Once a phone connects, the connection stays active unless the phone
actively disconnects Bluetooth or moves out of range. If disconnected, Bluetooth will remain in an
unconnected state; if no reconnection occurs within 10 minutes, it will shut down and enter sleep
mode."* This is **connection state**, not a countdown. `TECHNICAL_SPEC.md`'s glossary defines the
"dead-man timer" as *"the firmware countdown that locks the device after BLE disconnect, without
the app's involvement"* — CLAUDE.md's authority model rests on that countdown existing. What exists
instead is: the link drops on range loss (which *is* firmware-side and app-independent, so the
core safety property — the app dying doesn't keep the device unlocked forever — plausibly still
holds), but there is no timer to *configure*, so §4.6's `SET_AUTOLOCK_GRACE` has nothing in firmware
to command. Whether "locks on disconnect, full stop" is an acceptable design on its own, or firmware
needs a real timer added, is a decision for whoever owns the product/security architecture — not
something to infer here.

**Per-device key (OQ-4): none is written.** Their words, replying to who provisions a key and how
it reaches us: *"As previously discussed with the Nepa team during their visit to China regarding
the product definition, a unique MAC address is not required. This means that writing a key to each
device is not involved."* Read plainly: **no per-device secret is written at manufacture at all.**
§4.5's entire trust chain — `K_dev` in OTP → HKDF → `K_sess` → AES-128-CMAC proof — assumes exactly
this secret exists. If it doesn't, there is nothing for `device_keys` to hold and no cryptographic
device authentication as specified; only the Bluetooth MAC (§7 question 9b's answer) distinguishes
one unit from another, and that value is openly broadcast to anyone scanning, not secret.

#### Day 13 — two facts from the module spec that change both asks

Found on the second pass through `YP65-AT-BLE-module-spec-v1.3-release.pdf` (§3.2.2). Neither
overturns the analysis above; both make the escalation stronger and more specific.

**1. The MAC address is writable in software — so it is not an identity anchor.** `AT+ADDR=?` reads
it, and **`AT+ADDR=334455667788` sets it** to `33:44:55:66:77:88`, returning `OK`. The manufacturer's
answer 9b offers the Bluetooth MAC as the per-unit unique identifier *in place of* a provisioned key
(9a). It was already noted above that the MAC is **broadcast, not secret**; it is now also
**mutable by anything with UART access to the module**, per the module vendor's own documentation.
Two units can be given the same address; one unit can be given another's. That does not merely
weaken 9b as a substitute for `K_dev` — it means the substitute on offer cannot carry per-device
identity at all. Bears directly on **OQ-12**, where `serial_hash = SHA-256(deviceUid ‖ server_salt)`
would take the MAC as `deviceUid`.

**2. A real-time clock exists — so a timed auto-lock is a firmware gap, not a hardware limit.**
`AT+RTCEN=0|1` and `AT+RTCDA=` with a Unix epoch (§3.2.2). The manufacturer's answer to OQ-9 was
that no auto-lock function exists *in the firmware*; it did not say the hardware couldn't support
one, and it can. This converts "please add a timer" from a request that might be refused on
feasibility grounds into a scoping decision.

**Keep the caveat attached to that second point wherever it is repeated.** The RTC sits on the
**radio module**. The part that must actually inhibit the heater is the **PY32** (§2). A clock on the
radio establishes that a timed lock is *implementable*; it does not implement it, and it does not by
itself satisfy CLAUDE.md's dead-man-timer authority model — that still requires firmware behaviour on
the application MCU. Do not let this finding be read as "the timer already exists."

**Both original items are escalated in
[`../client-messages/architecture-escalation-2026-08-12.md`](../client-messages/architecture-escalation-2026-08-12.md),
drafted 2026-08-12, not yet sent.** Do not implement §4.5's key derivation or §4.6's
`SET_AUTOLOCK_GRACE` against real hardware before that lands an answer — building against a trust
chain that may not have a hardware anchor is exactly the kind of week of rework OQ-13's note in
`TECHNICAL_SPEC.md` §13 already warned about for the transport layer.

---

## 7. Outstanding asks to the client

This section's questions were superseded 2026-08-10 by
[`manufacturer-requirements-2026-08-10.md`](manufacturer-requirements-2026-08-10.md) as the outgoing
text (see that file's own history), and answered 2026-08-12 — see
[`manufacturer-supplied-2026-08-12/manufacturer-response-2026-08-12.md`](manufacturer-supplied-2026-08-12/manufacturer-response-2026-08-12.md).
Status below reflects the Day 12 reply, kept here since this table is what people read first.

| # | Ask | Why it matters | Status (2026-08-12) |
|---|---|---|---|
| 1 | 🔴 **Who programmed the YC1012, and its BLE profile / AT-command manual** | Contains the service UUID and the serial-over-BLE profile. **The single blocker on `BLE_SERVICE_UUID`.** Includes **1h** — whether the YC1012 runs its own stack or is an HCI controller (§4.2), which decides *which chip's* firmware we need. | ✅ **Mostly answered.** The real profile PDF arrived Day 12 (§3.2.1): service `0xFFF0`, characteristics `0xFFF1`–`0xFFF5`, MTU, disconnect events, stack ownership all confirmed. **Still open:** which of the five characteristics HQD's firmware uses, PIN-pairing disable (1d), and who wrote HQD's own firmware layered on the module (distinct from who wrote the module's firmware, which is now known — YIPRINCIPLE/YiChip). |
| 2 | The actual **`itronlib`** library files | Referenced throughout the protocol doc; absent from the archive. | ⏳ Promised for Friday, 2026-08-14. |
| 3 | **iOS equivalent, or written confirmation none exists** | We are contracted for both platforms (§3.3). | 🔴 Still open — circular answer ("once Android SDK confirmed"). |
| 4 | **Correct MCU datasheet** — PY32C642F, not PY32F030 | §5. | 🟡 Confirmed correct part will be used; updated datasheet referenced but not yet copied into the repo. |
| 5 | **Schematic identity and completeness** — sheet 2 of `H040-BT-SCH`, and `H040` vs `H158` | §5 and §5.1. | 🔴 **Not answered at all** — dropped from the reply, needs a direct follow-up. **Day 13: now the most consequential unanswered item.** The board we physically hold photographs as a charge/mic board, not the BLE board (§5.1), which makes "two boards, sheet 2 is the other one" the leading reading — and means the follow-up should ask for sheet 2 **and** for the BLE board itself, not just a naming clarification. |
| 6 | **Which command locks/unlocks?** Is it `0x02`? | The overview promises it; nothing documents it (§3.2). | ✅ Answered — three frames supplied (§3.2), container confirmed (§3.2.1: one of `0xFFF1`–`0xFFF5`), exact characteristic still unconfirmed. |
| 7 | **Confirm auto-lock behaviour and duration** | §6.3 — the 5 s vs 5–10 min conflict. | ✅ Answered, but the answer is "no timer exists" — escalated, §6.4. |

---

## 8. What is actually blocked in `P1-3.0`/`P1-7.0` — and what is not

**Revised 2026-08-09 (Day 10, later the same day).** The earlier version of this section said these
two tasks "have not started" and left it there. That overstated the block and, left unclarified,
stalled a subsequent execution attempt that read it and stopped without writing any code. Corrected
here — this revision is authoritative over the paragraphs it replaces.

**Revised again 2026-08-12 (Day 13).** `BLE_SERVICE_UUID` is no longer unknown — §3.2.1 above has the
real value from the manufacturer's profile PDF. What remains blocked has narrowed accordingly.

- `BLE_SERVICE_UUID` in `protocol.ts` (OQ-13) — the value currently in `protocol.ts` was invented at
  spec-writing time (commit `0bb8e80`, 2026-08-05) and is now **known to be wrong**: the real service
  is `0xFFF0` (16-bit), not a 128-bit `42530001-…` UUID, per §3.2.1. **Promoting the real value into
  `protocol.ts` is deliberately out of scope for this doc-update pass** (see the manufacturer-supplied
  MANIFEST §4) — it should land as its own reviewed commit, not bundled with documentation, and it
  should also decide which of `0xFFF1`–`0xFFF5` carries HQD's traffic first, since scanning on the
  right service UUID alone doesn't get you to a working connection if the write goes to the wrong
  characteristic.
- The **wire-level half** of §4.5's auth handshake — actually writing/reading against real hardware —
  is **partially unblocked**: the transport container (`0xFFF0`/`0xFFF1`–`5`, notify + write-no-
  response, 185 B MTU) is now known, so C1–C6 can be redesigned as payload bytes inside it per §6.2's
  middle path. **Still blocked:** which specific characteristic HQD's firmware uses, and the exact
  framing (the lock/unlock/read-status bytes in §3.2 are a manufacturer-supplied data point, not yet
  independently confirmed or reconciled with this transport).

**What is not blocked**, and was built against `tools/mock-peripheral` in this pass, because none of
it depends on the value of that one constant or on which transport eventually carries §4.5's bytes:

- `P1-3.0` — permission handling (`permissions.ts`), the device list and its `ScanState`/
  `ScanBlockedReason` handling (`scanner.ts`, `PairDeviceScreen.tsx`), dedupe, discovery ordering,
  scan timeout, staleness, and adapter-state (Bluetooth off/unauthorized/unsupported/resetting)
  handling. The scan filters *on* `BLE_SERVICE_UUID` — that one line is the block — but every other
  behaviour here is orthogonal to what that UUID turns out to be.
- `P1-7.0` — `connection.ts`'s reconnect-with-backoff, the re-handshake-on-every-reconnect rule, and
  clean-vs-abrupt disconnect handling. This layer calls `createAuthHandshake()` as a typed function;
  it does not care whether that function's bytes eventually travel over GATT characteristics or over
  HQD's serial pipe (§6.2) — that decision is still open, tracked separately, and does not gate
  anything built this pass.

**Day 12 addition.** The discoverability trigger is now known (re-solder the battery, or a single
button press; default name `YP65-AT` + MAC suffix; 10-minute idle sleep; USB power does not
suppress advertising) — useful for the bench and for `scanner.ts`'s user-facing copy, but it doesn't
change what's blocked above: the scan still filters on `BLE_SERVICE_UUID`, which is still pending
the profile PDF.

So: the constant and the wire-transport work stay blocked on the client's answer to §7 question 1.
Everything else in `P1-3.0`/`P1-7.0` does not, and is why this document no longer says "not started."

---

## 9. The PW200 `.pkg` finding — recorded here so it isn't re-investigated

**Added 2026-08-09.** This is a firmware artefact, not documentation, but it lives here rather than
nowhere: without a record, whoever next opens the client archive re-derives all of this from
scratch, including the risk in §9.2.

**What it is.** `Instructions for using the PW200 update program.pptx` (9 slides) in the client
archive walks through flashing the device's firmware with the **PW200** programmer: open
**PowerWriter**, unlock it with password `88888888`, load the `.pkg` file, connect the vape over
USB-C, and press the device's button to start the flash.

**The `.pkg` file itself:** 20,399 bytes. Entropy 7.906 bits/byte — effectively indistinguishable
from random, i.e. encrypted or compressed, not a plain firmware image. All 256 byte values appear at
least once. The longest run of anything resembling readable text is 13 characters. A `.rar` archive
sitting alongside it contains only that same `.pkg` — no accompanying manifest, key, or metadata.
None of this is a criticism of the client; it is simply what "opaque vendor-signed firmware blob"
looks like on inspection, and it means nobody on this project can read or modify what is inside it.

### 9.1 What this does and does not affect

This project does not touch firmware — CLAUDE.md already lists "no us writing firmware" among the
rejected/out-of-scope decisions, and nothing here changes that. The `.pkg` is relevant only as
context for OQ-4 (who burns the device root key into OTP at manufacture) and OQ-6 (the firmware team
has still never been contacted) — it confirms firmware updates are a real, external, vendor-mediated
process, not something this team can inspect or simulate.

### 9.2 🔴 The burn-button warning

Slide 9 of the deck describes pressing a button on the PW200 as part of the flashing sequence, and
notes — in the vendor's own language — that doing so **may consume a licence credit** on the
programmer. That is two clicks away from "let's just plug it in and see what the tool does," which
is exactly the instinct to head off: **do not connect the PW200 to a device or press that button out
of curiosity.** If firmware flashing is ever actually needed for this project, treat it as a
deliberate, client-coordinated action, not an exploratory one.

---

## 10. Bench power — the three wires, confirmed (Day 12)

**Closes the "battery retry" item** carried in prior session notes: the board's three unidentified
wires (§10 in `manufacturer-requirements-2026-08-10.md` item 10) leave a component the schematic
sheet we have doesn't label. The manufacturer confirmed:

| Wire | Function (per the manufacturer's reply) |
|---|---|
| Red | Battery positive |
| Black | Battery negative **and** output negative (shared return) |
| Blue | Output positive |

Whether a second board was sent alongside this answer (also asked in item 10) was not addressed —
check physically before assuming one arrived.

### 10.1 🔴 Correction, Day 13 — the blue wire is `T`, not "output positive"

**The board's own silkscreen contradicts the third row above.** Photographed 2026-08-12 (§5.1): the
three pads the wires land on are labelled **`B+`**, **`B−`** and **`T`** — red to `B+`, black to
`B−`, **blue to `T`**. `T` is the conventional designator for a battery-pack **thermistor**, which is
a sense input, not a power output.

**Use the silkscreen, not the reply.** Concretely, for bench power:

- Red → `B+`, black → `B−`. That pair is confirmed by both sources and is all that is needed.
- **Leave blue / `T` unconnected.** Driving a thermistor sense pin from a supply rail is not what it
  is for, and the manufacturer's description gives no reason to think otherwise once the silkscreen
  is legible.

The wider lesson for anything else in that reply: **item 10's wire-colour text is demonstrably loose
about this board.** It was a prose answer about wire colours, not a document — treat the rest of it
as indicative rather than authoritative, and prefer the board or the schematic wherever they speak.

---

## 11. OQ-13 closes for real, Day 17/18 — the `itronlib` SDK, and what it costs us

**Two things arrived together**
([`manufacturer-supplied-2026-08-17/`](manufacturer-supplied-2026-08-17/)): full written answers to
every one of the 18 blocking BLE questions from §7, and — four days late but delivered — the
`itronlib` Android SDK the manufacturer promised "this Friday" in the 2026-08-12 reply. The SDK is
working, tested Kotlin, not a document to interpret, and it is what actually closes what §3.2.1/§8
left open. See `manufacturer-supplied-2026-08-17/MANIFEST.md` for full provenance and hashes.

### 11.1 What's now closed

- **Which of `0xFFF1`–`0xFFF5` HQD's firmware uses:** `0xFFF1`, both directions
  (`itronlib`'s `BleSdkConfig.kt`, confirmed against LightBlue on real hardware; reply item 1). The
  other four channels the module spec describes exist on the chip but HQD's firmware never touches
  them.
- **The exact frame format:** `HEAD(0x02) | LEN | CMD | DATA… | XOR | TAIL(0x01)` for a command,
  `HEAD | LEN | CMD | ACK | DATA… | XOR | TAIL` for a reply — the **ACK byte** is new information;
  no prior document or reply mentioned it. **The checksum span is corrected here too**: it is XOR
  from the frame header (`HEAD^LEN^CMD^DATA…`), not the payload alone. Reply item 10 confirmed our
  question's payload-only reading, which the SDK's own source and its own unit test disprove against
  the manufacturer's own worked examples — see `manufacturer-supplied-2026-08-17/MANIFEST.md` §4 for
  the arithmetic. Trust the SDK source over the prose answer whenever the two disagree, same lesson
  as §10.1.
- **The PIN question (§7 1d), independently reconfirmed:** reply item 3 — "not supported at present
  … just-work unencrypted mode via AT commands." Matches §3.2.1's search-based finding exactly.
- **Status byte mapping:** `0x31` = locked, `0x30` = unlocked (`BleProtocol.kt`) — the written reply
  (item 2) gave both values without saying which is which; only the SDK source resolves it.
- Implemented, promoted into `src/features/ble/h158/h158Protocol.ts` (deliberately **not**
  `protocol.ts` — see that file's module doc for why): the frame codec, both commands, both response
  parsers, and an undocumented quirk visible only in `BleConnectionManager.kt` — a `CHILD_LOCK` reply
  carrying 3+ data bytes is routed through the *status* parser, not treated as malformed.

### 11.2 What's still open

- **YC1012 vs. YP65-AT.** Neither this reply nor the 2026-08-12 documents state whether YP65-AT is a
  module built around the YC1012 silicon (§4.1) or an unrelated part. Not blocking — OQ-13's actual
  blocker (the UUIDs) is answered either way.
- **Who wrote HQD's application firmware** (§3.2.1's third unclosed point) is, strictly, still open —
  `itronlib` is HQD's own Android SDK talking to that firmware, not a statement of who authored it.
- **`AC-H158-V1.01` — main board or charge/protection board?** Still not confirmed either way. Reply
  item 18 describes `B+`/`B-`/`H+`(heating)/airflow-sensor-microphone/on-PCB-antenna for *this* board
  — which reads as though it answers "main board," contradicting the Day-10 working assumption, but
  it's a prose answer about wire function again (§10.1's lesson), not a document. **This also revises
  §10.1**: that section read the blue wire as a thermistor sense pin (`T` silkscreen marking); this
  reply describes the same blue wire as `H+`, the heating element drive. Settle it on the bench (see
  the bring-up order below) rather than by asking a third time.

### 11.3 What this means for the build, independent of any of the above

The bytes are now real. What they describe is not what spec §4 describes, on every axis that
matters for pillar 3 (proximity lock/unlock) and the CLAUDE.md authority model:

- **No device-side authentication of any kind.** Just-work, unencrypted, plaintext commands (reply
  item 3). Anyone with the device's Bluetooth name and a generic BLE tool can send `A1 78`. Inviolable
  rule 2 (`K_dev` never leaves the server) and rule 3 (`age_verified` validated server-side) still
  protect *our* server; neither protects the *device* the way §4.5's CMAC handshake was meant to.
- **No dead-man timer.** Reply item 16: an unlocked device stays unlocked across a disconnect —
  "H158 retains the state prior to disconnection." CLAUDE.md's authority model ("the firmware
  dead-man timer is what makes the device safe … any design requiring the app to be alive for the
  device to lock is wrong") describes a mechanism this firmware does not implement.
- **No unsolicited notifications.** Reply item 13 — lock state must be *polled* via Read Status; the
  device never pushes a change, including on its own physical button. `h158Session.ts`'s design
  reflects this: every command carries an explicit timeout because a bad frame produces silence
  (reply item 12), not an error reply — timeout is the only failure signal this transport has.
- **Every unit advertises the identical name**, and it only advertises after a physical button press,
  lapsing again after three separate idle timers (reply items 4, 6, 7). iOS exposes no MAC address to
  distinguish units (OQ-14, already registered) — between the two, there is no way to key a
  multi-device pairing flow (pillar 1) off anything the radio provides.

None of this is a code defect to fix — it's what the hardware is. Registered as open questions in
`TECHNICAL_SPEC.md` §13; not drafted as a client message this pass (that's a deliberate choice, not
an oversight — see the session log for 2026-08-17).

### 11.4 Bring-up order, hardware-gated

Do this **before** attributing anything to our own code — the manufacturer's own demo app is the
control:

1. Solder a charged 4.2 V lithium cell to `B+`/`B-` — **USB power alone will not run the system**
   (reply item 17). This alone explains the Day-10 40-minute scan that found nothing.
2. Single-press the button. Expect a blue LED flash and advertising to start (reply item 6).
3. Scan with nRF Connect. Expect the name `YP65-AT`. Advertising lapses after 10 minutes idle —
   re-press before each attempt. **If `YP65-AT` appears, `AC-H158-V1.01` is the main board** — settles
   §11.2's open question on the bench rather than by asking again.
4. Install `manufacturer-supplied-2026-08-17/H158-itronlib-sdk/app/build/outputs/apk/debug/`'s debug
   build (or the hashed `H158 Demo.apk` it corresponds to — see MANIFEST.md) and run their own
   `docs/ble-manual-test.md` script. **If their own app cannot drive the board, the board or its
   firmware is the problem, not this codebase** — it may still need a PY32C642 firmware upgrade via
   PW200 (reply item 6). ⚠️ Do not press the PW200's flash button exploratorily — §9.2's licence-credit
   warning still applies.
5. Only once step 4 passes, run `H158BringUpScreen` (dev-only, behind `__DEV__`) and compare its
   captured hex trace against theirs.

---

## 12. Day 24 (2026-08-23) — the transport is now a written contract, not a reverse-engineering result

§11 derived the framing from the `itronlib` SDK because no protocol document had ever been supplied.
One has now arrived. **Nothing in §11's conclusions changes** — which is itself the useful result.

### 12.1 What arrived

Inside `H158_ProjectFile-V1.3-202608211812.rar`, archived at
[`manufacturer-supplied-2026-08-23/`](manufacturer-supplied-2026-08-23/):

- **`H158—CMD Protocol-202608131414.docx`** — the protocol document, cited as the authority in three
  separate manufacturer replies and never opened by us until now. Transcribed to
  [`manufacturer-supplied-2026-08-23/H158-CMD-Protocol-202608131414.md`](manufacturer-supplied-2026-08-23/H158-CMD-Protocol-202608131414.md).
- **`H158_Test_260814_01_.pkg`** — the firmware the manufacturer now directs us to use.
- **The iOS SDK** (`h158lib`) — closes **OQ-14**, open since Day 11.
- The correct MCU datasheet, and the v1.4/v1.5 module specs.

### 12.2 The framing is confirmed, from three independent directions

| Claim | Protocol doc | `BleProtocol.kt` (Android) | `BleProtocol.swift` (iOS) |
|---|---|---|---|
| `HEAD 0x02` … `TAIL 0x01` | §1 | ✓ | ✓ |
| `LEN` = CMD + DATA (+ ACK on replies) | §1 | ✓ | ✓ |
| Checksum = XOR from `head` through `data` | §1, in words | ✓ | ✓ |
| Lock `0x78` / unlock `0x87` under CMD `0xA1` | §2.1 | ✓ | ✓ |
| Terminal info = CMD `0xA2`, **no data byte** | §2.2 | ✓ | ✓ |
| Status data = lock byte, system state, battery | §2.2 | ✓ | ✓ |

The checksum span is the one §11 had to correct against the manufacturer's own written answer. §1 of
the protocol document now states it explicitly — "从 head 字段 到 data 字段，所有的数据异或的结果" —
so that correction is no longer an inference from a single SDK.

### 12.3 The complete command set is three commands

The document's table of contents contains only §2.1 (child lock) and §2.2 (terminal information).
The Day-13 reply's item 11 deferred "a complete list of the commands the device supports" to this
document; **this is that list.** There is no firmware-version query, no separate battery command
(battery is byte B3 of terminal information), and — consistent with **OQ-16** — no authentication,
pairing, or key command of any kind.

This matters for scoping: it is now documented rather than merely observed that the device exposes
**no command surface on which an authentication handshake could be added without new firmware.**

### 12.4 ACK error codes, previously unknown

The protocol document writes the ACK field as `00 / x0` and never enumerates the failures. The
Day-13 reply, item 12, does:

| ACK | Meaning |
|---|---|
| `0x00` | success |
| `0x01` | data error |
| `0x02` | data length error |
| `0xF1` | unknown command |

**With one asymmetry worth designing around:** a frame with a bad head, tail or checksum gets **no
reply at all**, not an error ACK. A non-zero ACK therefore always means the frame was structurally
valid and its *content* was rejected — a bug in what we sent, never line noise, and never something
to retry unchanged. A silent timeout, conversely, is ambiguous between "malformed frame", "device
asleep" and "out of range". Now handled distinctly in `h158Protocol.ts`.

### 12.5 What was not yet verified — see §13, now resolved

*(This section originally said "everything above is on paper." It no longer is — §13 has the
confirmation. Left in place because the sequencing is the point: verify against the vendor's own app
before trusting anything, which is exactly what §13 did.)*

Two items the manufacturer did not answer, still open: what `81 00 03 00 00 00` actually meant, and
whether production units ship needing a PW200 flash before they respond at all. The second is a
client and factory question, not an engineering one.

### 12.6 OQ-17 got worse, not better

The manufacturer has now answered the device-name question **both ways** — Day 12 item 1 says the
name carries an appended MAC "to distinguish between devices", Day 13 item 4 says "all devices share
the same Bluetooth name". Their iOS SDK cannot arbitrate: it prefix-matches and then keys on
CoreBluetooth's per-install identifier, which works under either answer.

**Settle it on the bench by scanning two units** — the same treatment §11.2 agreed for the blue-wire
discrepancy. Until then, assume no radio-visible per-unit identity exists, and do not design pairing
around one.

---

## 13. Day 24 (2026-08-23), same day — verified on real hardware, and a handoff for whoever wires this into product UI

§12 was written before any device was on the bench. Later the same day, one was.

### 13.1 The firmware fix is real

`H158_Test_260814_01_.pkg` flashed via PW200, tested against the manufacturer's own
`com.itorn.hqd.ble` demo app — deliberately not our code, so this isolates firmware from
implementation, per §11.4's bring-up order. Read Status, Lock and Unlock all exercised; every reply
captured and every checksum verified by hand, not just eyeballed against the app's summary:

| Command | TX | RX | Checksum |
|---|---|---|---|
| Read Status | `02 01 A2 A1 01` | `02 05 A2 00 30 00 64 F1 01` | `F1` ✓ |
| Lock | `02 02 A1 78 D9 01` | `02 03 A1 00 78 D8 01` | `D8` ✓ |
| Unlock | `02 02 A1 87 26 01` | `02 03 A1 00 87 27 01` | `27` ✓ |

Head `0x02`, tail `0x01`, on every single reply — the `0x81`/`0x82` framing that blocked this
project for three days is gone on this firmware. The Unlock checksum also settles the one
discrepancy §12.2 flagged in the manufacturer's own prose: their table said `0x26`; hardware says
`0x27`, matching the correction derived from their Swift source before any device confirmed it.
**Three independent sources now agree, and hardware is the fourth: the protocol document, the
Android SDK, the iOS SDK, and the real device.**

Not yet done: a second independent flash (the 08-20 standard), and confirming this against **our
own app** rather than only the manufacturer's. Full detail and the OQ-17 caveat from this session:
[`manufacturer-qa-consolidated.md`](manufacturer-qa-consolidated.md), the 2026-08-23 entry under
Round 3.

### 13.2 Handoff — what exists, ready to build on

For whoever picks up wiring the H158 into an actual user-facing screen (Sadin, Hardik, or anyone
else). Read this before writing new BLE code for this device — most of what you need already
exists and is tested.

**Reusable, stable, confirmed on hardware today:**

- **`src/features/ble/h158/h158Protocol.ts`** — the complete frame codec: encode, decode, all three
  commands (lock, unlock, terminal info), status parsing, and ACK error codes (`H158Ack` /
  `h158AckLabel`). Pure functions, no I/O. This is the codec — do not write a second one.
- **`src/features/ble/h158/h158Session.ts`** — connect → discover → subscribe → send, as a typed
  `H158Session` interface (`readStatus()`, `setChildLock()`, `dispose()`), every stage with an
  explicit timeout per CLAUDE.md's rule. This is the thing to call from a screen; you should not
  need to touch GATT primitives directly.
- **`src/features/ble/h158/H158BringUpScreen.tsx`** — a complete, working reference UI: scan → device
  list → connect → Read Status / Lock / Unlock, with a live hex log of every frame. It is a
  **reference to copy patterns from, not a screen to extend into production** — it's dev-only,
  registered behind `__DEV__`, deliberately plain. Its scan/connect/retry wiring is the pattern a
  real screen should follow.
- **`createDeviceScanner()` in `scanner.ts`**, used with `filter: { serviceUuids: null, namePrefix:
  H158_DEVICE_NAME_PREFIX }` — H158 doesn't advertise a service UUID, only a name, and the bring-up
  screen already does this correctly.

**What does not exist yet — this is real, unscoped work, not an oversight:**

- 🔴 **No production pairing screen for H158.** `PairDeviceScreen.tsx` exists but is built for the
  spec §4 GATT device (`protocol.ts`, `auth.ts`) — a different transport entirely, still valid for
  whenever the client decides on device authentication (see §12.1, §13.3 below). Whether H158 gets
  its own screen, or `PairDeviceScreen` grows a transport branch, is a design decision nobody has
  made — it is not written down anywhere in this repo.
- 🔴 **`src/features/lock/` is empty** — a single `.gitkeep`, nothing else. The entire proximity
  lock/unlock UI (pillar 3 of the product) is unbuilt. This is Phase 3 territory
  (`docs/project-roadmap-todos/TODO-phase-3.md`, 0/128 boxes done as of this writing), not something
  this session's hardware confirmation unblocks by itself.
- **No account/device binding exists for H158.** The Supabase schema (spec §5) was designed around
  §4's `device_ownership` + `K_sess` flow, which assumes bonding and a device-held key — neither of
  which H158 has. Binding an H158 unit to a verified account needs its own design, not a reuse of
  the §4 schema.

### 13.3 🔴 Read this before designing anything user-facing

**The H158 has no authentication and no dead-man timer.** OQ-16: "just-work unencrypted mode," no
PIN, no bonding, no CMAC counterpart anywhere in the firmware. OQ-9: an unlocked device stays
unlocked across a disconnect, indefinitely, with no firmware timer.

This is not a caveat about code quality — it changes what a "pairing" or "lock" screen can honestly
claim. Our app can require a verified, signed-in user before it will *send* a lock/unlock command,
and that satisfies inviolable rules 2 and 3 for **our server's** authority. It does nothing for the
**device's**: `A1 78` unlocks it for anyone in range holding any generic BLE tool who knows its name,
regardless of what our app does or doesn't check first. A screen that shows a padlock icon and the
word "Secured" is making a claim the hardware cannot back up.

Concretely, before shipping anything: what does "pair this device" even mean for a device with no
bonding at all? Almost certainly just "the app remembers this device for this account" — a purely
app-side, spoofable association, not a cryptographic pairing. **That is a product decision for the
client, not an engineering default to pick silently** — see CLAUDE.md's "authority model" section and
OQ-16's row in `TECHNICAL_SPEC.md` §13. Design the UI to match what's actually true, not what the
original §4 design assumed would be true.

### 13.4 Reading order for anyone picking this up

1. This section, then §11 (how the real transport was discovered) and §12 (the protocol document
   arriving and being ratified) — the reasoning, not just the conclusion.
2. [`manufacturer-qa-consolidated.md`](manufacturer-qa-consolidated.md) — the full question-and-answer
   history, so a question doesn't get asked a fourth time.
3. `h158Protocol.ts` and `h158Session.ts` doc comments — both cite exactly which manufacturer reply
   or SDK line justifies each constant and each design choice.
4. `H158BringUpScreen.tsx` as a pattern reference, not a starting point to extend.
5. §13.3 above, again, before any screen ships.
