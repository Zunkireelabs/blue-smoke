-- P0-3.0 — core schema (spec §5.2)
--
-- Source: docs/TECHNICAL_SPEC.md §5.2, spec version 1.1 (as merged on `stage`), with one
-- correction pulled forward from PR #6 (`feature/P0-2.0-ble-protocol`, open at the time this
-- migration was written, spec version 1.3 pending merge):
--
--   §5.2.4 `device_ownership` — the spec's inline `unique (device_id) where (revoked_at is
--   null)` is not valid Postgres as a table constraint (Postgres has no such form). Built here
--   as a partial unique INDEX instead, which is what actually enforces "one active owner per
--   device" and what §5.4 step 4's race-safety depends on. See PR #6 commit `ceaaa86`.
--
-- Every table gets RLS in the next migration. No table here is usable by a client until then.

-- 5.2.1 Profile (1:1 with auth.users)
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 5.2.2 Verification result — FLAG ONLY. No images. No DOB. No name.
create table verifications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  age_verified       boolean not null,
  verified_at        timestamptz not null default now(),
  method             text not null,          -- 'ondevice-mlkit-v1' | 'ondevice-vision-v1'
  threshold_version  text not null,          -- e.g. 'facematch-tau-0.62'
  app_version        text not null,
  platform           text not null,          -- 'ios' | 'android'
  outcome_reason     text                    -- 'pass' | 'under_18' | 'face_mismatch' |
                                              -- 'ocr_failed' | 'liveness_failed'
  -- DELIBERATELY ABSENT: dob, name, id_number, document_image, selfie_image,
  --                      face_embedding, similarity_score
);
create index on verifications (user_id, verified_at desc);

-- 5.2.3 Device registry
create table devices (
  id             uuid primary key default gen_random_uuid(),
  serial_hash    text not null unique,   -- SHA-256(deviceUid || server_salt). Raw UID never stored.
  model          text not null default 'YC1012_JD',
  hw_revision    int,
  key_generation int not null default 1,
  first_seen_at  timestamptz not null default now()
);

-- 5.2.4 Ownership — the authority for "may this user command this device?"
create table device_ownership (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  device_id   uuid not null references devices(id) on delete cascade,
  nickname    text,
  bonded_at   timestamptz not null default now(),
  revoked_at  timestamptz
);

-- One active owner per device. Partial unique INDEX, not an inline table constraint — see
-- the note at the top of this file. This is what §5.4 step 4's ownership assertion races
-- against; the index is the authority, a SELECT-then-INSERT in application code is not.
create unique index device_ownership_one_active_owner
  on device_ownership (device_id)
  where (revoked_at is null);

-- 5.2.5 Root device keys — SERVICE ROLE ONLY. RLS denies every client.
create table device_keys (
  device_id      uuid primary key references devices(id) on delete cascade,
  k_dev_wrapped  bytea not null,      -- K_dev, encrypted at rest with Supabase Vault
  key_generation int not null default 1,
  provisioned_at timestamptz not null default now()
);

-- 5.2.6 Issued session keys — metadata only, never the key material
create table device_sessions (
  id           uuid primary key default gen_random_uuid(),
  session_id   bytea not null unique,   -- the 16-byte salt used in HKDF
  user_id      uuid not null references auth.users(id) on delete cascade,
  device_id    uuid not null references devices(id) on delete cascade,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked_at   timestamptz
);
create index on device_sessions (user_id, device_id, expires_at desc);

-- 5.2.7 Push registration
create table push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text not null,            -- 'ios' | 'android'
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

-- 5.2.8 Audit log — metadata only
create table audit_log (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete set null,
  device_id  uuid references devices(id) on delete set null,
  event      text not null,            -- 'verification_submitted' | 'session_issued' |
                                        -- 'session_revoked' | 'device_bonded' | 'device_unpaired'
  metadata   jsonb,                    -- must NEVER contain PII or biometrics
  created_at timestamptz not null default now()
);
