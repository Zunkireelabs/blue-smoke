-- P2-1.0 / v1.5 — realign `verifications` to the Persona vendor flow (spec §5.2.2, §5.3)
--
-- WHY THIS EXISTS
--
-- 20260806060100_core_schema.sql and 20260806060200_rls_policies.sql were written against
-- spec v1.1, which described an ON-DEVICE verification pipeline: our own code did the OCR and
-- the face match, produced a decision, and the client submitted that decision. Verification
-- moved to Persona in v1.5 (spec change-log row 1.5, §6 replaced in full). The migrations were
-- already applied to dev and staging before that switch, so both databases currently describe
-- an architecture that no longer exists.
--
-- 🔴 THE PART THAT IS A SECURITY DEFECT, NOT JUST DRIFT
--
--   create policy insert_own_verifications on verifications
--     for insert with check (user_id = auth.uid());
--
-- Under the on-device design this was defensible: the client genuinely held the only copy of
-- the result. Under the vendor flow it is inviolable rule 3 INVERTED — any authenticated user
-- can INSERT their own row with age_verified = true and self-assert that they are over 18,
-- with no ID, no selfie, and no vendor involvement. `issue-device-session` (§5.4 step 2) reads
-- exactly this table to decide whether to hand out key material, so this is a complete bypass
-- of the age gate, reachable with nothing but a valid login.
--
-- This policy is DROPPED here. Clients keep SELECT on their own rows and get nothing else:
-- `create-inquiry` writes the pending row and `persona-webhook` writes the outcome, both as
-- service role (§6.2, §6.6). RLS enabled with no INSERT/UPDATE/DELETE policy is a deny for
-- every client role, which is what §5.3 now requires.
--
-- SHAPE CHANGES (§5.2.2 as revised in v1.5)
--
--   + inquiry_id        Persona's opaque handle. UNIQUE because the webhook must be idempotent
--                       on it — Persona retries deliveries, and a replayed body must not be
--                       able to write a second outcome row for the same inquiry (§8.3).
--   + provider_status   the vendor's decision string, verbatim. Written ONLY by the webhook.
--   ~ threshold_version now nullable. It named OUR face-match threshold ('facematch-tau-0.62');
--                       the vendor owns thresholds now and does not tell us what they are, so
--                       under Persona there is no honest value to put here.
--   ~ age_verified      now defaults false. The row is created PENDING at inquiry time and only
--                       becomes true when the webhook says so. A column with no default invites
--                       a caller to supply one, and the safe answer is always false.
--
-- DELIBERATELY NOT ADDED: dob, name, id_number, document_image, selfie_image, face_embedding,
-- similarity_score. Still absent, and must stay absent — pulling the full inquiry payload back
-- from Persona's API into this table would re-create precisely the liability the vendor exists
-- to hold (§6.3, inviolable rule 1).
--
-- DATA SAFETY: `verifications` is empty in every environment (no verification has ever run
-- end-to-end — the Edge Functions do not exist yet), so the not-null drop and the default are
-- shape corrections, not a data migration. The one exception is fixture rows created and
-- deleted by supabase/tests/*.sql, which never persist.

-- ── 1. The security fix ──────────────────────────────────────────────────────
-- Idempotent: this migration may run against dev/staging, where the policy exists, and
-- against a fresh database built from migrations, where it also exists. `if exists` keeps it
-- safe to re-run either way.
drop policy if exists insert_own_verifications on verifications;

comment on table verifications is
  'Age-verification outcome, flag only. Client-writable: NO (v1.5). Rows are created by the '
  'create-inquiry Edge Function and completed by persona-webhook, both service role. A client '
  'INSERT path would let a user assert their own age_verified — spec §5.3, inviolable rule 3.';

-- ── 2. Shape realignment (§5.2.2) ────────────────────────────────────────────
alter table verifications
  add column if not exists inquiry_id      text,
  add column if not exists provider_status text;

-- Idempotency support for the webhook. A partial index rather than a plain unique constraint:
-- rows created before an inquiry id is known (and any future row that legitimately has none)
-- must not collide with each other on NULL.
create unique index if not exists verifications_inquiry_id_key
  on verifications (inquiry_id)
  where inquiry_id is not null;

alter table verifications
  alter column threshold_version drop not null,
  alter column age_verified      set default false;

comment on column verifications.inquiry_id is
  'Persona inquiry handle. 🔴 NEVER log this beside anything that re-identifies the person '
  '(spec §8.1, CLAUDE.md rule 1). Unique so persona-webhook is idempotent under vendor retries.';
comment on column verifications.provider_status is
  'Vendor decision string, verbatim. WRITTEN ONLY BY persona-webhook (§5.3, §6.6).';
comment on column verifications.threshold_version is
  'Nullable since v1.5 — the vendor owns thresholds and does not disclose them. Pre-v1.5 this '
  'held our own face-match threshold.';
comment on column verifications.method is
  'persona-v1 since v1.5. Was ondevice-mlkit-v1 / ondevice-vision-v1 under the deleted '
  'on-device pipeline.';
