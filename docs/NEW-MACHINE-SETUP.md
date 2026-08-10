# Setting up Blue Smoke on a new Mac

**Written 2026-08-10.** If that date is more than a few days old, distrust the "where we left off"
section at the bottom and read `docs/session-log/sadin.md` (newest entry first) instead — that file
is maintained; this one is a snapshot.

This gets a new machine from nothing to *exactly* where the old one was, including the parts that
are **not in git** and that a clone alone will not give you.

---

## 0. The one thing a clone does not carry

**`.env` is gitignored and is not on the remote.** Without it the app throws on startup —
`getSupabaseClient()` and `getPersonaConfig()` both lazy-throw when their variables are missing, by
design. Four variables, values not recorded here on purpose:

| Variable | Where to get it |
|---|---|
| `SUPABASE_URL` | Not secret — `https://hejwrhijrztgdysycvto.supabase.co`. Also in `.env.example`. |
| `SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API. Public by design (it ships inside the app bundle), but still not written down in a repo file. |
| `PERSONA_TEMPLATE_ID` | Not secret — `itmpl_AW8e9aVuRLUbNAUrSemPxwgEU156jS`. 🔴 **This is an age-gate control, not a convenience setting.** See `.env.example`'s runbook and spec §6.6 item 3 before ever changing it. |
| `PERSONA_ENVIRONMENT` | `sandbox`. Do **not** set `production` — see §6 below. |

Easiest safe route: copy `.env` from the old Mac over AirDrop or a password manager. Do not email it,
do not paste it into a chat, and do not commit it — `.gitignore` guards it, don't defeat that.

**Edge Function secrets are server-side and already set** on the Supabase project
(`PERSONA_API_KEY`, `PERSONA_WEBHOOK_SECRET`, `PERSONA_TEMPLATE_ID`). They live in the cloud, not on
your laptop, so there is nothing to migrate — a new machine inherits them automatically.

---

## 1. Toolchain

The old machine, verified 2026-08-10 — match these and nothing will surprise you:

| Tool | Version | Notes |
|---|---|---|
| Node | `v24.12.0` | `package.json` requires `>= 22.11.0` |
| npm | `11.6.2` | |
| Xcode | `26.6` | plus Command Line Tools |
| CocoaPods | `1.17.0` | needed for `npm run ios` |
| Watchman | `2026.07.27.00` | Metro is unhappy without it on large trees |
| Supabase CLI | `2.113.0` | via `npx`, no global install needed |
| Java / `ANDROID_HOME` | **absent** | deliberate — see below |

```bash
# Xcode from the App Store first, then:
xcode-select --install
brew install node watchman cocoapods
```

🔴 **Android has never been compiled on this project.** No JDK, no `ANDROID_HOME`, `npm run android`
has never once been run. Both platforms on physical hardware are in the Definition of Done (spec
§12.1), so this is real outstanding work — but it is *pre-existing*, not something you broke by
setting up a new machine. Don't let a new Mac make you think you caused it.

---

## 2. Clone and install

```bash
git clone https://github.com/Zunkireelabs/blue-smoke.git
cd blue-smoke
npm ci                 # NOT npm install — respects the lockfile
cd ios && pod install && cd ..
```

Then put `.env` in the repo root (§0).

---

## 3. Which branch

⚠️ **`main` and `stage` will mislead you.** `stage` does not contain the current UI work, and `main`
is stale by design between promotions.

```bash
git fetch --all
git checkout feature/P1-3.0-device-scan-and-results
```

That branch is the **head of a five-deep local stack**, all of which were pushed on 2026-08-10:

```
feature/P1-3.0-device-scan-and-results        ← check this out (29 commits ahead of stage)
  └─ feature/P1-2.0-onboarding-and-permissions      (16)
       └─ feature/P2-6.0-verification-surfaces      (9)
            └─ feature/P0-7.0-visual-language       (7)
                 └─ feature/P1-8.0-profile-settings (1)
```

`feature/P2-8.0-server-side-inquiry-creation` also exists on the remote, pointing at the same commit
as the P1-3.0 head. It is the branch for the next task and has no work of its own yet.

---

## 4. Prove the machine is good — four gates

Run all four. **These are the 2026-08-09 baselines; never accept a regression:**

```bash
npm run typecheck      # clean
npm test               # 501 tests / 51 suites
npm run lint           # 0 errors, exactly 70 warnings
npm run bundle:check   # iOS + Android Metro bundle both build
npm run ios            # runs on the simulator
```

`bundle:check` building for Android is **not** the same as Android compiling — it is Metro
bundling JS, which needs no JDK.

On lint: the 70 is a *ruled* baseline, not a target to defend. No `eslint-disable`, and no
`no-bitwise` outside `src/features/ble`, `crypto`, `byteLayout`. Adding a file to those directories
may legitimately raise the count; suppressing a warning to hold the number down is a breach.

---

## 5. Supabase CLI

Only needed for deploying Edge Functions or pushing migrations.

```bash
npx supabase login     # must run in a real terminal — the browser handoff
                       # fails in a non-TTY, e.g. under Claude Code's `!` prefix
