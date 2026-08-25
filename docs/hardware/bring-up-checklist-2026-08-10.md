# Hardware bring-up checklist — first real board, Day 11 (2026-08-10)

**Status:** written before the board was in hand; **first bench attempt made the same day — see §3.0.
It did not get as far as a GATT dump, because the board never advertises.** The rest of §3 is still
the plan for the attempt that follows, once the client answers.

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

## 3.0 Bench attempt 1 — 2026-08-10 — 🔴 **the board does not advertise**

> **Read §3.0b below before acting on this section.** Its conclusion — that non-advertising is a
> fault — did not survive Day 13. There are now three explanations, two of which were unknown when
> this was written, and the board tested here is probably not the Bluetooth board at all.

Board, PW200 and an Android phone (nRF Connect) all present. **No GATT dump was obtained**, because
the device never appeared in a scan. Everything below §3.0 remains unfilled for that reason.

### What was observed

| | |
|---|---|
| Power | Laptop USB-C only. **Never tested on battery.** |
| LEDs | **Two white LEDs blinking continuously** while on USB, indefinitely, pattern unchanging |
| Board button | Pressed; LEDs continued blinking. No device appeared in any scan afterwards |
| Scan result | **Nothing above −60 dBm at ~10 cm**, across repeated scans over ~40 minutes |

Every device that did appear was identified and excluded — three Midea air-conditioners (`38:2F:B0:…`
and `BC:89:F8:EC:98:91`, manufacturer ID `<0x06A8>`, ASCII serial in the payload), a JBL Flip 7
speaker, an LG webOS TV, a soundbar. A board 10 cm from the phone would read **−30 to −50 dBm** and
be the strongest thing on screen by a wide margin. Nothing ever was.

### 🔴 The PW200 button was pressed — once, and it reported OK

During bring-up the PowerWriter's button was pressed **one time**. `POWER` blue and `OK` green lit;
`NG` never lit. The board's own LEDs brightened during the press.

**This was a completed firmware flash, on the vendor's own reading.** Slide 9 of
`Instructions for using the PW200 update program.pptx` says verbatim: *"Press the button on the PW200
and wait for a few seconds. A green indicator light will appear, indicating that the upgrade process
was successful."* Green is the documented success signal, not an idle state.

Note what was **not** done: slides 2–8 (install PowerWriter on a PC, load the `.pkg`, upload it into
the PW200, disconnect) were never performed. The programmer therefore arrived **with a `.pkg` already
loaded by the client** — which is why one press sufficed, and which means the image written was
theirs, not one we chose.

**This most likely consumed one licence credit** — §9.2 of
[`hqd-device-architecture.md`](hqd-device-architecture.md) records the vendor's own warning. **It
must be reported to the client**, not absorbed silently: it is their tooling and their credit.

It also means **the firmware now on this board is whatever the PW200 wrote on 2026-08-10**, not
necessarily what shipped on it. Anyone reading a future GATT dump from this board needs that fact
first — it decides whether they are looking at production behaviour.

The one useful consequence, and it is worth a lot: **"the board is unflashed" is dead as an
explanation.** The device was programmed with the client's own firmware image, their own tool
reported their own documented success signal, and it still does not advertise. Whatever keeps this
device off the air is in the firmware's intended behaviour, not in the board's state.

### Not yet tested — do these before escalating further

- **Battery power.** Everything above was on USB. Many devices disable BLE entirely while charging,
  and continuous blinking on USB is a textbook charge-in-progress or charge-fault indication. This is
  the single most likely remaining explanation.
- **Whether a LiPo is even connected.** Three wires (red / blue / black) leave the PCBA to a component
  that was not identified. Red+black+blue is equally consistent with a cell carrying a thermistor and
  with a heater coil.
- **Puff / MEMS microphone trigger**, long-press (≥10 s), and five-rapid-press pairing gestures.

### What this is worth

It is a harder fact than anything the specification contains. §4's six characteristics on
`42530001-…` were invented (spec v1.12); OQ-13 asked who owns the GATT profile. **This adds a prior
question: what puts the device into a discoverable state at all?** Neither the Itron SDK document nor
the PCBA archive says. That question now goes to the client with OQ-13 — and unlike the UUID, it
cannot be answered by observation, because there is nothing to observe until it is answered.

---

## 3.0b Bench attempt 2 — 2026-08-12 — the board was photographed and identified

No scan was run. This attempt was diagnostic: the board was photographed on both sides and read
against the schematic, which changed what attempt 1's silence means.

### What was observed

| | |
|---|---|
| Board identity | Silkscreen **`AC-H158-V1.01`**, `20260702` |
| Pad labels | `B−` `/B−` **`T`** `B+`, plus a separate `5V` / `GND` header and USB-C |
| Microphone | **Can type, on flying red/blue leads** — not the schematic's on-board `S087A` |
| Crystal | **None visible**, either side |
| Trace antenna | **None visible** — no edge meander, no ground keep-out |
| Battery | **Still not connected.** The `B+`/`B−` wires terminate in **bare, stripped ends** |

**Reading:** a charge/protection + microphone board, not the BLE board. Full analysis and the
caveats in `hqd-device-architecture.md` §5.1 — held as a hypothesis, since these are hand-held
photographs and a 2 × 2 mm QFN could hide in them.

### 🔴 The correction this forces to §3.0

Attempt 1 concluded "the board does not advertise" and treated that as a fault. **There are now
three live explanations, and non-advertising is not evidence of a fault:**

1. **Wrong board** — this one may carry no radio at all (above).
2. **Never powered as a device** — everything so far has been laptop USB with **no cell attached**,
   which the §3.0 notes already flagged as the most likely explanation and which is *still* untrue
   of every test run to date.
