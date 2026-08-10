# Hardware bring-up checklist — first real board, Day 11 (2026-08-10)

**Status:** written before the board was in hand. Fill in §3 *while the hardware is in front of you* —
the whole point of this document is that the answers are cheap to get with the board present and
expensive to get any other way.

**Why this exists.** `BLE_SERVICE_UUID` and the six §4.2 characteristic UUIDs in
`src/features/ble/protocol.ts` were **invented at spec-writing time** (commit `0bb8e80`, 2026-08-05)
and have never been checked against hardware. OQ-13 has been chasing the client's YC1012 profile
booklet to learn the real ones. A board in hand makes that booklet optional: **a BLE peripheral
publishes its own GATT table, and any phone can read it.** See
[`hqd-device-architecture.md`](hqd-device-architecture.md) §8 for what this unblocks.

---

## 1. 🔴 Before anything is plugged in

- **Do not press the button on the PowerWriter / PW200.** Per §9.2 of the architecture doc, the
  vendor's own deck says it may consume a licence credit, and the firmware `.pkg` is an opaque
  encrypted blob (20,399 bytes, 7.906 bits/byte entropy) that nobody on this project can inspect or
  rebuild. A scrambled board is not recoverable by us.
- **We do not flash firmware.** Out of scope per CLAUDE.md. If a board needs programming, that is
  the client's or factory's job. We need it powered and advertising, nothing more.
- Do not photograph or record anything that pairs a device serial with a person. Not a 🔴 data class
  under spec §8, but the habit is the point.

## 2. What to install (phone, 2 minutes, no build required)

**nRF Connect for Mobile** — Nordic Semiconductor. Free, on both stores. It is the standard tool for
exactly this. (LightBlue is an acceptable substitute.)

This needs **no** app build, no toolchain, no USB cable. It works the moment the board powers on.

## 3. The capture — fill this in

Power the board. In nRF Connect: **Scanner** tab → pull to refresh → find the device → **CONNECT** →
it auto-discovers services. Tap each service to expand its characteristics.

### 3.1 Advertisement (before connecting)

Tap the device row's **RAW** / details view in the scanner list.

| What | Spec §4.1 expects | Actual |
|---|---|---|
| Advertised local name | prefix `BlueSmoke-` | |
| MAC address | — (Android only; see OQ-14) | |
| Service UUID in advertisement? | yes, AD type `0x07` | |
| Manufacturer data | 4 bytes `[ver｜stateHint｜battery｜flags]` | |
| RSSI at ~1 m | — (feeds P3-3.0 thresholds) | |

> If **no service UUID is advertised at all**, that is a finding, not a failure — it means our
> scanner can never filter on one and `scanner.ts:320` needs a different strategy (name prefix, or
> filter-by-MAC as the Itron SDK does). Record it and stop; don't improvise a fix at the bench.

### 3.2 Pairing

The Itron SDK doc §3.2 says *"Enter the 6-digit PIN code when connecting for the first time."*

| What | Actual |
|---|---|
| Did a PIN / passkey prompt appear? | |
| At what point — on connect, or on first read/write? | |
| What PIN was used, and where did it come from? | |

### 3.3 GATT table — the main event

For **every** service and characteristic. Ignore the standard `1800` (Generic Access) and `1801`
(Generic Attribute) services; everything else matters.

| Service UUID | Characteristic UUID | Properties (R/W/WNR/Notify/Indicate) | Notes |
|---|---|---|---|
| | | | |

nRF Connect can export this: **⋮ menu → Export / Share** produces a file. **Attach it to the repo at
`docs/hardware/client-supplied-2026-08-09/` rather than retyping it** — a transcription typo in a
128-bit UUID fails exactly as silently as a guessed one.

### 3.4 MTU and connection

| What | Actual |
|---|---|
| Negotiated MTU (nRF Connect ⋮ → Request MTU, ask for 517) | |
| Does the connection survive ≥60 s idle? | |
| Does the device stop advertising once connected? | |

### 3.5 First contact with the real protocol

The Itron SDK documents exactly two commands: `0x01` `readDeviceInfo` and `0x02` `setCheckState`,
returning *device SN* and *lock status*. If there is a writable characteristic with a notify
counterpart (the classic serial-pipe shape), try writing a single byte `0x01` to it and record what
comes back on the notify characteristic.

| What | Actual |
|---|---|
| Which characteristic did you write `0x01` to? | |
| Bytes received on notify (hex) | |
| Anything resembling a serial number or lock flag in them? | |

> ⚠️ **Do not write arbitrary bytes hunting for an unlock command.** The SDK overview claims lock and
> unlock exist but its command table has neither (see architecture doc §3) — so the unlock path is
> undocumented, and blind writes to an undocumented command space on a device that heats a coil is
> not a bench experiment we should be running. Read-only probing (`0x01`) is fine.

---

## 4. What each answer unblocks

| Captured | Changes |
|---|---|
| Real service UUID | `BLE_SERVICE_UUID` in `protocol.ts` — one line, plus `scanner.ts:320`'s filter starts matching |
| Real characteristic UUIDs + properties | `BLE_CHARACTERISTIC_UUIDS` — **expect a shape change, not a swap.** §4.2 assumes six typed characteristics; two commands over a write+notify pair is far more likely, which is a different design, not a different constant |
| MTU | §4.5's two-frame `authResponse` split exists only to fit a 23-byte ATT MTU. A larger real MTU may make it unnecessary |
| PIN behaviour | The §4.5 CMAC handshake vs. OS-level bonding — these may be redundant or may compose; can't tell until observed |
| No advertised service UUID | Scanner strategy, and OQ-14 (the Itron SDK is MAC-keyed, which iOS cannot do) |

**Then, and only then**, update `protocol.ts` — it is an append-only contested shared file per
CLAUDE.md, so announce before rewriting the §4.2 block, and cite this document in the commit.

## 5. Still true regardless of what the board says

- §4 remains an **unratified contract** — the firmware team has never been contacted (OQ-6). A GATT
  dump tells us what this board *does*, not what the shipping firmware *will* do.
- `K_dev` never leaves the server; `age_verified` is validated server-side. Nothing observed at the
  bench relaxes the inviolable rules.
- The **firmware dead-man timer** remains the safety authority. If the board turns out to have no
  such timer, that is a 🔴 finding to escalate, not a design to work around in the app.
