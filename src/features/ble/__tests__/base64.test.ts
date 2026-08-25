import { Base64DecodeError, base64ToBytes, bytesToBase64 } from '../base64';

function bytesOfLength(length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    out[i] = (i * 37 + 11) & 0xff;
  }
  return out;
}

describe('bytesToBase64 / base64ToBytes — round trip', () => {
  // Padding boundaries: length mod 3 === 0 needs no '=', === 1 needs '==', === 2 needs '='.
  test.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20])('round-trips %i bytes', (length) => {
    const original = bytesOfLength(length);
    const encoded = bytesToBase64(original);
    expect(base64ToBytes(encoded)).toEqual(original);
  });

  test('empty input encodes to an empty string and decodes back to empty bytes', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToBytes('')).toEqual(new Uint8Array(0));
  });

  test.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20])(
    'matches Buffer.from(x).toString("base64") at length %i',
    (length) => {
      const original = bytesOfLength(length);
      expect(bytesToBase64(original)).toBe(Buffer.from(original).toString('base64'));
    },
  );

  test.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20])(
    'decodes what Buffer produced, at length %i',
    (length) => {
      const original = bytesOfLength(length);
      const bufferEncoded = Buffer.from(original).toString('base64');
      expect(base64ToBytes(bufferEncoded)).toEqual(original);
    },
  );
});

describe('base64ToBytes — invalid input', () => {
  test('throws Base64DecodeError on a character outside the alphabet', () => {
    expect(() => base64ToBytes('!!!!')).toThrow(Base64DecodeError);
  });

  test('throws on a padding character appearing mid-string', () => {
    expect(() => base64ToBytes('AB=CD==')).toThrow(Base64DecodeError);
  });
});
