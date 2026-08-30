# Execution Brief — AD-1 M1a: Commission + Auth Spine

**Task ID:** `AD-1` (Milestone 1, part a) · **Add-on, not a PRD phase**
**Branch:** `feature/AD-1-m1a-auth-spine` — **create it, push it empty on day one** (that is the claim, `CLAUDE.md`). Base it on `stage`.
**Do not push to `stage` or `main`.** Do not rebase onto `main`.
**Status:** ✅ Ready to execute. §3 resolved 2026-08-30: **Path B** — free Supabase, password-only for now, TOTP enforcement deferred to M2. No hardware dependency.

**Read first, in order:**
1. [`AD-1-handoff.md`](AD-1-handoff.md) — the whole workstream in one page
2. [`../project-roadmap-todos/TODO-AD-1-admin-panel.md`](../project-roadmap-todos/TODO-AD-1-admin-panel.md) — the task list and the 🔴 four rules
3. `~/.claude/plans/clever-purring-umbrella.md` — the plan of record
4. `supabase/functions/_shared/revokeRequest.ts` and `supabase/functions/revoke-device-session/index.ts` — **the house style you are matching**: pure logic in `_shared/`, unit-tested; `index.ts` thin
5. `supabase/tests/revoke_session_proof.sql` — the SQL-proof house style (the `CHECK 0` role guard especially)

---

## 1. What this brief delivers

The **security spine** of the admin panel, and nothing more. At the end:

- The repo no longer says "do not build the admin panel".
- `admin_users` and `admin_audit_log` exist, locked down.
- One Edge Function, `admin-query`, with exactly one action: `me`.
- An aal2 admin calling `me` gets their role back and an audit row is written.
- A customer JWT calling `me` gets `403` and (because they hold a valid JWT) an audit row recording the refused attempt.
- The lockdown is proved by SQL.

**Explicitly NOT in this brief** (they are M1b): `users.list`, `users.search`, `users.detail`,
`fleet.list`, `auditlog.list`, the `inquiry_id` ESLint tripwire, the response-shape test, wiring
the `web-admin` screens. Resist scope creep — `me` is enough to prove the gate.

---

## 2. Environment — read before running anything

- macOS. Node `v24.12.0`, npm `11.6.2`. `git` on PATH.
- **No Deno.** You cannot run or typecheck `admin-query/index.ts`. Verify it by reading, and by the
  fact that all its real logic lives in `_shared/` modules that Jest *does* run.
- **Check `docker --version` and report the result.** The SQL proofs need a throwaway Postgres.
  - If Docker is present: use it, pattern in §7.
  - If not: **still write the proof files** (they are deliverables), run what you can against the
    linked dev project inside a `BEGIN … ROLLBACK` you never commit, and flag clearly in your
    report that the proofs are unverified locally.
- `npm run typecheck` does not cover `supabase/functions/**`. Green means nothing there.
- **Record the baseline first:** `npm test` (count of tests/suites), `npm run typecheck` (exit
  code), `npm run lint` (error count + warning count). You must not regress any of them.
- **No `Co-Authored-By: Claude` trailer.** No "Generated with Claude Code" line. Repo rule.

---

## 3. MFA — RESOLVED: Path B (deferred)

**Decision, 2026-08-30:** the project is on **free Supabase**. TOTP MFA is deferred to M2. Build
this brief Path B.

Background: the panel's design wants **forced TOTP** for admins (an admin can delete users; a
stolen password must not be enough). `config.toml` shows `[auth.mfa.totp] enroll_enabled = false`
and the project has no Pro plan, so that enforcement waits.

### Path B — what to build now

Do **not** silently drop the second-factor check — stub it visibly:

- `requireAdmin` still computes `aal` from the JWT and still has the `isSecondFactorSatisfied` branch.
- That branch is gated by `requireMfa`, which `index.ts` sets from
  `Deno.env.get('REQUIRE_ADMIN_MFA') !== 'false'` — **default enforced**. Only an explicit
  `REQUIRE_ADMIN_MFA=false` Edge Function secret relaxes it. Set that secret to `false` on the dev
  project for now; document it.
