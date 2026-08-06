# Session log — Anish

Newest first. Conventions in [`README.md`](README.md).

---

## 2026-08-06 (later) — the no-vendor assumption I called settled has been reversed

**Branches:** `feature/P0-6.0-security-design`

**I was wrong in the entry below.** I wrote that the no-KYC-vendor question was closed and recorded
it in `TODO-phase-0.md` as "client-mandated, do not reopen," on the strength of §8.5 residual risk 3
and §1.3. That was an accurate reading of the *record* and the wrong call on the *plan*: Sadin and I
have since agreed to use a third-party verification provider. Not editing the entry below — leaving
it visible so the sequence is honest.

**What this does to P0-6.0, which is more than a doc edit.** If 🔴 data leaves the device, three of
the boxes I ticked or scoped today change shape:

- **§8.3 threat model** gains an entire class it doesn't have — data in transit, vendor-side breach,
  vendor account compromise, processor sub-processing. Ten threats become materially incomplete.
- **§8.6 GDPR posture inverts.** Today it claims exposure "near-zero" because nothing leaves the
  device. With a provider we are a controller/processor of **Article 9 special-category** data:
  DPA, probably a DPIA under Art 35, data-residency, retention terms.
- **Audit F1 becomes moot.** If the DOB never enters our app, there's no JS string to zeroise. The
  finding was real and is now likely irrelevant — worth knowing before anyone spends time on it.

**Blocked / needs someone else — the written client confirmation.** §1.2/§1.3/§1.4, §8.5, §8.6,
CLAUDE.md's "do not reintroduce" list and **the client-facing `PROJECT_BRIEF.md`** all still say
on-device-only, and §8.5 attributes that to the client specifically. I'm deliberately **not** editing
any of them on an internal decision: reversing a documented client mandate needs the client, and it
carries per-verification cost and legal obligations with it. Flagged in the TODO instead.

**Gotcha worth stealing — check what your own committed docs assert before you assert it twice.**
I put "do not reopen" into a shared TODO roughly four hours before the opposite was decided. The
lesson isn't "don't record decisions" — it's that a locked decision is worth citing (§8.5), not
restating in imperative mood in a second place.

**Sadin — schema warning stands and is now urgent.** `feature/P0-3.0-baas-setup` is scaffolding
§5.2's `verifications` table, built deliberately to hold no evidence. A provider adds an inquiry ID,
provider status, and webhook events, and the flow becomes **asynchronous**, which §5.4
`issue-device-session` currently isn't. Worth pausing that table before it's written twice.

---

## 2026-08-06 — P0-6.0 audited instead of authored; the DOB can't be zeroised

**Branches:** `feature/P0-6.0-security-design`
**Landed:** nothing yet — PR open against `stage`

**Decided, and why — audit first, author second.** P0-6.0 showed 0 / 10, which read like "no
security design exists." It isn't true: §8 already had the four-class data table, ten threats, key
rotation, three residual risks, and a compliance posture. Writing a fresh security model would have
duplicated it and, worse, would have produced a second document that could disagree with the spec.

So I read §8 against the code that landed in `P0-4.0` — which did not exist when §8 was written —
and against the native config. Six findings, three boxes ticked honestly. Full detail in
[`docs/audits/P0-6.0-security-audit.md`](../audits/P0-6.0-security-audit.md); it follows the shape
of Sadin's P0-1.0 audit, which turned out to be the right instinct for the same reason his was.

**Blocked / needs someone else — F1, and it's the important one.**
`src/native/verificationModule.ts` returns the DOB as `dateOfBirth: string`. §8.1 classifies DOB as
🔴 "RAM only, zeroised in a `finally` block", and §6.1 stage 7 says to overwrite "any derived
strings."

**You cannot overwrite a JavaScript string.** They're immutable and GC-managed; `dob = null` drops a
reference and the character data sits in the Hermes heap until collection, possibly copied by
compaction on the way. So a stated inviolable rule is unenforceable for that one value.

What makes it precise: every *other* 🔴 value on that interface is a `Uint8Array` — the ID image,
the selfie, the frames — and those genuinely are zeroisable with `.fill(0)`. Whoever wrote the
interface got the images right. The DOB is the single value typed as something we can't clear.

The fix isn't mine to pick, because each option costs something real: computing the age gate
natively means implementing §6.2's R1–R7 **twice** (Swift + Kotlin) against §9.2's one-shared-
interface intent, and two implementations of R3's fail-safe-to-younger rule is its own correctness
risk. Passing bytes instead keeps R1–R7 shared but still materialises unzeroisable integers.

**Sadin — this needs you**, since it touches §6 and re-scopes `P2-2.0` + `P2-3.0` (6.8 d combined).
Deciding now costs a conversation; deciding after those are built costs the rewrite. First agenda
item for the "bonding is not authorisation" session, which I'm booking anyway for box 3.

**Gotcha worth stealing — the 🔴-zone lint guard only covered half the zone.** The `.eslintrc.js`
override globbed `src/features/verification/**` only, but CLAUDE.md's own codebase map puts
`src/native/**` in the same area — and that's where the raw frames and the DOB actually cross the
bridge. A logger import there passed lint. Also, the guard blocked persistence and logging but not
*transmission*: `@supabase/supabase-js` wasn't restricted and `fetch` was free. Two of the three
things rule 1 forbids were enforced; the one with the worst failure mode wasn't. Both fixed here.

**Gotcha worth stealing — verifying lint with no `node_modules`.** `npx eslint` pulls **v10**, which
dropped `.eslintrc` support entirely and just errors with "couldn't find eslint.config.js" — looks
like your config is broken when it isn't. The project pins `^8.19.0`. What worked:

```bash
npx --yes eslint@8 --no-eslintrc --config <temp>.json src/native/probe.js
```

with a temp config holding the `overrides` array verbatim and `extends: '@react-native'` dropped
(that needs `node_modules`, and it's the part I hadn't changed). Then a throwaway probe file that
violates every rule on purpose, to watch all five fire. Use a `.js` probe, not `.ts` — the TS parser
comes from the RN config you just dropped. Deleted the probe afterwards.

**Gotcha worth stealing — this clone's git identity was Sadin's.** `.git/config` in my working copy
had `user.name = Sadin Shrestha` / `user.email = sadinshrestha001@gmail.com`; global was unset. So
anything I committed would have been attributed to Sadin, which quietly breaks the claim-by-branch
record. Fixed locally. **Sadin — the 7 existing commits under `sadinshrestha001@gmail.com` may
actually be mine**; not proposing to rewrite pushed history over it, just flagging so the record
isn't confusing later.

**Assumption I'm proceeding on:** the no-KYC-vendor question that was floating around is settled —
§8.5 residual risk 3 calls on-device ML a *client-mandated* trade-off and §1.3 lists vendors as an
explicit non-goal. Treating it as closed and noted as such in the TODO. Say so if that's wrong,
because all 23 person-days of Phase 2 rest on it.

**Next:** the three authored gaps (zeroisation policy — after F1; TLS/certificate handling; the
Block E checklist), then P0-7.0. Raising **OQ-7** (brand assets) and **OQ-3** (target markets) with
the client today — OQ-7 gates P0-7.0's first box, and OQ-3 is what's holding box 9 here.
