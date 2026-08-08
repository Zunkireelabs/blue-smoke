/**
 * Small helpers for reading/writing the fixed-offset little-endian layouts
 * from protocol.ts (§4.2: "all multi-byte integers are little-endian").
 */

export function writeUint8(buffer: Buffer, offset: number, value: number): void {
  buffer.writeUInt8(value & 0xff, offset);
}

export function writeUint16LE(buffer: Buffer, offset: number, value: number): void {
  buffer.writeUInt16LE(value & 0xffff, offset);
}

export function writeUint32LE(buffer: Buffer, offset: number, value: number): void {
  buffer.writeUInt32LE(value >>> 0, offset);
}

/** §4.5 (v1.4) — expiresAtDelta narrowed to uint24 LE. Max 0xFFFFFF; callers must clamp first. */
export function writeUint24LE(buffer: Buffer, offset: number, value: number): void {
  buffer.writeUIntLE(value >>> 0, offset, 3);
}

export function readUint8(buffer: Uint8Array, offset: number): number {
  return Buffer.from(buffer).readUInt8(offset);
}

export function readUint16LE(buffer: Uint8Array, offset: number): number {
  return Buffer.from(buffer).readUInt16LE(offset);
}

export function readUint32LE(buffer: Uint8Array, offset: number): number {
  return Buffer.from(buffer).readUInt32LE(offset);
}

/** §4.5 (v1.4) — expiresAtDelta narrowed to uint24 LE. */
export function readUint24LE(buffer: Uint8Array, offset: number): number {
  return Buffer.from(buffer).readUIntLE(offset, 3);
}

export function writeBytes(buffer: Buffer, offset: number, value: Uint8Array): void {
  Buffer.from(value).copy(buffer, offset);
}

export function readBytes(buffer: Uint8Array, offset: number, length: number): Buffer {
  return Buffer.from(buffer).subarray(offset, offset + length);
}
