/**
 * AES-128-CMAC (RFC 4493), for the app side of the §4.5 handshake.
 *
 * §5.1 — deliberately NOT shared with `tools/mock-peripheral/crypto.ts`: if
 * both sides of the handshake used the same CMAC implementation, a bug in it
 * would cancel out in every test that runs this app code against the mock,
 * and only surface against real hardware. Written independently from RFC
 * 4493 §2.3/§2.4 — only the public RFC 4493 Appendix A test vectors are
 * shared with the mock's own suite (see `__tests__/crypto.test.ts`), never
 * the implementation.
 *
 * No `node:crypto` — Hermes has no such module. The one primitive borrowed
 * from a library is a raw, unpadded AES-128 single-block encrypt from
 * `@noble/ciphers`; subkey generation and the MAC computation on top of it
 * are this file's own. The block primitive is checked against the FIPS-197
 * Appendix B known-answer vector in `__tests__/crypto.test.ts` before
 * anything here is trusted.
 */

import { ecb } from '@noble/ciphers/aes.js';

const BLOCK_SIZE_BYTES = 16;

// RFC 4493 §2.3 — the constant Rb for a 128-bit block cipher: the 128-bit
// value 0x00...0087 (big-endian), XORed in when a subkey's left-shift
// overflows the block.
const RB_LAST_BYTE = 0x87;

function encryptBlock(key: Uint8Array, block: Uint8Array): Uint8Array {
  return ecb(key, { disablePadding: true }).encrypt(block);
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    out[i] = a[i] ^ b[i];
  }
  return out;
}

// RFC 4493 §2.3 — left-shift a 128-bit block by one bit, MSB-first, dropping
// the bit shifted off the top.
function shiftLeftOneBit(input: Uint8Array): Uint8Array {
  const out = new Uint8Array(input.length);
  let carry = 0;
  for (let i = input.length - 1; i >= 0; i -= 1) {
    out[i] = ((input[i] << 1) | carry) & 0xff;
    carry = (input[i] & 0x80) !== 0 ? 1 : 0;
  }
  return out;
}

// RFC 4493 §2.3 — dbl(): shift left one bit, then conditionally XOR in Rb if
// the bit shifted off the top was set.
function dbl(block: Uint8Array): Uint8Array {
  const topBitWasSet = (block[0] & 0x80) !== 0;
  const shifted = shiftLeftOneBit(block);
  if (!topBitWasSet) {
    return shifted;
  }
  const rb = new Uint8Array(BLOCK_SIZE_BYTES);
  rb[BLOCK_SIZE_BYTES - 1] = RB_LAST_BYTE;
  return xor(shifted, rb);
}

interface Subkeys {
  k1: Uint8Array;
  k2: Uint8Array;
}

// RFC 4493 §2.3 — subkey generation from AES-128-encrypting an all-zero block.
function generateSubkeys(key: Uint8Array): Subkeys {
  const zeroBlock = new Uint8Array(BLOCK_SIZE_BYTES);
  const l = encryptBlock(key, zeroBlock);
  const k1 = dbl(l);
  const k2 = dbl(k1);
  return { k1, k2 };
}

// RFC 4493 §2.4 — padding: append a single 0x80 byte, then zero-fill to the
// block size.
function padBlock(partialBlock: Uint8Array): Uint8Array {
  const out = new Uint8Array(BLOCK_SIZE_BYTES);
  out.set(partialBlock);
  out[partialBlock.length] = 0x80;
  return out;
}

/** AES-128-CMAC per RFC 4493 §2.4. Returns the full 16-byte tag. */
export function aesCmac(key: Uint8Array, message: Uint8Array): Uint8Array {
  if (key.length !== BLOCK_SIZE_BYTES) {
    throw new Error('aesCmac: key must be 16 bytes (AES-128)');
  }

  const { k1, k2 } = generateSubkeys(key);

  const blockCount = Math.max(1, Math.ceil(message.length / BLOCK_SIZE_BYTES));
  const lastBlockIsComplete = message.length !== 0 && message.length % BLOCK_SIZE_BYTES === 0;

  let x: Uint8Array = new Uint8Array(BLOCK_SIZE_BYTES);
  for (let i = 0; i < blockCount - 1; i += 1) {
    const block = message.subarray(i * BLOCK_SIZE_BYTES, (i + 1) * BLOCK_SIZE_BYTES);
    x = encryptBlock(key, xor(x, block));
  }

  const lastBlockRaw = message.subarray((blockCount - 1) * BLOCK_SIZE_BYTES);
  const lastBlock = lastBlockIsComplete ? xor(lastBlockRaw, k1) : xor(padBlock(lastBlockRaw), k2);

  return encryptBlock(key, xor(x, lastBlock));
}
