/**
 * `adminAudit.ts` — AD-1 M1a execution brief §8.
 */
import { buildAuditRow, writeAdminAudit, type AuditSupabaseClient } from '../adminAudit';
import { allowConsoleError } from '../../../../tools/jest/failOnConsoleError';

const ACTOR = '11111111-1111-1111-1111-111111111111';

describe('buildAuditRow — valid entries', () => {
  it('builds a clean row with only the required fields', () => {
    const result = buildAuditRow({ actorAdminId: ACTOR, action: 'me', outcome: 'ok' });
    expect(result).toEqual({
      ok: true,
      row: {
        actor_admin_id: ACTOR,
        action: 'me',
        outcome: 'ok',
        target_user_id: null,
        target_device_id: null,
        metadata: null,
        request_id: null,
      },
    });
  });

  it('builds a row carrying every optional field', () => {
    const result = buildAuditRow({
      actorAdminId: ACTOR,
      action: 'users.detail',
      outcome: 'ok',
      targetUserId: '22222222-2222-2222-2222-222222222222',
      targetDeviceId: '33333333-3333-3333-3333-333333333333',
      metadata: { note: 'looked up via search' },
      requestId: 'req-abc',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row).toMatchObject({
        actor_admin_id: ACTOR,
        action: 'users.detail',
        outcome: 'ok',
        target_user_id: '22222222-2222-2222-2222-222222222222',
        target_device_id: '33333333-3333-3333-3333-333333333333',
        metadata: { note: 'looked up via search' },
        request_id: 'req-abc',
      });
    }
  });

  it('accepts a clean denied entry', () => {
    const result = buildAuditRow({ actorAdminId: ACTOR, action: 'me', outcome: 'denied' });
    expect(result.ok).toBe(true);
  });
});

describe('buildAuditRow — rejections', () => {
  it('rejects a missing actorAdminId', () => {
    const result = buildAuditRow({ actorAdminId: '', action: 'me', outcome: 'ok' });
    expect(result.ok).toBe(false);
  });

  it('rejects a missing action', () => {
    const result = buildAuditRow({ actorAdminId: ACTOR, action: '', outcome: 'ok' });
    expect(result.ok).toBe(false);
  });

  it('rejects an invalid outcome', () => {
    const result = buildAuditRow({
      actorAdminId: ACTOR,
      action: 'me',
      outcome: 'bogus' as unknown as 'ok',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects metadata with an inquiry_id key', () => {
    const result = buildAuditRow({ actorAdminId: ACTOR, action: 'me', outcome: 'ok', metadata: { inquiry_id: 'x' } });
    expect(result.ok).toBe(false);
  });

  it('rejects metadata with an inquiryId (camelCase) key', () => {
    const result = buildAuditRow({ actorAdminId: ACTOR, action: 'me', outcome: 'ok', metadata: { inquiryId: 'x' } });
    expect(result.ok).toBe(false);
  });

  it('rejects metadata with a forbidden key nested inside an object', () => {
    const result = buildAuditRow({
      actorAdminId: ACTOR,
      action: 'me',
      outcome: 'ok',
      metadata: { filters: { inquiry_id: 'x' } },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects metadata with a forbidden key nested inside an array', () => {
    const result = buildAuditRow({
      actorAdminId: ACTOR,
      action: 'me',
      outcome: 'ok',
      metadata: { rows: [{ ok: true }, { inquiry_id: 'x' }] },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects metadata with a dob/selfie/embedding/similarity key', () => {
    expect(buildAuditRow({ actorAdminId: ACTOR, action: 'a', outcome: 'ok', metadata: { dob: '2000-01-01' } }).ok).toBe(false);
    expect(buildAuditRow({ actorAdminId: ACTOR, action: 'a', outcome: 'ok', metadata: { selfie_ref: 'x' } }).ok).toBe(false);
    expect(buildAuditRow({ actorAdminId: ACTOR, action: 'a', outcome: 'ok', metadata: { embedding: [1, 2] } }).ok).toBe(false);
    expect(buildAuditRow({ actorAdminId: ACTOR, action: 'a', outcome: 'ok', metadata: { similarity_score: 0.9 } }).ok).toBe(false);
  });

  it('ACCEPTS the string "inquiry_id" appearing as a metadata VALUE, not a key (documented, conservative-on-keys choice)', () => {
    const result = buildAuditRow({
      actorAdminId: ACTOR,
      action: 'me',
      outcome: 'ok',
      metadata: { note: 'inquiry_id' },
    });
    expect(result.ok).toBe(true);
  });
});

describe('writeAdminAudit', () => {
  it('inserts the built row when the entry is valid', async () => {
    const insert = jest.fn(async () => ({ error: null }));
    const serviceClient: AuditSupabaseClient = { from: () => ({ insert }) };

    await writeAdminAudit(serviceClient, { actorAdminId: ACTOR, action: 'me', outcome: 'ok' });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ actor_admin_id: ACTOR, action: 'me', outcome: 'ok' }),
    );
  });

  it('does not insert, and logs, when the entry is invalid', async () => {
    const insert = jest.fn(async () => ({ error: null }));
    const serviceClient: AuditSupabaseClient = { from: () => ({ insert }) };
    allowConsoleError(/refusing to write invalid audit entry/);

    await writeAdminAudit(serviceClient, { actorAdminId: ACTOR, action: 'me', outcome: 'ok', metadata: { inquiry_id: 'x' } });

    expect(insert).not.toHaveBeenCalled();
  });

  it('swallows an insert error to console.error rather than throwing', async () => {
    const insert = jest.fn(async () => ({ error: { message: 'db down' } }));
    const serviceClient: AuditSupabaseClient = { from: () => ({ insert }) };
    allowConsoleError(/writeAdminAudit: insert failed/);

    await expect(writeAdminAudit(serviceClient, { actorAdminId: ACTOR, action: 'me', outcome: 'ok' })).resolves.toBeUndefined();
  });
});
