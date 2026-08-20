# Manufacturer Q&A — consolidated record

Every question we've sent the manufacturer about the BLE device, and every answer we've received,
in one place. Three separate rounds exist as their own dated files (linked below, with full text);
this document is the index and summary so nobody has to reconstruct the timeline from scratch. Today's
live bench session (2026-08-17, continuing) is recorded at the bottom — **not yet sent** to the
manufacturer, tracked here so it isn't lost before it is.

---

## Round 1 — sent 2026-08-10 (Day 11)

**Sent as:** [`manufacturer-requirements-2026-08-10.md`](manufacturer-requirements-2026-08-10.md)
(full text, 10 items). **Channel:** forwarded via the client, not sent direct.

| # | Asked | Answered? |
|---|---|---|
| 1 | How does the device become Bluetooth-discoverable? Board never advertised in 40 min of scanning. | ✅ Yes — see Round 2 reply item 1 |
| 2 | The YC1012 Bluetooth profile (service/characteristic UUIDs, MTU, PIN, AT commands, disconnect reporting, which chip runs the stack) | ✅ Yes — see item 2 below |
| 3 | The `itronlib` library files | ✅ Yes — promised "this Friday" (2026-08-14), delivered 2026-08-17 (late) |
| 4 | iOS SDK, or agreement to talk to the chip directly | 🔴 Not really — circular answer, see below |
| 5 | The correct MCU datasheet (PY32C642F, not PY32F030) | ⚠️ Partial — confirmed the part, datasheet itself never arrived |
| 6 | Schematic sheet 2 of 2, and board identity (`H040` vs `H158`) | 🔴 **Never answered**, either round |
| 7 | Which command locks/unlocks | ✅ Yes |
| 8 | Auto-lock behaviour and duration | ✅ Yes — answer is "it doesn't exist" |
| 9a | Per-device key manufacturing process | ✅ Yes — answer is "not done" (see OQ-4) |
| 9b | Device serial number / uniqueness | ✅ Yes — answer is "the MAC, nothing else" (see OQ-12) |
| 10 | Second board + battery operation | ⚠️ Partial — battery wiring answered, no second board sent |
| — | **Disclosure:** PW200 button pressed once 2026-08-10, green "success" light shown — one licence credit likely already spent before this document was even sent | Acknowledged, not directly responded to |

**Full manufacturer reply:** [`manufacturer-supplied-2026-08-12/manufacturer-response-2026-08-12.md`](manufacturer-supplied-2026-08-12/manufacturer-response-2026-08-12.md), received 2026-08-12 (Day 13).

