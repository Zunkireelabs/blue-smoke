# Manufacturer-supplied documents — received 2026-08-17 (Day 18)

Companion to [`../manufacturer-supplied-2026-08-12/MANIFEST.md`](../manufacturer-supplied-2026-08-12/MANIFEST.md),
same convention: this file records what arrived and its provenance. Read
[`../hqd-device-architecture.md`](../hqd-device-architecture.md) and
[`../../TECHNICAL_SPEC.md`](../../TECHNICAL_SPEC.md) §13 for what it means for the build.

---

## 1. What arrived

Two things, both pasted/dropped directly into a Claude Code conversation by the user — same capture
method as 2026-08-12, so again no original email in this repo:

1. **Written answers to all 18 blocking BLE questions** sent 2026-08-12/13 — `manufacturer-reply-2026-08-17.md` (English text, de-duplicated from the sender's bilingual formatting, otherwise unedited).
2. **The `itronlib` Android SDK + demo app**, promised "this Friday" in the 2026-08-12 reply (item 3) and now delivered, four days late but delivered. Received as a directory tree, `H158_ProjectFile-V1.2-202608131949/H158/`, containing:
   - `itronlib/` — an Android library module: BLE scan, connect/reconnect, the frame codec, and the actual command bytes for lock/unlock/read-status. **This is the primary source for this manifest** — it is working, tested Kotlin, not a document to interpret.
   - `app/` — a minimal demo Activity exercising the library, plus a **prebuilt debug APK**.
   - `docs/ble-manual-test.md` — their own manual test script, confirming the UUIDs "on real hardware."

## 2. What was committed here, and what was not

Source and docs only — **397 KB**, filed under `H158-itronlib-sdk/`, mirroring the directory
structure of the original delivery minus build output:

| Excluded | Why |
|---|---|
| `build/`, `.gradle/`, `.kotlin/`, `.idea/` | Gradle build cache and IDE state — regenerable, ~63.5 MB, no informational content. |
| `local.properties` | Leaked the sender's own machine path (`sdk.dir=/Users/xiangwu/…`). Not needed to read the source. |
| `app-debug.apk` / `H158 Demo.apk` | Binary. Hash recorded below; **not committed** — a prebuilt APK belongs in a release artifact store, not source control. |
| `.DS_Store` | Noise. |

Full source-file hash list: see `H158-itronlib-sdk/` — every `.kt`, `.kts`, `.xml`, `.toml`, `.md`
file was hashed at copy time; spot-check with `sha256sum` against the table below for the files that
matter to our implementation.

```
e115d2d5d7fb48fa2f6684e66ed8e063ec81d80a303a71869d5bfd423528761e  itronlib/src/main/java/com/itorn/hqd/itronlib/protocol/BleProtocol.kt
cdb49d72989ca3d44e8f1d76483820dde44810d2d9fbec92fa97644f52193b00  itronlib/src/test/java/com/itorn/hqd/itronlib/protocol/BleProtocolTest.kt
499294f30db2ccf6872fa9732d27bb276b5d05bb166fe73947df117226620719  itronlib/src/main/java/com/itorn/hqd/itronlib/config/BleSdkConfig.kt
01b211872e4e24f3fb69e3f6e388f3a4cdfad43d8e929989dd88fb9bc10f270a  itronlib/src/main/java/com/itorn/hqd/itronlib/connection/BleConnectionManager.kt
3c9393b86320413911eda36d7c8ae5e38cfd61e8acf221596039525f3728ce00  itronlib/src/main/java/com/itorn/hqd/itronlib/scan/BleScanner.kt
f9f9e6206f1d441d192101acac33ea8dc46986a151aadb6fb90d68b0058e64d1  itronlib/src/main/java/com/itorn/hqd/itronlib/model/BleModels.kt
aa55ed9d22270d6cd88c13bdbb4de64e7ba0077cf2c32802aa04884cb25a3545  itronlib/src/main/java/com/itorn/hqd/itronlib/protocol/HexCodec.kt
06e7a4b20de786f67d7b8b18dbf83625e9727ba376b6149445e6246bbea8542b  docs/ble-manual-test.md
```

APK (not committed, recorded for reference only):
```
473bd8068deec6a7c68bd1818690e217c82ff62e47d5d019041d6a29b4b99fa7  app/build/outputs/apk/debug/H158 Demo.apk
```

## 3. Resolves OQ-13

`BleSdkConfig.kt:17-21` states the UUIDs are "YP65-AT real UUID (LightBlue-verified)": service
`0000FFF0`, both write and notify on `0000FFF1`. This matches the written reply (item 1, item 5) and
the 2026-08-12 `YP65-AT-BLE-module-spec-v1.3-release.pdf`. Between the module spec (which characteristic
exists) and this SDK (which characteristic HQD's firmware actually uses), OQ-13 is now fully closed —
see `hqd-device-architecture.md` for the consequence write-up and the ground-truth protocol table.

## 4. What the SDK settles that the written reply left ambiguous

The written reply (item 10) asked us to confirm our checksum reading and we did so incorrectly —
we read the checksum as XOR over the payload only. `BleProtocol.kt:57` and its own test
(`BleProtocolTest.kt:41`) show it is XOR from the frame header: `HEAD ^ LEN ^ CMD ^ DATA…`. Verified
against their own worked examples: `02 01 A2 A1 01` (`02^01^A2 = A1` ✓) and `02 02 A1 78 D9 01`
(`02^02^A1^78 = D9` ✓).

The written reply (item 2) gave both status values (`30`/`31`) without saying which is which.
`BleProtocol.kt:38-39` gives the mapping: `0x31` = locked, `0x30` = unlocked.

Also newly visible only in the SDK, not in any written answer: reply frames carry an **ACK byte**
(`BleProtocol.kt:80-86`) that no written answer mentioned, and the demo's `BleConnectionManager.kt:346-356`
routes a `0xA1` reply carrying 3+ data bytes into the *status* parser rather than treating it as
malformed — an undocumented but real behaviour worth replicating.

## 5. Still open

The written reply and the SDK are silent on the YC1012 vs. YP65-AT relationship — whether YP65-AT is
a module built around the YC1012 silicon, or the two are unrelated parts that happen to share package
specs. Neither this reply nor the 2026-08-12 documents state it outright. Not blocking (OQ-13's actual
blocker — the service/characteristic UUIDs — is answered either way), but worth a follow-up question.

The manufacturer also did not confirm whether `AC-H158-V1.01` (our bench board) is the main board or
a charge/protection board — see `hqd-device-architecture.md` for the bring-up plan that settles this
on the bench rather than by asking again.
