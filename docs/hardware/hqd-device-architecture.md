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

| Fact | Page | Why it matters |
|---|---|---|
| **`QFN2*2_12L`** — 2 × 2 mm, 12 pins | 4, 7 | **A bare SoC, not a module.** This is the correction; everything below follows from it |
| **8 KB OTP** with internal charge pump | 1 | Somewhere to put `K_dev` — **OQ-4** |
| **AES-128 hardware encryption** | 1 | The primitive §4.5/§4.6 need, in silicon |
| **Pin 7 = `RF ANT port`**, "integrated balun … direct connection to antenna" | 1, 8 | **No antenna inside the part.** The host PCB must carry a trace or chip antenna |
| **Pins 5/6 = `XTAL_OUT`/`XTAL_IN`** | 8 | A crystal must sit beside it — BLE timing tolerance rules out running on the internal RC alone |
| **1 × UART (RTS/CTS) with HCI-H5**, up to 3.25 Mbps | 1 | See §4.2 — this is the one that could change the architecture |
| Bluetooth 5.4, +8 dBm TX, −96.5 dBm RX @ 1 Mbps | 1 | Ample for a proximity-lock product |
| 24 MHz 32-bit core, 8 KB RAM, serial-wire debug | 1 | Programmable by anyone with the toolchain |

**Identifying it on a board.** At 2 × 2 mm it is smaller than many of the passives and is easy to
miss entirely — it was not identifiable in the client's PW200 photos, and its absence there is not
evidence of anything. Look instead for the **trio**: a ~2 mm 12-pin part, a small crystal beside it,
and a thin track running from one corner to a clear area at the board edge. Recorded so the next
person reads this table instead of the 13-page PDF.

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

---

## 7. Outstanding asks to the client

Drafted as a message in [`client-questions-2026-08-09.md`](client-questions-2026-08-09.md).
**Not yet sent.**

| # | Ask | Why it matters |
|---|---|---|
| 1 | 🔴 **Who programmed the YC1012, and its BLE profile / AT-command manual** | Contains the service UUID and the serial-over-BLE profile. **The single blocker on `BLE_SERVICE_UUID`.** Includes **1h** — whether the YC1012 runs its own stack or is an HCI controller (§4.2), which decides *which chip's* firmware we need. |
| 2 | The actual **`itronlib`** library files | Referenced throughout the protocol doc; absent from the archive. |
| 3 | **iOS equivalent, or written confirmation none exists** | We are contracted for both platforms (§3.3). |
| 4 | **Correct MCU datasheet** — PY32C642F, not PY32F030 | §5. |
| 5 | **Schematic identity and completeness** — sheet 2 of `H040-BT-SCH`, and `H040` vs `H158` | §5 and §5.1. |
| 6 | **Which command locks/unlocks?** Is it `0x02`? | The overview promises it; nothing documents it (§3.2). |
| 7 | **Confirm auto-lock behaviour and duration** | §6.3 — the 5 s vs 5–10 min conflict. |

---

## 8. What is actually blocked in `P1-3.0`/`P1-7.0` — and what is not

**Revised 2026-08-09 (Day 10, later the same day).** The earlier version of this section said these
two tasks "have not started" and left it there. That overstated the block and, left unclarified,
stalled a subsequent execution attempt that read it and stopped without writing any code. Corrected
here — this revision is authoritative over the paragraphs it replaces.

**What is blocked:** exactly one constant and the transport half of the connection handshake.

- `BLE_SERVICE_UUID` in `protocol.ts` (OQ-13) — invented at spec-writing time (commit `0bb8e80`,
  2026-08-05), unconfirmed against this hardware, and per §2 above probably describes a GATT layout
  the YC1012 doesn't present at all. **Inventing a replacement value fails silently**: the
  scanner finds nothing, and "no devices found" is indistinguishable from "device is off", "out of
  range", or "not advertising" — the same failure mode as OQ-12's guessed salt, and the same reason
  the answer is to ask the client (§7), not to guess.
- The **wire-level half** of §4.5's auth handshake — actually writing/reading characteristics C1–C6
  against real hardware — inherits the same block, since it depends on the same UUID and on a GATT
  profile this document's §6.2 middle path says may not exist in that shape at all.

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
