# What we need in order to connect to the device over Bluetooth

**Prepared by the app development team, 2026-08-12. For forwarding to the manufacturer.**

This document covers **one topic only**: what the mobile app needs in order to connect to the device
and control it. It is a follow-up to
[`manufacturer-requirements-2026-08-10.md`](manufacturer-requirements-2026-08-10.md) and your reply
of 2026-08-12, and it is written to be forwarded as-is.

Internal reasoning is in [`hqd-device-architecture.md`](hqd-device-architecture.md) — that file is
for us, not for sending.

> **A note on what is deliberately not here.** Two topics from our earlier list — the per-device
> security key (item 9a) and the auto-lock timer (item 8) — are **not** in this document. Those are
> product decisions on our client's side, and it would be premature to ask the factory to act on them
> before that decision is made. They are being handled separately.

---

## Where we have got to

Your reply and the `YP65-AT` module specification answered a great deal, and we are grateful for
both. We now know:

| Known | Value |
|---|---|
| Bluetooth service | `0xFFF0` |
| Characteristics | `0xFFF1`–`0xFFF5`, all Notify + Write No Response |
| Maximum message size | 185 bytes |
| Device name | `YP65-AT` plus MAC address suffix |
| How it becomes discoverable | Power-on, or a single button press |
| Idle behaviour | Sleeps after 10 minutes with no connection |
| Lock / Unlock / Read Status | `02 02 A1 78 D9 01` / `02 02 A1 87 26 01` / `02 01 A2 A1 01` |

**What we still cannot do is complete a single working exchange with the device.** The questions
below are the remaining gaps, in the order the app hits them.

---

## Step 1 — Finding the device

**1.1 🔴 What exact Bluetooth name does the finished product advertise?**
You wrote that the name is *"typically `YP65-AT`"* with the MAC address appended. We need the exact
value, not the default — the module supports `AT+NAME=` (up to 29 bytes) and your firmware may be
setting something else. Read question 1.2 before answering this one; together they explain why a
one-line answer here unblocks a great deal.

**1.2 Does the device advertise the `0xFFF0` service UUID, or only its name?**
The module's default advertising data appears to contain only the Flags field, with the name carried
in the scan response. If that is what your firmware ships, the app **can only search by name** —
which makes 1.1 critical rather than a detail. If we search for the wrong name we will never find the
device, and there is **no error message to tell us why**: an empty scan looks exactly the same as a
device that is switched off. Please confirm which, because this decides how the app scans and we
would rather not discover it by trial and error.

**1.3 We have never seen a device advertise. What should we expect to see, and what would prevent
it?**
On 2026-08-10 we had a board, the PW200 programmer and an Android phone running nRF Connect. We
scanned repeatedly for roughly 40 minutes, with the phone 10 cm from the board, on USB power, and we
pressed the button on the board. **Nothing ever appeared.** We now suspect the board we hold is not
the main board (see the closing section), but we would like the question answered directly rather
than assumed away:

- What exactly should appear in a Bluetooth scanner when a working device is powered on?
- What are the most common reasons a device would not advertise at all?

**1.4 Does your firmware leave Bluetooth advertising switched on at all times?**
The module supports `AT+ADVEN=0`, which turns advertising off. We need to know whether your firmware
uses it — because if it does, a device that appears "silent" is behaving correctly and we would be
wrong to treat it as a fault.

**1.5 Is the advertising interval left at the default (200 ms)?**
This affects how quickly the app finds the device, which is user-visible.

## Step 2 — Connecting

**2.1 Is there a pairing PIN on this product, and can it be disabled?**
Your earlier protocol document (`HQD_BLE_Protocol_Commands_Android_EN`) describes a **6-digit PIN**.
The `YP65-AT` module specification contains **no PIN, pairing or bonding command anywhere**. The two
documents disagree and we cannot tell which describes the shipping product. A PIN prompt in the
middle of the connection flow is a significant difference to the app's user experience, so we need
this settled before building it.

**2.2 Does the device require any initialisation sequence after connecting**, before it will accept
commands? For example a wake byte, a handshake, or a delay. If the app may send a command
immediately after connecting, please say so explicitly.

**2.3 How many phones can be connected at once?** We assume one. Please confirm, and tell us what the
device does if a second phone attempts to connect while the first is still on.

## Step 3 — The data channel 🔴 **most important question in this document**

**3.1 Which of `0xFFF1`, `0xFFF2`, `0xFFF3`, `0xFFF4` or `0xFFF5` does your firmware use?**

The module specification shows all five channels are identical and that the module treats their
contents as opaque — so the specification **cannot** answer this; only your firmware knows. Without
it the app has a service to connect to and no channel to talk on.