Key answers, verbatim-summarized:
- **Discoverability:** re-solder the battery, or a single button press. Sleeps after 10 min with no connection. *(This answer said Bluetooth "operates normally while powered via USB" — which the Day-17 reply directly contradicts, see below.)*
- **YC1012 profile:** "refer to `YP65-AT-BLE-module-spec-v1.3-release.pdf`" (arrived same day). Bluetooth stack runs on the chip, now marketed as **YC8612** — same silicon as YC1012, silkscreen rename only.
- **Lock/Unlock/Read Status frames** confirmed with checksums shown.
- **Auto-lock:** "no auto-lock function in the firmware" — connection just stays active until disconnect or 10-min idle timeout.
- **9a (per-device key):** "a unique MAC address is not required... writing a key to each device is not involved." No factory-written secret exists.
- **9b (serial):** the Bluetooth MAC address is the only per-device identifier; nothing is hashed on their side.
- **Battery wiring:** red = battery+, black = battery− and output−, blue = output+. *(Corrected later — see `hqd-device-architecture.md` §10.1: the board's own silkscreen reads `B+`/`B-`/`T`, not this description.)*
- **Item 6 (board identity): no answer at all**, either in this round or Round 2.

---

## Round 2 — sent 2026-08-12 (Day 13)

**Sent as:** [`manufacturer-questions-ble-connection-2026-08-12.md`](manufacturer-questions-ble-connection-2026-08-12.md) (full text, 18 items, renumbered flat list). **Channel:** sent **direct** to the manufacturer via Teams, not through the client — the client was not cc'd.

**Full manufacturer reply:** [`manufacturer-supplied-2026-08-17/manufacturer-reply-2026-08-17.md`](manufacturer-supplied-2026-08-17/manufacturer-reply-2026-08-17.md), received 2026-08-17 (Day 18) — five days after being sent, alongside the `itronlib` SDK.

| # | Asked | Answer (summary) |
|---|---|---|
| 1 | Which of FFF1–FFF5 carries lock/unlock/status? | **FFF1**, both directions |
| 2 | Read Status reply bytes, locked vs. unlocked | `02 05 A2 00 30/31 00 ## ** 01` — `##`=battery%, `**`=checksum |
| 3 | Is there a 6-digit pairing PIN? | **No** — "just-work unencrypted mode," no PIN supported |
| 4 | Exact advertised Bluetooth name | `YP65-AT` — **identical on every unit** |
| 5 | Does it advertise the FFF0 service UUID? | No — FFF1–FFF5 are sub-services of FFF0, but name-only in the advertisement, per prior module-spec finding |
| 6 | What should a working scan show; why would nothing advertise? | Name `YP65-AT`; needs PW200 firmware upgrade or a single button press (blue LED flash) |
| 7 | Is advertising always on? | No — button-triggered only, times out after 10 min idle / 3 min post-disconnect / 10 min connected-idle |
| 8 | Post-connect delay needed? | No — commands can be sent immediately |
| 9 | Multiple phones at once? | No — one-to-one only |
| 10 | Frame format confirmation (header/length/payload/checksum/tail) | Confirmed **as asked**, but the SDK source proves the checksum-span answer is wrong — see below |
| 11 | Full command list | "Refer to *H158 Protocol-202608131414*" (not supplied as a document) |
| 12 | Reply to invalid command/checksum? | **Silence** — device does not respond at all |
| 13 | Unsolicited device-initiated messages? | **Never** — no push on button press or state change |
| 14 | Minimum gap between commands | **20 ms** |
| 15 | Re-advertise after disconnect? | Yes, for 3 minutes |
| 16 | Does lock state survive a disconnect? | **Yes** — retains pre-disconnect state (no dead-man timer) |
| 17 | How to power a bare board | **USB alone is not enough** — needs a soldered 4.2V Li-ion cell |
| 18 | LED meaning; is `AC-H158-V1.01` the charge board? | Ambiguous reply — see `hqd-device-architecture.md` §11.2 |

**What the accompanying `itronlib` SDK corrected, beyond the written answers:**
- **Checksum span:** the written reply (item 10) confirmed our payload-only XOR reading. The SDK's own source (`BleProtocol.kt`) and its own unit test prove the checksum is XOR **from the frame header**, not the payload alone. Verified against the manufacturer's own worked examples in this same reply (see `manufacturer-supplied-2026-08-17/MANIFEST.md` §4 for the arithmetic).
- **Status byte mapping:** item 2 gave both `0x30`/`0x31` without saying which is locked — the SDK settles it: `0x31` = locked, `0x30` = unlocked.
- **An ACK byte** in every reply frame that no written answer, from either round, ever mentioned.

Full technical breakdown, consequences, and what's promoted into code: [`hqd-device-architecture.md`](hqd-device-architecture.md) §11.

---

## Cross-round contradictions and unresolved items

| Item | Round 1 answer | Round 2 / SDK | Status |
|---|---|---|---|
| USB-only power | "Bluetooth operates normally while powered via USB" | "standalone USB power supply cannot sustain system operation" | 🔴 **Directly contradictory.** Round 2 is more specific and matches every bench observation — trust it. |
| Battery wiring | "Red = battery+, black = output− and battery−, blue = output+" | Board's own silkscreen reads `B+`/`B-`/`T`; reply item 18 (2026-08-17) describes the same third wire as `H+`, a heating-element line | 🔴 Three different descriptions of the same wire across two rounds. Settle on the bench, not by asking a fourth time — see `hqd-device-architecture.md` §11.2. |
| Board identity (`AC-H158-V1.01` — main board or charge board?) | Asked, not answered | Asked again indirectly via item 18, answer reads as though it's the main board but doesn't say so explicitly | 🔴 **Still open.** Item 6 has never been answered in either round. |
| Checksum span | N/A | Written reply says payload-only (matches our own original wrong reading); SDK source proves header-inclusive | Resolved — **trust the SDK**, not the written confirmation |
| Auto-lock / dead-man timer | "No auto-lock function in the firmware" | Reply item 16 (2026-08-17): unlocked state survives disconnect | Consistent across rounds — **confirmed absent**, not contradictory, just restated from a different angle |
| iOS SDK (item 4) | "Once the Android SDK version is confirmed, we will provide the iOS SDK" | Not re-asked in Round 2 | 🔴 **Still open, still circular.** No commitment on timeline or on whether direct CoreBluetooth is an acceptable fallback. |

---

## Today's bench session — 2026-08-17/18, not yet sent to the manufacturer

Live hardware bring-up, following the plan in `hqd-device-architecture.md` §11.4. Recorded here as
it happened so nothing is lost; **none of this has been sent to the manufacturer yet.**

1. **Manufacturer's own demo app (`com.itorn.hqd.ble`) built from their SDK source and installed** on
   a test Android phone (API 36). Scan run multiple times against the board, on battery power, with
   the board's button pressed immediately before each attempt (per reply items 6/7's advertising
   window). **No device found**, ever — confirmed via Android's own Bluetooth stack diagnostics
   (`dumpsys bluetooth_manager`) that the phone's radio was actively scanning and picking up hundreds
   of nearby BLE devices per attempt, so the negative result is not a scanning/permission problem on
   the phone's side.
