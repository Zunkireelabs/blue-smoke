# Workstream — walk the app end-to-end, map the flows, finish the design pass

**Opened:** 2026-08-08 · **Runs parallel to** P1-4.0 (BLE) · **Touches no file P1-4.0 touches**

Docs, dashboard config, SQL, and screen styling. Deliberately collision-free with the BLE work.

---

## Why

The app boots and runs, but **no one has ever walked it end-to-end**. Two gates block a manual
tester, each blocked for a different reason, and they keep getting discussed as one problem:

1. **Auth.** Twilio is on a 30-day trial on dev — SMS delivers only to numbers verified in the
   Twilio console. Email is worse: no custom SMTP, and a single test signup already hit
   `429 over_email_send_rate_limit` (`supabase/README.md`).
2. **The age gate.** `selectStack()` (`src/app/navigation.tsx:76-96`) reaches `Home` only when the
   newest `verifications` row for the user has `age_verified = true`.

---

## The map

| Flow | Blocked by | Cost |
|---|---|---|
| `signup(phone) → session` | Twilio trial delivers only to verified numbers | Config, 5 min |
| `signup(email) → session` | No SMTP; rate-limited at one signup | Don't bother — use phone |
| `login → home` | Needs an `age_verified` row | One seeded row, 5 min |
| `signup → persona → verified → home` | **Structural break — see below** | P2-8.0, own brief |

### Why Persona cannot complete today — this is not a config problem

`PersonaVerificationScreen` launches `Inquiry.fromTemplate(templateId)` with **no user linkage of
any kind** (`src/features/verification/personaConfig.ts`), so Persona has no idea whose inquiry it
is. The webhook then looks up the `inquiry_id`, finds nothing, and 404s
(`persona-webhook/index.ts:148-155`) — it only ever `UPDATE`s a row that `create-inquiry` was meant
to write. And `create-inquiry` returns **501 on purpose** (`create-inquiry/index.ts:90-105`): spec
§6.6 lists the Persona API request shape, the `reference-id` convention and the `min_age`
enforcement point as things not to guess, and a stub returning a fabricated inquiry id "would let
the app appear to work while verifying nobody."

**The webhook cannot know which user an inquiry belongs to, because nothing ever told it.** That is
increment 1, which the spec itself calls the shape that cannot be secured. Increment 2 (P2-8.0)
closes it.

> ### 🔴 More important than anything else in this file
> Even with the whole chain working, Persona's `approved` means *"passed the checks the template was
> configured with"* — **not** *"is over 18"*. Spec §6.6 item 3: a template with no age requirement
> returns `approved` for a fourteen-year-old, and every control we have would function perfectly and
> still open the gate. **The age gate rests on a dashboard checkbox nobody has verified.** Settle
> this before building anything on top of it.

---

## Track A — unblock the walkthrough (~20 min, zero app code)

- [ ] **A1. Test OTP, dev only.** Dashboard → bluesmoke-dev → Authentication → Providers → Phone →
      "Test Phone Numbers and OTPs". Register one pair (e.g. `9779800000000 = 123456`). Set
      `SMS_TEST_OTP_VALID_UNTIL` ~2 weeks out so the bypass expires by itself.
      Mapped numbers skip SMS and accept only the mapped code; unmapped numbers keep using Twilio.
      Already the repo's documented intent — `supabase/README.md`: *"the way around the trial
      restriction… **Never set this on prod:** a registered pair is a permanent auth bypass for that
      number."* The real client path runs unchanged; nothing is stubbed.
      **Closes P1-1.0's last open checkbox.**
- [ ] **A2. Apply the two pending migrations** (`20260807090000`, `20260807120000`) to dev, then run
      the five `supabase/tests/*.sql` proofs.
      Not housekeeping: until the first is applied, dev still carries `insert_own_verifications`, so
      **any user who can log in can self-assert `age_verified = true`**. Auth works now, so that is
      reachable, not theoretical.
- [ ] **A3. Seed one verified row** as service role (the anon key cannot, by design):
      ```sql
      insert into verifications
        (user_id, age_verified, provider_status, outcome_reason, method, app_version, platform)
      values
        ('<test user auth.users.id>', true, 'approved', 'pass', 'persona-v1', 'dev', 'ios');
      ```
      `method`, `app_version`, `platform` are NOT NULL with no defaults; `age_verified` defaults to
      `false` so it must be set explicitly. A **fixture, not a bypass** — it exercises the real gate,
      and the same row satisfies `issue-device-session`'s server-side check
      (`issue-device-session/index.ts:113-116`), so it stays coherent when P1-4.0 lands.

---

## Track B — flows and design

- [ ] **B1. `docs/FLOWS.md`** — every screen, transition and dead end, read out of `selectStack` and
      the screen files rather than from memory. Five stacks (`boot`/`auth`/`pending`/`verify`/`home`),
      the deep-link route, and **the states with no exit** — where the DoD's "error states have a
      user-visible recovery path" is currently unmet. Two already found:
      - `SignupScreen`'s `checkEmail` branch is a dead end with no navigation — stranded until an
        email arrives that, with no SMTP, may never.
      - `VerificationPendingScreen` polls forever, because `create-inquiry` is 501 and no outcome can
        land.

      Doubles as the input to P1-2.0 (onboarding) and as the punch list of missing recovery paths.

