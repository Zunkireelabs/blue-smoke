# Session log — Anish

Newest first. Conventions in [`README.md`](README.md).

## 2026-08-23 (later the same day) — H158 firmware verified on real hardware, UI handoff written up

**Branches:** `feature/ble-connectivity`

**Landed:** `docs/hardware/manufacturer-qa-consolidated.md` (Round 3 bench confirmation),
`docs/hardware/hqd-device-architecture.md` §13 (hardware confirmation + UI handoff),
`manufacturer-questions-firmware-2026-08-20.md` (verified banner), `CLAUDE.md` Current state. No code
changes this entry — this was the bench session the earlier entry today said hadn't happened yet.

### The bench session

Flashed `H158_Test_260814_01_.pkg` via PW200. Two things worth writing down that aren't in the
manufacturer's deck, reconfirmed from 08-20: the USB-C adapter only seats correctly one way round,
and the battery has to stay connected through programming. Neither bit us this time — both were
already known.

Tested against the manufacturer's own `com.itorn.hqd.ble` demo app, not our code — deliberate, per
§11.4's bring-up order, so a result can't be blamed on our implementation before the firmware itself
is trusted. All three documented commands, captured straight from the phone:

```
TX 02 01 A2 A1 01        (Read Status)
RX 02 05 A2 00 30 00 64 F1 01

TX 02 02 A1 78 D9 01     (Lock)
RX 02 03 A1 00 78 D8 01

TX 02 02 A1 87 26 01     (Unlock)
RX 02 03 A1 00 87 27 01
```

Checked every checksum by hand rather than trusting the app's summary line — all three correct:
`F1`, `D8`, `27`. Status decode checks out too: `30 00 64` → unlocked, power-on, 100%, matching what
the app displayed.

**Head `0x02`, tail `0x01`, on every reply.** The `0x81`/`0x82` framing that blocked this project for
three days is gone on this firmware. Three independent sources — the protocol document, the Android
SDK, the iOS SDK — now agree with a fourth: the real device.

### The Unlock checksum dispute is settled, in our favour

Flagged this the moment the 08-21 reply arrived, before any device was on the bench: their written
table gave the Unlock reply checksum as `0x26`, which looked copy-pasted from the request row above
it, and XOR-from-header gives `0x27`. Real hardware just returned `0x27`. Worth restating the general
lesson this confirms a fourth time: **derive from their code, don't transcribe their prose.**

### What's still open

- Only one flash, one session. The 08-20 standard — two independent flashes before fully trusting a
  result — hasn't been repeated. Given how cleanly every checksum landed, I'd call this a
  nice-to-have for the written record rather than a doubt about the result, but it's not done.
- **Not yet tested against our own app.** Everything above used the manufacturer's demo app on
  purpose. Running `H158BringUpScreen` against this same device is the next physical step, and
  nobody's done it yet.
- OQ-17 picked up one data point, not a resolution: the demo app showed `YP65-AT  13:7F:AC:00:00:0C`
  — Android's native MAC read next to the name. That's not proof of what the advertised *name string*
  itself contains, which is what actually decides OQ-17 and is why iOS can't see it. Still open.

### Handoff for whoever wires this into product UI

The user asked directly for this to be written up so Sadin and others can pick up UI integration
without re-deriving what's already known. Put it in `hqd-device-architecture.md` §13.2/§13.3 rather
than only here, since that's the file that already carries "the full technical analysis and
consequences" per its own description in the consolidated Q&A doc.

Short version of what's there: `h158Protocol.ts` and `h158Session.ts` are stable, tested, and now
hardware-confirmed — reuse them, don't re-derive them. `H158BringUpScreen.tsx` is a working
reference for the scan/connect/command pattern, but it's a dev spike, not something to extend into
production. **No production pairing screen exists for H158** — `PairDeviceScreen.tsx` is built for
the unrelated §4 GATT transport. `src/features/lock/` is empty, one `.gitkeep`. And the one thing
that must not get silently designed around: **the device has no authentication and no dead-man
timer**, so whatever "pairing" means for it, it isn't a cryptographic bond — that's a product decision
for the client, not a default to pick while wiring up a screen. Full reasoning and citations in
§13.3, not repeated here.