2. **LED behaviour does not match any documented signal.** Manufacturer's reply says a single button
   press should produce **one blue LED flash** (advertising started). What was actually observed,
   across repeated attempts, on **battery-only power**: **continuous blinking of four red LEDs.**
   This is a third pattern — distinct from the "single blue flash" success signal (Round 2) and from
   the "two white LEDs blinking continuously" symptom recorded back on Day 10 (Round 1).
3. **PW200 + PowerWriter firmware-upgrade path attempted**, per the manufacturer's own suggested fix
   for an unexplained LED symptom (reply item 6: *"You need to use PW200 to upgrade the PY32C642
   firmware"*). Chip identity **confirmed physically off the package markings**: `PUYA` / `C642F15` /
   `4B6HM1A` → **PY32C642F15**, matched in PowerWriter's chip database as `PY32C642xx5` (24.00 KB
   flash). This is the manufacturer's own designated `.pkg`/programmer pairing for this project, not
   a new request.
4. **PW200-to-PC connection required troubleshooting** — Windows initially reported the PW200 as a
   `CM_PROB_PHANTOM` (Code 45, not currently connected) despite being physically plugged in; reseating
   the USB cable resolved it (`Present: True`, error code `0`).
5. **PW200-to-chip connection failed**: `[0009] The target chip is not connected...`, while the board
   was powered **only via PW200/USB-C, with no battery connected**. This is very likely the same
   USB-power-insufficient issue as everything else this session (reply item 17) — the chip may not be
   fully running without a battery, so the debug probe can't see it. **Not yet re-tested with the
   battery reconnected alongside the PW200 debug connection** — that's the next step.
6. **No firmware has been flashed.** The `.pkg` load and Write step have not been attempted; only an
   `ID` read was tried, and it failed at the connection level described in point 5.

**Open question worth sending, once this is resolved one way or the other:** what does **four
continuous red LEDs** indicate, specifically — is it a distinct fault code, a different board
revision's normal boot indicator, or something else? Neither round of manufacturer correspondence
has ever described this pattern.

**Superseded by 2026-08-20, below:** point 5's "USB-power-insufficient" theory for the PW200 connect
failure was wrong — see that section for the real cause (adapter orientation) and a second real
factor (battery must stay connected during programming, contrary to what point 5 implies).

---

## 2026-08-20 (Day 21/22) — connection intermittency solved, PW200 flash pipeline solved, firmware/protocol mismatch is the new open question

Full narrative in `docs/session-log/anish.md`. Summary here for anyone scanning hardware state only.

### Two 08-17/18 findings retested today and refuted

- **The device does *not* force-disconnect after ~17-20s.** That symptom, observed informally during
  today's early BLE trials before the cause was understood, does not reproduce once the device is
  woken with a button press before connecting. An idle link survived 120.5s on our own app and
  3+ minutes on the manufacturer's demo app, identical connection parameters both times. What looked
  like an unsolicited drop was a connection made to a device that was already asleep, timing out on
  its own schedule.
- **RSSI is not weak.** Readings of -83/-84 dBm recorded earlier were a **stale cached value** —
  `scanner.ts` only re-emits a device's row when a fresh advertisement arrives, so a sleeping
  (non-advertising) device's last-seen RSSI sits on screen indefinitely. Live readings, confirmed via
  the manufacturer's own app which redraws RSSI continuously, are -57 to -61 dBm — normal for a
  device sitting next to the phone.

### Connection intermittency — solved

The H158 only advertises for a few seconds after its physical button is pressed, then goes silent
(consistent with reply item 7's stated timeouts, though the *duration* we observe is seconds, not
the ~10 minutes the reply describes — worth asking about, see the new question set). Our own
`H158BringUpScreen` scanner made a sleeping device look permanently connectable, because
`DEVICE_STALE_AFTER_MS` in `scanner.ts` is a filter applied only when a new advertisement triggers a
re-render — nothing re-evaluates it on a timer, so a device that stopped advertising keeps its last
snapshot on screen with an apparently-live Connect button. **This is a real dev-only bug, not yet
fixed** — see the session log for detail.

Woken immediately before connecting: 6/6 successful connects, 0.3-0.7s. Left asleep: 3/3
`HCI_ERR_HOST_TIMEOUT` failures, ~30s each.

