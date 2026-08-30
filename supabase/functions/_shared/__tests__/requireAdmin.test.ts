/**
 * `requireAdmin.ts` — AD-1 M1a execution brief §7.
 *
 * Covers the pure functions exhaustively: `parseAdminClaims` and `isSecondFactorSatisfied`. The
 * DB-touching `assertAdmin` / `requireAdmin` are covered by the SQL proof and by reading, per the
 * brief — no Supabase mock is stood up here beyond the minimal fakes needed to prove the
 * composition order in `requireAdmin` itself (steps 1–4), which do not touch a real DB.
 */
import { parseAdminClaims, isSecondFactorSatisfied, requireAdmin, type AdminGateSupabaseClient } from '../requireAdmin';

/** Base64url-encodes raw text. `/[=]+$/` rather than `/=+$/` — the latter trips `no-div-regex`
 * (a leading `/=` reads like a stray division-assignment operator to a human skimming the file). */
function base64UrlEncode(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/[=]+$/, '');
}

/** Base64url-encodes a plain object into a JWT-shaped payload segment. No signature needed —
 * `parseAdminClaims` never verifies one, by design (see the module header). */
function encodeSegment(obj: unknown): string {
  return base64UrlEncode(JSON.stringify(obj));
}

function makeJwt(payload: unknown, header: unknown = { alg: 'HS256', typ: 'JWT' }): string {
  return `${encodeSegment(header)}.${encodeSegment(payload)}.fake-signature`;
}

const SUB = '11111111-1111-1111-1111-111111111111';

describe('parseAdminClaims', () => {
  it('rejects a null header', () => {
    expect(parseAdminClaims(null)).toEqual({ ok: false, reason: expect.any(String) });
  });

  it('rejects a header without a Bearer prefix', () => {
    const result = parseAdminClaims('Basic abc123');
    expect(result.ok).toBe(false);
  });

  it('rejects "Bearer " with an empty token', () => {
    const result = parseAdminClaims('Bearer ');
    expect(result.ok).toBe(false);
  });

  it('rejects a non-JWT string', () => {
    const result = parseAdminClaims('Bearer not-a-jwt-at-all');
    expect(result.ok).toBe(false);
  });

  it('rejects a JWT with only 2 segments', () => {
    const result = parseAdminClaims(`Bearer ${encodeSegment({ alg: 'none' })}.${encodeSegment({ sub: SUB })}`);
    expect(result.ok).toBe(false);
  });

  it('rejects a valid-shape payload missing aal', () => {
    const jwt = makeJwt({ sub: SUB });
    const result = parseAdminClaims(`Bearer ${jwt}`);
    expect(result.ok).toBe(false);
  });

  it('rejects a valid-shape payload missing sub', () => {
    const jwt = makeJwt({ aal: 'aal1' });
    const result = parseAdminClaims(`Bearer ${jwt}`);
    expect(result.ok).toBe(false);
  });

  it('accepts an aal1 payload with no amr', () => {
    const jwt = makeJwt({ sub: SUB, aal: 'aal1' });
    const result = parseAdminClaims(`Bearer ${jwt}`);
    expect(result).toEqual({ ok: true, sub: SUB, aal: 'aal1', amrMethods: [] });
  });

  it('accepts an aal2 payload with no totp in amr', () => {
    const jwt = makeJwt({ sub: SUB, aal: 'aal2', amr: [{ method: 'password', timestamp: 1 }] });
    const result = parseAdminClaims(`Bearer ${jwt}`);
    expect(result).toEqual({ ok: true, sub: SUB, aal: 'aal2', amrMethods: ['password'] });
  });

  it('accepts an aal2 + totp amr payload', () => {
    const jwt = makeJwt({
      sub: SUB,
      aal: 'aal2',
      amr: [
        { method: 'password', timestamp: 1 },
        { method: 'totp', timestamp: 2 },
      ],
    });
    const result = parseAdminClaims(`Bearer ${jwt}`);
    expect(result).toEqual({ ok: true, sub: SUB, aal: 'aal2', amrMethods: ['password', 'totp'] });
  });

  it('rejects a malformed base64url payload segment', () => {
    const result = parseAdminClaims('Bearer aaa.!!!not-base64!!!.sig');
    expect(result.ok).toBe(false);
  });

  it('rejects a payload segment that decodes to non-JSON', () => {
    const notJson = base64UrlEncode('not json at all');
    const result = parseAdminClaims(`Bearer aaa.${notJson}.sig`);
    expect(result.ok).toBe(false);
  });

  it('rejects a payload segment that decodes to a JSON array, not an object', () => {
    const arr = encodeSegment([1, 2, 3]);
    const result = parseAdminClaims(`Bearer aaa.${arr}.sig`);
    expect(result.ok).toBe(false);
  });
});

describe('isSecondFactorSatisfied', () => {
  it('is false for aal1, regardless of amr', () => {
    expect(isSecondFactorSatisfied({ ok: true, sub: SUB, aal: 'aal1', amrMethods: ['totp'] })).toBe(false);
  });

  it('is false for aal2 with no totp amr entry', () => {
    expect(isSecondFactorSatisfied({ ok: true, sub: SUB, aal: 'aal2', amrMethods: ['password'] })).toBe(false);
  });

  it('is false for aal2 with an empty amr', () => {
    expect(isSecondFactorSatisfied({ ok: true, sub: SUB, aal: 'aal2', amrMethods: [] })).toBe(false);
  });

  it('is true for aal2 with a totp amr entry', () => {
    expect(isSecondFactorSatisfied({ ok: true, sub: SUB, aal: 'aal2', amrMethods: ['password', 'totp'] })).toBe(true);
  });
});

