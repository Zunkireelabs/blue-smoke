# Client-supplied hardware

**Recorded:** 2026-08-06 (Day 6) · **Status:** first-hand observation, not a client-confirmed record

> **Why this file exists.** Until now these findings lived only in a chat log. They change what
> `P0-2.5`, `P3-3.0` and `P3-6.0` can start on, and they carry safety warnings that must not depend
> on someone remembering a conversation.
>
> **What is verified vs. inferred is marked throughout.** Everything under "Open questions for the
> client" is unconfirmed and goes out with the [architecture sign-off message](../ARCHITECTURE-SIGNOFF.md).

---

## 1. What was supplied

Two items, physically wired together:

| Item | What it is |
|---|---|
| **ICWorkshop PowerWriter PW200** | A production **firmware burner**. Not a debugger. |
| **Green PCB** | Battery + MEMS airflow sensor, no display. Consistent with the device electronics. |

### 1.1 Identifying the PW200

Windows mislabels the device as **"DAPLink CMSIS-DAP"**. That label is wrong and sent the first
identification attempt down the wrong path. The USB descriptors are what actually identify it:

```
"Power Writer Serial Port"
"#PW_HID_CMSIS-DAP"
```

- **Firmware label (on the unit):** `程序 V0832` / `251108-18-19`
- **Probe serial:** `E8AB7F111EF2EDC1C2F573D3358160C1`

**This matters because a burner and a debugger imply different client intentions.** A debugger would
suggest we were expected to develop firmware. A production burner suggests the client's own firmware
process, with us on the app side of the line — which is consistent with the locked decision that
[we do not write firmware](../archive/PROJECT_BRIEF-superseded.md).

---

## 2. Pinout

From the label on the back of the unit. Two rows, ten pins each:

```
VIN    5V    GND    BOOT0    GND      GND    GND    GND    GND    GND
VREF   TX    RX     SWDIO    SWCLK    CTRL   SWIM   RST    OK     NG/SWO
```

Notes on what this tells us:

- **`SWDIO` / `SWCLK`** — SWD. ARM Cortex-M target.
- **`SWIM`** — an STM8 programming pin. The PW200 is a multi-target tool; its presence says nothing
  about which part is on our PCB.
- **`BOOT0`** — STM32-family boot-mode selection. Suggestive of ST silicon, not conclusive.
- **`OK` / `NG`** — pass/fail status lines for a production jig. Reinforces "production burner".
- **`TX` / `RX`** — present on the header, but see §3.

---

## 3. What was observed

| Observation | Interpretation |
|---|---|
| **COM3 opens successfully but returns 0 bytes.** | An **idle line**, not a wrong baud rate. A baud mismatch produces framing errors or garbage, not silence. Since TX/RX are on the header, the likely explanation is that they are simply **not wired in the supplied harness**. Unconfirmed — see §6. |
| **No MSD (mass-storage) interface enumerates.** | No drag-and-drop flashing. Any firmware transfer goes through PowerWriter's own tooling, which is the client's process, not ours. |
| **The stock firmware does not speak our §4 GATT spec.** | `V0832` is the client's **existing** firmware. **Nobody has built to [`TECHNICAL_SPEC.md` §4](../TECHNICAL_SPEC.md) yet.** This is the single most important line in this document — see §5. |

---

## 4. 🔴 Safety — read before touching it

These are not cautions, they are prohibitions. Each one is cheap to obey and expensive to violate.

1. **Do not press the button on the PW200.** It burns firmware. It may also consume a **licence
   credit** — PowerWriter units are licensed per-burn. An idle press is not free and may not be
   recoverable.
2. **Do not attempt flash readout.** Read-protected ARM parts **mass-erase on a failed unlock
   sequence**. If the PCB carries the client's only build of `V0832`, a curiosity-driven read
   attempt destroys it, and we cannot reflash it — we do not have their firmware image.
3. **The lithium cell is unprotected.** No protection circuit. Do not short it, do not leave it
   charging unattended, do not store it connected.

> If a question can only be answered by burning, reading, or powering something unattended — it is a
> question for the client, not an experiment.

---

## 5. What this unblocks, and what it does not

### 5.1 🔴 It does **not** unblock the §4 contract

`V0832` is stock firmware that predates our spec. It does not implement our service UUID, our
characteristics, our auth handshake, or our command set. Possessing this hardware therefore does
**nothing** for:

- `P0-2.5` mock BLE peripheral — still the only thing that can exercise §4
- `P1-4.0` bonding, `P3-2.0` lock/unlock — still building against an **unratified** contract
- `P3-6.0` / milestone **M7** — still needs firmware built to §4, by the client's team

**The critical path is unchanged: `OQ-6` — get a firmware counterpart and walk them through §4.**
No amount of hardware in the room substitutes for a firmware engineer having read the spec.

### 5.2 What it *does* unblock — earlier than planned

Three things that the roadmap assumed were gated on Day-26 hardware:

| Now possible | Was blocked on | Relevant to |
|---|---|---|
| **BLE recon with nRF Connect** — observe what the stock firmware actually advertises, its GAP name, advertising interval, connection parameters | Day 26 | `P1-3.0` filtered scan, §4.9 connection parameters sanity-check |
| **PCB chip-marking photographs** — identify the actual MCU and BLE SoC | Day 26 | Tells us whether the §4.5 crypto (AES-CMAC) and the §4.8 `F2` RTC/LPTIM dead-man timer are realistic on the part the client has already committed to |
| **§7.2 RSSI baselining** — measure real RSSI-vs-distance with a real radio in a real enclosure | Day 26 | `P3-3.0` proximity hysteresis. Thresholds tuned against a dev board are a guess; these are a starting point. |

> **Caveat on RSSI baselining.** The stock firmware's TX power and advertising parameters are not
> necessarily what §4-compliant firmware will use. Treat any numbers derived here as a **baseline to
> be re-validated in Block E**, not as final thresholds. Record the conditions alongside the numbers.

---

## 6. Open questions for the client

These ride along with the [architecture sign-off message](../ARCHITECTURE-SIGNOFF.md):

- [ ] **Are `TX`/`RX` wired in the supplied harness?** COM3 is silent; we want to know whether
      there is a debug UART we should be listening to, or whether the pins are simply unpopulated.
- [ ] **What MCU / BLE SoC is on the PCB?** We can read the chip markings, but a definitive part
      number from the client is faster and authoritative — and it determines whether §4.5 and §4.8
      `F2` are implementable as specified.
- [ ] **Is `V0832` the baseline the §4 firmware will be built from**, or is §4 firmware a separate
      effort? This changes what "firmware integration" on Day 26 actually means.
- [ ] **Who holds the PowerWriter licence, and what is the burn-credit budget?** Relevant if
      iterating on firmware during Block E.
- [ ] **Is this PCB representative of the production device**, including enclosure and antenna? RSSI
      baselining is only transferable if it is.

---

## 7. Related

- [`../TECHNICAL_SPEC.md` §4](../TECHNICAL_SPEC.md) — the GATT contract this hardware does *not* implement
- [`../TECHNICAL_SPEC.md` §7.2](../TECHNICAL_SPEC.md) — proximity / RSSI hysteresis
- [`../ARCHITECTURE-SIGNOFF.md`](../ARCHITECTURE-SIGNOFF.md) — the client message carrying §6 above
- [`../session-log/sadin.md`](../session-log/sadin.md) — 2026-08-06, where these findings were flagged as unwritten
