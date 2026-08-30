-- AD-1 M1a — admin identity + admin audit trail.
--
-- Both tables get RLS ENABLED with ZERO POLICIES — the same deny-all pattern device_keys uses
-- (20260806060200_rls_policies.sql). No client role (anon, authenticated) can read or write
-- either table by any path. Rows in admin_users are created ONLY by:
--   (a) the manual seed documented in the AD-1 M1a brief §6 / supabase/README.md, run once
--       against the linked project;
--   (b) the admin-admins Edge Function (M2), which itself requires an existing superadmin.
-- A mobile-app user has no route to appear here.
--
-- Sequence number: latest existing migration on every local and remote branch is
-- 20260807120000_k_dev_accessor.sql (verified via `git ls-tree` over every ref, 2026-08-30).
-- This is the first 20260830… stamp. Announced in the branch report; no other migration
-- claims this number.

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
