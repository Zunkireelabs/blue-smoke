# Resume — Track A, blocked on app sign-in

Paste the fenced block below into a fresh Claude Code session to pick this up exactly where it
stopped. Committed rather than left in a scratch dir so it survives a machine change.

Written 2026-08-09 ~01:35, at `1848067`.

Delete this file once the app can sign in and Track A's checklist is finished.

---

```
I'm Sadin, planner/tech lead on Blue Smoke: /Users/sadinshrestha/Projects/blue-smoke
Branch: chore/integrate-auth-db-persona · HEAD 1848067 · NOT pushed · tree clean
Day 10 of 30.

Read first, in this order, then confirm your understanding and WAIT — do not start work:
  1. CLAUDE.md
  2. docs/execution-briefs/TRACK-A-dev-walkthrough-enablement.md  ← especially "Session log
     — 2026-08-09, first attempt", which has the full elimination table
  3. docs/FLOWS.md §5.1 (SD-4, SD-5) and §4.1 (the trap)
  4. supabase/README.md — the "Applied" section and the db push warning

## The one blocker

The app cannot sign in. Email login shows "We couldn't reach the server. Check your
connection and try again."

That message is runSafely's catch-all (supabaseAuthClient.ts:45). It fires ONLY on a
non-AuthError exception — a real transport failure is wrapped by auth-js as an AuthError
and takes the other branch, which renders "Incorrect email or password". So something
throws outside auth-js's error handling. Do not go down a connectivity path: the app can
provably reach Supabase (see below).

Already ruled out — each tested empirically last session, do NOT re-test:
  - env not inlined        → bundle has the literal URL + 208-char anon JWT
  - simulator networking   → fetch INSIDE the app → HTTP 401 from /auth/v1/health
  - anon key wrong         → POST to /token INSIDE the app → HTTP 400 invalid_credentials
  - react-native-url-polyfill missing → every new URL() in auth-js is a browser path,
                             disabled by detectSessionInUrl: false
  - Keychain pod unlinked  → podspec registered, Manifest.lock current, 60 refs in
                             Pods.xcodeproj  (an earlier `strings` check said otherwise —
                             it was WRONG, the control modules also showed zero)
  - server saw the attempt → auth.sessions = 0, refresh_tokens = 0, last_sign_in_at null

Prime remaining suspect: authKeychainStorage.setItem (src/shared/lib/authKeychainStorage.ts
:30-36). It is the only app-specific code injected into supabase-js, it runs inside
_saveSession AFTER the token request, and a Keychain failure is not an AuthError so auth-js
rethrows it. Its ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE is documented at :19-22 as
an ASSUMPTION about devices with no enrolled biometrics — a simulator has neither biometrics
nor a passcode, and that assumption has never been tested. NOT confirmed: it does not by
itself explain zero server-side sessions.

## How to finish the diagnosis in one tap

auth-js resolves fetch lazily (resolveFetch returns `(...args) => fetch(...args)`), so
patching globalThis.fetch over the Metro CDP endpoint IS observed by supabase-js.

  1. Start Metro yourself in a background task so you can read its output:
       npx react-native start --port 8081
     (RN 0.86 sends app console logs to DevTools, NOT Metro stdout — Metro alone won't
     show you the error.)
  2. curl -s http://localhost:8081/json/list  → take webSocketDebuggerUrl
  3. Connect with ws AND an `Origin: http://localhost:8081` header — the proxy 401s without
     it. Runtime.evaluate with awaitPromise does NOT work (Hermes promises aren't awaited by
     CDP): write results to a global and read it back in a second evaluate.
  4. Wrap globalThis.fetch to push request URLs into globalThis.__calls, then attempt a login
     IMMEDIATELY — the patch does not survive a Fast Refresh reload.
  5. If /token appears in __calls → the throw is AFTER the request → Keychain.
     If it never appears → the throw is BEFORE it → getSupabaseClient() or createClient.

A working CDP script from last session is described in the brief; rewrite it, it's ~40 lines.

## Try this BEFORE debugging

Phone OTP. Test OTP is configured and it's the flow that ships — different code path from
email, and it may just work:
  Continue with Phone → 4152127777 → code 123456
If it works, we're past the gate: seed the verified row and walk the rest.

## Environment facts