### PW200 chip-ID read — solved, cause was an adapter, not the device

`[0009] The target chip is not connected` blocked the whole day until, by elimination, **flipping the
USB-C programming adapter's orientation** made an ID read succeed immediately. SWD only maps onto the
adapter's pins in one direction; the wrong way is indistinguishable from a dead target. Ruled out
before finding this: wrong MCU selected in PowerWriter, VREF, clock speed, a "the MCU sleeps and drops
SWD" hypothesis (refuted with 7 ID attempts, device kept awake throughout, all `[0009]`), and PW200
USB-port flakiness (real, but incidental — reseating/direct-to-laptop fixed it independently).

**Second real factor, contrary to what 08-17/18 point 5 assumed:** the board's MCU needs the
**battery connected** during programming. The manufacturer's project files set `I/O VREF = 3.3V`
(the PW200 supplying the target rail), which reads as "battery should come off to avoid contention" —
but pulling it produced a red `NG` on the PW200's own LEDs. Battery connected + correct adapter
orientation is what actually flashes successfully. USB power alone still cannot sustain the board
(reply item 17 stands), it just isn't the *contention* story we assumed.

### 🔴 Chip identity discrepancy — unresolved, needs the manufacturer's confirmation

Point 3 above (08-17/18) records the chip as **PY32C642F15**, read physically off the package
markings (`PUYA` / `C642F15` / `4B6HM1A`) and matched by us in PowerWriter's database as
`PY32C642xx5`. **Both of the manufacturer's own firmware project files
(`H158_V0R0_5EDA983B_202607151202.pkg` and `H158_Test_260708_01.pkg`, both supplied 2026-08-09 in
`BLE.zip`, never opened until today) instead specify `PY32F002Bx5`** — same flash size (24.00 KB) and
OTP size (0.13 KB), different part family. We have not reconciled this; both `.pkg` files loaded and
flashed successfully as `PY32F002Bx5`, so that is what today's programming was actually done against,
regardless of which reading of the physical package is correct. **New question, below.**

### 🔴 New finding, the one that actually matters most: three firmware images, three behaviours, and none matches the documented protocol

Flashed via PW200, then tested identically with the manufacturer's own demo app (byte-identical
frames both times, so this isolates the firmware, not our code):

| Firmware | `TX 02 01 A2 A1 01` (Read Status) response |
|---|---|
| Originally shipped | silence — no reply, ever |
| `H158_Test_260708_01.pkg` (built 2026-07-08) | silence — no reply, ever |
| `H158_V0R0_5EDA983B_202607151202.pkg` (built 2026-07-15) | `RX 81 00 03 00 00 00`, ~35-75ms, **reproduced across two independent flash cycles** |

Reply item 2 specifies `02 05 A2 00 30/31 00 ## ** 01` — header `0x02`, tail `0x01`. **No firmware we
hold produces that.** The `V0R0` image's `0x81`/`0x82` replies are not parseable by the
manufacturer's own demo app (`Failed to parse BLE frame: Invalid frame head: 0x81`), and are
**invariant across Lock/Unlock/Read Status** — the reply bytes do not change regardless of which
command was sent or the device's actual state, consistent with `0x81`/`0x82` being a generic
NAK/error frame rather than a real status reply.

**This is the new blocking question**, and it is squarely the manufacturer's to answer — see
`manufacturer-questions-firmware-2026-08-20.md`.

Firmware and instructions archived at `manufacturer-supplied-2026-08-20/` (both `.pkg` files, plus a
text transcript of the previously-unopened PW200 instructions deck).

---

## Reference — full source documents

| Round | Sent | Reply received | Sent file | Reply file |
|---|---|---|---|---|
| 1 | 2026-08-10 | 2026-08-12 | [`manufacturer-requirements-2026-08-10.md`](manufacturer-requirements-2026-08-10.md) | [`manufacturer-supplied-2026-08-12/manufacturer-response-2026-08-12.md`](manufacturer-supplied-2026-08-12/manufacturer-response-2026-08-12.md) |
| 2 | 2026-08-12 | 2026-08-17 | [`manufacturer-questions-ble-connection-2026-08-12.md`](manufacturer-questions-ble-connection-2026-08-12.md) | [`manufacturer-supplied-2026-08-17/manufacturer-reply-2026-08-17.md`](manufacturer-supplied-2026-08-17/manufacturer-reply-2026-08-17.md) |

Also relevant: [`client-questions-2026-08-09.md`](client-questions-2026-08-09.md) (superseded draft,
kept for the item-9b salt reasoning that didn't survive into the sent version) and
[`hqd-device-architecture.md`](hqd-device-architecture.md) (the full technical analysis and
consequences of everything above — this document is the index, that one is the reasoning).
