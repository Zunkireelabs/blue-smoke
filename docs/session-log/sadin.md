# Session log — Sadin

Newest first. Conventions in [`README.md`](README.md).

---

## 2026-08-07 — P1-1.0 client-side scope substantially complete; caught an abstraction violation from my own prior session

**Branches:** `feature/P1-1.0-signup-login-reset`
**Landed:** 3 commits pushed to the feature branch (not yet merged to `stage`/`main`):
refactor to the `AuthClient` abstraction, auth-choice + Method B phone/OTP screens, password
reset request/confirm + deep-link config.

**Decided, and why:** the 2026-08-06 foundation/signup/login commits had `SignupScreen`/
`LoginScreen` call `api.ts`, which called `@supabase/supabase-js` directly — exactly what the
P1-1.0 execution brief's §3.5 rules out, and precisely because `P0-3.0` is still unmerged
(`feature/P0-3.0-baas-setup` isn't an ancestor of this branch). Refactored to the `AuthClient`
interface (`client.ts`) with `supabaseAuthClient.ts` / `mockAuthClient.ts` implementations and
`AuthClientContext.tsx` as the composition root, before adding anything else. Two deliberate
deviations from the brief, both explained in the refactor commit body: result types instead of
`Promise<void>` on three methods, and a real (lazily-configured) `supabaseAuthClient` instead of
the brief's suggested hardcoded `throw new Error('P0-3.0')` stub — the latter would need deleting
the moment P0-3.0 lands, the former already works then with no further change.

Also added `confirmPasswordReset` to `AuthClient` — not in the brief's §3.5 interface sketch, but
without it the reset-link deep link lands the user in the app with nothing to do. Flagged in
`client.ts` rather than silently bolted on.

**Blocked / needs someone else:**

- Twilio Verify configuration itself (P0-3.0) — Method B's client-side flow is built against the
  `AuthClient` abstraction and works with the mock, but can't be exercised against a real phone
  number until that lands.
- Nothing in this task can be run on a physical device or simulator from this machine — typecheck/
  lint/test only. Deep-link config (URL scheme in `Info.plist`/`AndroidManifest.xml`, RN `linking`
  config) is therefore unverified, not untested-in-principle. Left unticked in `TODO-phase-1.md`
  where the brief's own DoD says to.

**Gotcha worth stealing:** the 2026-08-06 entry above says the build machine is now macOS with
Node/git already present. **This session ran on a third machine** — Windows, with neither `git`
nor `node` installed at all, not even the PowerShell-workaround Windows the P1-1.0 brief's §2
describes. Installed both via `winget` (`Git.Git`, `OpenJS.NodeJS.LTS`) before anything else was
possible. Worth checking `git --version` / `node --version` before assuming *either* the brief's
Windows section or yesterday's macOS note describes whatever machine you're actually on — three
different environments in three days on one small team.


## 2026-08-06 — §4 and §5 audited before anyone builds against them; P0-1.0 landed

**Branches:** `feature/P0-1.0-architecture-signoff`, `feature/P0-2.0-ble-protocol`,
`fix/ci-promotion-guard-branch-prefixes`
**Landed:** PR #5, #6, #7 into `stage`, all CI green

**Six defects found in the spec, in two sittings.** All of them would have surfaced during
integration, which is the most expensive place to find anything. Details are in the v1.2 and v1.3
changelog rows; the ones worth knowing about without reading the diff:

- **§4.5 `K_sess` was underivable device-side.** `info` bound `user_id` and an absolute
  `expires_at`, and the handshake sends neither. The firmware could not have derived the same key —
  *every* authentication on real hardware would have failed. Fixed by binding only what the device
  actually receives, and moving `sessionExpiry` to a monotonic uptime counter so the device needs
  no clock at all.
- **§4.6 command tags weren't connection-scoped.** A captured `UNLOCK` would have replayed in any
  later session whose counter hadn't passed it — **without the attacker needing the key**. The tag
  now binds the connection nonce.
- **§5.3 ownership squat.** Any authenticated user could INSERT an ownership row for any unclaimed
  device, take the single active-owner slot, and lock the real owner out permanently — again with
  no `K_sess` required. Client INSERT/DELETE denied; ownership is created service-side only.
- **§5.2.4 wouldn't have migrated at all.** `unique (...) where (...)` isn't valid Postgres as an
  inline table constraint. `supabase db push` would have failed on the first run of P0-3.0.

**Decided, and why — `protocolVersion` stays `0x01` through all of this.** §4 has never been sent
to the firmware team and nothing implements it, so a bump would mint a version no party speaks.
**That exemption ends at M2.** Once §4 is acknowledged, changing it means bumping and notifying in
writing. Noted in the changelog, in `protocol.ts`, and in the P0-2.0 section so the next person
doesn't have to infer it.

**The lesson that generalises:** §2 is narrative and drifts — the P0-1.0 audit found four
divergences there. But v1.2/v1.3 showed the normative sections aren't automatically safe either;
they were internally consistent and still wrong. **Don't implement from §2. Do re-derive §4/§5 from
first principles before building against them.**

**Blocked / needs someone else:**

- **`ARCHITECTURE-SIGNOFF.md` is written and has never been sent.** The "approved by all
  stakeholders" box is ticked on internal authority. It gates Phase 1, and Phase 1 work is already
  on `stage`.
- **OQ-6 — nobody has contacted the firmware team.** Days 3–5 was the review window in the
  roadmap; it passed unused, so **M2 has slipped** and can't be recovered by working harder on our
  side. This blocks the last three P0-2.0 boxes, and `P0-2.5`/`P1-4.0`/`P3-2.0` are all now
  building against an unratified contract.
- Both go out with the same client message. Neither is an engineering problem.

**Gotchas worth stealing:**

- **The build machine is now macOS, not Windows.** Every PowerShell / BOM / `git`-not-on-PATH
  workaround in the `P0-4.0` and `P1-1.0` execution briefs (§2 of each) is stale — **those briefs
  now describe a machine that doesn't exist.** Current reality: Node v24.12.0, npm 11.6.2,
  Xcode 26.6 — but **no CocoaPods, no simulator runtimes, no `java`, no `ANDROID_HOME`**. So
  neither platform builds today, for entirely different reasons than before.
- `node_modules` had never been installed here. `npm ci` first, or `typecheck`/`lint`/`test` all
  fail with `command not found` and look like something worse than they are.
- **The workflow is `feature/* → stage → main` now**, enforced by `promotion-guard`. **`CLAUDE.md`
  still says "All PRs target `main`" and is wrong.** Needs fixing.
- `promotion-guard` rejected `chore/*` and `docs/*` outright, which left `chore/add-codeowners`
  pushed and unmergeable. Fixed in PR #7 — `main`'s restriction untouched.
- **The `62` sub-task denominator in `TODO-phase-0.md` was never right.** The seven PRD tasks hold
  **76** boxes and always have. Corrected, with the basis written down. Worth re-counting the other
  phase files rather than trusting their headers.

**Still not written down anywhere:** the client-supplied hardware findings — the ICWorkshop
PowerWriter PW200, its pinout, the safety warnings, and the fact that its stock firmware does
**not** speak §4. That belongs in `docs/hardware/client-supplied-hardware.md`. Until it exists,
those facts live only in a chat log, which is exactly the failure this journal is meant to stop.