- The **`admin_users` membership check is never behind a flag.** Always enforced. It is the real
  authority — logging in ≠ being an admin.
- Add a checkbox to `TODO-AD-1-admin-panel.md` M2: "enable TOTP: set `REQUIRE_ADMIN_MFA` unset/true
  on all envs, enable `[auth.mfa.totp]` in the dashboard, verify the web-admin enroll+challenge
  flow end to end."
- The `web-admin` frontend already ships the enrollment + challenge screens. With `requireMfa`
  off, `resolveAuthStage()` will return `ready` straight after password sign-in (no verified
  factor, `nextLevel` stays `aal1`) — the panel just works. When MFA is switched on later, those
  screens activate with no frontend change.

Interim posture to note in your report: password-only admin login; the mitigations are a short
admin list, `admin_audit_log` on every action, and `disabled_at` for fast lockout. The residual
risk is "leaked admin password = full access" — that is what M2's TOTP closes.

Also worth a dashboard check (not blocking): Supabase has changed MFA plan-gating over time. If
TOTP turns out to be available on free after all, say so in your report and we flip `REQUIRE_ADMIN_MFA`
early.

---

## 4. Part 0 — Commission docs (do these first, same branch)

Small, mechanical, and they must land before the code so the repo stops contradicting itself.

### 4.1 `CLAUDE.md`

**"Do not" section** — replace the add-ons bullet:

> - **Build add-ons.** Admin panel, analytics/Sentry, firmware, advanced PAD are out of scope. If asked, name it as an add-on and point at `TODO-addons.md`.

with:

> - **Build add-ons — except AD-1.** Analytics/Sentry, firmware, and advanced PAD are still out of scope; if asked, name it as an add-on and point at `TODO-addons.md`. **The admin web panel (AD-1) was commissioned on 2026-08-30** and is live work — see `docs/project-roadmap-todos/TODO-AD-1-admin-panel.md`. AD-1 being open does **not** open AD-2: a real verification funnel needs client-side events, which is AD-2 by definition.

**"Read before answering" table** — change the `Is this in scope?` row to note the AD-1 exception,
and add a row:

> | Admin panel — anything | `docs/project-roadmap-todos/TODO-AD-1-admin-panel.md`. Read its 🔴 preamble before writing admin code |

**Codebase-areas table** — add a row:

> | **Admin panel (AD-1)** | `supabase/functions/admin-*/**`, `supabase/functions/_shared/{requireAdmin,adminAudit,adminCors}.ts`, and the separate `web-admin` repo | Admin auth, fleet/user/audit reads, account actions. Backend + migrations live in THIS repo. Touches `issue-device-session` once in M2 (account-status check) and refactors `revoke-device-session` behaviour-neutrally in M2 — both need announcing. |

### 4.2 `docs/project-roadmap-todos/TODO-addons.md`

- Header status line: `🅿️ PARKED` → `🟡 AD-1 COMMISSIONED (2026-08-30). AD-2, AD-3, AD-4 remain 🅿️ PARKED.`
- Under `## ⛔ Scope discipline`: note AD-1 has its own working file and that leak-vector #1 ("see a
  list of who's verified") is now commissioned — but the answer to it is still "aggregate counts,
  not a per-user browser of verification detail".
- In the `## AD-1` section: add `**🟡 COMMISSIONED 2026-08-30 — working file: TODO-AD-1-admin-panel.md.**`
  right under the heading; add a subsection **"Added at commissioning, not in the PRD line item"**
  listing suspend/ban/reactivate, delete user, admin password reset, adoption metrics; add a note
  that the **15.0 d / 120 h figure predates both the Persona switch and these additions and owes
  the client a re-estimate**; add the 🔴 paragraph that "approve/unapprove" = account status only,
  not a verification override (cite spec §6.4.1).

### 4.3 `docs/project-roadmap-todos/ROADMAP.md`

