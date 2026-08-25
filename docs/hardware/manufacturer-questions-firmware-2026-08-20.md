# Firmware upgrade completed via PW200 — device now replies, but not in the documented protocol

**Prepared by the app development team, 2026-08-20.**

> ✅ **SENT — 2026-08-20, by Anish, over Teams, directly to the manufacturer.** Same channel as
> `manufacturer-questions-ble-connection-2026-08-12.md`.
>
> ✅ **REPLIED — 2026-08-23.** Answers recorded at
> [`manufacturer-supplied-2026-08-23/manufacturer-reply-2026-08-23.md`](manufacturer-supplied-2026-08-23/manufacturer-reply-2026-08-23.md);
> summary row-by-row in [`manufacturer-qa-consolidated.md`](manufacturer-qa-consolidated.md) Round 3.
>
> **Short version:** the `0x81`/`0x82` framing was an **older** protocol, not a newer one — a version
> skew between the firmware we flashed and their demo app. Use `H158_Test_260814_01_.pkg`, archived
> at [`manufacturer-supplied-2026-08-23/`](manufacturer-supplied-2026-08-23/) together with the
> protocol document, the iOS SDK, and the correct MCU datasheet — all of which were inside the
> accompanying `.rar` rather than attached to the message.
>
> **Two of the questions below were not answered:** what `81 00 03 00 00 00` actually meant (Q3.1/3.2),
> and whether production units ship needing a PW200 flash before they will respond (Q4 in the list
> below / 1.3). The second is a client and factory question now, not an engineering one.
>
> ✅ **VERIFIED ON HARDWARE — 2026-08-23, same day.** `H158_Test_260814_01_.pkg` flashed and tested
> against the manufacturer's own demo app. Read Status, Lock and Unlock all reproduced exactly as the
> protocol document describes — no `0x81`/`0x82` framing, every checksum correct by hand. Full byte
> tables in [`manufacturer-qa-consolidated.md`](manufacturer-qa-consolidated.md) Round 3. **The
> firmware fix is real, not just documented.**

This is a follow-up to your 2026-08-17 reply, specifically items 2, 6, 7, 12, and 18. We followed
your PW200 firmware-upgrade instructions (received 2026-08-09 inside `BLE.zip`, `Programming Software
Guide/Instructions for using the PW200 update program.pptx` — apologies, we did not open this file
until now; the delay is on us). Thank you — the procedure worked exactly as documented and the
device now responds to BLE commands for the first time. We do need your help interpreting what it's
sending back.

---

## What we did

Using PowerWriter 1.4.1.0 and the PW200, we loaded and flashed each of the two `.pkg` files present
in that same `BLE.zip`:

| File | Built | Result after flashing |
|---|---|---|
| `H158_Test_260708_01.pkg` | 2026-07-08 | Device remains silent to every command (same as originally shipped) |
| `H158_V0R0_5EDA983B_202607151202.pkg` | 2026-07-15 | **Device replies** — reproduced across two independent flash cycles |

We tested with your own `com.itorn.hqd.ble` demo app both times, so the results below reflect the
device and firmware only, not our code.

## What the device sends back on the newer firmware

```
TX  02 01 A2 A1 01        (Read Status, per your reply item 2)
RX  81 00 03 00 00 00     (~35-75 ms round trip, every time)

TX  02 02 A1 78 D9 01     (Lock)
RX  82 00 00

TX  02 02 A1 87 26 01     (Unlock)
RX  82 00 00

TX  02 01 A2 A1 01        (Read Status again)
RX  81 00 03 00 00 00     (identical to the first read)
```

Your reply's item 2 specifies the Read Status response as `02 05 A2 00 30/31 00 ## ** 01` — header
`0x02`, tail `0x01`. What we receive starts `0x81` and has no `0x01` tail. Your own demo app cannot
parse it either: `Failed to parse BLE frame: Invalid frame head: 0x81`, and the app's Lock/System/
Battery fields stay blank.

We also notice the reply is **identical whether we send Lock, Unlock, or Read Status**, and does not
change between reads. That pattern reads to us like a generic acknowledgement or error frame, not a
real status payload — but we'd rather ask than guess.

## Questions

1. **Which of these two `.pkg` files is the current production firmware for the H158/YP65-AT?**
   Neither is what shipped on the unit originally.
2. **Is `0x81`/`0x82` framing a newer or different protocol** than *H158 Protocol-202608131414*
   (referenced in your reply items 2 and 11)? If so, could you send the document that describes it?
3. If the `02...01` framing from your reply is still current, **which firmware image implements it**,
   and could you send that `.pkg`?
4. Separately — **is a firmware upgrade required before the device will ever respond**, or should the
   originally-shipped firmware have replied and something else is wrong? We ask because
   `H158_Test_260708_01.pkg`, also from your team, produced no reply either.

## One more, smaller item while we have your attention

Reply item 7 states advertising stays active for **10 minutes** after a button press. On our unit
(both before and after the firmware upgrade) it stops after a few **seconds**. Is that expected for
either firmware image, or a separate issue?

## And a physical-identification discrepancy, for whenever it's convenient

We identified the MCU as `PY32C642F15` from the package markings (`PUYA` / `C642F15` / `4B6HM1A`).
Both of your `.pkg` files instead specify `PY32F002Bx5` in PowerWriter (same 24.00 KB flash / 0.13 KB
OTP). We're not raising this as urgent — both packages loaded and flashed against `PY32F002Bx5`
without issue — but if you can confirm which is correct we'd like to get our records right.

---

## Plain text (for pasting)

Hi — following up on your 17 Aug reply and the PW200 instructions from the 9 Aug BLE.zip (sorry for
the delay opening that file, that's on us). We flashed both `.pkg` files from that archive via PW200.

`H158_Test_260708_01.pkg` (built 7/8): device stays silent to every command, same as originally
shipped.

`H158_V0R0_5EDA983B_202607151202.pkg` (built 7/15): device now replies. Sending your documented Read
Status command 02 01 A2 A1 01 gets back 81 00 03 00 00 00 in under 100ms, reliably, across two
separate flashes. But that doesn't match the reply format from your item 2 (02 05 A2 00 30/31 00 ##
** 01), and your own demo app can't parse it either — it shows "Failed to parse BLE frame: Invalid
frame head: 0x81" and Lock/System/Battery stay blank. Lock and Unlock get the same 82 00 00 reply
every time regardless of command or device state, which looks like a generic ack/error rather than a
real status payload.

Questions:
1. Which pkg is the current production firmware for H158/YP65-AT? Neither is what shipped originally.
2. Is 0x81/0x82 a newer protocol than H158 Protocol-202608131414? If so please send that doc.
3. If 02...01 framing is still current, which firmware image implements it — could you send it?
4. Should the originally-shipped firmware have replied to commands at all?

Smaller item: your reply said advertising stays on 10 minutes after a button press; ours drops after
a few seconds on both firmware images. Expected, or separate issue?

Also, whenever convenient: we read the MCU package as PUYA C642F15, but both your pkg files specify
PY32F002Bx5 in PowerWriter. Can you confirm which is correct?

Happy to send full BLE logs for any of this if useful. Thanks again for the PW200 procedure — it
worked exactly as documented once we found it.
