# Manufacturer-supplied documents — received 2026-08-23 (Day 24)

Companion to [`../manufacturer-supplied-2026-08-17/MANIFEST.md`](../manufacturer-supplied-2026-08-17/MANIFEST.md),
same convention: this file records what arrived and its provenance. Read
[`../hqd-device-architecture.md`](../hqd-device-architecture.md) and
[`../../TECHNICAL_SPEC.md`](../../TECHNICAL_SPEC.md) §13 for what it means for the build.

---

## 1. What arrived

Two items, delivered over Teams in reply to
[`../manufacturer-questions-firmware-2026-08-20.md`](../manufacturer-questions-firmware-2026-08-20.md):

1. `H158 Q&A_260821_Replied.md` — our own outgoing document with their answers inline in blue.
   Recorded here as [`manufacturer-reply-2026-08-23.md`](manufacturer-reply-2026-08-23.md).
2. `H158_ProjectFile-V1.3-202608211812.rar` — **31 MB, 12 files**, a *cumulative* bundle. Their own
   `tree.txt` marks only four entries `----added at 20260821`: the v1.5 module spec, the `.pkg`, the
   08-21 Q&A, and the iOS demo. Everything else had been sent before.

> ⚠️ **The `.rar` is the delivery; the message is not.** The reply's load-bearing instruction is
> *"use `H158_Test_260814_01_.pkg` uniformly"* and that file exists **only inside the archive** — it
> was not attached to the message. On first inspection only the inner `H158_IOS_Demo.zip` had been
> extracted locally, which made the firmware look missing. This is the second time in two weeks that
> unopened archive contents have cost us time (see the 2026-08-20 session log on `BLE.zip`, unopened
> for eleven days). **Extract every manufacturer archive in full, and diff its file list against this
> folder, before concluding anything is absent.**

## 2. What was committed here, and what was not

**3.7 MB.** Committed:

| File | Size | Why |
|---|---:|---|
| `H158_Test_260814_01_.pkg` | 25,770 | 🔴 **The point of this delivery.** Built 2026-08-17. The firmware every answer in the reply depends on. |
| `H158-CMD-Protocol-202608131414.docx` | 25,352 | The protocol document, cited as the authority in three replies (08-13 items 2 and 11, 08-21) and never opened by us until now. |
| `H158-CMD-Protocol-202608131414.md` | — | Our text transcription of the above — the `.docx` is not greppable and not diffable. It contains no images; nothing was lost in extraction. |
| `PY32C642_Datasheet_V0.5.pdf` | 2,255,187 | The **correct** MCU datasheet. Supersedes `PY32F030` in `../client-supplied-2026-08-09/`, which they flagged as the wrong part on 2026-08-12 item 5. |
| `YP65-AT-BLE-module-spec-v1.5-EN-release.pdf` | 574,203 | Newest module spec (2026-08-18). Repo previously held v1.3 only. |
| `YP65-AT-BLE-module-spec-v1.4-release.pdf` | 744,607 | Kept because their 2026-08-13 reply item 3 states their command documentation is based on **v1.4** specifically, so it is the version their firmware claims to implement. |
| `h158lib-ios-sdk/` | ~80 KB | The iOS SDK — **first iOS artifact received on this project.** Swift sources plus 20 unit tests. |

Not committed:

