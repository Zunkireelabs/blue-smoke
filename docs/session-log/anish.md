# Session log — Anish

Newest first. Conventions in [`README.md`](README.md).

## 2026-08-09 — the client's device is a two-chip design, and §4's GATT layout probably can't run on it

**Branches:** `feature/ble-connectivity` (claim pushed Day 10, cut from `stage` @ `27d5291`)
**Landed:** nothing executable — `P1-3.0` and `P1-7.0` are blocked, see below.

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