- Supabase dev project: hejwrhijrztgdysycvto (bluesmoke-dev). NEVER staging/prod.
- All 5 migrations applied to dev. The age-gate hole (insert_own_verifications) is CLOSED
  on dev and was confirmed live before closing. STAGING STILL HAS IT — flag, don't fix.
- ⚠️ Do NOT run `npx supabase db push` against dev. Dev's migrations were applied via MCP,
  which stamps version with the time of application, not the filename. The CLI compares
  versions, concludes none are applied, and re-runs a bare `create table` that fails.
  Details + two fixes in supabase/README.md.
- Test OTP (dashboard → Auth → Phone): 14152127777=123456,14152127778=123456. The leading
  country-code 1 is mandatory. PhoneInputScreen:51-55 runs libphonenumber isValid() BEFORE
  calling Supabase, so 555 numbers and +447700900xxx are rejected client-side and never
  reach the server — which looks exactly like "test OTP is broken".
- SMS OTP Expiry was 60s under a 30s app resend cooldown. Raise to 300 on dev if not done.
- A user exists: 29faa6cb-c070-437f-9000-a9751f627e98 (email, auto-confirmed, no phone).
- NO verifications row seeded yet, deliberately — see the walkthrough order below.
- Supabase MCP: authorize with mcp__supabase__authenticate. It connects as postgres with
  rolbypassrls, so you can seed/delete rows directly. The FIRST authenticate call last time
  returned "Unrecognized client_id" — just call it again, a second call worked.
- `npx supabase login` does NOT work in this environment (non-TTY). Don't try.

## Tooling gotchas — these cost an hour last time

- cliclick TAPS on the simulator were unreliable: a coordinate model derived from the
  AppleScript window bounds (1117,34 395x850) did NOT land correctly. Verify any tap with a
  known-navigating control before trusting it, or just ask me to tap.
- cliclick TYPING into an RN TextInput opens the React Native dev menu. Don't. Ask me to type.
- Do NOT call TurboModules directly via CDP (e.g. RNKeychainManager) — it crashed the app.
  Read-only probes only.
- Screenshot: xcrun simctl io booted screenshot out.png, then Read it.

## Walkthrough order once sign-in works — do NOT skip step 2

  1. Sign in.
  2. Observe the `verify` stack BEFORE seeding anything. This is FLOWS.md §4.1 — a declined
     user has no sign-out, no support and no working retry, and nobody has ever seen it on a
     device. It is the single most important observation left.
  3. Seed the verified row (execute_sql via MCP):
       insert into verifications
         (user_id, age_verified, method, app_version, platform, provider_status, outcome_reason)
       values ('29faa6cb-c070-437f-9000-a9751f627e98', true, 'persona-v1',
               'dev-seed-track-a', 'ios', 'approved', 'pass');
  4. Confirm Home renders.
  5. DELETE the row and confirm the app falls back to Persona. Without this you've proved the
     seed worked, not that the gate does.
  6. RLS proof with a SECOND user's JWT (Track A step B3) — five assertions, listed in the
     brief. Never done for `verifications`, and it's in the Definition of Done.
  7. Settle SD-2: does the bluesmoke://reset-password deep link's target render, or does the
     recovery session flip signedIn and unmount the auth stack first? Unverified; the one
     claim in FLOWS.md that source reading cannot resolve.

## Rules

- Docs only unless I say otherwise. The 8 dead ends are RECORDED, not fixed — six want the
  same fix and patching them one screen at a time gives six different answers.
- No src/ changes without asking. No pushing — I push when the app works.
- NEVER add Co-Authored-By: Claude or any Anthropic attribution to a commit.
- Commit with `git commit -F -` heredocs. Never --no-verify. Never force-push main/stage.
- Don't run `npm ci` or `supabase start` (no Docker; port 54322 is another project).
- Baseline to preserve: typecheck 0 · lint 0 errors / 70 warnings · 274 tests / 30 suites.

## Still blocked on me, unchanged — ask, don't solve

  1. 🔴 Screenshot of the Persona template's AGE REQUIREMENT setting. `approved` means
     "passed the template's configured checks", NOT "is over 18". Gates all of F6.
  2. 🔴 OQ-12 — the serial_hash salt. A guess fails SILENTLY.
  3. OQ-2 — manual-review owner, channel, SLA. Nine flows point at it.
  4. OQ-7 — brand assets, before any visual design pass.

Start by telling me what you understand and what you'd do first. Then wait.
```