**3.2 Is it one channel in both directions, or one for sending and another for receiving?**
That is, does the app write commands to the same characteristic it receives replies on?

**3.3 Do we need to enable notifications explicitly** on that characteristic before the device will
send anything back?

## Step 4 — The message format

We have studied the three command frames you supplied and believe the structure is as follows.
**Please confirm or correct it** — we would rather be told we have it wrong than build on a guess.

| Frame | Header | Length | Payload | Checksum | Tail |
|---|---|---|---|---|---|
| Lock | `02` | `02` | `A1 78` | `D9` | `01` |
| Unlock | `02` | `02` | `A1 87` | `26` | `01` |
| Read Status | `02` | `01` | `A2` | `A1` | `01` |

Our reading: a fixed header `02`, a length byte counting the payload, the payload itself (`A1` =
lock/unlock with `78` = lock and `87` = unlock; `A2` = read status), an XOR checksum over every byte
from the header up to the end of the payload, and a fixed tail `01`.

**4.1 Is that structure correct**, and is it the same structure for every command the device
supports?

**4.2 What is the tail byte `01` for?** Is it a fixed terminator, a protocol version, or something
that varies?

**4.3 Is the checksum calculated over the header and length bytes as well as the payload?** Our
arithmetic says yes for all three examples, but three samples is not proof.

## Step 5 — What the device sends back 🔴 **second most important**

This is the largest gap. We can send commands; we cannot understand any reply.

**5.1 What does the device send back after a Lock or Unlock command?** Is there an acknowledgement
frame? What does it look like, and what distinguishes success from failure?

**5.2 What does Read Status return, and how is the lock state encoded in it?**
Please give us an example of the actual bytes for a locked device and for an unlocked device.

**This is a safety requirement on our side, not a convenience.** Our application is not permitted to
display the device as unlocked until the device itself has confirmed it. We never assume a command
worked. So until we can read a status reply, we cannot show the user a lock state at all.

**5.3 Does the device send anything unprompted** — for example, notifying the app when the state
changes because the user pressed the button on the device? If so, what does that message look like?

**5.4 What happens on a bad command?** If the app sends an unknown command byte, a wrong length or a
bad checksum, does the device reply with an error, or stay silent? Please give us the error frame if
one exists.

**5.5 Is there a list of the other commands the device supports?** We have three. If there are more —
battery level, firmware version, device information — a complete command list would save us returning
to you repeatedly.

## Step 6 — Timing and reliability

**6.1 Is there a minimum gap required between commands?** The module specification mentions a 20 ms
interval in places. If the app must pace its writes, we need the number.

**6.2 Are there connection parameters the device expects** — connection interval, latency,
supervision timeout? If your firmware requests specific values, the app should not fight them.

**6.3 What does the device do when the phone disconnects or goes out of range?** Does it start
advertising again immediately, and does it remain reachable for the full 10 minutes before sleeping?

**6.4 Does the lock state survive a disconnection or a power cycle?** If a device is unlocked and the
phone walks away, is it still unlocked when the phone returns?

## Step 7 — Bench testing

**7.1 How should we power a bare board on the bench** so that Bluetooth runs? We have been using USB
only. Which pads should a battery connect to, and is a battery required for Bluetooth to work at all?

**7.2 What do the indicator LEDs mean?** On our board two white LEDs blink continuously and do not
stop. We do not know whether that indicates charging, a fault, or normal standby.

**7.3 How can we tell the difference between a device that is advertising and one that has gone to
sleep**, without a phone in hand?

---

## Summary — if you can only answer four

1. **Which of `0xFFF1`–`0xFFF5` carries your commands** (3.1).
2. **What Read Status returns, and how lock state is encoded in it**, with example bytes (5.2).
3. **The exact name the product advertises** (1.1) — one line to answer, and the app cannot find any
   device without it.
4. **Whether there is a pairing PIN** (2.1).

With those four we can build and test the whole connection flow. Everything else in this document
refines it.

We would also repeat the request from our previous message: **we believe the board we currently hold
is a charging board rather than the main board**, so none of the above can be tested here until a
board carrying the PY32C642F and the Bluetooth chip reaches us.

---

## The same questions, as plain text for chat

The version below is what was actually sent, pasted into Teams. It carries the same questions in the
same order, rewritten for a chat window: **no Markdown, no tables, short sentences**, since it is
read by a team working in English as a second language and formatting characters survive a paste
badly. Renumbered 1–18 as one flat list.

**If the two versions ever disagree, this one is what the manufacturer actually saw.** Keep them in
step, or delete this section rather than let it drift.