| Excluded | Why |
|---|---|
| `SDK&Sourcecode/H158-APK-Demo-sourcecode-V1.1-202608131957.zip` (27 MB) | Duplicate. The same Android `itronlib` and demo is already at `../manufacturer-supplied-2026-08-17/H158-itronlib-sdk/`. |
| `Q&A/H158 Q&A_260811_Replied.md` | Already held as `../manufacturer-supplied-2026-08-12/manufacturer-response-2026-08-12.md`. ⚠️ **The repo copy is the better one** — it carries an answer to the per-device-key question (item 9a) that is *blank* in the archive copy, because it came via a different channel. Do not "update" the repo copy from this archive. |
| `Q&A/H158 Q&A_260813_Replied.md` | Already held as `../manufacturer-supplied-2026-08-17/manufacturer-reply-2026-08-17.md` (the 18 blocking questions). |
| `Bluetooth Chip datasheet&protocol/YC8612_Datasheet_V1.0(1)(1).pdf` | Already held at `../manufacturer-supplied-2026-08-12/YC8612_Datasheet_V1.0.pdf`. |
| `SDK&Sourcecode/H158_IOS_Demo.zip` | Committed unpacked as `h158lib-ios-sdk/`, minus `xcuserdata/` and `.DS_Store` (another developer's Xcode window state). |
| `tree.txt` | Their manifest of the above; superseded by this file. |

## 3. Integrity

```
e1e10557b794469afbc5958bbc6114b15e4da0bd18cb287ef314216c0e81f3cf  H158_Test_260814_01_.pkg
bdb0e8b266061cb3330612a40ec0ac3d8a18fad1eadc5eb5bb041967b92c98cb  H158-CMD-Protocol-202608131414.docx
507b80041429413cae64928cd99bd0957b7e425b08ada07099d8a015f3eaa0df  PY32C642_Datasheet_V0.5.pdf
d49569a91e8c1b17b34db014e5f1b4fa6c73f29a89b9beb1d319d91701f04417  YP65-AT-BLE-module-spec-v1.4-release.pdf
e05a2dc4d5d911a5f58b8912913b207de887cfd24ede4ab9ab63d906b6a4964a  YP65-AT-BLE-module-spec-v1.5-EN-release.pdf
13980f6bc2ca8672690445e5be3ef5b51bd34fc509377b20a124359f3fde30c6  h158lib-ios-sdk/h158lib/h158lib/Protocol/BleProtocol.swift
946edcb734c194b18cae84bf659d8bd64260e5df23c3216cd71059f149cd71f1  h158lib-ios-sdk/h158lib/h158libTests/BleProtocolTests.swift
271a2b0f37bfb738d9fd5e81f568c362d2511bf7bb8e7d78d243895eb84cd816  h158lib-ios-sdk/h158lib/h158lib/Config/BleSdkConfig.swift
921d913af6584dc15e706c68f7faff3e0fae013ff69e9245c2fa611579820f87  h158lib-ios-sdk/h158lib/h158lib/Scan/BleScanner.swift
e348a9461952088764c2b44d9ff3d70adab4205cd159f93679fa087ca0455159  h158lib-ios-sdk/h158lib/h158lib/Connection/BleConnectionManager.swift
6c86c2599ba94bedce426a000756bdc46ee8efa90dff649ed5f625c441c8642d  h158lib-ios-sdk/h158lib/h158lib/Model/BleModels.swift
```

Firmware images now held, for telling them apart at the burner:

```
d45020a243d3c4ab370fa11c35f73349201230c560df61f3764d1fa67322134c  ../manufacturer-supplied-2026-08-20/H158_Test_260708_01.pkg   (silent to all commands)
e1e10557b794469afbc5958bbc6114b15e4da0bd18cb287ef314216c0e81f3cf  H158_Test_260814_01_.pkg                                      (untested as of writing)
```

`H158_V0R0_5EDA983B_202607151202` is held as a `.rar` in the 08-20 folder — that is the image that
replies in the undocumented `0x81`/`0x82` framing.

## 4. What this settles

**The frame format, definitively.** [`H158-CMD-Protocol-202608131414.md`](H158-CMD-Protocol-202608131414.md)
§1 states the checksum rule in the manufacturer's own words — XOR from `head` through `data` — and §2
gives the complete command set. Their `BleProtocol.swift` agrees with it line for line.

**The complete command list is three commands.** Lock, unlock, terminal information. The 2026-08-13
reply item 11 deferred "a complete list of the commands the device supports" to this document; the
document's table of contents has only §2.1 and §2.2. There is no firmware-version query and no
separate battery command — battery is byte B3 of terminal information.

**Chip identity — closed.** PY32F002B and PY32C642 are the same die with different package markings.

**Two errors in the 08-21 prose**, both caught by cross-checking against the `.docx` and the Swift:
the device-info TX frame and the Unlock RX checksum. See the transcription's final sections. This is
the third time the artifact has beaten the prose (cf. the 08-17 MANIFEST §4) — **treat their
hand-written tables as drafts, and their shipped code and specs as the contract.**

## 5. Still open

- **Which image ships on production units**, and whether every unit needs a PW200 flash before it
  will talk at all. Asked 08-20 (1.1, 1.3), not answered. Their 08-13 item 6 implies a flash is
  required. This is a client and manufacturing question now, not an engineering one.
- **What `81 00 03 00 00 00` meant.** Only matters if 260814 does not behave as documented.
- 🔴 **OQ-17 — the advertised device name.** The manufacturer has answered this **both ways**
  (08-12 item 1: the name carries the MAC and distinguishes devices; 08-13 item 4: all devices share
  one name). Their iOS SDK does not settle it. **Decidable on the bench by scanning two units** —
  settle it by testing, as with the blue-wire item, not by asking a third time.
- 🔴 Nothing here moves **OQ-4**, **OQ-12** or **OQ-16**. The device still has no authentication and
  no dead-man timer; 08-13 items 3, 13 and 16 reconfirm all three. This delivery makes the transport
  workable. It does not make the device safe by the spec's authority model.
