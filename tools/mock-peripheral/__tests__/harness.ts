/**
 * Test-only helper: plays the role of a correctly-implemented app/central
 * to build valid §4.5 handshake frames and §4.6 command frames.
 *
 * Uses the mock's OWN crypto.ts (the "device" side). There is no app-side
 * CMAC yet — that's P1-4.0 — so this is the only implementation available
 * to construct fixtures with. It is still the single implementation the
 * mock validates itself against (brief §3.1(b) is about not sharing CMAC
 * *between the app and the device*, not about the test harness).
 */

import { aesCmac, hkdfSha256, nodeDeviceCoreCrypto, nodeNonceSource } from '../crypto';
import type { DeviceCoreConfig } from '../deviceCore';
import {
  AUTH_HKDF_INFO,
  AUTH_PROOF_FIXED_PREFIX,
  AUTH_RESPONSE_FRAME_1_LAYOUT,
  AUTH_RESPONSE_FRAME_2_LAYOUT,
  AuthResponseFrameIndex,
  PROTOCOL_VERSION,
} from '../../../src/features/ble/protocol';
import { writeUint24LE } from '../byteLayout';

/**
 * P1-3.0 §2.1 — `DeviceCore` takes no default crypto/nonceSource (deviceCore.ts's module doc
 * comment explains why: a top-level `node:crypto` import there would break any Metro bundle
 * that reaches it). Every test construction site spreads this in, the same way the Node test
 * harness supplies real node:crypto-backed implementations per the P1-3.0 brief §2.1.
 */
export const NODE_DEPS: Pick<DeviceCoreConfig, 'crypto' | 'nonceSource'> = {
  crypto: nodeDeviceCoreCrypto,
  nonceSource: nodeNonceSource,
};

export function deriveKSess(kDev: Uint8Array, sessionId: Uint8Array, keyGeneration: number): Buffer {
  return hkdfSha256(
    kDev,
    sessionId,
    Buffer.concat([Buffer.from(AUTH_HKDF_INFO, 'utf8'), Buffer.from([keyGeneration])]),
    16,
  );
}

export interface HandshakeFrames {
  frame1: Buffer;
  frame2: Buffer;
  kSess: Buffer;
}

export function buildHandshakeFrames(options: {
  kDev: Uint8Array;
  sessionId: Uint8Array;
  keyGeneration: number;
  nonce: Uint8Array;
  expiresAtDeltaSeconds: number;
}): HandshakeFrames {
  const { kDev, sessionId, keyGeneration, nonce, expiresAtDeltaSeconds } = options;
  const kSess = deriveKSess(kDev, sessionId, keyGeneration);

  // §4.5 (v1.4) frame 1: [ frameIndex=0x01 | session_id (16B) | keyGeneration (1B) | reserved (2B) ]
  const frame1 = Buffer.alloc(20, 0);
  frame1.writeUInt8(AuthResponseFrameIndex.FRAME_1, AUTH_RESPONSE_FRAME_1_LAYOUT.frameIndex.offset);
  Buffer.from(sessionId).copy(frame1, AUTH_RESPONSE_FRAME_1_LAYOUT.sessionId.offset);
  frame1.writeUInt8(keyGeneration, AUTH_RESPONSE_FRAME_1_LAYOUT.keyGeneration.offset);

  // §4.5 (v1.4) expiresAtDelta narrowed to uint24 LE (3B), inside the proof CMAC as sent.
  const expiresAtDeltaBytes = Buffer.alloc(3);
  writeUint24LE(expiresAtDeltaBytes, 0, expiresAtDeltaSeconds >>> 0);

  const proofInput = Buffer.concat([
    Buffer.from([AUTH_PROOF_FIXED_PREFIX]),
    Buffer.from([PROTOCOL_VERSION]),
    Buffer.from(nonce),
    Buffer.from(sessionId).subarray(0, 4),
    expiresAtDeltaBytes,
  ]);
  const proof = aesCmac(kSess, proofInput).subarray(0, 16);

  // §4.5 (v1.4) frame 2: [ frameIndex=0x02 | proof (16B) | expiresAtDelta (3B, uint24 LE) ]
  const frame2 = Buffer.alloc(20, 0);
  frame2.writeUInt8(AuthResponseFrameIndex.FRAME_2, AUTH_RESPONSE_FRAME_2_LAYOUT.frameIndex.offset);
  proof.copy(frame2, AUTH_RESPONSE_FRAME_2_LAYOUT.proof.offset);
  expiresAtDeltaBytes.copy(frame2, AUTH_RESPONSE_FRAME_2_LAYOUT.expiresAtDelta.offset);

  return { frame1, frame2, kSess };
}

export function buildLockCommandFrame(options: {
  kSess: Uint8Array;
  nonce: Uint8Array;
  commandId: number;
  counter: number;
  payload?: Uint8Array;
}): Buffer {
  const { kSess, nonce, commandId, counter, payload } = options;
  const frame = Buffer.alloc(20, 0);
  frame.writeUInt8(commandId, 0);
  frame.writeUInt32LE(counter >>> 0, 1);
  if (payload) {
    Buffer.from(payload).copy(frame, 5, 0, Math.min(payload.length, 7));
  }

  const tagInput = Buffer.concat([Buffer.from(nonce), frame.subarray(0, 12)]);
  const tag = aesCmac(kSess, tagInput).subarray(0, 8);
  tag.copy(frame, 12);

  return frame;
}

export function randomBytesFixed(seedByte: number, length = 16): Buffer {
  return Buffer.alloc(length, seedByte);
}
