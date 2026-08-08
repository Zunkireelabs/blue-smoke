# Resume prompt — Twilio/Supabase phone-OTP end-to-end test

Paste the fenced block below into a new Claude Code session to pick this work up, on this
machine or another one.

Committed rather than left in `scratch/` so it survives a machine change. The narrative
record of the same work is in [`hardik.md`](hardik.md); this file is the operational
hand-off. Keep it updated as the blockers close, or delete it once the flow actually runs.

Written 2026-08-07, updated 2026-08-07.

> ⚠️ **Stale in two ways, still needed for one thing (2026-08-09).** The machine is now
> **macOS + zsh** — every `C:\Users\...` path below is dead. And the app-side sign-in blocker is
> **fixed** (`react-native-url-polyfill`; see the Track A brief's 2026-08-09 log), so the flow
> below is no longer blocked by the app. What this file still owns: the **real-SMS** Twilio Verify
> end-to-end test — test OTP (now live on dev) deliberately does not prove SMS delivery, Fraud
> Guard, or the Verify service config.

---

```
I'm Hardik, working on the Blue Smoke React Native app at C:\Users\Projects\blue-smoke.

**Do NOT start work until I say "go ahead."** Read the context, confirm, raise anything wrong, wait.

## Goal
A real end-to-end test of the Twilio Verify -> Supabase phone-OTP flow: enter a phone number,
receive a real SMS, enter the code, land signed in.

## Read first
- CLAUDE.md
- docs/TECHNICAL_SPEC.md - the phone-OTP section (1.2.1 per the brief; that exact heading does
  not grep, so find it rather than assuming the number)
- docs/execution-briefs/P1-1.0-signup-login-reset.md

## State - verified in code, not just claimed

Branch `feature/P1-1.0-signup-login-reset` (pushed, no PR). All under src/features/auth/:
AuthMethodChoiceScreen, PhoneInputScreen (country picker, libphonenumber-js), OtpEntryScreen
(segmented 6-digit, resend cooldown), Signup/Login, PasswordResetRequest/ResetPasswordConfirm,
client.ts / mockAuthClient.ts / supabaseAuthClient.ts / AuthClientContext.tsx.
8 suites, 23 tests, typecheck + lint clean. **The screens exist - do not rebuild them.**

- `supabaseAuthClient.ts` is a REAL implementation, not the stub the brief asked for. The prior
  session deviated deliberately; reasoning is in the file header. signInWithOtp / verifyOtp
  ({phone, token, type:'sms'}) are correct for Supabase's Twilio Verify integration.
- `AuthClientContext` defaults to `supabaseAuthClient` and `src/app/providers.tsx` uses the
  no-prop form - the composition root ALREADY points at the real backend. Nothing to swap.
- The brief's section 5 checklist still lists real Supabase calls as deferred. It's stale.

## Twilio + Supabase phone auth is CONFIGURED (dev only), as of 2026-08-07
- Twilio Verify Service `bluesmoke-dev` = VA193a790c2c54883cf964f331f96fc46f (SMS, Fraud Guard on)
- Wired into DEV Supabase project hejwrhijrztgdysycvto -> Auth -> Providers -> Phone,
  SMS provider = "Twilio Verify" (NOT plain "Twilio" - different integrations)
- Twilio 30-day trial: SMS only reaches numbers verified in the Twilio console
- Supabase "Test Phone Numbers and OTPs" bypasses SMS on dev (never prod) - useful for the UI
  leg, but it does NOT prove Twilio, so it is not the end-to-end test

## Blockers (all environment, not UI)
1. **No env injection for RN.** src/shared/lib/supabaseClient.ts reads `process.env.SUPABASE_URL`
   / `SUPABASE_ANON_KEY`; Metro does not populate process.env. react-native-config needs native
   Gradle/xcconfig edits that can't be verified without a build; a babel env plugin is JS-only
   and needs no change to supabaseClient.ts. **package.json is a contested shared file - announce
   to Sadin and Anish before adding any dep, and get my call on which approach first.**
2. **.env.example is stale Vite** - declares VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, which
   don't match the un-prefixed names the code reads. No .env exists in the repo; pull the URL and
   anon key from the Supabase dashboard on whatever machine you're on.
3. **The app can't run on the Windows machine.** No java/JDK, no ANDROID_HOME, no Android SDK,
   and no Xcode ever. Bare RN 0.86 with react-native-keychain, ble-plx, vision-camera - so Expo
   Go is out, and a web harness would bypass the Keychain storage adapter (i.e. test something
   other than what ships). **If you are now on a machine with a working Android or iOS
   toolchain, this blocker is gone - say so, it changes the plan below.**

## Agreed plan - two legs
- **Leg 1 (~20 min, no new deps, no Android SDK):** throwaway Node script in the scratchpad using
  the already-installed @supabase/supabase-js - signInWithOtp, pause for the code off my phone,
  verifyOtp, print whether a session came back. Node populates process.env natively, so blocker #1
  doesn't apply. Proves the Verify service, provider wiring, trial allowlist, and phone->session
  path. Does not touch src/, never committed.
- **Leg 2:** get a working native toolchain, fix blockers #1 and #2 for real, run the screens.

## Known defects (found, not yet fixed)
1. `ensureProfileRow` (supabaseAuthClient.ts:50) throws instead of returning an AuthResult - its
   own comment says the failure is non-fatal to the caller, but the code throws and neither
   signUpWithEmail nor verifyPhoneOtp catches it.
2. That throw will likely fire on the email path: with email confirmation on, signUp returns
   session: null, so the profiles upsert runs as anon and the `own_profile` RLS policy
   (id = auth.uid()) rejects it -> unhandled rejection instead of an error state. The phone path
   should be fine (session is live by then).

## Open security items (console work, not repo work)
- Rotate the Twilio Auth Token - it was exposed in a screenshot.
- Switch the Supabase SMS config to a scoped Twilio API Key rather than the account-wide Auth
  Token, which Twilio's own console recommends against.

## Repo/workflow facts
- I am Hardik. userEmail in the harness says sadin@ - ignore it, don't infer identity from it.
  Local git identity on the Windows box is Hardik Phuel <hardik.phuel@nepa.global>; set the same
  on any new machine. Five commits from an earlier session are misattributed to Sadin;
  unresolved, low priority.
- No Claude co-authorship trailer on commits (CLAUDE.md).
- On Windows: git is NOT on PATH - prefix with $env:PATH = "C:\Program Files\Git\cmd;$env:PATH".
  PowerShell 5.1 mangles quotes in `git commit -m` - write the message to a file, `git commit -F`.
  `Out-File -Encoding utf8` writes a BOM into commit subjects - use
  [System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding $false))
- Other branch: feature/P0-3.0-baas-setup (Supabase schema/RLS/Vault + Twilio doc), pushed, no PR.
- Both feature branches are behind main and neither has a PR yet.
- Workflow is feature/* -> stage -> main. CLAUDE.md still incorrectly says "all PRs target main".
- Nothing is gitignored that you need except screenshots (temp_ss/, one of which contains the
  exposed Twilio token - do not commit them) and node_modules (npm install).

## Not this session's problem
Resend SMTP for password-reset email - waiting on DNS domain verification. Separate from phone
OTP; don't block on it.

Confirm you've read this, then tell me whether to start with Leg 1 or the toolchain. WAIT.
```
