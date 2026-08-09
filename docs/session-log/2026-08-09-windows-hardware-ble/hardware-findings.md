# Hardware bring-up findings — H158 PCBA sample (single unit)

*Session date: 2026-08-09. Branch: `chore/hw-bringup-inspect`. Scratch note only — NOT repo docs.
Merge into docs/spec register together with Anish's research.*

## Session state at close (2026-08-09)

- **P1-7.0 (BLE connection lifecycle) is CLAIMED by us and handed to Sonnet.**
  Branch `feature/P1-7.0-connection-lifecycle` (off `origin/stage`, not yet pushed — push early to
  make the claim visible). Brief: `temp_ss/P1-7.0-connection-brief.md`. Built against the mock; no
  hardware needed. Deliberately parallel to Anish's `feature/ble-connectivity` (docs-only, zero
  `src/` changes at time of claim) — **whichever comes out better is chosen later; do not merge or
  rebase between the two branches.**
  ⚠️ Heads-up owed to Anish: the brief has Sonnet make an **additive** change to the shared file
  `src/features/ble/BleClientContext.tsx` (adds `onDeviceDisconnected` to `BleManagerLike`, mirroring
  the real `react-native-ble-plx` API) plus the matching mock method on `MockBleManager`.
- **Client-facing docs ready to send** (user is sending): `temp_ss/client-device-requirements.md`
  (plain-language, no internal §/OQ codes) and `temp_ss/itron-firmware-requirements.md`.
- **YC1012_JD command manual: confirmed NOT public.** Repeated searches surface only the *different*
  YC1021 part. Must be requested from itron/Yichip — it is the top outstanding document.
- **Repo docs deliberately untouched** (`docs/**`, spec register, `CLAUDE.md`) pending Anish's
  research, per the user's call. All findings live here in `temp_ss/` only.

## Setup on hand

- 1× H158 vape PCBA (battery attached) wired via harness to a **PW200** PowerWriter programmer
  (ICWorkshop), USB into the Windows PC. PowerWriter **1.4.0.1** installed at
  `C:\Users\USER\AppData\Local\PowerWriter`.
- PW200 status: **red NG LED lit** = last (standalone) programming attempt FAILED. Today's GUI log
  (`PowerWriter/Logs/2026_08_09.log`) shows only an app launch at 12:37, no operations — so the NG
  state predates this session or reflects an offline attempt, not anything done via the GUI today.

## Desk research (Step 0) — established facts

### Vendor's intended flashing flow (from the PW200 instructions PPTX, 9 slides)
1. Install PowerWriter, plug PW200 in via USB (GUI shows connected).
2. **File → Load Project** → select the `.pkg` → **password `88888888`** → OK.
3. Click the upload button to load the project **into the PW200's internal storage**.
4. Disconnect from the host app.
5. Plug PW200 into the **vaporizer's USB-C port** (SWD is routed through USB-C).
6. **Press the button on the PW200** → it flashes the target. Green OK = success, red NG = fail.

⚠️ **Safety consequence: the PW200 button is a WRITE trigger.** With a project loaded in the
programmer, pressing it programs (and first erases) the target. Do not press it during inspection.

### `.pkg` files
Encrypted PowerWriter project archives (high-entropy binary, no plain header). Password
`88888888` opens them in the GUI. Two provided: `H158_Test_260708_01.pkg` (test fw) and
`H158_V0R0_5EDA983B_202607151202.pkg` (July 15 build, ~27 KB).

### PY32F030 MCU (from client-provided datasheet Rev 1.4)
- Cortex-M0+, up to **64 KB flash** (0x0800_0000–0x0800_FFFF), **8 KB SRAM**. Some variants 32 KB.
- 4 KB information area: **option bytes** (0x1FFF_0E80), **factory config/UID**, system bootloader.
  → The factory **UID** is a candidate `deviceUid` source for spec `serial_hash` (OQ-12 relevance).
- SWD on PA13 (SWDIO) / PA14 (SWCLK) — matches PW200 harness pin map.
- Protections: **RDP** (read protection), WRP (4 KB granularity), option-byte write protection.
  Datasheet doesn't spell out RDP-downgrade behaviour (reference-manual territory), but the PY32
  family follows the STM32 convention: **RDP Level 1 → 0 mass-erases flash. Never unprotect.**
- No hardware crypto block → §4.5 AES-CMAC + HKDF-SHA256 must be software; fine on M0+ at this
  duty cycle; flash headroom exists (27 KB current image vs 64 KB part, if 64 KB variant).
- Flash endurance 100K cycles; boot modes via BOOT0 pin + option bytes.

### PW200 LEDs (from installed manual)
POWER = powered; STATUS = activity; **OK (green) = last operation succeeded**;
**NG (red) = last operation failed**.