describe('requireAdmin — composition order (fakes, no real DB)', () => {
  function fakeClients(opts: {
    getUserResult: { data: { user: { id: string } | null }; error: unknown };
    adminRow: { role: string; disabled_at: string | null } | null;
  }): { anonClient: AdminGateSupabaseClient; serviceClient: AdminGateSupabaseClient } {
    const anonClient: AdminGateSupabaseClient = {
      from: () => {
        throw new Error('anonClient.from should never be called by requireAdmin');
      },
      auth: { getUser: async () => opts.getUserResult },
    };
    const serviceClient: AdminGateSupabaseClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: opts.adminRow, error: null }),
          }),
        }),
      }),
      auth: {
        getUser: async () => {
          throw new Error('serviceClient.auth.getUser should never be called by requireAdmin');
        },
      },
    };
    return { anonClient, serviceClient };
  }

  it('returns 401 NO_TOKEN when the header is absent', async () => {
    const { anonClient, serviceClient } = fakeClients({ getUserResult: { data: { user: null }, error: null }, adminRow: null });
    const result = await requireAdmin({ authorizationHeader: null, anonClient, serviceClient, requireMfa: false });
    expect(result).toEqual({ ok: false, status: 401, code: 'NO_TOKEN', loggableUserId: null });
  });

  it('returns 401 INVALID_TOKEN when getUser rejects the token', async () => {
    const jwt = makeJwt({ sub: SUB, aal: 'aal1' });
    const { anonClient, serviceClient } = fakeClients({
      getUserResult: { data: { user: null }, error: { message: 'bad token' } },
      adminRow: null,
    });
    const result = await requireAdmin({ authorizationHeader: `Bearer ${jwt}`, anonClient, serviceClient, requireMfa: false });
    expect(result).toEqual({ ok: false, status: 401, code: 'INVALID_TOKEN', loggableUserId: null });
  });

  it('returns 401 INVALID_TOKEN when getUser sub disagrees with the decoded payload sub', async () => {
    const jwt = makeJwt({ sub: SUB, aal: 'aal1' });
    const { anonClient, serviceClient } = fakeClients({
      getUserResult: { data: { user: { id: '22222222-2222-2222-2222-222222222222' } }, error: null },
      adminRow: null,
    });
    const result = await requireAdmin({ authorizationHeader: `Bearer ${jwt}`, anonClient, serviceClient, requireMfa: false });
    expect(result).toEqual({ ok: false, status: 401, code: 'INVALID_TOKEN', loggableUserId: null });
  });

  it('returns 403 MFA_REQUIRED when requireMfa is true and the token is aal1', async () => {
    const jwt = makeJwt({ sub: SUB, aal: 'aal1' });
    const { anonClient, serviceClient } = fakeClients({
      getUserResult: { data: { user: { id: SUB } }, error: null },
      adminRow: { role: 'admin', disabled_at: null },
    });
    const result = await requireAdmin({ authorizationHeader: `Bearer ${jwt}`, anonClient, serviceClient, requireMfa: true });
    expect(result).toEqual({ ok: false, status: 403, code: 'MFA_REQUIRED', loggableUserId: SUB });
  });

  it('does not require aal2 when requireMfa is false (Path B) — an aal1 admin gets through', async () => {
    const jwt = makeJwt({ sub: SUB, aal: 'aal1' });
    const { anonClient, serviceClient } = fakeClients({
      getUserResult: { data: { user: { id: SUB } }, error: null },
      adminRow: { role: 'admin', disabled_at: null },
    });
    const result = await requireAdmin({ authorizationHeader: `Bearer ${jwt}`, anonClient, serviceClient, requireMfa: false });
    expect(result).toEqual({ ok: true, admin: { userId: SUB, role: 'admin' }, userId: SUB });
  });

  it('returns 403 NOT_AN_ADMIN when membership check fails, even with requireMfa false', async () => {
    const jwt = makeJwt({ sub: SUB, aal: 'aal1' });
    const { anonClient, serviceClient } = fakeClients({
      getUserResult: { data: { user: { id: SUB } }, error: null },
      adminRow: null,
    });
    const result = await requireAdmin({ authorizationHeader: `Bearer ${jwt}`, anonClient, serviceClient, requireMfa: false });
    expect(result).toEqual({ ok: false, status: 403, code: 'NOT_AN_ADMIN', loggableUserId: SUB });
  });

  it('returns 403 NOT_AN_ADMIN when the admin row is disabled — membership check is never behind requireMfa', async () => {
    const jwt = makeJwt({ sub: SUB, aal: 'aal2', amr: [{ method: 'totp', timestamp: 1 }] });
    const { anonClient, serviceClient } = fakeClients({
      getUserResult: { data: { user: { id: SUB } }, error: null },
      adminRow: { role: 'admin', disabled_at: '2026-01-01T00:00:00Z' },
    });
    const result = await requireAdmin({ authorizationHeader: `Bearer ${jwt}`, anonClient, serviceClient, requireMfa: true });
    expect(result).toEqual({ ok: false, status: 403, code: 'NOT_AN_ADMIN', loggableUserId: SUB });
  });

  it('succeeds when requireMfa is true, the token is aal2+totp, and the admin row is live', async () => {
    const jwt = makeJwt({ sub: SUB, aal: 'aal2', amr: [{ method: 'totp', timestamp: 1 }] });
    const { anonClient, serviceClient } = fakeClients({
      getUserResult: { data: { user: { id: SUB } }, error: null },
      adminRow: { role: 'superadmin', disabled_at: null },
    });
    const result = await requireAdmin({ authorizationHeader: `Bearer ${jwt}`, anonClient, serviceClient, requireMfa: true });
    expect(result).toEqual({ ok: true, admin: { userId: SUB, role: 'superadmin' }, userId: SUB });
  });
});