Add a `## 7.1 AD-1 — Admin Web Panel (commissioned 2026-08-30, post-core track)` section after §7.
It must state: this is **not one of the 30 days** and must not consume the §1.1 capacity table
while Blocks D/E are open; the M1/M2/M3 shape; the two-repo split; the two touches into shipped
core code in M2 (`issue-device-session`, `revoke-device-session`) both needing announcement; and
the three things AD-1 does **not** do (write `age_verified`; show a real per-step funnel; show an
ID/selfie).

### 4.4 `docs/TECHNICAL_SPEC.md` §1.3

The `❌ Admin web panel *(add-on)*` line → strike it through, note "commissioned 2026-08-30 as
AD-1, separately quoted, outside the 30 days; still a non-goal of the *base* build so nothing in
Phases 0–3 may depend on it", and add "the panel adds no writer of `age_verified` (§6.4.1) and no
policy to the §5.3 RLS surface." Leave the AD-2 line, adding "(AD-1 does not open it)".

### 4.5 `docs/system-design-ux/SCREEN_MAP.md`

In "Out of scope — do not supply refs": remove AD-1 from the list, and add a short paragraph that
AD-1 is commissioned but out of scope *for that document* because the panel is a separate web SPA
on Tailwind/shadcn, not `tokens.ts`, and needs no refs from that workstream.

> Full pre-written content for all five edits is in this session's plan discussion; if anything is
> ambiguous, match the intent above and flag it in your report rather than guessing wording.

---

## 5. Part 1 — Migration `2026XXXX_admin_identity.sql`

**Announce the sequence number** before adding the file (`CLAUDE.md` shared-files rule). Latest
existing is `20260807120000`; check `git log --all -- 'supabase/migrations/*'` for anything newer
on another branch, then use a `20260830…`-or-later stamp.

```sql
-- AD-1 M1a — admin identity + admin audit trail.
--
-- Both tables get RLS ENABLED with ZERO POLICIES — the same deny-all pattern device_keys uses
-- (20260806060200_rls_policies.sql). No client role (anon, authenticated) can read or write
-- either table by any path. Rows in admin_users are created ONLY by:
--   (a) the manual seed documented in the AD-1 M1a brief §6, run once against the linked project;
--   (b) the admin-admins Edge Function (M2), which itself requires an existing superadmin.
-- A mobile-app user has no route to appear here.

create table admin_users (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'admin'
                 check (role in ('readonly', 'admin', 'superadmin')),
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  disabled_at  timestamptz,                      -- set to lock an admin out on their next request
  note         text                              -- who this is; operator-typed, no PII beyond that
);
alter table admin_users enable row level security;
-- NO POLICIES. Intentional and load-bearing.

create table admin_audit_log (
  id               bigserial primary key,
  actor_admin_id   uuid not null references auth.users(id),   -- who acted (or attempted to)
  action           text not null,                             -- 'me' | 'search_users' | 'revoke_sessions' | ...
  target_user_id   uuid references auth.users(id) on delete set null,
  target_device_id uuid references devices(id)   on delete set null,
  outcome          text not null default 'ok'
                     check (outcome in ('ok', 'denied', 'error')),
  metadata         jsonb,        -- filters used, row counts. NEVER inquiry_id, NEVER raw PII.
  request_id       text,         -- correlation id echoed from the caller
  created_at       timestamptz not null default now()
);
alter table admin_audit_log enable row level security;
-- NO POLICIES.

-- Genuinely append-only — the service role bypasses RLS but NOT triggers.
create or replace function admin_audit_log_immutable()
  returns trigger language plpgsql as $$
begin
  raise exception 'admin_audit_log is append-only';
end;
$$;

create trigger admin_audit_log_no_mutate
  before update or delete on admin_audit_log
  for each row execute function admin_audit_log_immutable();

comment on table admin_users is
  'AD-1. Membership is the authority for admin access. RLS-enabled, zero policies. Written only '
  'by the seed and by admin-admins (service role). A mobile user cannot appear here.';
comment on table admin_audit_log is
  'AD-1. Every admin-* Edge Function call writes one row here, including denied attempts by a '
  'valid non-admin JWT. Append-only by trigger. metadata must never carry inquiry_id or PII.';
```

