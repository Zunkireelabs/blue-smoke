# Session log — Anish

Newest first. Conventions in [`README.md`](README.md).

## 2026-08-09 — the client's device is a two-chip design, and §4's GATT layout probably can't run on it

**Branches:** `feature/ble-connectivity` (claim pushed Day 10, cut from `stage` @ `27d5291`)
**Landed:** nothing executable — `P1-3.0` and `P1-7.0` are blocked, see below.

> ⚠️ **Corrected later the same day — read this before the entry below.** Two claims above and in
> the next paragraph did not survive the day:
>
> **(1) "Landed: nothing executable" is wrong.** Most of both tasks landed against the mock: scan,
> dedupe, discovery ordering, scan timeout, staleness, adapter-state handling, Android runtime
> permissions, the pairing screen, and reconnect with re-handshake. What OQ-13 blocks is
> `BLE_SERVICE_UUID` plus the wire-level half of the §4.5 handshake — see
> [`../hardware/hqd-device-architecture.md`](../hardware/hqd-device-architecture.md) §8, which is
> authoritative on where that line falls. The overstated version of this claim stalled an execution
> attempt that read it and stopped without writing code; this was the fourth place it survived.
>
> **(2) "The GATT profile is the BLE module vendor's, not the client's" was an inference stated as
> fact.** The YC1012 datasheet says `QFN2*2_12L` — a bare 2×2 mm SoC with 8 KB OTP and a debug port,
> **not a pre-programmed module.** Its firmware was written by someone; whether that is the silicon
> vendor or the client's own contractor is now question 1 of the client message rather than a
> settled answer, and it decides whether the document blocking us is a third party's to release or
> the client's to hand over. Recorded in `hqd-device-architecture.md` §4.1–4.2, spec v1.14.
>
> **Method note for next time:** I read the schematic carefully and the datasheet only for the
> features I expected to find in it. The package line was on page 4 and would have taken a minute.
> **When a conclusion turns on what a part *is*, read the part's own datasheet first.**

**Decided, and why:** the client sent their PCBA archive so our app can talk to *their* device, which
settles a question we'd been leaving open: **we build to their hardware, they do not implement our
§4.** Reading the schematic is what mattered — two chips (PY32C642F app MCU + YC1012 BLE module) on a
UART with an AT-command line, so **the GATT profile is the BLE module vendor's, not the client's.**
Their `0x01`/`0x02` are application bytes over a serial pipe, not characteristics. Recommendation
recorded in [`../hardware/hqd-device-architecture.md`](../hardware/hqd-device-architecture.md):
**keep §4's security design, move it from characteristics into payload bytes over that pipe** —
costs the client firmware work, costs the module vendor nothing, which is the difference between a
request and a supply-chain negotiation. Registered as **OQ-13** / **OQ-14**; **§4 itself deliberately
left unchanged** until the client answers, because a transport redesign on our inference alone
shouldn't go into the build contract.

**Tried and abandoned:** hoping the protocol document was a GATT spec. It's an Android SDK usage
guide for a library (`itronlib`) that isn't in the archive — no UUIDs, no byte layouts, no result
codes. Two commands total, and the one the overview claims does lock/unlock isn't documented.

**Blocked / needs someone else:** `P1-3.0` needs the **YC1012 AT-command / profile manual** for the
real service UUID. One ask, and everything else follows from it. Client message drafted at
[`../hardware/client-questions-2026-08-09.md`](../hardware/client-questions-2026-08-09.md) —
**not sent.**

**Gotcha worth stealing:** three checks that each changed a conclusion. **(1)** The first archive the
client sent was **truncated** (83.3 MB vs 85.6 MB) and Explorer's error was generic — check archive
sizes against each other before trusting anything you extracted. **(2)** My first PDF extractor was
lossy and I wrote down that the MCU lacked LPTIM/IWDG/RTC; it has all three. **If a datasheet
appears to be missing a standard peripheral, suspect your extractor before the silicon** — `pypdf`
was reliable where the crude reader wasn't. **(3)** The datasheet supplied is for the **PY32F030**;
the schematic says **PY32C642F**. Searched all 62 pages for `C642` — absent. Wrong document, and it
would have been easy to read the family name and move on.

**Also:** `tools/lint-guard/__tests__/verificationGuard.test.ts` is **red on `stage`** — all 7 tests
fail with `Cannot read properties of undefined (reading 'errorCount')`, an ESLint API shape
mismatch. That guard enforces inviolable rule 1 in the verification subtree and is currently doing
nothing. Not my area, not touched — **it needs an owner.**

## 2026-08-12 — BLE connection questions sent direct to the manufacturer; the bench board is the wrong board

**Branches:** `feature/ble-connectivity` (9 commits ahead of its remote, **not pushed**)

**Sent:** `docs/hardware/manufacturer-questions-ble-connection-2026-08-12.md`, over **Teams, direct
to the manufacturer** — the first time we have gone direct rather than via the client. 18 questions,
ordered by the sequence the app hits them. Follow-through checklist is in that file.

**Decided, and why:**

- **Excluded the per-device key and auto-lock timer from the manufacturer message.** Both await a
  client-side product decision (`client-messages/architecture-escalation-2026-08-12.md`). Asking the
  factory to act before that decision exists would get an answer we then have to unpick.
- **Asked for the device's exact advertised name as a first-class question.** It reads like trivia
  and isn't: the module advertises **no service UUID**, so the scanner can only filter on name, and
  all we have is the manufacturer's *"typically `YP65-AT`"* over a value `AT+NAME=` can change. A
  wrong name gives an empty scan indistinguishable from a device that is off — the same silent
  failure as a guessed `serial_hash` salt. I had originally left this out and it was caught in
  review.
- **Offered the command frame structure as a worked hypothesis** (header `02`, length, payload, XOR,
  tail `01`) rather than asking "what is the format?" — a correction returns faster and more exactly
  than an open question. XOR verified against all three supplied frames.

**Gotcha worth stealing:** 🔴 **`pdftotext` silently drops CJK text.** The first pass over
`YP65-AT-BLE-module-spec-v1.3-release.pdf` took the GATT table and stopped, because the Chinese body
text extracted as nothing and the hardware sections *looked* empty. They were not. The second pass
found the module pinout, the AT command set, a writable MAC (`AT+ADDR=`) and a real-time clock — two
of which change open questions we were actively escalating. **If a supplied document looks
suspiciously thin, suspect the extractor before the document.** Same lesson as Day 10's `pypdf`
finding, now twice.

**Blocked / needs someone else:**

- 🔴 **The board we hold is almost certainly not the Bluetooth board.** `AC-H158-V1.01`, pads
  `B+`/`B−`/`T`, off-board microphone, **no crystal and no antenna** — a charge/protection board.
  Nothing can be brought up until a board with the PY32C642F and the BT chip arrives. Requested.
- 🔴 **`architecture-escalation-2026-08-12.md` is still unsent.** It is the time-sensitive one and it
  needs a product decision, not engineering.
- **This branch is not pushed.** 9 commits of hardware findings invisible to Sadin and Hardik.

---

Copy the template below, put your entry above this line, and delete any field
that doesn't apply.

```markdown
## YYYY-MM-DD — one-line summary

**Branches:** feature/P1-4.0-bonding-flow
**Landed:** PR #12 into stage, CI green
**Decided, and why:** ...
**Tried and abandoned:** ...
**Blocked / needs someone else:** ...
**Gotcha worth stealing:** ...
```