## Step 1 — NG diagnosis / online chip query

### 🔴 Correction: the MCU is NOT the PY32F030 in the client's datasheet
Loading the manufacturer's project (`H158_V0R0_..._202607151202.pkg`, project updated 2026-07-15)
populated the real target from the `.pkg`:

- **MCU: `PY32F002Bx5`** — a *different, smaller* part than the PY32F030 datasheet we were given.
- **Flash size: 24.00 KB** (not 64 KB). Single bank.
- **OTP memory: 0.13 KB ≈ 128 bytes.** ← this is the physical home for spec §4 `K_dev` (OQ-4).
- A dedicated **"OTP Memory" tab** appeared in PowerWriter once the project loaded → the tooling
  supports reading/writing that OTP region directly.
- Project configures a serial-number write at **`SN Addr 0x08005FFC`** (last word of the 24 KB
  flash), but **"Enable SN" is unchecked** in this project, so it isn't writing one here.
- Load succeeded ("Update chip information successfully… Load success"). Target still shows
  **disconnect** — this was all read from the file, nothing touched the chip yet.

**Implications to carry forward:**
- Our spec §3 hardware assumptions were written against the wrong datasheet. Request the
  **PY32F002B** datasheet/reference manual from the client/itron. 24 KB flash is tight for
  BLE-app + AES-CMAC + HKDF — a real constraint to validate, not assume (note: the PY32F002B is the
  application MCU; the YC1012 is the separate BLE controller, so the RF stack isn't in these 24 KB).
- **128 bytes of OTP + a PowerWriter OTP tab is exactly the OQ-4 mechanism**: itron/factory can
  burn a per-device `K_dev` into OTP with this same tool. Turns OQ-4 from "how?" into "who runs it
  and how is the key manifest delivered?".
- The `SN Addr 0x08005FFC` slot is a candidate for `deviceUid` feeding `serial_hash` (OQ-12).

### Chip-connectivity probe — result: SWD link does NOT come up
Clicking read-only **`ID`** returned **`[0009] The target chip is not connected`**.

- **Not a protection lock** — no RDP/unlock prompt appeared, so the single-sample mass-erase trap
  was never reached. Nothing was written (op aborts before touching the chip).
- **This is the NG-light cause**: the prior standalone flash attempt failed the same way — the
  programmer cannot reach the MCU over SWD. The NG means "couldn't connect", not "dead chip".
- I/O VREF is currently forced to **3.3V** in the project, not "External input", while the board is
  self-powered by its LiPo (~3.7–4.2V). Candidate causes, in likelihood order:
  1. **Target MCU not powered / asleep** — vape MCUs often stay off until activated (draw/button);
     no VCC on the MCU → SWD can't attach.
  2. **Wiring** — SWDIO/SWCLK/GND (and a VREF sense line) not landing on the right SWD test points.
     Note the vendor's *documented* connection is via the vape's **USB-C port** (SWD routed through
     USB-C), whereas this rig uses flying leads to a small breakout — so the leads may not be on the
     actual SWD pads.
  3. **VREF mismatch** — programmer driving 3.3V logic level; VREF is forced to 3.3V in the project.

  **CORRECTION (later in session): the board has NO battery and NO charger.** It is powered only by
  whatever the PW200 supplies down the USB-C link. That is enough to blink an LED but likely not to
  run the device normally — which reframes cause #1: the MCU may be brown-out / half-powered, not
  merely asleep. A bare, unpowered board is a weak basis for SWD bring-up regardless of debug-lock.

**→ This is now a physical-bringup / itron question, not a software one.** Ask itron: exact SWD
test points (or is online SWD only exposed via USB-C?), whether the board must be powered on first,
and the correct VREF mode. We will NOT force-connect or unlock the single sample.

### Update: board powered, SWD still fails → likely SWD disabled in production firmware
Pressing the device's own button woke the board (LEDs now blinking = powered). Re-probe of `ID`
still returns **not connected**. So it is **not** a power/sleep issue.

Most probable cause now: **production firmware has disabled the SWD debug interface** (RDP enabled,
or PA13/PA14 repurposed as GPIO) — a standard anti-readout hardening step on a security-sensitive
device. This is consistent with the NG light (prior offline flash also couldn't attach) and cannot
be cleared without a mass-erase unlock, which we will NOT do on the single sample. Alternative
causes (USB-C pin mapping / SWD not on these leads) are also possible; both are **itron questions**.

**Do not long-press the device button to experiment** — on an unknown vape firmware a hold can fire
the atomizer or power-cycle/reset the board. A normal short press already powered it; that's enough.

### What we can still do without SWD
BLE GATT enumeration (Step 3) needs only the powered device + a phone — it does not depend on the
programmer link at all. That is the higher-value remaining step and is unblocked.

## Step 2 — Flash backup attempt
*(pending — only if chip readable; refuse any unlock/erase prompt)*

## Step 3 — BLE GATT enumeration of running device

- **Device LED: continuous RED blink** — with NO battery present, this reads as a no-battery /
  power-fault indicator rather than "advertising". The board is powered solely by the PW200 over
  USB-C, which is insufficient to run the BLE radio reliably.
- 🔴 **BLE enumeration is BLOCKED on power.** The board has no battery and no charger; the only feed
  is the programmer. The Bluetooth radio (YC1012) does not come up under that feed, so the device
  does not advertise. To capture the GATT the board needs real power: its battery, a bench 3.3–4.2V
  supply, a normal 5V USB charger into its USB-C, OR the assembled vape.
- **USB-charger attempt (later): still nothing advertises.** Powering the bare board from a real
  5V USB charger did not make it appear in nRF Connect. Conclusion: this mainboard does not start
  its BLE application without a battery — it stays in charge/fault mode (steady red LED). BLE
  enumeration is **deferred** until a battery, a bench supply emulating one, or the assembled vape
  is available, OR itron tells us how to force advertising/pairing on a bare board.
- nRF Connect (iOS) scan: the board does **not** advertise an obvious name (no "HQD"/"H158").
  Named hits are all environment (Windows beacon, JBL Flip 7, Midea AC "net", a MacBook, a Samsung
  TV). **Two nameless "N/A" advertisers (TxPower 12 dBm) are the candidates**: ~−53 dBm and
  ~−75 dBm. Identification in progress via proximity + raw-advertising inspection.
- **Spec check to make once identified:** does the advertised 128-bit service UUID equal our spec
  §4.1 `42530001-1E5B-4A9C-9D3F-7C6E1B2A5D80`? Expected answer under stock itron firmware: **no** —
  which is the direct on-air confirmation that the shipping firmware is not our §4 contract.
  *(pending)*

## Correct datasheet obtained (public)
Downloaded the official Puya **PY32F002B-C_Datasheet_V1.0** into the client's Datasheet folder
(`PY32F002B-C_Datasheet_V1.0 (CORRECT PART - downloaded).pdf`). Confirms the real silicon:
- Cortex-M0+ @ 24 MHz, **24 KB Flash, 3 KB SRAM**, SWD, 1.7–5.5 V, no hardware AES.
- ⚠️ **3 KB SRAM is a real constraint** for spec §4 software crypto (AES-CMAC + HKDF-SHA256) running
  alongside the application. Feasible on M0+ (the YC1012 carries the BLE stack separately, so the RF
  stack is not in these 3 KB), but memory budget must be validated with itron, not assumed.
- This closes the "wrong datasheet" item. The PY32F030 PDF in the folder remains mislabelled for
  this board and should be ignored for part-specific detail.

## 🔴 Full-folder review — the schematic + BLE datasheet change the §4 picture

Read the two files not opened earlier: the PCB schematic (`H040BLE-SCH-V1.02.pdf`) and the BLE
chip datasheet (`YC1012_JD_Datasheet_V1.0.pdf`). Both are load-bearing.

### The device is a TWO-CHIP design, not one "firmware"
- **U5 = application MCU** — schematic marks it **`PY32C642F-QFN20`** (note: PowerWriter reported
  `PY32F002Bx5`; these are near-equivalent Puya dies, but the P/N should be reconciled — the
  C642 datasheet may be the strictly-correct one; F002B is close enough for planning).
  SWD pins are non-default: **SWDIO=PB6, SWCLK=PA2**. RGB status LED: R=PB7, G=PC1, B=PC0.
  Button=PA5, puff/mic sensor=PA3, coil drive via P-FET Q1, charger = **BM9073** Li-ion charger.
- **U6 = `YC1012_JD`** — a **standalone Bluetooth 5.4 SoC** (Yichip): own 24 MHz 32-bit MCU, 8 KB
  RAM, **8 KB OTP**, **hardware AES128**, its own serial-wire/ICE debug. It carries the radio and
  link layer. **The BLE stack does NOT run on the PY32.**
- **The two chips talk over a UART**: schematic nets `BLE_TX`/`BLE_RX` + `WAKE_HOST` (BLE wakes
  MCU) + `INT_ICE`; datasheet says it "can be paired through **HCI interface** with a more powerful
  MCU" and has "1 x UART (RTS/CTS) with **HCI-H5 protocol** up to 3.25 Mbps". Schematic also notes
  an "AT/DATA Select (AT-Command Mode Only)". So the PY32 drives the YC1012 as a BLE
  controller/module over UART (HCI-H5 or an AT command set).

### Why this matters for spec §4 (the contract several tasks are built against)
Our §4 assumes a single "firmware" that (a) exposes our custom GATT (service `4253…5D80`,
characteristics with read/write/notify, 20-byte frames), (b) runs AES-CMAC/HKDF, (c) holds `K_dev`
in OTP, and (d) runs the dead-man auto-lock timer. In reality that is split across two chips:
1. **The GATT server lives on the YC1012, not the PY32.** Whether it can be configured with our
   custom §4 UUIDs/characteristics/notifications and 20-byte writes depends on the **YC1012's**
   firmware / AT-or-HCI capability — which is **Yichip's** domain, not just itron's. This is a new,
   deeper dependency and the single biggest §4 risk the drop surfaces. **We do not have the
   YC1012 AT/HCI command manual** — request it.
2. **Crypto placement is now a real design question.** Either the YC1012's HW-AES128 computes the
   CMAC, or the PY32 does AES-CMAC/HKDF in software (feasible on M0+ but 3 KB SRAM is tight).
3. **`K_dev` OTP — which chip?** There are TWO OTP regions (PY32 128 B, YC1012 8 KB). OQ-4
   provisioning must target the right one; whoever burns keys needs to know which.
4. **The MCU↔YC1012 UART is an internal plaintext trust boundary** — the handshake crosses it in
   the clear on-board. Not necessarily a flaw, but §4's threat model assumes one chip; document it.
5. **Auto-lock dead-man timer** must run on the always-present PY32 app MCU (not the radio), or the
   §7 authority model breaks. Needs to be specified to itron.

### Naming / version mismatches to resolve with the client
- **Board name:** schematic title is **`HQD-H040BT-MAIN-V1.02`** (dated 2026-07-02), but the
  firmware/project is **`H158`** and the folder says "HQD PLUS PMTA New Device". The schematic may
  be a related-but-different board revision (H040 vs H158). Confirm the schematic matches the
  H158 sample we physically have.
- **MCU P/N:** `PY32C642F` (schematic) vs `PY32F002Bx5` (writer) — reconcile.

### Docs we still lack (add to the itron/client ask)
- **YC1012 AT/HCI command manual** (decides whether custom §4 GATT is even possible on this radio).
- **PY32C642 datasheet/reference manual** if C642 ≠ F002B in any way that matters.
- Confirmation the schematic revision matches the delivered H158 board.

## YC1012 custom-GATT capability — desk research (partial de-risk of the make-or-break question)

No public datasheet/AT manual for the exact `YC1012_JD` exists, but sibling Yichip parts and our own
datasheet give a useful read:
- Yichip BLE modules (e.g. YC1021, YC1155) ship as **customer-customisable firmware** with **AT
  configuration that supports custom services incl. 128-bit UUIDs**; many default to a **UART
  transparent-transmission** profile (fixed TX/RX pipe). The `_JD` suffix on our part almost
  certainly denotes a **customer/project-specific firmware build**.
- Our datasheet says the YC1012 exposes a **UART HCI-H5** link and (schematic) an **AT command
  mode**. The PY32 host is far too small (3 KB RAM) to run a full BLE host stack, so the YC1012
  almost certainly **runs the whole BLE stack itself**; the PY32 drives it at a high level.

**Interpretation (must still be confirmed with the YC1012_JD command manual):**
- The make-or-break risk is **lower than feared**: custom 128-bit GATT is a documented capability of
  this module family, and the firmware is a customer build — so exposing our §4 service/characteristics
  is *likely possible with a firmware rebuild by itron/Yichip*, NOT physically precluded.
- **Cleanest integration to propose:** YC1012 firmware hosts the §4 GATT layout and simply
  transports characteristic reads/writes/notifies to/from the PY32 over UART; **the PY32 runs the
  §4 crypto (CMAC/HKDF) and holds `K_dev` in its OTP.** This keeps the root key on the app MCU and
  limits what Yichip must change to "expose these UUIDs + pass bytes through".
- **Residual risk if the YC1012_JD build is locked to a fixed transparent-transmission profile:**
  then our app's exact §4 GATT addressing (distinct characteristics C1/C4/C5/C6, our service UUID)
  can't be honoured directly and our protocol would have to be **tunnelled over the module's single
  TX/RX pipe** — an app-side + spec-side adaptation. Still workable, but a real change. This is why
  the YC1012_JD AT/HCI manual is the top document to obtain.

## Open items for itron / client raised by this session
- Is the sample's MCU read-protected (RDP)? If yes: request an unprotected dev sample or their
  guidance — we will not unprotect (mass-erase) the only unit.
- Exact PY32F030 variant on the H158 board (flash size letter) — read from chip marking or GUI.