Notes:
- `actor_admin_id` is `not null`. A denied attempt is logged **only when the JWT was valid** (so we
  have a real `auth.users.id`) but the caller is not an admin. A garbage/expired token gets a `401`
  from the platform or from `requireAdmin` and writes nothing — there is no user to attribute it to.
- `outcome` is on the row (not just in metadata) so a denial sweep is a simple `where outcome =
  'denied'`.

---

## 6. Part 2 — First admin seed (manual, documented, NOT committed as a migration)

Add a short section to `supabase/README.md` under a new `## AD-1 admin panel` heading:

```sql
-- Run ONCE against the linked project (Supabase SQL editor, service role).
-- Replace the email with the real first admin's account, which must already exist in auth.users
-- (they sign up through the web-admin panel first — it will 403 until this runs).
insert into admin_users (id, role, note)
select id, 'superadmin', 'bootstrap admin — <name>, 2026-08-30'
from auth.users
where email = '<first-admin@example.com>'
on conflict (id) do nothing;
```

Do **not** put the email in a committed migration — that puts an identity in git. Report that this
step is pending the requester running it.

---

## 7. Part 3 — `_shared/requireAdmin.ts` (+ Jest tests)

Same pure/thin split as `revokeRequest.ts`. Two concerns, kept separate:

```ts
// ── Pure: decode + shape-check the JWT payload. No network, no DB. Unit-tested. ──
export type AdminClaims =
  | { readonly ok: true; readonly sub: string; readonly aal: string; readonly amrMethods: string[] }
  | { readonly ok: false; readonly reason: string };

/** Decodes the JWT payload (base64url) and extracts sub, aal, amr. Never throws. */
export function parseAdminClaims(authorizationHeader: string | null): AdminClaims;

/** True iff claims show a second factor was actually used (aal2 + a totp amr entry). */
export function isSecondFactorSatisfied(claims: Extract<AdminClaims, { ok: true }>): boolean;
```

```ts
// ── Thin: the DB membership check. Takes a service-role client. ──
export interface AdminRow { userId: string; role: 'readonly' | 'admin' | 'superadmin'; }

export async function assertAdmin(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<AdminRow | null>;   // null = not an admin, or disabled
```

```ts
// ── Compose: what index.ts calls. ──
export type AdminGate =
  | { readonly ok: true; readonly admin: AdminRow; readonly userId: string }
  | { readonly ok: false; readonly status: 401 | 403; readonly code: string; readonly loggableUserId: string | null };

export async function requireAdmin(args: {
  authorizationHeader: string | null;
  anonClient: SupabaseClient;      // to validate the token via auth.getUser()
  serviceClient: SupabaseClient;   // to read admin_users
  requireMfa: boolean;             // §3: from REQUIRE_ADMIN_MFA, default true
}): Promise<AdminGate>;
```

**Order inside `requireAdmin`:**
1. `parseAdminClaims(header)` — bad shape → `{ ok:false, status:401, code:'NO_TOKEN', loggableUserId:null }`.
2. `anonClient.auth.getUser(jwt)` — this is what actually validates signature + expiry against the
   auth server. Failure → `401 INVALID_TOKEN`, `loggableUserId: null`.
   - Cross-check: the `sub` from `getUser()` must equal the `sub` from `parseAdminClaims`. Mismatch → `401`.
3. If `requireMfa` and not `isSecondFactorSatisfied(claims)` → `{ ok:false, status:403, code:'MFA_REQUIRED', loggableUserId: sub }`.
4. `assertAdmin(serviceClient, sub)` — `null` → `{ ok:false, status:403, code:'NOT_AN_ADMIN', loggableUserId: sub }`.
5. Otherwise `{ ok:true, admin, userId: sub }`.

`loggableUserId` is what `index.ts` passes to the audit writer for a denied attempt — non-null only
once we have a server-validated `sub`.

**`aal` in a Supabase JWT:** it is a top-level claim (`"aal": "aal1" | "aal2"`), and `amr` is an
array of `{ method, timestamp }`. `getUser()` does **not** surface `aal`, which is why step 1
decodes the payload directly — but that decoded value is only *trusted* after step 2 proves the
token is valid. If the installed `@supabase/supabase-js` has `auth.getClaims()` (verifies via
JWKS and returns `aal`), you may use it to replace steps 1+2 — check the version and say which you
used.