3. 🔴 **Silent by design** — the module spec documents **`AT+ADVEN=0`**, which disables advertising
   outright (`hqd-device-architecture.md` §3.2.2). HQD's firmware is free to hold the radio silent
   until some trigger. **This explanation did not exist when §3.0 was written** and cannot be ruled
   out by scanning harder.

Do not escalate "the board is broken" until at least (2) is eliminated.

### Wire colours — use the silkscreen

The manufacturer's reply calls the blue wire "output positive". **The board says `T`** — a pack
thermistor. For bench power: red → `B+`, black → `B−`, and **leave blue / `T` unconnected**. See
`hqd-device-architecture.md` §10.1.

### Add to the visual search — look for a 5-pin module

The BLE part is documented as **`YP65`, a 5-pin module** (`VIN`, `GND`, BLE-TX, BLE-RX, wake/mode),
not only as the bare `QFN2*2_12L` SoC the schematic draws — the two sources disagree and it is
unresolved. This matters at the bench because **a castellated 5-pin module carrying its own antenna
is conspicuous**, where a 2 × 2 mm QFN is not. On any candidate board, look for the module first;
its absence is a much safer negative than the absence of a bare SoC.

---

## 3. The capture — fill this in

Power the board. In nRF Connect: **Scanner** tab → pull to refresh → find the device → **CONNECT** →
it auto-discovers services. Tap each service to expand its characteristics.

### 3.1 Advertisement (before connecting)

Tap the device row's **RAW** / details view in the scanner list.

| What | Spec §4.1 expects | Module spec says (Day 13) | Actual |
|---|---|---|---|
| Advertised local name | prefix `BlueSmoke-` | `YP65-AT` + MAC suffix, **in the scan response** | |
| MAC address | — (Android only; see OQ-14) | settable via `AT+ADDR=` | |
| Service UUID in advertisement? | yes, AD type `0x07` | 🔴 **no** — default ADV data is `02 01 06`, Flags only | |
| Manufacturer data | 4 bytes `[ver｜stateHint｜battery｜flags]` | configurable via `AT+ADVDA=`; not present by default | |
| ADV interval | — | default 320 × 0.625 ms = **200 ms** (`AT+ADVINT=`) | |
| RSSI at ~1 m | — (feeds P3-3.0 thresholds) | — | |

> **✅ Settled Day 13 — this is no longer an open question at the bench.** The module's default
> advertising data is `02 01 06`: the Flags AD structure and nothing else. **No service UUID is
> advertised**, and the device name is carried in the *scan response* rather than the advertisement
> (`hqd-device-architecture.md` §3.2.2).
>
> So **`scanner.ts` cannot filter on `0xFFF0`** — it must match on the **name prefix `YP65-AT`**.
> Filter-by-MAC, the Itron SDK's approach, remains unavailable on iOS (OQ-14). Confirm the above at
> the bench when a board finally advertises, but plan the scanner on it now rather than treating it
> as unknown.

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

**Most of this table was answered on paper before the bench could answer it.** The module spec
(Day 12–13) supplied the profile, the MTU and the advertising behaviour, so what remains for the
bench is confirmation plus the one thing no document states — *which* of the five pipes HQD's
firmware uses.

| Captured | Changes | Status |
|---|---|---|
| Real service UUID | `BLE_SERVICE_UUID` in `protocol.ts` — one line. **But `scanner.ts:320`'s filter must not use it**, see the last row | ✅ `0xFFF0`, from the profile PDF |
| Real characteristic UUIDs + properties | `BLE_CHARACTERISTIC_UUIDS` — the shape change this row predicted **did happen**: not six typed characteristics but **five identical notify + write-no-response pipes**, `0xFFF1`–`0xFFF5`, with no per-characteristic meaning | ✅ from the profile PDF; **which pipe HQD uses is still unknown** — the one thing the bench must still answer |
| MTU | §4.5's two-frame `authResponse` split exists only to fit a 23-byte ATT MTU. A larger real MTU may make it unnecessary | ✅ **185 B** — so the split is unnecessary on this hardware |
| PIN behaviour | The §4.5 CMAC handshake vs. OS-level bonding — these may be redundant or may compose; can't tell until observed | 🔴 Still open. The profile PDF documents **no PIN/pairing/bonding command at all** (confirmed by search), while the `itronlib` doc describes a 6-digit PIN. The two sources disagree; only the bench can settle it |
| No advertised service UUID | Scanner strategy, and OQ-14 (the Itron SDK is MAC-keyed, which iOS cannot do) | ✅ **Confirmed on paper: none is advertised.** Filter on the name prefix `YP65-AT`. See §3.1 |

**Then, and only then**, update `protocol.ts` — it is an append-only contested shared file per
CLAUDE.md, so announce before rewriting the §4.2 block, and cite this document in the commit.

## 5. Still true regardless of what the board says

- §4 remains an **unratified contract** — the firmware team has never been contacted (OQ-6). A GATT
  dump tells us what this board *does*, not what the shipping firmware *will* do.
- `K_dev` never leaves the server; `age_verified` is validated server-side. Nothing observed at the
  bench relaxes the inviolable rules.
- The **firmware dead-man timer** remains the safety authority. If the board turns out to have no
  such timer, that is a 🔴 finding to escalate, not a design to work around in the app.
  **🔴 Day 12–13: this is no longer hypothetical.** The manufacturer states there is **no auto-lock
  timer in firmware at all** — only connection state. It is escalated in
  `../client-messages/architecture-escalation-2026-08-12.md` (drafted, **not sent**), not designed
  around. The module does have a real-time clock, so a timer is feasible; that makes it a scoping
  decision, not a closed door. See `hqd-device-architecture.md` §6.4.