```

Then use `--project-ref hejwrhijrztgdysycvto` on commands rather than `supabase link`, which avoids
the database-password prompt.

**Deploy flags are not interchangeable:**

```bash
# Persona sends no Supabase JWT. With gateway JWT checking on, every delivery is
# rejected BEFORE our signature check runs and no verification can ever complete.
npx supabase functions deploy persona-webhook --project-ref hejwrhijrztgdysycvto --no-verify-jwt

# create-inquiry requires the CALLER's user JWT — leave verification on.
npx supabase functions deploy create-inquiry --project-ref hejwrhijrztgdysycvto
```

---

## 6. 🔴 Things that will bite you, learned the hard way

- **`PERSONA_ENVIRONMENT` must stay `sandbox`.** Production is a *separate template object* with its
  own separately-defaulted checks. The sandbox template's `Min 18` was confirmed by hand on
  2026-08-09 — after being found defaulted to **`Min 13`**. Production has had no such confirmation.
- **Keychain entries survive an iOS app uninstall.** `simctl uninstall` does **not** sign a user out.
  `xcrun simctl keychain <device-id> reset` does. This is why onboarding state uses AsyncStorage.
- **The iOS Simulator has no BLE radio**, so `manager.state()` never settles and the Bluetooth gate
  cannot be walked there. Cover it by test and say so — don't fake a walk.
- **Never blind-click simulator coordinates.** A previous session's `cliclick` landed on a WhatsApp
  window. Use `tools/dev/simtap.sh`; if it aborts, stop.
- **iOS ScrollView swallows fast synthetic clicks** — use a slow press.
- **Dev test accounts:** phone `+14152127777` / `+14152127778`, OTP `123456`. Dev only.
- **Two agents in one working directory is a hazard.** A Sonnet session once switched the checked-out
  branch mid-review and nearly swept unrelated edits into its commit. If a writer session is running,
  either wait for its report or isolate one side in a git worktree.

---

## 7. Where we left off — 2026-08-10

### Done and verified this session

- **OQ-2 (manual-review fallback) decided** — mechanism settled in spec §6.4.1; a reviewer approves
  in Persona's console, the webhook writes the row, no new writer and no client boolean. **Still open
  at the client**, who owes three things: a named reviewer + backup, a support email address, and an
  SLA (we propose: target 1 business day, tell users 2). The `TODO-phase-2.md` box is deliberately
  **unticked** — nothing has been agreed.
- **Discovered that no Edge Function had ever been deployed.** `list_edge_functions` returned `[]`
  while all five migrations were applied. The story we had been repeating — "`create-inquiry` returns
  501" — was true of the code and wrong about the system: nobody had ever seen that 501. The real
  reason no dev account can verify was that **`persona-webhook` had no endpoint at all**.
- **The webhook chain is now live and authenticated.** `persona-webhook` deployed with
  `verify_jwt: false`; all three Edge Function secrets set; the Persona webhook created, **Enabled**,
  Kebab, `2025-12-08`, subscribed to `completed`/`approved`/`declined`/`failed`/`expired`/
  `marked-for-review`. A locally computed `openssl` HMAC returned **`400 MISSING_INQUIRY_ID`** rather
  than `401`, proving the stored secret matches Persona's byte for byte.
- **A Persona API key created and scoped to `inquiry.write` alone.** New keys are born with *every*
  permission ticked, including `Access all inquiries` (rule 1 — reads ID payloads) and
  `Create or update inquiry templates`, which could rewrite the confirmed 18+ template.

### The next task

**`P2-8.0` — server-side inquiry creation.** Brief:
[`docs/execution-briefs/P2-8.0-server-side-inquiry-creation.md`](execution-briefs/P2-8.0-server-side-inquiry-creation.md).
It is **7 of 8 boxes done**; the last box is `create-inquiry`'s Persona API call, plus deploying it.

The chain today is `app → (gap) → Persona → webhook → verifications row`. Everything downstream of
the gap works. The gap is that the app creates its inquiry **client-side**, so no pending row is
written, and `persona-webhook` rightly answers `404 UNKNOWN_INQUIRY` rather than attaching an unknown
inquiry to a guessed user.

⚠️ **Still unproven and it fails closed:** the JSON path to `status`
(`data.attributes.payload.data.attributes.status`) has never been confirmed against a real payload —
`persona-webhook/index.ts:110` says so itself. The signature test used a `{}` body and stopped at the
missing id. If that path is wrong, nobody is ever verified and nothing logs an error.

### Open blockers, unchanged

- 🔴 **OQ-12** — the `serial_hash` salt. Blocks DV-6/7/8 and all 119 LK boxes: the actual product.
  Two questions, not one — what the value is, *and* which side computes it (§2.3 Flow B has the app
  compute it; the column is named `server_salt`). **Never invent a salt: a guess fails silently.**
- 🔴 **OQ-2** — waiting on the client, see above.
- **OQ-7** — no brand assets, so `SH-1` splash can't be finished.
- **OQ-1 / OQ-4** — physical hardware, ~Day 26.
- The old **Default API key** in Persona still exists (`Last used at: —`) and should be expired.
