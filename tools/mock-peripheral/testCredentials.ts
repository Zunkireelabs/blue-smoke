/**
 * §4.5 test credentials shared by connection.test.ts and journey.test.ts.
 *
 * 🔴 `K_DEV` here is a test stand-in, not the real factory key. This file
 * does not touch, advance, or unblock OQ-4 (who burns the device root key at
 * manufacture) or OQ-12 (the `serial_hash` salt) — anyone describing it that
 * way is wrong.
 *
 * Lives outside `__tests__/` so the mock's Jest project does not try to run
 * it as a suite.
 */
import { hkdfSha256 } from './crypto';
import type { AuthResponseInput } from '../../src/features/ble/auth';
import { AUTH_HKDF_INFO } from '../../src/features/ble/protocol';

export const K_DEV = Uint8Array.from({ length: 16 }, (_, i) => 0x10 + i);
export const SESSION_ID = Uint8Array.from({ length: 16 }, (_, i) => 0x20 + i);
export const KEY_GENERATION = 7;
export const EXPIRES_AT_DELTA = 3600;

export function deriveKSess(kDev: Uint8Array, sessionId: Uint8Array, keyGeneration: number): Uint8Array {
  return hkdfSha256(
    kDev,
    sessionId,
    Buffer.concat([Buffer.from(AUTH_HKDF_INFO, 'utf8'), Buffer.from([keyGeneration])]),
    16,
  );
}

export function validCredentials(): AuthResponseInput {
  return {
    sessionId: SESSION_ID,
    kSess: deriveKSess(K_DEV, SESSION_ID, KEY_GENERATION),
    keyGeneration: KEY_GENERATION,
    expiresAtDelta: EXPIRES_AT_DELTA,
  };
}

export function wrongCredentials(): AuthResponseInput {
  return {
    ...validCredentials(),
    kSess: Uint8Array.from({ length: 16 }, (_, i) => 0x90 + i),
  };
}
