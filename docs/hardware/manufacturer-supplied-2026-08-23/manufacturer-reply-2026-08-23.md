# Manufacturer's reply to `manufacturer-questions-firmware-2026-08-20.md`

**Received:** 2026-08-23 (Day 24) · **Channel:** Teams, direct · **Recorded by:** Anish
**Their file:** `H158 Q&A_260821_Replied.md`, authored 2026-08-21 16:07, last edited 16:59
(`wuxiang xiangw@itron.com.cn`), delivered alongside `H158_ProjectFile-V1.3-202608211812.rar`.

They answered inline in our own outgoing document, in blue. This file keeps the English answer text
only, numbered to match [`../manufacturer-questions-firmware-2026-08-20.md`](../manufacturer-questions-firmware-2026-08-20.md).
**Nothing is reworded or interpreted here.**

---

## The headline

> "Please use the `H158_Test_260814_01_.pkg` bundle uniformly. The protocol used by the demo app we
> provided corresponds to the `H158_Test_260814_01_.pkg` firmware version."

So the `0x81` / `0x82` framing we saw on `H158_V0R0_...202607151202.pkg` was an **older** protocol,
not a newer one. **That `.pkg` is in this folder** — it was in the `.rar`, not attached to the
message.

## 1. Which firmware is correct

**1.1 / 1.2 — which `.pkg` is current production firmware, and is there a newer one?**
Answered only as above: use `H158_Test_260814_01_.pkg`. They did **not** say which image ships on
production units.

**1.3 — should the originally-shipped firmware have replied at all, or does every unit need this
PW200 upgrade?** **Not answered in this round.** Their 2026-08-13 reply, item 6, does say
*"You need to upgrade the H158 firmware using the PW200 programme tool"* — which implies yes. See
the open item at the foot of this file.

## 2. The reply format

**2.1 / 2.2 — is `0x81`/`0x82` a newer protocol, and can we have its document?**

> "The error is caused by a mismatch between the protocol version used by the Android app and H158's
> earlier protocol version. Please update to the `H158_Test_260814_01_.pkg` bundle for normal data
> communication."

i.e. **no** — `0x81` is the older side of a version skew, so no document for it exists or is needed.

**2.3 — which firmware implements the `02...01` framing?** `H158_Test_260814_01_.pkg`.

**2.4 — is your demo app older than this firmware, or is `0x81` unexpected to you too?**
Answered as the same version skew.

They then volunteered the full frame spec, unasked. It is reproduced in
[`H158-CMD-Protocol-202608131414.md`](H158-CMD-Protocol-202608131414.md) from the authoritative
`.docx` rather than from this prose, because **the prose contains two errors** — see that file's
final sections. In summary:

| Command | TX | RX |
|---|---|---|
| Lock | `02 02 A1 78 D9 01` | `02 03 A1 00 78 D8 01` |
| Unlock | `02 02 A1 87 26 01` | `02 03 A1 00 87 26 01` ⚠️ checksum should be `0x27` |
| Device info | `02 02 A1 A1 01` ⚠️ should be `02 01 A2 A1 01` | `02 05 A2 00 31 00 64 F0 01` |

Status data field (3 bytes): `0x31`/`0x30` lock/unlock · system state (`00` power-on, `01` power-off,
`02` preheating, `03` heating) · battery percent, hex → decimal.

## 3. The reply doesn't seem to carry real data

**3.1 / 3.2 — is `81 00 03 00 00 00` a generic ack, and what does it mean specifically?**

> "This remains due to an inconsistency between the terminal protocol and the Android app protocol.
> Kindly update the H158 software version."

**The specific meaning of those bytes was not given.** Moot if 260814 behaves as documented;
unexplained if it does not.

## 4. Advertising duration

> "Did you test this using the upgraded `H158_Test_260814_01_.pkg` firmware version? For this
> version, a single button press keeps Bluetooth advertising active for 10 minutes. Once connected,
> if the phone disconnects, the Bluetooth advertising remains active for 3 minutes."

Consistent with their 2026-08-13 reply item 7. Our bench measurement of a **few seconds** was taken
on 260715 and on the as-shipped image, so it does not contradict this — but it is unverified on 260814.

## 5. Chip identity

> "PY32F002B and PY32C642 are in fact the same chip — only the package marking differs. Please simply
> use the installation package we provided to flash the device."

✅ **Closed.** `PY32C642_Datasheet_V0.5.pdf` in this folder is the correct datasheet. The
`PY32F030` datasheet in `../client-supplied-2026-08-09/` is the wrong part and they said so on
2026-08-12, item 5.

---

## Still open after this round

1. **Which firmware ships on production units** (1.1). We have now been given three different images
   and told to use a fourth. If units ship needing a bench flash before they will talk to a phone,
   that is a client and manufacturing problem, not an app one — it should go to the client rather
   than be asked a third time.
2. **What `81 00 03 00 00 00` meant** (3.2). Only matters if 260814 does not fix it.
3. 🔴 **OQ-17 — the device name.** They have now answered this **both ways**, and the contradiction
   is theirs, not ours:
   - 2026-08-12, item 1: the name is `YP65-AT` *"with the MAC address appended as a unique identifier
     to distinguish between devices."*
   - 2026-08-13, item 4: *"The device's Bluetooth name can be set via the AT+NAME command, but **all
     devices share the same Bluetooth name**."*

   Their iOS SDK does not settle it — `BleScanner.swift` filters on the `YP65-AT` prefix and keys
   devices by `peripheral.identifier.uuidString`, a per-install CoreBluetooth value that works either
   way. **This is decidable on the bench by scanning two units.** Test it; do not ask a third time.
