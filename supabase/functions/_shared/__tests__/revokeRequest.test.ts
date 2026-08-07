/**
 * Spec §5.4.1 request parsing, and §7.1/§7.4 of the `revoke-device-session` execution brief.
 *
 * The property under test that matters most: an absent `session_id` means bulk revoke, an
 * explicit `null` does not (§7.4), and every accepted single-session id round-trips through
 * `toByteaLiteral` into the exact `\x`-prefixed representation `issue-device-session` writes
 * (§7.1) — a plain-hex comparison would match zero rows forever and look like a clean 404.
 */
import { parseRevokeTarget, toByteaLiteral } from '../revokeRequest';

const VALID_HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const VALID_HEX_32 = VALID_HEX.slice(0, 32); // 32 chars, not the 33 above

describe('parseRevokeTarget — valid input', () => {
  it('treats an absent session_id as a bulk revoke', () => {
    expect(parseRevokeTarget({})).toEqual({ kind: 'all' });
  });

  it('accepts a well-formed lowercase hex session_id as single', () => {
    expect(parseRevokeTarget({ session_id: VALID_HEX_32 })).toEqual({
      kind: 'single',
      sessionIdHex: VALID_HEX_32,
    });
  });

  it('lowercases a mixed-case hex session_id before comparing', () => {
    const mixed = VALID_HEX_32.toUpperCase();
    expect(parseRevokeTarget({ session_id: mixed })).toEqual({
      kind: 'single',
      sessionIdHex: VALID_HEX_32,
    });
  });
});

describe('parseRevokeTarget — rejections (§7.4)', () => {
  it('rejects explicit null — it is NOT bulk revoke, that is the deviation trap', () => {
    const result = parseRevokeTarget({ session_id: null });
    expect(result.kind).toBe('invalid');
  });

  it('rejects a non-string session_id', () => {
    expect(parseRevokeTarget({ session_id: 12345 }).kind).toBe('invalid');
    expect(parseRevokeTarget({ session_id: {} }).kind).toBe('invalid');
    expect(parseRevokeTarget({ session_id: [] }).kind).toBe('invalid');
    expect(parseRevokeTarget({ session_id: true }).kind).toBe('invalid');
  });

  it('rejects a session_id that is not exactly 32 hex characters', () => {
    expect(parseRevokeTarget({ session_id: VALID_HEX_32.slice(0, 31) }).kind).toBe('invalid');
    expect(parseRevokeTarget({ session_id: `${VALID_HEX_32}a` }).kind).toBe('invalid');
    expect(parseRevokeTarget({ session_id: '' }).kind).toBe('invalid');
  });

  it('rejects non-hex characters', () => {
    expect(parseRevokeTarget({ session_id: 'g'.repeat(32) }).kind).toBe('invalid');
    expect(parseRevokeTarget({ session_id: `${'a'.repeat(31)}z` }).kind).toBe('invalid');
  });

  it('rejects a non-object body', () => {
    expect(parseRevokeTarget(null).kind).toBe('invalid');
    expect(parseRevokeTarget('a string').kind).toBe('invalid');
    expect(parseRevokeTarget(42).kind).toBe('invalid');
    expect(parseRevokeTarget(undefined).kind).toBe('invalid');
  });
});

describe('toByteaLiteral — §7.1, the trap the whole task is about', () => {
  it('prefixes with \\x, matching exactly what issue-device-session writes', () => {
    // issue-device-session: `session_id: \`\\x${toHex(sessionId)}\``
    expect(toByteaLiteral(VALID_HEX_32)).toBe(`\\x${VALID_HEX_32}`);
  });

  it('lowercases before prefixing', () => {
    expect(toByteaLiteral(VALID_HEX_32.toUpperCase())).toBe(`\\x${VALID_HEX_32}`);
  });

  it('throws on malformed input rather than emitting a broken literal', () => {
    expect(() => toByteaLiteral('too-short')).toThrow(RangeError);
    expect(() => toByteaLiteral('z'.repeat(32))).toThrow(RangeError);
  });
});
