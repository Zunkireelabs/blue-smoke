/**
 * `K_sess` derivation — spec §4.5 and §5.4 step 6.
 *
 * ⚠️ THIS FUNCTION HAS A COUNTERPART IT MUST AGREE WITH, BYTE FOR BYTE.
 *
 * The device performs the identical derivation in firmware; `tools/mock-peripheral`'s
 * `deviceCore.ts` is our executable model of it. If the two disagree by a single byte, the
 * CMAC proof will not match and **every authentication on real hardware fails** — with no
 * useful error, because a wrong key and a forged key are indistinguishable by design.
 *
 * That is not hypothetical: spec v1.2 fixed exactly this bug, where `info` bound `user_id`
 * and an absolute `expires_at` that the handshake never sends, making `K_sess` underivable
 * device-side. The cross-verification test beside this file exists so that class of defect
 * cannot return silently.
 *
 * ── The derivation ────────────────────────────────────────────────────────────────────
 *
 *   K_sess = HKDF-SHA256(
 *     ikm    = K_dev                      (16 bytes, from Vault)
 *     salt   = session_id                 (16 random bytes, generated per issuance)
 *     info   = "bluesmoke-session-v1" ‖ keyGeneration
 *     length = 16 bytes
 *   )
 *
 * ── The detail most likely to be got wrong ────────────────────────────────────────────
 *
 * `keyGeneration` is appended as **ONE RAW BYTE**, not as its decimal text. The spec prose
 * says `info = AUTH_HKDF_INFO ‖ key_generation`, which does not pin that down; the device
 * model does — `Buffer.concat([utf8(INFO), Buffer.from([keyGeneration])])`. Writing
 * `INFO + String(keyGeneration)` would append `0x31` instead of `0x01` for generation 1,
 * produce a completely different key, and pass every unit test that does not compare against
 * the device implementation.
 *
 * ── What `info` must NOT contain ──────────────────────────────────────────────────────
 *
 * Not `user_id`, not an absolute `expires_at`. The device is offline, has no clock, and is
 * never sent either value, so it could not reproduce them. Both are enforced server-side at
 * issuance instead, which is the only place they can be checked at all. Expiry reaches the
 * device as the authenticated RELATIVE `expiresAtDelta` inside the handshake proof.
 *
 * Web Crypto only, so this runs unchanged in Deno (the Edge runtime) and Node (the tests).
 */

/** Spec §4.5 / `src/features/ble/protocol.ts` AUTH_HKDF_INFO. */
export const AUTH_HKDF_INFO = 'bluesmoke-session-v1';

/** §4.5 — K_sess is an AES-128 key. */
export const K_SESS_LENGTH_BYTES = 16;

/** §4.5 — the HKDF salt is the 16-byte session id. */
export const SESSION_ID_LENGTH_BYTES = 16;

/** §4.5 — hard cap on session lifetime. §8.5 recommends 30. */
export const SESSION_EXPIRY_MAX_DAYS = 90;

/**
 * Builds the HKDF `info` parameter. Separated out and exported so the cross-verification test
 * can assert on the exact bytes rather than only on the derived key — when the two
 * implementations disagree, the byte-level assertion is what tells you why.
 */
export function buildHkdfInfo(keyGeneration: number): Uint8Array {
  if (!Number.isInteger(keyGeneration) || keyGeneration < 0 || keyGeneration > 255) {
    // A generation outside a byte cannot be encoded the way the device reads it. Failing
    // loudly beats silently truncating and deriving a key that will never authenticate.
    throw new RangeError(`keyGeneration must be a single byte (0-255), got ${keyGeneration}`);
  }
  const infoBytes = new TextEncoder().encode(AUTH_HKDF_INFO);
  const out = new Uint8Array(infoBytes.length + 1);
  out.set(infoBytes, 0);
  out[infoBytes.length] = keyGeneration; // ONE RAW BYTE — see the header.
  return out;
}

export async function deriveSessionKey(
  kDev: Uint8Array,
  sessionId: Uint8Array,
  keyGeneration: number,
): Promise<Uint8Array> {
  if (sessionId.length !== SESSION_ID_LENGTH_BYTES) {
    throw new RangeError(`session_id must be ${SESSION_ID_LENGTH_BYTES} bytes`);
  }

  const ikm = await crypto.subtle.importKey('raw', kDev, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: sessionId,
      info: buildHkdfInfo(keyGeneration),
    },
    ikm,
    K_SESS_LENGTH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new RangeError('hex string must have an even length');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