### Shared files touched

`CLAUDE.md`, `docs/**`. Not `protocol.ts`, `auth.ts`, `crypto.ts`, `scanner.ts`, `navigation.tsx`,
or the mock. Mention the `CLAUDE.md` edit in the PR body per the announce rule.

---

## 2026-08-23 — the manufacturer's protocol document arrives, three days late and inside an archive nobody opened

**Branches:** `feature/ble-connectivity`

**Landed:** `docs/hardware/manufacturer-supplied-2026-08-23/` (firmware, protocol doc + transcription,
iOS SDK, correct MCU datasheet, two module specs, MANIFEST), `manufacturer-supplied-2026-08-20/MANIFEST.md`
(backfilled — it was the only archive folder without one), `manufacturer-qa-consolidated.md` (Round 3),
`manufacturer-questions-firmware-2026-08-20.md` (marked replied), `hqd-device-architecture.md` §12,
`TECHNICAL_SPEC.md` §13 (OQ-14 closed, OQ-17 contradiction registered), `CLAUDE.md` Current state,
`client-supplied-2026-08-09/MANIFEST.md` (two superseded rows). Code:
`src/features/ble/h158/h158Protocol.ts` + tests — ACK error codes.

### The one thing to take away

**The reply was in the `.rar`, not in the message.** Their answer was "use `H158_Test_260814_01_.pkg`
uniformly", and I concluded — and said out loud — that they had forgotten to attach it. They hadn't.
Only the inner `H158_IOS_Demo.zip` had been extracted locally, so a search over the extracted folder
showed no `.pkg` and no protocol document. Listing the `.rar` itself showed both, plus the iOS SDK,
plus the correct MCU datasheet, plus two module specs we didn't have.

**This is the second time in two weeks.** `BLE.zip` sat unopened for eleven days holding the PW200
procedure that unblocked the device. Same failure, same cost. The rule is now written into
`CLAUDE.md` and both MANIFESTs: **extract every manufacturer archive in full and diff its file list
before concluding anything is missing.**

### What the protocol document settles

`H158—CMD Protocol-202608131414.docx` has been cited as the authority in three separate replies
(08-13 items 2 and 11, 08-21) and had never been sent until now. It is short, and it confirms
everything §11 reverse-engineered from the Android SDK on 08-17 — frame layout, `LEN` semantics,
lock/unlock/terminal-info, the status byte meanings — including the checksum-span correction, now
stated in their own words: "从 head 字段 到 data 字段，所有的数据异或的结果".

The genuinely new fact is **negative and useful: those three are the entire command set.** The table
of contents has only §2.1 and §2.2. No version query, no battery command, and — relevant to OQ-16 —
no authentication or pairing command anywhere. It is now *documented*, not merely observed, that
there is no command surface on which auth could be added without new firmware.

### The artifact beat the prose again — third time

Their 08-21 Q&A prose contradicts their own protocol document in two places, and is wrong in both:

- Device-info TX given as `02 02 A1 A1 01` (CMD `0xA1`, length `0x02`). The document's §2.2 says CMD
  `0xA2` with no data byte, and `BleProtocolTests.swift:154-162` asserts exactly that. **`02 01 A2 A1
  01` — what we already send — is correct.**
- Unlock reply checksum given as `0x26`, copy-pasted from the request row. XOR gives **`0x27`**.

I derived both of these from the checksum rule before finding the document, then confirmed them
against it and against their Swift. Worth saying because the derivation is cheap: **XOR-check every
frame in any table they send.** Two of six examples in that file are wrong.

### Code: ACK error codes

