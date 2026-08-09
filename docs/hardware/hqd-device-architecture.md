# The HQD device is a two-chip design, and it changes what §4 can be

**Recorded:** 2026-08-09 (Day 10) · **Author:** Anish · **Branch:** `feature/ble-connectivity`
**Status:** first-hand reading of client-supplied documents. Conclusions marked **verified** are
printed in those documents; conclusions marked **inferred** are mine and need client confirmation.

> **Read this before writing any BLE scan, connect, or GATT code.** It is the reason `P1-3.0` and
> `P1-7.0` have not started. Source documents are in
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
is **not theirs to change** — the radio is a separate off-the-shelf module (YC1012) running a
third-party vendor's firmware, joined to the application MCU by a 2-wire UART. Our §4 defines six
custom GATT characteristics on a custom 128-bit service. On this hardware those characteristics live
in a chip nobody on this project controls. **Our §4 GATT layout is probably not implementable as
written**, and the fix is an architectural one, not a sprint task.

---

## 2. What the schematic shows — the decisive evidence

`H040BLE-SCH-V1.02.pdf`, doc `H040-BT-SCH`, HQD TECH, 2026-07-02. **Verified — this is printed on
the sheet.**

Two processors:

| Part | Role |
|---|---|
| **PY32C642F-QFN20** | Application MCU. Heater control, button, RGB LEDs, MEMS microphone (puff detection), BM9073 charge management. |
| **YC1012** | BLE module. Nothing else. |

They are joined by:

- a **2-wire UART**,
- a net labelled to select **"AT Command Mode"**,
- an interrupt line labelled **"BLE Module Wake-up MCU"**.

Also on the board: `BM9073` charger, `S087A` MEMS microphone, RGB LEDs, a button, heater drive, and
an SWD header whose pinout matches the PW200 burner already in our possession.

### 2.1 What that implies (**inferred**, but hard to read another way)

An AT-command line and a wake interrupt are the signature of a **module you configure, not a stack
you compile**. The GATT table — service UUID, characteristic UUIDs, properties, MTU behaviour —
is defined by **the YC1012 module's own firmware**, supplied by its vendor. HQD's application
firmware on the PY32 sends and receives **bytes over a serial-over-BLE pipe**; it does not define
characteristics.

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

**YC1012_JD** (BLE module):

- **AES-128 hardware encryption** ✅ — the primitive §4.5/§4.6 need is present
- **8 KB OTP** ✅ — somewhere to put `K_dev` (OQ-4)
- 8 KB RAM, 24 MHz core, UART with HCI-H5

The datasheet contains **no UUID information and no AT-command reference.** It is a silicon
datasheet, not a module protocol manual. **The AT-command manual is the single document that would
unblock `P1-3.0`.**

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

Why this is the cheap path: **it requires no change from the BLE module vendor.** Asking the YC1012's
vendor for custom characteristics is a supply-chain negotiation with a third party who has no
contract with us and no reason to prioritise a 30-day project. Asking HQD to add command bytes to
their own PY32 firmware is a normal firmware request to a team we are already meant to be talking to
(**OQ-6**).

What it still needs, and what it does not solve:

- the YC1012's **AT-command / profile manual**, to know the pipe's UUIDs and MTU — **§7 question 1**;
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
| 1 | 🔴 **YC1012 module AT-command / BLE profile manual** | Contains the service UUID and the serial-over-BLE profile. **The single blocker on `P1-3.0`.** |
| 2 | The actual **`itronlib`** library files | Referenced throughout the protocol doc; absent from the archive. |
| 3 | **iOS equivalent, or written confirmation none exists** | We are contracted for both platforms (§3.3). |
| 4 | **Correct MCU datasheet** — PY32C642F, not PY32F030 | §5. |
| 5 | **Sheet 2 of the schematic** (doc `H040-BT-SCH`) | §5. |
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
  the YC1012 module doesn't present at all. **Inventing a replacement value fails silently**: the
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