```text
Hi [name],

Thank you for the module specification and your answers - they closed most of our
questions. A few remain before we can connect our app to the device. I have put the
three most important first.

TOP 3 - THESE BLOCK US COMPLETELY

1. The YP65-AT module provides five channels: FFF1, FFF2, FFF3, FFF4, FFF5. The
specification says the module treats their contents as opaque data, so only your
firmware knows which one is used. Which of the five does your firmware use to send
and receive the lock, unlock and status commands?

2. What does the device send back when we send Read Status (02 01 A2 A1 01)? Please
give us the actual bytes for a locked device and for an unlocked device. Our app is
not permitted to show a device as unlocked until the device itself confirms it, so
without this reply format we cannot display a lock state at all.

3. Is there a 6-digit pairing PIN on this product? Your protocol document describes
one, but the YP65-AT module specification contains no PIN or pairing command
anywhere. The two documents disagree, and this changes the app's connection flow.

FINDING THE DEVICE

4. What exact Bluetooth name does the finished product advertise? You wrote that the
name is "typically YP65-AT" with the MAC address appended. We need the exact value,
because the module supports the AT+NAME= command and your firmware may be setting a
different name.

5. Does the device advertise the FFF0 service UUID, or only its name? From the module
specification, the default advertising data appears to contain only the Flags field,
with the name carried in the scan response. If that is what your firmware ships, our
app can only search by name, which makes question 4 critical - if we search for the
wrong name we will never find the device, and we will see no error to tell us why.

6. We have never seen a device advertise. On 10 August we had a board, a programmer
and an Android phone running nRF Connect. We scanned repeatedly for about 40 minutes
with the phone 10 cm from the board, on USB power, and pressed the button on the
board. Nothing ever appeared. We now think the board we have may be the wrong one
(see the end of this message), but we would still like to ask directly:

   - What exactly should we expect to see in a Bluetooth scanner when a working
     device is powered on?
   - What are the most common reasons a device would not advertise at all?

7. Does your firmware keep Bluetooth advertising switched on at all times? The module
supports AT+ADVEN=0 to switch it off. We need to know whether a device that appears
silent is behaving normally or is faulty.

CONNECTING

8. After connecting, can the app send a command immediately, or is an initialisation
step or a delay required first?

9. Can more than one phone be connected at the same time?

MESSAGE FORMAT

10. We believe your command frames are: header 02, then a length byte, then the
payload, then an XOR checksum, then a tail byte 01. For example we read Lock
(02 02 A1 78 D9 01) as header 02, length 02, payload A1 78, checksum D9, tail 01.
Is this correct? And what is the tail byte 01 for?

11. Do you have a complete list of the commands the device supports? We currently
have only lock, unlock and read status. If there are others - battery level, firmware
version, device information - a full list would save us asking again later.

12. What does the device reply if we send an invalid command or a wrong checksum? An
error frame, or nothing at all?

13. Does the device ever send a message on its own? For example, if the user presses
the button on the device and the state changes, does the app get notified?

TIMING AND RECONNECTION

14. Is a minimum gap required between commands? The specification mentions 20 ms in
some places.

15. When the phone disconnects or moves out of range, does the device start
advertising again immediately?

16. If a device is unlocked and the phone disconnects, is it still unlocked when the
phone reconnects?

BENCH TESTING

17. How should we power a bare board so that Bluetooth works? Which pads should the
battery connect to, and is a battery required, or is USB power enough?

18. On our board, two white LEDs blink continuously and never stop. What does this
indicate?

ONE MORE THING

We believe the board we currently have is a charging and protection board, not the
main board. It is marked AC-H158-V1.01, its pads are marked B+, B- and T, it has a
USB-C connector and a microphone on separate wires, and we can see no crystal and no
antenna anywhere on it.

Could you please confirm whether this is correct, and send us a board carrying the
PY32C642F and the Bluetooth chip? Until one reaches us we cannot test any of the
above.

Thank you.
```

---

## Reference — documents this is based on

| Document | Received | Used for |
|---|---|---|
| `YP65-AT-BLE-module-spec-v1.3-release.pdf` | 2026-08-12 | Service and characteristic UUIDs, MTU, advertising behaviour, AT commands |
| Your written reply to our 10 items | 2026-08-12 | Discoverability, the three command frames, sleep behaviour |
| `HQD_BLE_Protocol_Commands_Android_EN` | 2026-08-09 | The 6-digit PIN description that question 2.1 asks about |
| `H040BLE-SCH-V1.02.pdf` (sheet 1 of 2) | 2026-08-09 | Board architecture |
