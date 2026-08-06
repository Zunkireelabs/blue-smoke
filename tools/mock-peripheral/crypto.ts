/**
 * AES-128-CMAC (RFC 4493) and HKDF-SHA256, for the mock peripheral only.
 *
 * Deliberately NOT shared with app-side code. P1-4.0 will need its own
 * CMAC on the app side; if both sides called the same function, a bug in
 * it would cancel out in integration tests and only surface against real
 * hardware. See docs/execution-briefs/P0-2.5-mock-ble-peripheral.md §3.1(b).
 *
 * CMAC validated against the RFC 4493 Appendix A test vectors —
 * see __tests__/cmac.rfc4493.test.ts.
 */

import { createCipheriv, hkdfSync, timingSafeEqual } from 'node:crypto';

const BLOCK_SIZE_BYTES = 16;

// RFC 4493 §2.3 — the constant Rb for a 128-bit block cipher: the 128-bit
// value 0x00...0087 (big-endian), used to reduce mod the GF(2^128)
// generator polynomial when a subkey shift overflows the block.
function rbBlock(): Buffer {
  const block = Buffer.alloc(BLOCK_SIZE_BYTES, 0);
  block[BLOCK_SIZE_BYTES - 1] = 0x87;
  return block;
}

function aes128EncryptBlock(key: Uint8Array, block: Uint8Array): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

function xorBytes(a: Uint8Array, b: Uint8Array): Buffer {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i] ^ b[i];
  }
  return out;
}

// RFC 4493 §2.3 — left-shift the 128-bit block by one bit, discarding the
// bit shifted off the top (the caller decides whether to XOR const_Rb back
// in based on that discarded bit).
function leftShiftOneBit(input: Uint8Array): Buffer {
  const out = Buffer.alloc(input.length);
  let carryIn = 0;
  for (let i = input.length - 1; i >= 0; i -= 1) {
    out[i] = ((input[i] << 1) | carryIn) & 0xff;
    carryIn = (input[i] & 0x80) !== 0 ? 1 : 0;
  }
  return out;
}

interface Subkeys {
  k1: Buffer;
  k2: Buffer;
}

// RFC 4493 §2.3 — subkey generation.
function generateSubkeys(key: Uint8Array): Subkeys {
  const zeroBlock = Buffer.alloc(BLOCK_SIZE_BYTES, 0);
  const l = aes128EncryptBlock(key, zeroBlock);

  const k1 =
    (l[0] & 0x80) === 0 ? leftShiftOneBit(l) : xorBytes(leftShiftOneBit(l), rbBlock());
  const k2 =
    (k1[0] & 0x80) === 0
      ? leftShiftOneBit(k1)
      : xorBytes(leftShiftOneBit(k1), rbBlock());

  return { k1, k2 };
}

// RFC 4493 §2.4 — padding: append 0x80 then zero-fill to the block size.
function padBlock(partialBlock: Uint8Array): Buffer {
  const out = Buffer.alloc(BLOCK_SIZE_BYTES, 0);
  out.set(partialBlock);
  out[partialBlock.length] = 0x80;
  return out;
}

/** AES-128-CMAC per RFC 4493 §2.4. Returns the full 16-byte tag. */
export function aesCmac(key: Uint8Array, message: Uint8Array): Buffer {
  if (key.length !== BLOCK_SIZE_BYTES) {
    throw new Error('aesCmac: key must be 16 bytes (AES-128)');
  }

  const { k1, k2 } = generateSubkeys(key);

  const blockCount = Math.max(1, Math.ceil(message.length / BLOCK_SIZE_BYTES));
  const lastBlockIsComplete =
    message.length !== 0 && message.length % BLOCK_SIZE_BYTES === 0;

  const leadingBlocks = message.subarray(0, (blockCount - 1) * BLOCK_SIZE_BYTES);
  const finalBlockRaw = message.subarray((blockCount - 1) * BLOCK_SIZE_BYTES);

  const finalBlock = lastBlockIsComplete
    ? xorBytes(finalBlockRaw, k1)
    : xorBytes(padBlock(finalBlockRaw), k2);

  let x: Uint8Array = Buffer.alloc(BLOCK_SIZE_BYTES, 0);
  for (let i = 0; i < blockCount - 1; i += 1) {
    const block = leadingBlocks.subarray(i * BLOCK_SIZE_BYTES, (i + 1) * BLOCK_SIZE_BYTES);
    x = aes128EncryptBlock(key, xorBytes(x, block));
  }

  return aes128EncryptBlock(key, xorBytes(x, finalBlock));
}

/** HKDF-SHA256 per spec §4.5. Returns `lengthBytes` of derived key material. */
export function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  lengthBytes: number,
): Buffer {
  return Buffer.from(hkdfSync('sha256', ikm, salt, info, lengthBytes));
}

/** §4.8 F7 — constant-time comparison for all CMAC/tag verification. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