**Jest tests** (`_shared/__tests__/requireAdmin.test.ts`) — cover the pure functions exhaustively:
no header; `"Bearer "` empty; non-JWT string; JWT with 2 segments; valid-shape payload missing
`aal`; `aal1` payload; `aal2` payload with no `totp` in `amr`; `aal2` + `totp` amr → satisfied.
The DB-touching `assertAdmin` / `requireAdmin` are covered by the SQL proof in §9 and by reading;
do not stand up a Supabase mock for them unless it is genuinely quick.

---

## 8. Part 4 — `_shared/adminAudit.ts` and `_shared/adminCors.ts`

### `adminAudit.ts`

```ts
export interface AdminAuditEntry {
  actorAdminId: string;
  action: string;
  outcome: 'ok' | 'denied' | 'error';
  targetUserId?: string;
  targetDeviceId?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
}

/** Pure: validates the entry and strips anything forbidden from metadata. Never throws. */
export function buildAuditRow(entry: AdminAuditEntry):
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; reason: string };

/** Thin: buildAuditRow + insert. Swallows insert errors to a console.error — a failed audit
 *  write must not turn a successful admin read into a 500, but it must be loud. */
export async function writeAdminAudit(serviceClient: SupabaseClient, entry: AdminAuditEntry): Promise<void>;
```

`buildAuditRow` **rejects** (returns `ok:false`) if `metadata`, serialized, matches
`/inquiry.?id/i` or contains a key matching `/dob|selfie|embedding|similarity/i`. Jest-test that:
a clean entry passes; `metadata: { inquiry_id: 'x' }` is rejected; `metadata: { note: 'inquiry_id' }`
(the string as a *value*, not a key) — decide and document which way this goes (recommend: reject,
be conservative).

### `adminCors.ts`

