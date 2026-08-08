import { ecb } from '@noble/ciphers/aes.js';
import { aesCmac } from '../crypto';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hexString: string): Uint8Array {
  const out = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hexString.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

describe('§5.2 — @noble/ciphers raw AES-128 block encrypt, FIPS-197 Appendix B vector', () => {
  test('ecb(key, { disablePadding: true }).encrypt(block) is the raw, unpadded block cipher', () => {
    const key = fromHex('000102030405060708090a0b0c0d0e0f');
    const plaintext = fromHex('00112233445566778899aabbccddeeff');
    const ciphertext = ecb(key, { disablePadding: true }).encrypt(plaintext);

    expect(ciphertext).toHaveLength(16);
    expect(hex(ciphertext)).toBe('69c4e0d86a7b0430d8cdb78070b4c55a');
  });
});

describe('aesCmac — RFC 4493 Appendix A test vectors', () => {
  const KEY = fromHex('2b7e151628aed2a6abf7158809cf4f3c');
  const M = fromHex(
    '6bc1bee22e409f96e93d7e117393172a' +
      'ae2d8a571e03ac9c9eb76fac45af8e51' +
      '30c81c46a35ce411e5fbc1191a0a52ef' +
      'f69f2445df4f9b17ad2b417be66c3710',
  );

  test('Mlen=0', () => {
    expect(hex(aesCmac(KEY, M.subarray(0, 0)))).toBe('bb1d6929e95937287fa37d129b756746');
  });

  test('Mlen=16', () => {
    expect(hex(aesCmac(KEY, M.subarray(0, 16)))).toBe('070a16b46b4d4144f79bdd9dd04a287c');
  });

  test('Mlen=40', () => {
    expect(hex(aesCmac(KEY, M.subarray(0, 40)))).toBe('dfa66747de9ae63030ca32611497c827');
  });

  test('Mlen=64', () => {
    expect(hex(aesCmac(KEY, M.subarray(0, 64)))).toBe('51f0bebf7e3b9d92fc49741779363cfe');
  });

  test('throws on a key that is not 16 bytes', () => {
    expect(() => aesCmac(fromHex('aabb'), M)).toThrow('16 bytes');
  });
});