`h158Protocol.ts` already implemented the framing correctly (08-17 work — the new document required
no change to it, which is the strongest evidence that pass was right). The real gap was ACK handling:
every non-zero ACK collapsed into one `expected 0x00` string, which is precisely the catch-all
CLAUDE.md forbids. The codes were sitting in the 08-13 reply item 12 all along — `0x01` data error,
`0x02` data length error, `0xF1` unknown command.

Added `H158Ack` + `h158AckLabel`, and failures now carry the `ack` byte so callers can branch. The
asymmetry that made this worth doing properly: **a malformed frame gets no reply at all**, so a
non-zero ACK always means the frame was structurally valid and its *content* was rejected — our bug,
never line noise, and never retry-unchanged. A silent timeout stays ambiguous between malformed,
asleep, and out of range. 57 tests in the h158 suite, up from 44.

### 🔴 Not verified — do not read the above as "it works"

**`H158_Test_260814_01_.pkg` has not been flashed.** I had no device on the bench today. Everything
above is three sources agreeing on what the device *should* send. The bench matrix is written up in
`manufacturer-qa-consolidated.md` Round 3 — Read Status, Lock, Unlock, their demo app, both
advertising windows, bad checksum, and the three error ACKs. **Run it across two independent
flashes**, same standard as 08-20, which is what caught the two false findings that session.

If 260814 does *not* produce the documented framing, stop — that is another manufacturer round, not
something to code around.

### OQ-17 got worse

The manufacturer has now answered the device-name question **both ways**: 08-12 item 1 says the name
is `YP65-AT` with the MAC appended "to distinguish between devices"; 08-13 item 4 says "all devices
share the same Bluetooth name". Both cannot be true, and it decides whether pillar 1 has any
radio-visible device identity to key on.

Their iOS SDK can't arbitrate — it prefix-matches then keys on CoreBluetooth's per-install identifier,
which works either way. **Scan two units and read the names.** Registered in spec §13 and inline on
`H158_DEVICE_NAME_PREFIX`. Do not ask a fourth time.

### Closed today

- **OQ-14 (iOS)** — open since Day 11, circular answer since Day 12. The iOS SDK arrived: `h158lib`,
  Swift, 20 unit tests. It also resolves the objection that made the Android SDK unportable — the
  vendor themselves key on CoreBluetooth's identifier and filter by name, not MAC, so the
  direct-CoreBluetooth approach no longer needs separate agreement.
- **Chip identity** — PY32F002B and PY32C642 are the same die, different package marking. Correct
  datasheet archived; the `PY32F030` one in `client-supplied-2026-08-09/` is marked superseded.

### Still open, still theirs

Two questions went unanswered: what `81 00 03 00 00 00` actually meant, and whether production units
ship needing a PW200 flash before they respond at all. **The second is not an engineering question
any more** — if units need a bench flash before they talk to a phone, that belongs to the client and
the factory. It has been asked twice. It should go to the client next, not to the manufacturer.

### Also noticed, not fixed

- `CLAUDE.md`'s numbers were stale: lint baseline says 70, actual is **89** on a clean checkout;
  tests say 273/30, actual is **449/39**. Corrected in the block, and I verified my own changes add
  **zero** warnings (stash, lint, unstash, lint — 89 both ways). The rule itself hasn't changed.
- The **7 Windows-only `verificationGuard.test.ts` failures** are still red and still unowned.
  Diagnosed in `docs/execution-briefs/P0-5.0-ci-hardening.md` — `npx` resolves to `npx.cmd` and
  `execFileSync` can't spawn it without `shell: true`. Worse than a red test: the same `catch` masks
  a spawn failure as "ESLint found nothing", so the inviolable-rule-1 guard **passes vacuously on
  every platform**. That deserves an owner more than it deserves another mention here.
- The **scanner staleness bug** from 08-20 is still unfixed, deliberately out of scope for this
  branch — `scanner.ts` is a contested shared file and needs a heads-up to Sadin and Hardik first.
  Still worth remembering that it is what manufactured the "-83 dBm" and "17-20s disconnect" false
  findings.

### Shared files touched

