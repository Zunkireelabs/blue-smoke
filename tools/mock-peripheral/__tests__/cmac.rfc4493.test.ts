/**
 * RFC 4493 Appendix A — the four published AES-CMAC-128 test vectors,
 * fetched verbatim from https://www.rfc-editor.org/rfc/rfc4493.txt.
 *
 * This is the independent check required by brief §3.1(b): the mock's CMAC
 * must match a source with no code relationship to this implementation.
 */

import { aesCmac } from '../crypto';

const KEY = Buffer.from('2b7e151628aed2a6abf7158809cf4f3c', 'hex');

const M = Buffer.from(
  '6bc1bee22e409f96e93d7e117393172a' +
    'ae2d8a571e03ac9c9eb76fac45af8e51' +
    '30c81c46a35ce411e5fbc1191a0a52ef' +
    'f69f2445df4f9b17ad2b417be66c3710',
  'hex',
);

describe('AES-128-CMAC — RFC 4493 Appendix A test vectors', () => {
  test('Example 1 — Mlen = 0', () => {
    const tag = aesCmac(KEY, Buffer.alloc(0));
    expect(tag.toString('hex')).toBe('bb1d6929e95937287fa37d129b756746');
  });

  test('Example 2 — Mlen = 16', () => {
    const message = M.subarray(0, 16);
    const tag = aesCmac(KEY, message);
    expect(tag.toString('hex')).toBe('070a16b46b4d4144f79bdd9dd04a287c');
  });

  test('Example 3 — Mlen = 40', () => {
    const message = M.subarray(0, 40);
    const tag = aesCmac(KEY, message);
    expect(tag.toString('hex')).toBe('dfa66747de9ae63030ca32611497c827');
  });

  test('Example 4 — Mlen = 64', () => {
    const tag = aesCmac(KEY, M);
    expect(tag.toString('hex')).toBe('51f0bebf7e3b9d92fc49741779363cfe');
  });
});
