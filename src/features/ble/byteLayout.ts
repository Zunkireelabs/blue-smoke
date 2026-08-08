/**
 * Small helpers for reading/writing the fixed-offset little-endian layouts
 * from protocol.ts (§4.2: "all multi-byte integers are little-endian").
 *
 * Plain `Uint8Array`, not `Buffer` — this runs on Hermes, which has no
 * `Buffer` global.
 */

export function writeUint8(buffer: Uint8Array, offset: number, value: number): void {
  buffer[offset] = value & 0xff;
}

export function writeBytes(buffer: Uint8Array, offset: number, value: Uint8Array): void {
  buffer.set(value, offset);
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

export function readBytes(buffer: Uint8Array, offset: number, length: number): Uint8Array {
  return buffer.subarray(offset, offset + length);
}

/** §4.5 (v1.4) — expiresAtDelta narrowed to uint24 LE. */
export function readUint24LE(buffer: Uint8Array, offset: number): number {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}