`CLAUDE.md`, `docs/**`, and `src/features/ble/h158/**` (not shared). **Not** `protocol.ts`, `auth.ts`,
`crypto.ts`, `scanner.ts`, `navigation.tsx` or the mock — all untouched. Mention the `CLAUDE.md` and
docs edits in the PR body per the announce rule.

---

## 2026-08-20 — connection intermittency solved, PW200 flash pipeline solved, firmware genuinely replies now — but not in the documented protocol

**Branches:** `feature/ble-connectivity`

**Landed:** revert of a temp auth-stack bypass in `navigation.tsx` (was never committed, so no code
diff lands from this session at all — see "Tried and abandoned"). Docs:
`docs/hardware/manufacturer-qa-consolidated.md` (two 08-17/18 findings corrected, new 08-20 section),
`docs/hardware/manufacturer-questions-firmware-2026-08-20.md` (drafted, **not yet sent**),
`docs/hardware/manufacturer-supplied-2026-08-20/` (the two firmware `.pkg` files + a text transcript
of the PW200 instructions deck, archived because `temp-ss/` is gitignored and these are small enough
to keep durably).

This was entirely a hands-on hardware/bench session plus documentation — no app code shipped. If
you're picking this up, **read this whole entry before touching hardware** — several hours went into
finding things that are now cheap to know in advance.

### Where this leaves the BLE picture

**Solved — connection.** The H158 only advertises for a few seconds after its physical button is
pressed, then goes silent. Woken immediately before connecting: 6/6 successful connects in 0.3-0.7s.
Left asleep: 3/3 timeouts (`HCI_ERR_HOST_TIMEOUT`, ~30s). This explains everything that looked like
BLE flakiness in earlier sessions.

**Real dev-only bug found, not fixed:** `H158BringUpScreen`'s scanner keeps offering Connect on a
device that has stopped advertising. `scanner.ts`'s `DEVICE_STALE_AFTER_MS` filter is only applied
when a fresh advertisement triggers a re-render — nothing re-evaluates it on a timer — so a sleeping
device's last-seen row sits on screen indefinitely with an apparently-live Connect button. Whoever
picks up `P0-2.5`/scanner work next should know this; it isn't specific to the bring-up screen, it's
in `scanner.ts` itself.

