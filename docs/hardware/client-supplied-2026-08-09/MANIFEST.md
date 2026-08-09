# Client-supplied hardware documents — received 2026-08-09 (Day 10)

Verbatim copies of what the client sent. **Nothing in this folder has been edited.** Filenames were
transliterated only where the original used full-width parentheses (`U+FF08` / `U+FF09`), which are
awkward on Windows checkouts; the bytes are unchanged and the SHA-256s below prove it.

Read [`../hqd-device-architecture.md`](../hqd-device-architecture.md) for what these documents mean
for our build. This file only records what arrived.

---

## 1. Provenance

Three archives were received, two of which are duplicates and one of which is damaged:

| Archive | Size (bytes) | Status |
|---|---:|---|
| `BLE.zip` | 85,558,444 | ✅ Complete. `sha256:b7838f1f6285…` — **the copy of record.** |
| `PCBA-Related Documents for the HQD PLUS PMTA New Device 260710 (1).zip` | 85,558,444 | ✅ Byte-identical to `BLE.zip`. |
| `PCBA-Related Documents for the HQD PLUS PMTA New Device 260710.zip` | 83,282,769 | 🔴 **Truncated — do not use.** Windows Explorer and .NET both refuse it; 7-Zip opens it with errors. |

The truncated archive is the one that arrived first. If anyone else on the team is working from a
copy of that name, check the size before trusting anything they extracted from it.

## 2. What was in the archive

Eleven files across six folders. Only the four documents below are committed here — the rest are
either binaries we must not run or client IP with no readable content.

| Item | Committed? | Why |
|---|---|---|
| `API/HQD_BLE_Protocol_Commands_Android_EN.md` | ✅ | The protocol document. 3,772 B. |
| `（PCB schematic）H040BLE-SCH-V1.02.pdf` | ✅ | The schematic. **The most informative file in the archive** — see the write-up. |
| `Datasheet/（BT chip spec）3.YC1012_JD_Datasheet_V1.0(1).pdf` | ✅ | BLE module datasheet. |
| `Datasheet/（MCU spec）PY32F030 datasheet Rev.1.4_EN.pdf` | ✅ | MCU datasheet — **but for the wrong part**, see write-up §5. |
| `Programming Software Guide/…/H158_Test_260708_01.pkg` + `.rar` | ❌ | Encrypted firmware image, 20,399 B. 0 printable strings, all 256 byte values present. Nothing to read; it is the client's IP and belongs in their burner flow, not our git history. |
| PowerWriter installer (~81 MB) | ❌ 🔴 | **Do not run.** It is the firmware burner. Burning may consume a licence credit — see the safety section in [`client-supplied-hardware.md`](../client-supplied-hardware.md) *(currently on the unmerged `docs/hardware-record-client-supplied` branch)*. |
| `PW200` PowerPoint guide | ❌ | Usage guide for the burner. Same reason. |

## 3. Integrity

```
5f427af79847ef26997027b1a3c087f01271b55acd276f9e6097520dca3f3850  H040BLE-SCH-V1.02.pdf
01721db030ace4da11ca4525a61b0bfc847f5bed4924f1f73f22b5a4d1c26766  HQD_BLE_Protocol_Commands_Android_EN.md
82a30e7445caa063a8cd42e70028893818525c9a7153fe27cf21ff2dafc8408d  PY32F030_datasheet_Rev1.4_EN.pdf
596a218d2977f5e73d4ea558037febaddca650274a719df3ca40529c0a58a9f4  YC1012_JD_Datasheet_V1.0.pdf
```

## 4. Document identity, as printed on the documents themselves

| Field | Value |
|---|---|
| Schematic doc # | `H040-BT-SCH` |
| Schematic title block | `HQD-H040BT-MAIN-V1.02-260702`, HQD TECH, dated **2026-07-02** |
| Schematic sheets | Title block says **"Sheet 1 of 2"**. The PDF is **1 page — sheet 2 was not supplied.** |
| Protocol doc version | `v1.0.0`, last updated 2026-06-09, marked *"Status: Ongoing Update"* |
| Protocol doc author | A header comment left in by the editor names an `@itron.com.cn` address and a local path under `…/2026workProject/Claude_demo/HQD BLE/`. Recorded because it tells us the SDK vendor is **itron**, which is who the missing library comes from. |
