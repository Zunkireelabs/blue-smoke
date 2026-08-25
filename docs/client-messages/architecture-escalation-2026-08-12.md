# Escalation to the client/product owner — two architecture conflicts from the manufacturer's Day-12 reply

**Status: DRAFT — not sent.** Addressed to whoever owns product/security architecture decisions on
the client side — likely the same recipient as `commercial-2026-08-10.md` or `product-policy-2026-08-10.md`,
not the hardware/manufacturer channel. This is a decision request, not a status update, so it should
go out as its own message rather than folded into either.

Background: the manufacturer replied 2026-08-12 to
[`../hardware/manufacturer-requirements-2026-08-10.md`](../hardware/manufacturer-requirements-2026-08-10.md) —
full text in
[`../hardware/manufacturer-supplied-2026-08-12/manufacturer-response-2026-08-12.md`](../hardware/manufacturer-supplied-2026-08-12/manufacturer-response-2026-08-12.md).
Most items were routine progress. Two were not: their answers to items 8 (auto-lock) and 9a
(per-device key) each remove a premise the app's security design currently depends on. Full
technical detail is in `../hardware/hqd-device-architecture.md` §6.4 and
`../TECHNICAL_SPEC.md` §13 (OQ-4, OQ-9); this message is the plain-language version for a decision,
not the analysis itself.

**Updated 2026-08-12 (Day 13), still not sent.** A second read of the module spec
(`YP65-AT-BLE-module-spec-v1.3-release.pdf`, analysed in `../hardware/hqd-device-architecture.md`
§3.2.2) added one fact to each item, both from the module vendor's own documentation rather than our
inference: the Bluetooth address is **settable by AT command** (`AT+ADDR=`), and the module carries a
**real-time clock** (`AT+RTCEN=` / `AT+RTCDA=`). The first strengthens item 1 — the identifier
offered in place of a per-device key is not reliably unique. The second strengthens item 2 — a timed
lock is a firmware decision, not a hardware limitation. **Keep the caveat in item 2's wording:** the
clock is on the radio module, while the timer must act on the PY32 that drives the heater, so this
establishes feasibility and not the design.

Notes before sending:

- Keep this **separate** from the hardware/manufacturer channel — these are decisions for the
  client/product side to make, not something to forward to the factory.
- Do not soften past "unambiguous" — the two engineering team members who aren't Anish need to be
  able to read this and understand the actual state without digging through the spec.
- This is time-sensitive against the 30-day plan (Day 13 of 30). A decision needed here changes what
  `P1-4.0`'s remaining work and `P1-7.0`'s hardware pass can safely build against.

---

## Message

> **Subject: Two things from the manufacturer's reply that need a decision, not just a note**

We heard back from the manufacturer on the hardware questions we sent. Most of it was straightforward
progress — we now know how to make the board discoverable, we have the lock/unlock commands, and the
Bluetooth module's full specification has since arrived. Two of their answers, though, mean something
we've been building against isn't quite what we assumed, and we'd rather flag it now than three weeks
from now.

**1. There's no per-device secret key written at the factory.**

Our security design assumes each device gets a unique secret key burned in during manufacturing,
which the app and the device both use to prove who's talking to whom — a real handshake, not just
"this Bluetooth connection worked." The manufacturer's answer was that this isn't part of their
process: devices are only distinguished by their Bluetooth address, nothing is written per unit.

That means the authentication design as currently specified doesn't have anything to anchor to on
the device side.

There's a second half to this that we found after their reply, in the Bluetooth module's own
documentation. The Bluetooth address they're offering as the thing that distinguishes one device
from another **can be changed in software** — the module has a documented command that sets it to
any value. So two devices can be given the same address, or one device can be given another's. It
isn't a serial number burned in at the factory; it's a setting.

Put together: there's no per-device secret, and the identifier offered in its place isn't reliably
unique either. We have a few ways to handle this — a lighter-weight authentication scheme, or asking
the factory to add key provisioning as a line item — but which one is right depends on your risk
tolerance and the factory relationship, not on anything we can decide unilaterally.

**2. The device doesn't lock itself on a timer.**

We had understood the device auto-locks after some minutes unattended, independent of the phone app.
The manufacturer's answer is that there's no such timer in firmware today — the device stays
connected and unlocked until the phone actively disconnects or physically moves out of range, at
which point it takes up to 10 minutes to go to sleep.

The good news: since it locks on range loss rather than needing the app to be running, the core
concern — "does the device stay unlocked forever if the app crashes" — is probably still fine, because
that's enforced by the Bluetooth link itself, not the app. The open question is whether "locks when
the phone walks away or disconnects" is an acceptable definition of auto-lock for this product, or
whether you want an actual firmware timer added as a backstop (e.g. locking after N minutes even if
the phone stays in range). That's a product call, not something we should assume either way.

One thing worth knowing before you decide: the Bluetooth module has a real-time clock built in, and
their documentation describes how to set it. So if you do want a timer, this is firmware work on an
existing capability rather than a hardware limitation — it shouldn't be refused as impossible. We'd
want to confirm the details with them, because the clock sits on the Bluetooth part while the timer
would need to act on the main controller that drives the device itself. But "the hardware can't do
it" isn't the obstacle.

**What we need from you:** a decision on each of these two, so we know what to build the remaining
authentication and lock-timing work against. Happy to walk through the tradeoffs on a call if that's
faster than email.

---

## Follow-through after sending

- [ ] Log the send date and recipient in `docs/session-log/anish.md`
- [ ] Once a decision lands on item 1, update `TECHNICAL_SPEC.md` §4.5 and the OQ-4 row accordingly —
      do not silently keep building the current `K_dev`/`K_sess` design if the answer is "use a
      lighter scheme"
- [ ] Once a decision lands on item 2, update `TECHNICAL_SPEC.md` §4.6/§4.8 and the OQ-9 row, and the
      glossary's "dead-man timer" definition if the accepted design is disconnect-based rather than
      timer-based
- [ ] Track separately from `hardware-forward-2026-08-10.md`, `commercial-2026-08-10.md`, and
      `product-policy-2026-08-10.md` — a reply to one of those does not mean this one landed too