**Two 08-17/18 findings retested and refuted** (details + evidence in
`manufacturer-qa-consolidated.md`'s new 08-20 section, not repeating the numbers here):
- The "~17-20s unsolicited force-disconnect" — doesn't reproduce; was a connection racing a device
  that was already asleep.
- The "-83/-84 dBm weak signal" — was a stale cached RSSI, never re-emitted. Live is -57 to -61 dBm.

**Solved — PW200 chip-ID read** (`[0009] The target chip is not connected`, blocking since Day 17/18).
Root cause: the yellow USB-C programming adapter only works in one orientation. Wrong way is
indistinguishable from a dead target — cost most of the day. Confirmed by elimination after ruling
out (in order): wrong MCU selected in PowerWriter, VREF (3.3V vs External), clock speed (10MHz vs
1MHz), a "the MCU sleeps and drops SWD" theory (refuted — 7 ID attempts with the device kept awake
throughout the whole procedure, all still `[0009]`), and PW200-to-PC USB flakiness (real, incidental,
fixed independently by reseating/going direct to the laptop rather than a hub).

**Second real factor, and this one contradicts what 08-17/18 assumed:** the board needs its
**battery connected** during PW200 programming, not disconnected. The manufacturer's project sets
`I/O VREF = 3.3V` (PW200 supplies the target rail), which reads like "pull the battery to avoid
contention" — that's what I told Anish's stand-in (me) to do, and it produced a red `NG`. Battery on
+ correct adapter orientation is what actually works. Recorded wrong in this session initially;
corrected once it was tested.

**🔴 New, unresolved: three firmware images, three behaviours, none matches the documented
protocol.** Full table and byte-level evidence in `manufacturer-qa-consolidated.md`. Short version:
the originally-shipped firmware and `H158_Test_260708_01.pkg` both stay silent to every command.
`H158_V0R0_5EDA983B_202607151202.pkg` replies (`TX 02 01 A2 A1 01` → `RX 81 00 03 00 00 00`, ~35-75ms,
reproduced across two independent flashes) but not in the `02...01` framing the manufacturer's spec
and their own demo app expect — their app throws `Failed to parse BLE frame: Invalid frame head:
0x81`. The reply is also byte-identical regardless of whether Lock, Unlock, or Read Status was sent,
which reads like a NAK/ack frame rather than a real payload. **This is now a manufacturer question,
not an implementation task** — draft above, not yet sent.

**🔴 Also unresolved: chip identity discrepancy.** We identified the MCU as `PY32C642F15` from
package markings back on Day 17/18. Both of the manufacturer's own `.pkg` project files instead
specify `PY32F002Bx5` (same flash/OTP size, different part). Not urgent — both packages flashed fine
against `PY32F002Bx5` — but worth a definitive answer, folded into the same question set.

**Decided, and why:**

- **Chose to flash `V0R0` over `Test` on the strength of it being newer, release-named, and delivered
  standalone** rather than buried in an older bundle. Turned out right — it's the only image that
  replies at all — but it was a guess at the time, not something we could have known from the
  filenames alone. Their own instructions deck actually demos loading `Test`, which is presumably
  just because that was the file at hand when the deck was made, not a recommendation.
- **Archived the two `.pkg` files and a transcript of the PW200 instructions into the repo**
  (`manufacturer-supplied-2026-08-20/`) rather than leaving them in `temp-ss/` (gitignored) or a
  Desktop folder (not shared). Small files (<30KB each); worth keeping durable given how much of the
  day was spent because this material sat unopened since 2026-08-09.
- **Did not revert `manufacturer-qa-consolidated.md`'s 08-17/18 section, corrected it in place with a
  pointer forward instead.** The journal convention is append-only for the log; this doc isn't the
  log, but rewriting history there would hide *why* point 5's power theory was reasonable at the
  time. A forward-pointing correction note seemed more honest than silent editing.

**Tried and abandoned:**

- A Sonnet subagent driving the PowerWriter GUI via synthetic mouse/keyboard input — stalled
  immediately on a modal dialog and never recovered; killed. PowerWriter's custom-drawn UI doesn't
  expose real coordinates via UI Automation and doesn't respond to `SendKeys`/synthetic clicks
  reliably enough for unattended automation. Everything from that point on was manual: screenshot
  from the user, read it, tell them the next click.
- A dev-only `H158BringUp` entry added to the **auth** stack (reachable without Supabase configured,
  for bring-up on a machine with no backend set up) — this was explicitly temporary and got reverted
  before anything committed. The legitimate `__DEV__`-gated route already exists on the **home**
  stack from the 08-17 session and was untouched.
- Chasing VREF, clock speed, and a chip-sleep hypothesis for the PW200 `[0009]` error — all
  reasonable in sequence, all wrong. Real cause was the adapter orientation, unrelated to any
  PowerWriter setting.

**Blocked / needs someone else:**

- 🔴 **The firmware/protocol question above is now with the manufacturer, not us.** Send
  `manufacturer-questions-firmware-2026-08-20.md` before doing any more `h158Protocol.ts` work — we
  don't yet know which firmware or protocol is actually current.
- The scanner staleness bug (`DEVICE_STALE_AFTER_MS` never re-evaluated on a timer) needs a real fix,
  not just a workaround for the bring-up screen. Whoever's on `scanner.ts` next should pick this up.
- This branch is still not pushed as of the start of this session — pushing now, but the habit of
  pushing daily slipped again this week.

**Gotcha worth stealing:** 🔴 **We had unopened manufacturer material for eleven days** (`BLE.zip`,
supplied 2026-08-09) containing the actual PW200 procedure, a schematic, and a second firmware image
— and spent most of today's bench time rediscovering by trial-and-error what was already written
down. Before any hands-on hardware session: **grep every manufacturer-supplied archive for anything
we haven't listed as "read" somewhere**, not just the files we remember receiving.

---

## 2026-08-17 — OQ-13 closes for real: the manufacturer's SDK, and what it costs

**Branches:** `feature/ble-connectivity`
**Landed:** `src/features/ble/h158/{h158Protocol,h158Session,H158BringUpScreen}.tsx?`, tests, an
additive `filter` option on `scanner.ts`, an additive `writeCharacteristicWithoutResponseForService`
on `BleClientContext.tsx`, a dev-only nav route. `docs/hardware/hqd-device-architecture.md` §11,
`TECHNICAL_SPEC.md` v1.17 (OQ-13 closed, OQ-9 reconfirmed, OQ-16/OQ-17 registered), CLAUDE.md's
Current State and authority-model caveat refreshed. The manufacturer's `itronlib` SDK archived at
`docs/hardware/manufacturer-supplied-2026-08-17/` (397 KB source+docs, build output excluded).

**What arrived:** written answers to all 18 blocking questions sent Day 12/13, plus — four days late
— the `itronlib` Android SDK itself, working Kotlin with its own unit tests and a prebuilt demo APK.
The SDK, not the prose, is what actually closes this: it names the one characteristic (`0xFFF1` of
the five the module spec describes), and its own source and test disprove a corner of the written
reply — item 10 confirmed our checksum reading as payload-only XOR, which `BleProtocol.kt`'s own test
shows is wrong (it's XOR from the frame header). Full cross-check in
`manufacturer-supplied-2026-08-17/MANIFEST.md` §4. Lesson repeated from Day 13's wire-colour finding:
**when a prose answer and the vendor's own artifact disagree, trust the artifact.**

**Decided, and why:** build a narrow bring-up spike (`src/features/ble/h158/**`) rather than touch
`protocol.ts`/`auth.ts`/`crypto.ts`/`tools/mock-peripheral` at all. The real device doesn't implement
§4 — no CMAC handshake, no notifications, not even a GATT profile shaped like ours — so there is
nothing in the existing §4 implementation to *port*; deleting it before the client has agreed to lose
the security model it implements would be the wrong call to make unilaterally. Explicit user decision
this session, not an inference: ship the spike, record the consequences in docs, and hold off on a
drafted client message this pass.

**What this actually reveals, and why it's bigger than "which characteristic":** four separate
findings now point at the same conclusion. **OQ-16** (new) — no device-side authentication exists at
all; the firmware only supports "just-work unencrypted mode," no PIN, no bonding. **OQ-17** (new) —
every unit advertises the identical Bluetooth name, and iOS exposes no MAC to tell them apart, so
there is no radio-visible per-device identity for pillar 1's multi-device pairing. **OQ-9**
(reconfirmed, not reopened) — an unlocked device stays unlocked across a disconnect; no dead-man
timer, independently restated in this reply's item 16 after Day 12 already found it from the firmware
description. **OQ-4** (unchanged, now more concerning) — no per-device key is written at manufacture
either. CLAUDE.md's authority model line ("the firmware dead-man timer is what makes the device
safe") now carries an explicit caveat rather than reading as a settled fact — see the file itself.

**Also settled, incidentally:** reply item 17 explains the Day-10 40-minute silent-scan mystery —
USB power alone can't run the system; it needs a soldered 4.2 V cell. And item 18 revises §10.1's
bench-wiring read: the blue wire was read off the board's `T` silkscreen mark as a thermistor sense
pin; this reply describes the same wire as `H+`, a heating-element drive line. Neither confirmed
against the board directly yet — next bench session should settle it by testing, not asking a third
time.

**Method note carried forward from Day 12/13:** the SDK's own test file (`BleProtocolTest.kt`) was
free, known-good test data — ported its vectors verbatim into `h158Protocol.test.ts` rather than
inventing fixtures, so this module's tests are checked against the manufacturer's own values, not
just against itself.

---

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
