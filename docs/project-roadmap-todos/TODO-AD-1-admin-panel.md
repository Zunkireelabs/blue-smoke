# AD-1 — Admin Web Panel

**Status:** 🟡 **Commissioned 2026-08-30.** Planning done. Execution starting with Milestone 1.
**Commercial record:** [`TODO-addons.md`](TODO-addons.md) §AD-1 · **Roadmap:** [`ROADMAP.md`](ROADMAP.md)
**Plan of record:** `~/.claude/plans/clever-purring-umbrella.md`
**Spec references:** [`../TECHNICAL_SPEC.md`](../TECHNICAL_SPEC.md) — §5 (schema/RLS), §6.4.1 (why
there is no manual verification override), §8.1 (data classes), §8.6 (erasure)

**Progress:** 0 / 3 milestones · **8 / 62 sub-tasks** *(M1a done except the manual admin seed and the `REQUIRE_ADMIN_MFA` dev secret — both blocked on deploy credentials not available in this environment, see the M1a report)*

> **Goal.** A small web panel where an operator can see who is using the product, manage those
> accounts, watch the device fleet, and audit verification outcomes in aggregate — **without ever
> being able to see an ID, a selfie, or set someone's age-verified flag by hand.** The panel is a
> window, not a back door.

**Execution model:** briefs in [`../execution-briefs/`](../execution-briefs/) prefixed `AD-1-`.
Each brief is one branch / PR-set, executed, reported, and reviewed before the next is written.

---

## 🔴 Read this before writing any admin code

Four constraints. Each one is a block, not a review comment.

1. **`persona-webhook` stays the sole writer of `age_verified` / `provider_status`.** No admin
   endpoint writes them. Not behind a role check, not behind a confirmation dialog, not "for
   support". Spec §6.4.1, change-log 1.18, `CLAUDE.md` inviolable rule 3. "Approve / unapprove a
   user" was commissioned as **account status** (suspend / ban / re-enable), nothing more.
2. **`inquiry_id` never leaves the server.** Not in an API response, not in `admin_audit_log`, not
   in a reporting view's column list, not in a log line. An ESLint tripwire enforces this in
   `supabase/functions/admin-*/**`.
3. **The customer RLS surface stays frozen.** No `is_admin()` branch is added to any existing
   policy. Admin access is service-role Edge Functions only, so every existing proof in
   `supabase/tests/` must still pass **unchanged** — that is the evidence.
4. **There is no raw ID or biometric material in the system to expose.** The panel cannot show an
   uploaded document because the image never existed outside the user's phone. Say this to the
   client early — `TODO-addons.md`'s AD-1 hard-constraint paragraph has the wording.

---

## Architecture, in one paragraph

A **Vite + React + TypeScript SPA** in the separate `web-admin` repo, talking to **three new Edge
Functions** in this repo's `supabase/functions/` — `admin-query` (all reads), `admin-mutate`
(account and device actions), `admin-admins` (superadmin only). Each dispatches on an `action`
field, shares one auth gate, and writes one `admin_audit_log` row per action. Same Supabase project
as the mobile app. The SPA **never** calls PostgREST (`supabase.from(...)`), so it never depends on
customer RLS and cannot accidentally read a customer table.

**The auth gate**, in `_shared/requireAdmin.ts`, applied identically by all three:
valid JWT → `aal === 'aal2'` (a TOTP factor was actually *used*, not merely enrolled) →
`admin_users` row exists and `disabled_at is null`. A mobile-app user fails the last two.

**Docs live in this repo, code lives in two.** `web-admin` never restates a decision — it links
back here. A copied paragraph is a paragraph that goes stale.

---

## Dependencies & prerequisites

