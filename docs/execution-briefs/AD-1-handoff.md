# AD-1 Admin Panel — Handoff Note

**For:** whoever executes the `AD-1-*` briefs.
**From:** the planner/reviewer session.
**Date:** 2026-08-30.

This orients you. The **plan of record** is `~/.claude/plans/clever-purring-umbrella.md` and the
**working task list** is [`../project-roadmap-todos/TODO-AD-1-admin-panel.md`](../project-roadmap-todos/TODO-AD-1-admin-panel.md).
Read both before touching a brief.

---

## 1. What AD-1 is

An operator web panel — device fleet, user management, verification audit. It is PRD add-on **AD-1**,
**commissioned 2026-08-30**. Until now the repo said "do not build add-ons"; the first brief
(`AD-1-M1a`) flips that, for AD-1 only.

**What the client asked for on top of the PRD line:** suspend / ban / re-enable an account, delete a
user, admin-triggered password reset, and app-download figures. All folded into scope.

**What was asked for but is NOT being built:** a manual "approve this user's age verification"
button. Today `persona-webhook` is the only writer of `age_verified` (spec §6.4.1). A wrongly-
declined user is recovered via a fresh Persona inquiry approved in **Persona's console**, which
flows back through the existing signed webhook. "Approve / unapprove" was built as *account status*
only.

## 2. How the work is split across two repos

| | Repo | Why |
|---|---|---|
| **Frontend SPA** | `web-admin` (separate git repo, `/Users/urbishrestha/Desktop/Project/web-admin`) | Keeps this repo's `promotion-guard` CI and lint baseline untouched. Already scaffolded — Vite + React + TS, sign-in + TOTP screens, typed `adminApi`, four read-only screens. Committed at `3ec0ce2`. |
| **Backend** | **this repo**, `supabase/functions/admin-*` + `supabase/migrations/` | One Supabase project = one ordered, append-only migration sequence. Migrations cannot live anywhere else. |
| **Docs / governance** | **this repo**, `docs/` | Single source of truth. The SPA's README only links back. |

The one seam between the repos is `web-admin/src/lib/adminApi.ts` — a typed client over the three
Edge Functions. A contract mismatch there is a runtime error, not a compile error, because the
boundary is HTTP. Keep it in step by hand.

## 3. The three Edge Functions

| Function | Role | JWT verify |
|---|---|---|
| `admin-query` | every read | on (default) |
| `admin-mutate` | account + device actions (M2) | on |
| `admin-admins` | superadmin only: who is an admin (M2) | on |

Each dispatches on a `{ action, payload }` body, shares `_shared/requireAdmin.ts`, and writes one
`admin_audit_log` row per call. This is deliberate: one gate, one audit path, no per-screen function
sprawl.

## 4. The four rules that bound every change

Copied from the task list because they matter more than anything else here:

1. **`persona-webhook` stays the sole writer of `age_verified` / `provider_status`.** No admin
   endpoint writes them, ever.
2. **`inquiry_id` never leaves the server** — no response, no audit row, no view column, no log line.
3. **The customer RLS surface stays frozen** — no `is_admin()` branch on any existing policy. Admin
   access is service-role Edge Functions only. Every existing `supabase/tests/*.sql` proof must
   still pass unchanged.
4. **No raw ID/biometric material exists to expose.** Don't build a UI affordance that implies it
   could.

## 5. Environment facts (verified 2026-08-30)

- Build machine: **macOS**, Node `v24.12.0`, npm `11.6.2`, `git` on PATH.
- **No Deno.** `admin-*/index.ts` files import JSR/Deno specifiers and cannot be run or typechecked
  locally. They are verified by *reading* + by testing the pure `_shared/` modules in Jest + by
  running their SQL against a real Postgres. Same constraint the `P0-3.0` brief worked under.
- **Docker:** unknown — `config.toml` comments say the build machine has none, but the `P0-3.0`
  brief used `docker run`. **Check `docker --version` first** and report. The SQL proofs need a
  throwaway Postgres; if there's no Docker, say so in your report and we decide how to verify.
- `npm run typecheck` does **not** cover `supabase/functions/**` (excluded in `tsconfig.json`). A
  green typecheck says nothing about Edge Function code.
- `npm run lint` has a ruled warning baseline. Do not add `eslint-disable`. Record the count before
  and after.
- Latest migration is `20260807120000_k_dev_accessor.sql`. Nothing newer on any branch. AD-1's
  first migration is a `20260830…` timestamp — but re-check `git log --all -- 'supabase/migrations/*'`
  before picking, and announce the number.

## 6. MFA — resolved: deferred to M2

The project is on **free Supabase**; TOTP MFA (Pro-gated per `config.toml`) is deferred. M1a builds
**Path B**: the `admin_users` membership gate is always enforced (logging in ≠ being an admin), the
second-factor check exists but sits behind `REQUIRE_ADMIN_MFA` (default enforced; set to `false` on
dev for now). The `web-admin` frontend already has the enrollment + challenge screens — they
activate with no frontend change when MFA is switched on later.

Interim posture: password-only admin login. Mitigations — short admin list, `admin_audit_log` on
every action, `disabled_at` for fast lockout. Residual risk "leaked admin password = full access"
is what M2's TOTP closes. Full detail in `AD-1-M1a` §3.

## 7. Working agreement for this workstream

- **One brief = one branch = one PR-set.** Branch name carries the task: `feature/AD-1-m1a-auth-spine`.
- **Push the branch on day one**, empty if need be — that's the claim (`CLAUDE.md`).
- **Do not push to `stage` or `main`.** Promotion is the requester's call.
- **No `Co-Authored-By: Claude` trailer**, no "Generated with Claude Code" line. Repo rule.
- **Tick the TODO boxes in `TODO-AD-1-admin-panel.md` in the same PR** that completes the work.
- **Your report** goes back to the planner session for review. Structure it: what you built, what
  you verified and how (with command output), **Deviations** (anything you did differently from the
  brief and why), and open questions. Do not claim something works that you did not run.
