# Resume — Track A, nearly done (sign-in FIXED 2026-08-09)

The blocker this file existed for is solved. Full account: the **"Session log — 2026-08-09,
second attempt"** section of
[`../execution-briefs/TRACK-A-dev-walkthrough-enablement.md`](../execution-briefs/TRACK-A-dev-walkthrough-enablement.md),
and the matching entry in [`sadin.md`](sadin.md).

One line for the impatient: supabase-js 2.112.0 assigns `URL.protocol` in its constructor, RN's
built-in `URL` is getter-only there, every auth method threw before any request →
`react-native-url-polyfill` installed and imported first in `index.js`. Phone OTP sign-in,
the §4.1 trap, Home-via-seed, gate re-closure, and the five RLS assertions are all verified on
the simulator.

**Delete this file when the last two boxes close:**

1. **B4 / SD-2** — dashboard → Auth → Users → "Send password recovery" to
   `sadinshrestha001@gmail.com`, open the link on the simulator, record whether
   `ResetPasswordConfirmScreen` renders or the recovery session unmounts the auth stack first.
   Update `FLOWS.md` §6 SD-2 and `USER_FLOWS.md` F5.S from "suspected" to a verdict.
2. `npm run lint` — confirm 0 errors / 70 warnings (agent runs were permission-blocked; typecheck
   and 274/274 tests already verified green after the fix).

Environment facts that still matter: dev project `hejwrhijrztgdysycvto` only; test OTP pairs
`14152127777`/`14152127778` = `123456` (leading `1` mandatory); MCP applies migrations to dev,
`db push` is staging-only (version-stamp mismatch — `supabase/README.md`); current app user is the
phone user `4327be3e…`; `verifications` is empty by intent (gate-reclose proof) — re-seed SQL is
in the Track A brief A4.
