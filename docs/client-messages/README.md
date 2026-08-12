# Client messages

Drafted messages to the client, and what each one unblocks. **All three below are drafts and none
has been sent.**

The split is deliberate: these go to **different people**. Bundling them into one message means the
engineer who can answer the BLE questions is also reading about developer-account ownership, and the
commercial owner is scrolling past AT-command lists. Worse, one reply then reads as "answered" when
two thirds of it is still outstanding — so **track the three separately**.

| Message | Recipient | Blocks | Register |
|---|---|---|---|
| [`hardware-forward-2026-08-10.md`](hardware-forward-2026-08-10.md) + its attachment [`../hardware/manufacturer-requirements-2026-08-10.md`](../hardware/manufacturer-requirements-2026-08-10.md) | Client, **for forwarding to the manufacturer** | All BLE work; the factory key and serial | OQ-4, OQ-6, OQ-9, OQ-12, OQ-13, OQ-14 |
| [`commercial-2026-08-10.md`](commercial-2026-08-10.md) | Contract owner | `ARCHITECTURE-SIGNOFF.md`, `P0-5.0`, `P3-8.0` | OQ-8, OQ-11 |
| [`product-policy-2026-08-10.md`](product-policy-2026-08-10.md) | Product owner | `P2-6.0`, `P0-7.0`, `P3-8.0` | OQ-1 (part), OQ-2, OQ-3, OQ-5, OQ-7 |
| [`architecture-escalation-2026-08-12.md`](architecture-escalation-2026-08-12.md) | Product/security architecture owner (not the hardware channel) | §4.5 `K_dev`/`K_sess` design, §4.6/§4.8 auto-lock design | OQ-4, OQ-9 |

Between them they cover **every open question in `../TECHNICAL_SPEC.md` §13 that is answered by the
client rather than by us** — which, as of Day 11, is all of them. The fifth message above is new on
Day 13: it doesn't ask a new question, it surfaces that two already-answered ones (OQ-4, OQ-9)
came back in a way that breaks a design assumption, and asks for a decision rather than a fact.

## Rules

1. **Each message carries its own follow-through checklist.** Work it when the reply lands; that is
   where the answer gets registered against the right OQ. An answer that arrives and is not recorded
   in §13 is an answer that gets asked for again.
2. **A blocker that lives only in a draft message is a blocker nobody chases.** Same lesson as
   OQ-12, which sat inside an execution brief for nine days (spec changelog v1.9). If a question
   here is not in §13, put it there.
3. **Do not merge these messages.** See above.
4. 🔴 **`../ARCHITECTURE-SIGNOFF.md` must not be sent** until `commercial-2026-08-10.md` item 1 is
   answered — it promises an on-device privacy model the build no longer implements.
5. **The hardware ask is now two files, and only one of them is ours to write freely.** The covering
   note is to the client; the attachment is forwarded to a third party we have never spoken to, so
   every factual claim in it about their own hardware has to be traceable to a document they sent us.
   `../hardware/client-questions-2026-08-09.md` is retained as the working source and is **not** for
   sending.
