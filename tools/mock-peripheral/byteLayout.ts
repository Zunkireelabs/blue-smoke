/**
 * Small helpers for reading/writing the fixed-offset little-endian layouts
 * from protocol.ts (§4.2: "all multi-byte integers are little-endian").
 *
 * P1-3.0 §2.1 — pure `Uint8Array`, not `Buffer`. This module is on the path `deviceCore.ts`
 * needs for scan/connect/discover/deviceInfo in the app (`src/app/providers.tsx`'s dev wiring),
 * and `Buffer` is a Node global that doesn't exist in the RN/Hermes runtime — confirmed absent
 * the same way `src/features/ble/auth.ts`'s hand-rolled base64 already confirms it for `btoa`/
 * `atob` (see that file's comment). A `Buffer`-based implementation here would crash on first
 * use in the app, not at bundle time — Buffer usage is a runtime global reference, not an
 * unresolvable import, so nothing in `npm run bundle:check`/`bundle:check:release` catches it;
 * only actually running the app does.
 */

export function writeUint8(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
}

export function writeUint16LE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

export function writeUint32LE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

/** §4.5 (v1.4) — expiresAtDelta narrowed to uint24 LE. Max 0xFFFFFF; callers must clamp first. */
export function writeUint24LE(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
}

export function readUint8(buffer: Uint8Array, offset: number): number {
  return buffer[offset];
}

export function readUint16LE(buffer: Uint8Array, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

/** Unsigned — `>>> 0` reinterprets byte 3's sign bit, which plain `<<`/`|` would otherwise set. */
export function readUint32LE(buffer: Uint8Array, offset: number): number {
  return (
    (buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24)) >>> 0
  );
}

/** §4.5 (v1.4) — expiresAtDelta narrowed to uint24 LE. */
export function readUint24LE(buffer: Uint8Array, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

export function writeBytes(buffer: Uint8Array, offset: number, value: Uint8Array): void {
  buffer.set(value, offset);
}

export function readBytes(buffer: Uint8Array, offset: number, length: number): Uint8Array {
  return buffer.subarray(offset, offset + length);
}

/** `Uint8Array`-native, not `Buffer.concat` — see this module's doc comment. */
export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** `Uint8Array`-native, not `Buffer.from(str, 'utf8')`. ASCII-only — deviceCore.ts's only
 * caller (`AUTH_HKDF_INFO`, protocol.ts) is an ASCII literal, so a `charCodeAt` encoder is
 * exact, not an approximation. */
export function asciiToBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    out[i] = text.charCodeAt(i) & 0xff;
  }
  return out;
}

/**
 * P1-3.0 §2.1 — hand-rolled, not `Buffer.from(...).toString('base64')`/`Buffer.from(b64,
 * 'base64')`, for the same reason as the rest of this file: `Buffer` doesn't exist in the
 * RN/Hermes runtime `bleAdapter.ts` (this module's only caller) also needs to run in. Same
 * algorithm and same reasoning as `src/features/ble/auth.ts`'s `bytesToBase64`/`base64ToBytes`
 * (that file's comment: `btoa`/`atob` aren't polyfilled either, confirmed absent from RN's
 * `InitializeCore.js`) — duplicated rather than imported, since that pair is private to
 * `auth.ts` and this mock must not depend on app code either way. Lives here, not in
 * `bleAdapter.ts`, so its bit-shifting stays inside this file's already-accepted `no-bitwise`
 * byte-level-work exception (CLAUDE.md) rather than introducing a new one.
 */
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let outIndex = 0;
  let buffer = 0;
  let bitsInBuffer = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const value = BASE64_ALPHABET.indexOf(clean[i]);
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