- [ ] **B2. Finish the design-system migration — 8 screens.** `src/shared/ui/` already has tokens and
      8 primitives (`Screen`, `Text`, `Button`, `TextField`, `Card`, `EmptyState`, `ErrorState`,
      `LoadingState`) with contrast, touch-target, dynamic-type and token-only guards (P0-7.0,
      `eea907f`). Only `PhoneInputScreen` and `OtpEntryScreen` were restyled. Still on raw hex:
      ```
      auth/AuthMethodChoiceScreen  auth/LoginScreen      auth/SignupScreen
      auth/CountryPicker           auth/PasswordResetRequestScreen
      auth/ResetPasswordConfirmScreen
      verification/PersonaVerificationScreen            devices/HomeScreen
      ```
      One PR per flow, not one wide diff. Reuse the existing primitives; needing a ninth is a finding
      to raise, not to invent.

- [x] **B3. Establish whether the token-only guard actually reaches those 8 screens.** **Answered on
      the Day-9 audit: it does not reach them.** Both source-scanning guards call
      `listSourceFiles('src/shared/ui')` — the kit directory only
      (`tokenOnlyGuard.test.ts:18`, `contrastCompleteness.test.ts:20`). Nothing under
      `src/features/**` is scanned, so **every one of the 8 screens can carry raw hex while the
      guard reports green.** That is the false-green shape this box suspected, confirmed.
      *Not fixed here — widening the guard's scope would fail the build on the 8 screens
      immediately, so it belongs with **B2**: migrate the screens, then widen the guard in the same
      change. Doing it the other way round just produces a red build nobody can merge.*

> **Constraint: OQ-7 is open.** Brand assets have never arrived and `tokens.ts` says the palette is
> provisional. This pass is **structural** — get every screen onto tokens and primitives so a later
> palette swap is a one-file change. Do not spend the day choosing colours a brand kit will
> overwrite. The contrast-pair completeness guard exists so that swap stays safe.

---

## Later — P2-8.0, its own brief, after P1-4.0

Implement `create-inquiry` (server-side Persona API call, inquiry bound to `user_id` via
`reference-id`, pending row written, handle returned); switch the app off `Inquiry.fromTemplate`;
deploy `persona-webhook` and register its URL + secret with Persona.

**Confirm before writing that brief — any one blocks it:** (1) do we hold a Persona API secret key,
and does the account permit server-side inquiry creation (OQ-11, developer-owned account)? (2) the
`min_age` checkbox 🔴; (3) §6.6 items 2 and 4 remain unspecified.

> **A shortcut considered and rejected.** Persona supports a client-set `reference-id`, so the app
> could pass `user.id` from the client and let the webhook resolve it — no `create-inquiry` needed.
> It works. It also lets a client nominate *which user* gets verified, so user A could complete a
> real ID check against user B's account and verify B without B ever showing ID. That is exactly the
> hole §6.2 cites for moving inquiry creation server-side. A day saved for a shipped auth bug.

---

## Not to be done

- **Wiring `mockAuthClient` into the app.** It cannot work — it creates no Supabase session, so
  `useSessionStore` stays `signedOut` and the navigator never leaves the auth stack. It would change
  only the screens' own local text. Verified, not assumed.
- **A dev-bypass env flag.** It would need adding to `babel.config.js`'s inline `include` list,
  making it a build-time constant that ships unless someone remembers to strip it.
- **Relaxing RLS on `verifications`, or making `selectStack` treat unknown as verified.**
- **Test OTP on staging or prod.**
- **Picking brand colours while OQ-7 is open.**

---

## Verification

1. Sign up on the simulator with the test number and `123456`; confirm a real session
   (`useSessionStore` → `signedIn`) and the navigator leaving the auth stack.
2. `npx supabase migration list --linked` shows all five matching; the five proofs pass against dev.
3. As a normal authenticated user, attempt to insert a `verifications` row for yourself → denied.
4. After seeding, the app reaches `HomeScreen`. **Then delete the row and confirm it falls back to
   the Persona screen** — that is what proves the gate does the work, not the seed.
5. Launch the Persona modal, complete a sandbox capture, confirm no crash and that it parks on
   pending. The webhook 404 is the expected, documented gap.
6. `npm test` (the guards run there), `npm run lint`, and a screenshot of each restyled screen in
   light and dark.

---

## Open blockers this does not solve

- **OQ-6** — the firmware team still has not seen §4, now v1.8, on day 9. Most likely item to
  invalidate finished work.
- **OQ-11** — Persona acceptance, DPA, per-inquiry cost. Gates P2-8.0.
- **OQ-7** — brand assets. Constrains Track B to structural work.
- **`min_age`** — the checkbox the whole age gate rests on.
- **Android has never been compiled** (no JDK, no SDK, `android/app/build` absent), and both
  platforms on physical hardware are in the Definition of Done.
