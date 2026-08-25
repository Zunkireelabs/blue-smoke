# Manufacturer-supplied firmware and programming guide — archived 2026-08-20 (Day 21)

**Backfilled 2026-08-23.** This folder was created during the 2026-08-20 bench session without a
MANIFEST — the only archive directory under `docs/hardware/` that lacked one. Written now from the
session log and the files themselves.

Same convention as the sibling folders. Read
[`../hqd-device-architecture.md`](../hqd-device-architecture.md) for what this means for the build.

---

## 1. Provenance — these files are not new

**Nothing here arrived on 2026-08-20.** All of it came inside `BLE.zip`, supplied **2026-08-09** and
recorded in [`../client-supplied-2026-08-09/MANIFEST.md`](../client-supplied-2026-08-09/MANIFEST.md),
where the firmware images and the PW200 material were deliberately **excluded** from the repo — the
`.pkg` as opaque client IP, the burner installer and its guide as things not to run.

That call was reasonable at the time and wrong in hindsight. The PowerPoint that was left out,
`Instructions for using the PW200 update program.pptx`, contained the procedure that unblocked the
device — and it sat unopened for **eleven days**. This folder exists because the 08-20 session copied
the load-bearing pieces out of the gitignored `temp-ss/` so they would survive independently of one
machine's `Downloads` folder.

The lesson is recorded in the 2026-08-20 session log and restated in the 08-23 MANIFEST:
**grep every manufacturer-supplied archive for anything not yet listed as read somewhere.**

## 2. What is here

| File | Size | Why |
|---|---:|---|
| `H158_Test_260708_01.pkg` | 20,399 | Built 2026-07-08. Flashed successfully; **device stays silent to every command**, same as the as-shipped image. |
| `H158_V0R0_5EDA983B_202607151202.rar` | 24,466 | Wrapper around a 26,922 B `.pkg` built 2026-07-15. Flashed successfully; **device replies for the first time in this project** — but in an undocumented `0x81`/`0x82` framing that the manufacturer's own demo app rejects with `Invalid frame head: 0x81`. Kept in its original `.rar` as delivered. |
| `pw200-instructions-transcript.md` | 2,733 | Text transcript of the PW200 PowerPoint, which is not committed (~3 MB binary, and it is a burner guide). The procedure works exactly as written. |

## 3. Integrity

```
d45020a243d3c4ab370fa11c35f73349201230c560df61f3764d1fa67322134c  H158_Test_260708_01.pkg
e6b55f8cafe9d805097fc617c17be6ee632da0aa24f2df62598ee9b8227adcd0  H158_V0R0_5EDA983B_202607151202.rar
2a92f985289a7f924291691e778f5d98d3127c5f3cc634e3c837e90cf5b98674  pw200-instructions-transcript.md
```

## 4. Bench notes that are not in the PowerPoint

Both cost a full session on 2026-08-17/18 before being found on 08-20. They are the difference
between the burner working and reporting `[0009] The target chip is not connected`:

- 🔴 **The USB-C programming adapter only works in one orientation.** The wrong way round is
  indistinguishable from a dead target. Try flipping it *first*, before suspecting anything else.
- 🔴 **The board's battery must stay connected during programming.** This is contrary to what the
  project's `VREF = 3.3 V` setting implies. USB power alone is not enough to keep the system running
  (confirmed independently by the manufacturer's 2026-08-13 reply, item 17).

Ruled out, in order, before the real cause was found — recorded so the same ground is not re-walked:
wrong MCU selected in PowerWriter; VREF; clock speed; and a "chip sleeps and drops SWD" theory,
refuted with seven ID attempts while keeping the device awake throughout.

## 5. Superseded

**Neither image here is the one to use.** On 2026-08-23 the manufacturer directed us to
`H158_Test_260814_01_.pkg`, archived at
[`../manufacturer-supplied-2026-08-23/`](../manufacturer-supplied-2026-08-23/), and explained the
`0x81` framing as an **older** protocol rather than a newer one. These two images are retained as
evidence — they are what the `0x81` findings were measured on, and the hashes above are how to tell
the three images apart at the burner.
