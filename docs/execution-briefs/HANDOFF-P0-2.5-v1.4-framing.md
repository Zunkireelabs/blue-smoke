# Handoff — execute the `P0-2.5` v1.4 framing addendum

**Read this first, then execute [`P0-2.5-addendum-v1.4-frame-discriminator.md`](P0-2.5-addendum-v1.4-frame-discriminator.md), which is the actual work order.**

This note exists because briefs are not rewritten to match what happened
([`README.md`](README.md)). The addendum stands as written; three things around it have moved,
and one thing has been *discovered*, since it was authored.

---

## 1. 🔴 The finding that makes this urgent

**Spec v1.4 was written and never implemented.** `TECHNICAL_SPEC.md` on this branch is at
**v1.7** and its §4.5 mandates `frameIndex` in byte 0 of both `authResponse` frames, with
`expiresAtDelta` narrowed to **uint24 LE**. Neither the constants file nor the mock knows this.
Verified, not assumed:

```
grep -c frameIndex docs/TECHNICAL_SPEC.md          → present (§4.5, F12, FW-19/FW-20, changelog 1.4)
grep -c frameIndex src/features/ble/protocol.ts    → 0
grep -c frameIndex tools/mock-peripheral/*.ts      → 0
```

`protocol.ts` still declares the **pre-v1.4** layouts (`sessionId` at offset 0,
`expiresAtDelta` as **uint32** at offset 16), and `deviceCore.ts` still reads frames with the
positional cursor its own module header describes — *"advances positionally"* — which is
precisely the convention the mock invented, flagged as ambiguity #1, and which became spec
defect #11 and the v1.4 fix. **The spec was corrected; the two artefacts that implement it were
not.**

So there is a live three-way disagreement:

| Artefact | `frameIndex` | `expiresAtDelta` |
|---|---|---|
| `TECHNICAL_SPEC.md` §4.5 (v1.4+) | byte 0 of both frames | uint24 LE, 3 B |
| `src/features/ble/protocol.ts` | absent | uint32, 4 B @ offset 16 |
| `tools/mock-peripheral` | absent (positional cursor) | uint32 |

## 2. Why this blocks everything downstream

- **§4 is what goes to the firmware team** (OQ-6, the project's critical path). Walking them
  through v1.7 §4.5 while our own mock implements the pre-v1.4 wire format means firmware builds
  one contract and our test harness speaks another. That surfaces at hardware integration, which
  is the most expensive possible place.
- **The mock is our executable model of firmware.** Its value is entirely that it is a faithful
  stand-in. Right now it is faithful to a superseded spec.
- **App-side BLE work is next and cannot start.** `src/features/ble/auth.ts` is still a stub. An
  implementer reading `protocol.ts` would build the wrong wire format; one reading the spec would
  fail every round-trip test against the mock. Either way the failure looks like a bug in their
  own code. **This must land before `P1-4.0`.**

## 3. Three corrections to the addendum brief

Everything else in it stands. Work from its §3.1 layouts — they are correct and authoritative.

1. **Its §2 is now stale in your favour.** It says the v1.4 spec "is NOT on `stage` yet" and
   lives on an unpushed branch. That was true when written. **The spec is now on your branch at
   v1.7**, so you can and should read §4.5 directly — *and* cross-check it against the brief's
   §3.1 table. If those two ever disagree, **stop and report it**; do not pick one.
2. **Branch.** The addendum says `feature/P0-2.5-mock-ble-peripheral`. That branch is already
   merged into **`chore/integrate-auth-db-persona`**, which is checked out and is where the mock
   now lives. Work there. Do not branch, do not rebase, do not push.
3. **Its §4.5 "declared-dependency fix" is already done.** `@babel/plugin-transform-typescript`
   is now in `devDependencies`. Skip that item; tick it and say so.

## 4. Environment

macOS. `git` on `PATH`. `node_modules` current — **do not run `npm ci`**. No Deno. Do not run
`supabase start` (port 54322 belongs to an unrelated project). **Do not push. No Claude
attribution in the commit.**

Baseline you must not regress: **142 tests / 19 suites**, `typecheck` exit 0, lint **0 errors /
33 warnings**.

`protocol.ts` is a contested shared file, normally append-only. The addendum's §4.1 **authorises
a rewrite of the two frame layouts specifically** — that authorisation is still valid and is
limited to those two entries.

## 5. The one thing most likely to go wrong

`frameIndex` is **deliberately outside the proof CMAC** (§4.5, and the addendum's §8 item 1
rejects getting this wrong). It is framing, not a security parameter: forging it without
`K_sess` achieves nothing beyond a handshake reset. Putting it inside the CMAC would change the
proof input, break every cross-check against the spec, and quietly alter the security argument.

Second most likely: treating a framing reset as an authentication failure. F12 says it is not —
it must **not** burn an F6 attempt and must **not** invalidate `N`. That distinction is the
whole point of the obligation.

## 6. What "done" means here

The addendum's §6 DoD, minus the babel item (§3.3 above), plus one addition:

- [ ] **A test proving `protocol.ts` and the mock agree with each other** on both frame layouts —
      the same cross-verification discipline used for `K_sess` in
      `supabase/functions/_shared/__tests__/deriveSessionKey.test.ts`. Two artefacts that must
      match should assert that they match, not merely both claim to follow §4.5.

Report in the addendum's §7 format, seven sections, verbatim command output.
