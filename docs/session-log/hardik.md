# Session log — Hardik

Newest first. Conventions in [`README.md`](README.md).

---

## 2026-08-07 — Twilio Verify live on dev; P1-1.0 client scope finished; the OTP flow still can't actually be run

**Branches:** `feature/P1-1.0-signup-login-reset`, `feature/P0-3.0-baas-setup`
**Landed:** nothing merged — both branches pushed, neither has a PR yet.

**Twilio Verify is configured on the dev Supabase project.** Verify Service `bluesmoke-dev`
(`VA193a790c…`, SMS, Fraud Guard on), wired into Auth → Providers → Phone. Details and caveats
are in [`supabase/README.md`](../../supabase/README.md) on the P0-3.0 branch rather than repeated
here. That closes the `P1-1.0` Method B Twilio box and the "blocked, no Twilio account" line that
had been sitting in P0-3.0's notes.

**The trap, if you configure phone auth on staging or prod later:** Supabase's SMS-provider
dropdown offers both **"Twilio"** and **"Twilio Verify"**, and they are different integrations.
Plain "Twilio" wants a Messaging Service SID (`MG…`) and has Supabase generate the OTP itself;
spec §1.2.1 requires the Verify integration, where Twilio generates and checks the code. Picking
the wrong one leaves you with a form that has no field your `VA…` SID fits into. I had it set to
the wrong one and didn't notice until the field labels stopped matching the credentials I had.

**Decided, and why — refactored `P1-1.0` onto the `AuthClient` abstraction before adding
anything to it.** The screens from the previous session called `api.ts`, which called
`@supabase/supabase-js` directly. The execution brief's §3.5 rules that out precisely because
`P0-3.0` hasn't merged, and §7 lists it as an automatic review-reject. Doing the refactor first
meant Method B, password reset, and every test after it inherited the right shape instead of
compounding the violation. `client.ts` / `mockAuthClient.ts` / `supabaseAuthClient.ts` /
`AuthClientContext.tsx`, with the two deviations from the brief explained in the commit body.

**Blocked / needs someone else:**

- **The phone-OTP flow is configured but has never actually been run.** Three things stand
  between here and a real SMS round-trip, none of them UI work: (1) `supabaseClient.ts` reads
  `process.env.SUPABASE_URL`, but Metro doesn't populate `process.env` in React Native — there
  is no env-injection mechanism in this project yet; (2) `.env.example` is a leftover from a web
  scaffold and declares `VITE_`-prefixed names that don't match what the code reads; (3) this
  machine has no JDK, no `ANDROID_HOME`, no Android SDK, and is Windows, so neither platform can
  build. **The screens being "done" and the flow being testable are further apart than the
  checkboxes suggest.**
- Resend SMTP still waiting on DNS domain verification — blocks the password-reset email path
  and the live-signup version of the RLS proof.
- Twilio is on a 30-day trial, so SMS only reaches numbers verified in the Twilio console. Worth
  knowing before someone reads a failed send to an arbitrary number as a broken integration.

**Gotchas worth stealing:**

- **This machine is a third distinct environment**, matching neither the P1-1.0 brief's §2
  (Windows with tooling) nor Sadin's 2026-08-06 note that the build machine is now macOS.
  Neither `git` nor `node` was installed at all; both went on via `winget`, along with `gh`.
  **Check `git --version` / `node --version` before trusting either environment description.**
- The **Twilio console's Verify → Services page kept bouncing to an upgrade interstitial** on the
  trial account — four attempts, from both the old and new console URLs. Creating the service
  worked; only the list view was gated. If it happens again, `GET https://verify.twilio.com/v2/Services`
  with account SID + auth token returns the SID directly and skips the console entirely.
- **Two auth-token hygiene items still open:** the Twilio Auth Token should be rotated (it was
  exposed in a screenshot), and the Supabase config should use a scoped API Key rather than the
  account-wide Auth Token, which Twilio's own console recommends against.

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
