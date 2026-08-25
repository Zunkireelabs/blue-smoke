# Manufacturer-supplied documents — received 2026-08-12 (Day 13)

Companion to [`client-supplied-2026-08-09/MANIFEST.md`](../client-supplied-2026-08-09/MANIFEST.md),
same convention: this file records what arrived and its provenance. Read
[`../hqd-device-architecture.md`](../hqd-device-architecture.md) and
[`../../TECHNICAL_SPEC.md`](../../TECHNICAL_SPEC.md) §13 for what it means for the build.

---

## 1. What was actually captured

**Text, plus two PDFs recovered later the same day.** The manufacturer's reply text was pasted
directly into a Claude Code conversation by the user — there is no original email in this repo for
that part, and no hash to record for it. `manufacturer-response-2026-08-12.md` is that text, English
only, de-duplicated from the sender's bilingual formatting, otherwise unedited.

The two files referenced by the reply — `YP65-AT-BLE-module-spec-v1.3-release.pdf` and
`YC8612_Datasheet_V1.0.pdf` — surfaced later in the same session in a root-level `operating-manual/`
folder (the zip's contents, extracted outside this repo by the user's IDE) and were copied in here
verbatim, then that stray folder was removed. SHA-256s below.

```
27cd15f81e1eaca6763182471395a565f917d6d99c459a5984fe729b0eb77335  YP65-AT-BLE-module-spec-v1.3-release.pdf
919ce2bd6021a1856103fb014bb5eed20eef6082e63177f7202d1b1fe525e12a  YC8612_Datasheet_V1.0.pdf
```

**`YP65-AT-BLE-module-spec-v1.3-release.pdf`** is the real GATT profile document that OQ-13 had been
waiting on since Day 9. It documents the **YP65AT** module (壹原理科技/YIPRINCIPLE, built on a
YiChip/YICHIP BLE SoC) — private service **`0xFFF0`** with five generic notify+write-no-response
characteristics **`0xFFF1`–`0xFFF5`** (handles `0x002a`/`0x002d`/`0x0030`/`0x0033`/`0x0036`), a
**separate standard HID service `0x1812`** (`0x2A4D` etc.) for media/volume remote-control keys
unrelated to lock/unlock, default MTU 185 B, explicit `AT+CONNECT`/`AT+DISCONN` events, and the full
`AT+NAME`/`AT+ADDR`/`AT+ADVEN`/`AT+SLEEP` command set. See
[`../hqd-device-architecture.md`](../hqd-device-architecture.md) §3.2/§11 for what this means —
the previously invented 128-bit `42530001-…` service UUID is superseded by this real 16-bit one.

**`YC8612_Datasheet_V1.0.pdf`** confirms the Day 12 rename is real: same `QFN2*2_12L` package, 8 KB
OTP, AES-128 HW, HCI-H5 UART, 24 MHz core — byte-for-byte the same silicon facts as
`YC1012_JD_Datasheet_V1.0.pdf` in `client-supplied-2026-08-09/`, just a newer preliminary datasheet
under the YC8612 name.

## 2. Still not in this repo

| Referenced item | Where it's referenced | Status |
|---|---|---|
| Updated PY32C642F datasheet | Item 5 — "the datasheet has been updated in the document package" | 🔴 **Not in repo.** Not part of what surfaced in `operating-manual/`; may still be in the original zip. |
| Operating manual | Mentioned when the zip was opened, not tied to a specific numbered item | 🔴 **Not in repo** as a distinct document — possibly `YP65-AT-BLE-module-spec-v1.3-release.pdf` itself was what was meant; if a separate manual exists, it hasn't surfaced yet. |
| `itronlib` SDK + demo | Item 3 — promised "this Friday" | ⏳ **Not sent yet.** Expected 2026-08-14. Chase if it doesn't arrive. |

## 3. What item 6 is missing

The manufacturer's reply has no answer for item 6 (schematic sheet 2 of 2, and the `H040`/`H158`
board-identity question). Every other item 1–5, 7–10 has a reply. This looks like an item dropped in
translation or in copying the reply together, not a "no comment" — worth a direct one-line follow-up
rather than re-asking the whole item.

## 4. Cross-check against the profile PDF — partial

The lock/unlock/read-status byte frames in item 7 are recorded as supplied, with their XOR checksums
shown by the manufacturer. The profile PDF confirms **the container** they travel in — one of the
`0xFFF1`–`0xFFF5` write-no-response characteristics under service `0xFFF0` — but does **not** by
itself say which of the five, nor does it document `02 02 A1 78 D9 01` etc. as a named command; those
bytes are HQD application-layer payload, opaque to the generic transport module. **Which
characteristic HQD's firmware actually uses is still not confirmed**, and the frames are **not yet
promoted into `src/features/ble/protocol.ts`** — see `hqd-device-architecture.md` and
`TECHNICAL_SPEC.md` §13's OQ-13 row for why that's deliberate.
