-- P0-3.0 — Step 3 of 3 for the live-HTTP RLS proof. SERVICE ROLE / SQL EDITOR ONLY.
-- Partner files: `…seed.sql` (step 1), `rls_ownership_proof_live.mjs` (step 2).
--
-- ⚠️ NOT OPTIONAL. Unlike `rls_ownership_proof.sql`, which wraps everything in
-- BEGIN/ROLLBACK and leaves nothing behind, the live proof needs its fixtures to be
-- really committed so PostgREST can serve them over HTTP. Until this runs, dev
-- carries a device and an `age_verified = true` verification row that belong to no
-- real hardware and no real person.
--
-- Deletion order matters — `device_ownership` references `devices`.
-- Every predicate is pinned to a fixture-specific value, so this can never touch a
-- real row even if run twice or run against the wrong project.

delete from verifications    where inquiry_id = 'inq_rlsproof_live_fixture';
delete from push_tokens      where token      = 'rls-proof-live-token-a';
delete from device_ownership where id         = '3f3f3f3f-0000-4000-8000-000000000002';
delete from devices          where id         = '3f3f3f3f-0000-4000-8000-000000000001';

-- All four counts must be 0. Anything else means a fixture is still live.
select 'devices'          as fixture, count(*) from devices          where id = '3f3f3f3f-0000-4000-8000-000000000001'
union all
select 'device_ownership', count(*) from device_ownership where id = '3f3f3f3f-0000-4000-8000-000000000002'
union all
select 'push_tokens',      count(*) from push_tokens      where token = 'rls-proof-live-token-a'
union all
select 'verifications',    count(*) from verifications    where inquiry_id = 'inq_rlsproof_live_fixture';