| Need | Status | Notes |
|---|---|---|
| Supabase **Pro plan** on the target project | ❌ on free — **deferred** | Decided 2026-08-30: build M1 password-only. TOTP enforcement is an M2 item, gated by `REQUIRE_ADMIN_MFA` (default enforced, set `false` on dev for now). No rework — frontend screens already built. |
| `[auth.mfa.totp]` enabled on the dev project dashboard | ❌ deferred to M2 | Enable when on Pro; also worth a dashboard check in case free now allows it. |
| First admin account | ❌ | Seeded manually against the linked project (SQL in the M1a brief). Not in a committed migration. |
| `web-admin` hosting target | ❓ | Vercel / Netlify / Cloudflare Pages. Static SPA. Needed before M1 ships to a URL. |
| App Store Connect / Play Console API credentials | ❌ later | Only needed for M3's automated download sync. Manual entry works without them. |

---

## M1 — Foundation + read-only *(nothing mutating ships)*  ·  0 / 28

Split into two briefs:

### M1a — Commission + auth spine  ·  `AD-1-M1a-commission-and-auth-spine.md`
- [x] Commission docs: un-park AD-1 in `CLAUDE.md`, `TODO-addons.md`, `ROADMAP.md`, spec §1.3, `SCREEN_MAP.md`
- [x] Migration `2026…_admin_identity.sql` — `admin_users`, `admin_audit_log`, append-only trigger
- [ ] First admin seeded manually (documented, not committed) — **pending, not run**; SQL is in `supabase/README.md`
- [x] `_shared/requireAdmin.ts` (pure claims parse + `assertAdmin` DB check) + Jest tests
- [x] `_shared/adminAudit.ts` (`writeAdminAudit`, forbidden-key scrub) + Jest tests
- [x] `_shared/adminCors.ts` — preflight + origin allowlist for browser callers
- [x] `admin-query/index.ts` — dispatch skeleton + the `me` action **only**
- [ ] `config.toml` — `[functions.admin-query]` entry committed; `REQUIRE_ADMIN_MFA=false` secret **documented in `supabase/README.md` but not set** — no deploy credentials in this environment, see report §7
- [x] SQL proofs: `admin_users_write_denial_proof.sql`, `admin_audit_append_only_proof.sql` — written; **not locally verified, no Docker/psql/DB credentials in this environment** (see M1a report §5)
- [x] Auth matrix verified by reading: no token → 401 · customer JWT → 403 · admin JWT → 200 (Path B) · aal1 admin → 403 when `REQUIRE_ADMIN_MFA` unset — **not exercised against a deployed function**, see report §11

### M1b — Read actions  ·  `AD-1-M1b-read-actions.md` *(brief written after M1a review)*
- [ ] `admin-query` actions: `users.list`, `users.search` (exact match only), `users.detail`, `fleet.list`, `auditlog.list`
- [ ] `inquiry_id` ESLint tripwire over `admin-*` + probe test
- [ ] `no select('*')` ESLint rule for `admin-*`
- [ ] Jest response-shape test — seed a `verifications` row with a known `inquiry_id`, assert no read action leaks it
- [ ] `web-admin` screens wired to the deployed function; the four screens show real data
- [ ] SQL proof: a non-admin authenticated JWT gets 403 from every action
- [ ] All pre-existing `supabase/tests/*.sql` proofs pass **unchanged**

---

## M2 — Dashboards + user management *(the mutating milestone)*  ·  0 / 20

