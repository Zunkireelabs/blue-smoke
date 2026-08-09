/**
 * Base64 ↔ bytes, for the `react-native-ble-plx` boundary: characteristic
 * values and advertisement `manufacturerData` both cross it as base64 strings.
 *
 * Extracted here because `deviceInfo.ts` had already duplicated `auth.ts`'s
 * copy and explicitly flagged the extraction as a follow-up once a second
 * module needed one — `scanner.ts` (P1-3.0) is the third, so it is done now
 * rather than copied again.
 *
 * Plain `Uint8Array` and no `atob`/`Buffer` — this runs on Hermes, which has
 * neither, same constraint `byteLayout.ts` documents.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export class Base64DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Base64DecodeError';
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

/**
 * Throws `Base64DecodeError` on any character outside the alphabet.
 *
 * The two copies this replaces used `indexOf` without checking for `-1`, so a
 * corrupt or truncated value decoded to plausible-looking garbage instead of
 * failing. That is the wrong direction for byte layouts that are then read at
 * fixed offsets: a silently wrong `deviceUid` or `stateHint` is far worse than
 * a caught error, and every caller already funnels throws into a typed
 * failure outcome.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let outIndex = 0;
  let buffer = 0;
  let bitsInBuffer = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const value = BASE64_ALPHABET.indexOf(clean[i]);
    if (value < 0) {
      throw new Base64DecodeError(`invalid base64 character at index ${i}`);
    }
    buffer = (buffer << 6) | value;
    bitsInBuffer += 6;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      out[outIndex] = (buffer >> bitsInBuffer) & 0xff;
      outIndex += 1;
    }
  }
  return out;
}