The `web-admin` SPA calls these functions from a browser on a **different origin**, so preflight
matters (the RN app's functions never needed this).

```ts
/** Allowed origins from ADMIN_PANEL_ORIGINS (comma-separated Edge Function secret). */
export function corsHeaders(requestOrigin: string | null): Record<string, string>;

/** If the method is OPTIONS, returns a 204 preflight Response; otherwise null. */
export function handlePreflight(req: Request): Response | null;
```

- Never `Access-Control-Allow-Origin: *` — echo the request origin only if it is in the allowlist.
- Allow headers: `authorization, content-type, x-client-info, apikey`.
- Jest-test `corsHeaders`: allowed origin echoed; unknown origin → no ACAO header; null origin → no ACAO header.

---

## 9. Part 5 — `admin-query/index.ts` (skeleton + `me` only)

Thin. Model the env-var handling and the "anon client to resolve the user, service client to act"
split on `issue-device-session/index.ts`.

```
POST /functions/v1/admin-query
Authorization: Bearer <supabase user JWT>
Body: { "action": "me" }

Flow:
  0. handlePreflight(req) → return it if non-null
  1. method !== POST → 405
  2. parse body; missing/blank action → 400 { error: 'MISSING_ACTION' }
  3. gate = await requireAdmin({ header, anonClient, serviceClient, requireMfa })
     if !gate.ok:
        if gate.loggableUserId !== null:
           writeAdminAudit(serviceClient, { actorAdminId: gate.loggableUserId,
                                            action, outcome: 'denied', requestId })
        return json(gate.status, { error: gate.code })
  4. switch (action):
       case 'me':
         writeAdminAudit(serviceClient, { actorAdminId: gate.userId, action: 'me',
                                          outcome: 'ok', requestId })
         return json(200, { userId: gate.userId, email: <from getUser>, role: gate.admin.role, disabled: false })
       default:
         writeAdminAudit(serviceClient, { actorAdminId: gate.userId, action,
                                          outcome: 'denied', requestId })
         return json(400, { error: 'UNKNOWN_ACTION' })
```

- `requestId`: read from body `payload.requestId` or a `x-request-id` header if present; optional.
- CORS headers from `corsHeaders(origin)` go on **every** response, including the error ones.
- Deploy **with** JWT verification (the default). Add to `config.toml`:

```toml
[functions.admin-query]
verify_jwt = true
```

  (Explicit even though it is the default — persona-webhook's `verify_jwt = false` sits right there
  in the same file and the contrast should be legible.)

---

## 10. Part 6 — SQL proofs

House style: `BEGIN … ROLLBACK`, `ON_ERROR_STOP=1`, a temp results table, and a **`CHECK 0`** that
asserts the role posture before trusting anything (see `revoke_session_proof.sql` lines 1–40).

### `supabase/tests/admin_users_write_denial_proof.sql`
`CHECK 0`: running as `authenticated` (not service role) — because this proof is specifically about
what a *client* can do. Set `request.jwt.claims` to a fabricated non-admin user.
- INSERT into `admin_users` → denied (0 rows / RLS)
- UPDATE `admin_users` → denied
- SELECT from `admin_users` → 0 rows
- INSERT / SELECT on `admin_audit_log` → denied / 0 rows
- Assert on outcome (row counts / values), never on "did it throw" — a denied write does not raise.

### `supabase/tests/admin_audit_append_only_proof.sql`
`CHECK 0`: running **with RLS bypassed** (service-role posture) — the trigger must hold even there.
- INSERT a row → succeeds
- UPDATE that row → **must raise** `admin_audit_log is append-only` (wrap in a `DO $$ … EXCEPTION`)
- DELETE that row → **must raise**
- Row still present and unchanged afterwards.

If Docker is unavailable, still commit both files; run them inside an uncommitted `BEGIN … ROLLBACK`
against the linked dev DB if you can safely, and mark them "not locally verified" in your report.

---

## 11. What you must verify, and how

| Claim | How |
|---|---|
| Baseline not regressed | `npm test`, `npm run typecheck`, `npm run lint` before and after — paste both |
| Migration applies cleanly | `docker` throwaway PG (§7 of `P0-3.0` brief has the exact incantation) — apply all migrations in order, no error |
| `admin_users` / `admin_audit_log` deny clients | `admin_users_write_denial_proof.sql` passes |
| `admin_audit_log` is append-only | `admin_audit_append_only_proof.sql` passes |
| Pure `_shared` logic correct | `npm test` — new `requireAdmin` / `adminAudit` / `adminCors` suites green |
| `admin-query/index.ts` correct | **Read-through only** (no Deno). In your report, walk the `me` path and each `!gate.ok` path line by line |
| Auth matrix | Describe how each case resolves given the code. With `REQUIRE_ADMIN_MFA=false` (Path B): no token → 401 (platform or `NO_TOKEN`); customer JWT → `403 NOT_AN_ADMIN` + denied audit row; admin JWT (any aal) → 200 + ok audit row. Also confirm by reading that with `REQUIRE_ADMIN_MFA` unset, an `aal1` admin → `403 MFA_REQUIRED` + denied audit row. If you can exercise this against the deployed function with real tokens, do it and paste output. |
| Existing proofs still pass | Run every `supabase/tests/*.sql` — unchanged, all pass |

---

## 12. Your report — structure it exactly like this

1. **MFA** — confirm you built Path B; note whether the dashboard check showed TOTP available on free after all.
2. **Baseline** — test/typecheck/lint counts before, and after.
3. **What shipped** — file by file, with the migration timestamp you chose and who you announced it to.
4. **Verification** — the §11 table filled in, with command output pasted (not summarized).
5. **Docker** — present or not; what that meant for the proofs.
6. **Deviations** — anything you did differently from this brief, and why. If you changed a
   function signature, a table column, an error code — it goes here.
7. **Open questions / blocked-on** — the manual admin seed, MFA dashboard config, hosting, anything else.
8. **TODO boxes ticked** — which ones in `TODO-AD-1-admin-panel.md`.

Do not claim anything works that you did not run. If a proof is unverified because there is no
Docker, say exactly that.