- [ ] `2026…_account_status.sql` — `profiles.account_status` (`active|suspended|banned`) + column-privilege lockdown
- [ ] `account_status_write_denial_proof.sql` — a user cannot un-suspend themselves
- [ ] `issue-device-session/index.ts` — add the `account_status` check (age-gate function; own review)
- [ ] `_shared/revokeSessions.ts` — extract from `revoke-device-session`, behaviour-neutral, re-prove with `revoke_session_proof.sql` unchanged
- [ ] `admin-mutate` — `user.suspend` / `user.ban` / `user.reactivate` (sets flag + GoTrue ban)
- [ ] `admin-mutate` — `user.delete` (GoTrue deleteUser; cascade; audit before delete; typed confirm in UI)
- [ ] `admin-mutate` — `user.sendPasswordReset` (default) and `user.setTemporaryPassword` (superadmin, hidden on phone-only accounts)
- [ ] `admin-mutate` — `user.revokeSessions`, `device.forceUnpair` (never touches `device_keys`, never `DELETE`s ownership)
- [ ] `admin-admins` — add / disable / change role / force-signout; only writer of `admin_users` besides seed
- [ ] Per-admin rate limits on every mutating action; optional IP allowlist
- [ ] **Enable TOTP** (deferred from M1): set `REQUIRE_ADMIN_MFA` unset/true on all envs, enable `[auth.mfa.totp]` in the dashboard, verify the web-admin enroll + challenge flow end to end. Needs Pro plan (or free, if the dashboard check shows it's allowed).
- [ ] `web-admin` — account actions on user detail, each with confirmation; UI copy states revoke/unpair does **not** reach the device (offline by design, §5.4.1)
- [ ] Dashboard tiles: total users, active users, verified users, devices

---

## M3 — Verification audit + adoption  ·  0 / 14

- [ ] `2026…_admin_reporting_views.sql` — **new `admin_reporting` schema, NOT added to `config.toml [api] schemas`**; `REVOKE ALL … FROM anon, authenticated`
- [ ] Views: `verification_outcome_stats` (no `user_id`/`inquiry_id`), `verification_attempts_per_user`, `device_fleet` (promoted from M1b inline query)
- [ ] `admin_reporting_not_exposed_proof.sql` — `has_schema_privilege` asserts unreachable by `anon`/`authenticated`
- [ ] CI grep: fail if any `admin_reporting` view selects `inquiry_id` or a bare `user_id` from `verifications`
- [ ] `admin-query` — `verification.stats` (aggregate buckets), `verification.funnel` (**ships a `caveats[]` array** in the response), `adoption.summary`
- [ ] `admin-mutate` — `adoption.recordDownloads` (manual entry) + small table
- [ ] `web-admin` — verification audit charts, funnel screen renders `caveats` verbatim, adoption dashboard
- [ ] Persona decline strings mapped to coarse reason codes before returning (§6.4) — never verbatim
- [ ] **No UI** for `under_18` / `face_mismatch` / `ocr_failed` / `liveness_failed` — `persona-webhook` only ever writes `'pass'` or `'vendor_declined'` (`persona-webhook/index.ts:209`)
- [ ] Follow-up (tracked, not in AD-1 estimate): store-API download sync — blocked on client credentials
- [ ] Follow-up (🔴 verification subtree — coordinate with owner): add `verifications.id` to `persona-webhook`'s audit metadata (§6.4.1); `create-inquiry` emits coarse `verification_started` event

---

## ⚠️ Funnel analysis — what is honestly possible

The PRD line ("where verification attempts drop off") promises more than the data supports.

**Available now** from `verifications` + `audit_log`: inquiries created vs. still `pending` vs.
approved vs. declined; approve/decline rates over time; retry pressure per user (who is reaching the
§6.4 6-attempt lockout); splits by platform and app version.

**Not available, not fakeable:** pre-inquiry drop-off (nothing records it, and the verification
subtree is analytics-blocked by ESLint by design); within-Persona step drop-off (lives in Persona's
own dashboard; pulling it into our DB is forbidden by inviolable rule 1).

**A real step-by-step funnel needs AD-2**, instrumented at the navigation boundary
(`src/app/navigation.tsx`), never inside `features/verification/**`.

---

## ✅ Exit criteria

- [ ] An admin signs in with email + password + TOTP; an `aal1` session is refused everywhere
- [ ] A customer JWT gets `403` from every admin function
- [ ] A user can be suspended, is blocked from obtaining new key material, and is reactivated — proved end-to-end against a test account on a real device
- [ ] Deleting a user cascades correctly and leaves `audit_log` rows with a null `user_id`
- [ ] Every admin action leaves exactly one `admin_audit_log` row, with no `inquiry_id` and no PII
- [ ] No admin response payload contains `inquiry_id` — proved by the automated scan and a manual read
- [ ] Every pre-existing `supabase/tests/*.sql` proof passes unchanged
- [ ] Panel exposes audit metadata only — never raw biometrics *(PRD add-on exit criterion)*
