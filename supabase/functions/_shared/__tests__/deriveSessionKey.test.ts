/**
 * The point of this file is the CROSS-VERIFICATION, not the unit tests.
 *
 * `deriveSessionKey` (server, Web Crypto) and `tools/mock-peripheral`'s device model
 * (`node:crypto` hkdfSync) must produce identical `K_sess` bytes. They are separate
 * implementations of §4.5 using separate crypto libraries, so agreement between them is real
 * evidence rather than a tautology — a self-consistent test would pass just as happily
 * against a wrong-but-stable derivation.
 *
 * This is the exact defect class spec v1.2 had to fix: `info` bound values the device is
 * never sent, so `K_sess` was underivable device-side and EVERY authentication on real
 * hardware would have failed. Nothing else in the suite would catch its return.
 */
import { hkdfSync } from 'node:crypto';

import {
  AUTH_HKDF_INFO,
  buildHkdfInfo,
  deriveSessionKey,
  fromHex,
  toHex,
  K_SESS_LENGTH_BYTES,
} from '../deriveSessionKey';

const K_DEV = fromHex('000102030405060708090a0b0c0d0e0f');
const SESSION_ID = fromHex('101112131415161718191a1b1c1d1e1f');

/**
 * The device side, reproduced exactly as tools/mock-peripheral/deviceCore.ts does it:
 *
 *   hkdfSha256(kDev, sessionId,
 *     Buffer.concat([Buffer.from(AUTH_HKDF_INFO, 'utf8'), Buffer.from([keyGeneration])]), 16)
 *
 * Deliberately built here from `node:crypto` rather than imported from the mock: importing it
 * would couple this test to the mock's module graph, and the value is in the two paths being
 * independent.
 */
function deviceSideDerive(
  kDev: Uint8Array,
  sessionId: Uint8Array,
  keyGeneration: number,
): Uint8Array {
  const info = Buffer.concat([
    Buffer.from(AUTH_HKDF_INFO, 'utf8'),
    Buffer.from([keyGeneration]),
  ]);
  return new Uint8Array(hkdfSync('sha256', kDev, sessionId, info, K_SESS_LENGTH_BYTES));
}

describe('K_sess derivation agrees with the device implementation', () => {
  it.each([1, 2, 7, 255])(
    'server and device derive identical K_sess at key generation %i',
    async (keyGeneration) => {
      const server = await deriveSessionKey(K_DEV, SESSION_ID, keyGeneration);
      const device = deviceSideDerive(K_DEV, SESSION_ID, keyGeneration);

      expect(toHex(server)).toBe(toHex(device));
      expect(server).toHaveLength(K_SESS_LENGTH_BYTES);
    },
  );

  it('changes the key when the session id changes', async () => {
    const a = await deriveSessionKey(K_DEV, SESSION_ID, 1);
    const b = await deriveSessionKey(K_DEV, fromHex('ffffffffffffffffffffffffffffffff'), 1);
    expect(toHex(a)).not.toBe(toHex(b));
  });

  it('changes the key when the key generation changes', async () => {
    // Key rotation depends on this: a re-provisioned device must not accept sessions derived
    // under its old generation.
    const g1 = await deriveSessionKey(K_DEV, SESSION_ID, 1);
    const g2 = await deriveSessionKey(K_DEV, SESSION_ID, 2);
    expect(toHex(g1)).not.toBe(toHex(g2));
  });
});

describe('buildHkdfInfo — the byte-level detail that breaks hardware silently', () => {
  it('appends keyGeneration as ONE RAW BYTE, not as decimal text', () => {
    const info = buildHkdfInfo(1);
    const expected = Buffer.concat([Buffer.from(AUTH_HKDF_INFO, 'utf8'), Buffer.from([1])]);

    expect(Buffer.from(info).equals(expected)).toBe(true);
    // The wrong-but-plausible encoding, stated explicitly so the distinction survives a
    // refactor: `INFO + String(1)` appends 0x31, not 0x01.
    expect(info[info.length - 1]).toBe(0x01);
    expect(info[info.length - 1]).not.toBe('1'.charCodeAt(0));
  });

  it('binds neither user_id nor an absolute expiry', () => {
    // The v1.2 regression, asserted directly. The device is offline and is sent neither
    // value, so anything beyond the fixed string plus one byte makes K_sess underivable
    // device-side.
    const info = buildHkdfInfo(1);
    expect(info).toHaveLength(AUTH_HKDF_INFO.length + 1);
  });

  it.each([-1, 256, 1.5, NaN])('rejects a key generation of %p rather than truncating', (gen) => {
    // Silent truncation would derive a key that never authenticates, and the failure would
    // surface only on physical hardware.
    expect(() => buildHkdfInfo(gen as number)).toThrow(RangeError);
  });
});

describe('hex helpers', () => {
  it('round-trips', () => {
    expect(toHex(fromHex('00ff10a5'))).toBe('00ff10a5');
  });

  it('rejects an odd-length hex string', () => {
    expect(() => fromHex('abc')).toThrow(RangeError);
  });
});
