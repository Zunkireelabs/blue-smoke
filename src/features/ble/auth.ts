/**
 * §4.5 auth challenge–response handshake: read nonce, compute the CMAC
 * proof, write the two-frame authResponse.
 *
 * Implementation for P1-4.0 Part 1 (execution brief §6). Everything a
 * BLE-failure path can do resolves to a typed `HandshakeOutcome` — nothing
 * across this boundary throws, same convention as `AuthClient`'s
 * `AuthResult`.
 */

import type { BleDeviceLike, BleManagerLike } from './BleClientContext';
import { aesCmac } from './crypto';
import { readBytes, readUint8, writeBytes, writeUint24LE, writeUint8 } from './byteLayout';
import {
  AUTH_NONCE_LENGTH_BYTES,
  AUTH_PROOF_FIXED_PREFIX,
  AUTH_RESPONSE_FRAME_1_LAYOUT,
  AUTH_RESPONSE_FRAME_2_LAYOUT,
  AuthResponseFrameIndex,
  BLE_CHARACTERISTIC_UUIDS,
  BLE_SERVICE_UUID,
  CHARACTERISTIC_LENGTH_BYTES,
  COMMAND_RESULT_LAYOUT,
  HANDSHAKE_RESULT_COMMAND_ID,
  PROTOCOL_VERSION,
  ResultCode,
} from './protocol';

// §4.5 step 2 — there is no spec-defined value for this timeout; it is an
// app-level operational choice, not a §4 constant, so it does not belong in
// protocol.ts. Well inside AUTH_NONCE_TTL_MS (30s) so a timeout here still
// leaves room to retry against the same nonce.
const HANDSHAKE_RESPONSE_TIMEOUT_MS = 5000;

export interface AuthSession {
  sessionId: string;
  keyGeneration: number;
  expiresAt: number;
}

export interface AuthResponseInput {
  sessionId: Uint8Array; // 16B, from issue-device-session
  kSess: Uint8Array; // 16B, from issue-device-session
  keyGeneration: number; // 0-255
  expiresAtDelta: number; // seconds, ≤ SESSION_EXPIRY_MAX_DAYS worth
}

export type HandshakeOutcome =
  | { ok: true; session: AuthSession }
  | { ok: false; resultCode: typeof ResultCode.AUTH_FAILED | typeof ResultCode.RATE_LIMITED }
  | { ok: false; reason: 'timeout' };

export interface AuthHandshake {
  authenticate(deviceId: string, input: AuthResponseInput): Promise<HandshakeOutcome>;
}

// Hand-rolled base64, not `btoa`/`atob`: React Native/Hermes doesn't polyfill
// either (confirmed absent from RN's InitializeCore.js and from
// node_modules/react-native/types), so depending on them here would be an
// unverified assumption about the on-device runtime — exactly what the brief
// says to check, not guess. `react-native-ble-plx` itself represents
// characteristic values as base64 strings either way (§4.2), so this is
// needed regardless.
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
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

function base64ToBytes(base64: string): Uint8Array {
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

function buildFrame1(sessionId: Uint8Array, keyGeneration: number): Uint8Array {
  const frame = new Uint8Array(CHARACTERISTIC_LENGTH_BYTES.authResponse);
  writeUint8(frame, AUTH_RESPONSE_FRAME_1_LAYOUT.frameIndex.offset, AuthResponseFrameIndex.FRAME_1);
  writeBytes(frame, AUTH_RESPONSE_FRAME_1_LAYOUT.sessionId.offset, sessionId);
  writeUint8(frame, AUTH_RESPONSE_FRAME_1_LAYOUT.keyGeneration.offset, keyGeneration);
  // reserved (2B) left zero-filled.
  return frame;
}

function buildFrame2(proof: Uint8Array, expiresAtDelta: number): Uint8Array {
  const frame = new Uint8Array(CHARACTERISTIC_LENGTH_BYTES.authResponse);
  writeUint8(frame, AUTH_RESPONSE_FRAME_2_LAYOUT.frameIndex.offset, AuthResponseFrameIndex.FRAME_2);
  writeBytes(frame, AUTH_RESPONSE_FRAME_2_LAYOUT.proof.offset, proof);
  writeUint24LE(frame, AUTH_RESPONSE_FRAME_2_LAYOUT.expiresAtDelta.offset, expiresAtDelta);
  return frame;
}

function computeProof(input: {
  kSess: Uint8Array;
  nonce: Uint8Array;
  sessionId: Uint8Array;
  expiresAtDelta: number;
}): Uint8Array {
  const { kSess, nonce, sessionId, expiresAtDelta } = input;
  const expiresAtDeltaBytes = new Uint8Array(3);
  writeUint24LE(expiresAtDeltaBytes, 0, expiresAtDelta);

  const proofInput = new Uint8Array(1 + 1 + nonce.length + 4 + 3);
  let offset = 0;
  writeUint8(proofInput, offset, AUTH_PROOF_FIXED_PREFIX);
  offset += 1;
  writeUint8(proofInput, offset, PROTOCOL_VERSION);
  offset += 1;
  writeBytes(proofInput, offset, nonce);
  offset += nonce.length;
  // §4.5 — "session_id[0..3]" means the first 4 bytes, half-open range;
  // confirmed against deviceCore.ts's evaluateHandshake (frame1.sessionId.subarray(0, 4)).
  writeBytes(proofInput, offset, readBytes(sessionId, 0, 4));
  offset += 4;
  writeBytes(proofInput, offset, expiresAtDeltaBytes);

  return aesCmac(kSess, proofInput);
}

export function createAuthHandshake(manager: BleManagerLike): AuthHandshake {
  return {
    async authenticate(deviceId: string, input: AuthResponseInput): Promise<HandshakeOutcome> {
      const { sessionId, kSess, keyGeneration, expiresAtDelta } = input;

      // §4.5 step 1 — connect. `BleManagerLike` (§4) has no method to fetch a
      // Device handle for an already-open connection other than calling
      // connectToDevice() again, so "if not already connected" can't be
      // implemented against this interface as scoped — see this execution
      // report's findings section (real BleManager.connectToDevice forces a
      // disconnect+reconnect on Android when already connected).
      const device: BleDeviceLike = await manager.connectToDevice(deviceId);
      await device.discoverAllServicesAndCharacteristics();

      // §4.5 step 2 — subscribe to commandResult BEFORE writing anything: the
      // device notifies once, asynchronously, and a read issued after the
      // write could race a notification that already fired.
      let settleResult: (outcome: HandshakeOutcome) => void;
      const resultPromise = new Promise<HandshakeOutcome>((resolve) => {
        settleResult = resolve;
      });
      let settled = false;
      const resolveOnce = (outcome: HandshakeOutcome): void => {
        if (settled) {
          return;
        }
        settled = true;
        settleResult(outcome);
      };

      const subscription = device.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_CHARACTERISTIC_UUIDS.commandResult,
        (error, characteristic) => {
          if (error || !characteristic?.value) {
            return;
          }
          const bytes = base64ToBytes(characteristic.value);
          const commandId = readUint8(bytes, COMMAND_RESULT_LAYOUT.commandId.offset);
          if (commandId !== HANDSHAKE_RESULT_COMMAND_ID) {
            // Something unrelated wrote to this characteristic (e.g. an
            // in-flight lockCommand result) — not this handshake's answer.
            return;
          }
          const resultCode = readUint8(bytes, COMMAND_RESULT_LAYOUT.resultCode.offset);
          if (resultCode === ResultCode.OK) {
            resolveOnce({
              ok: true,
              session: {
                sessionId: bytesToBase64(sessionId),
                keyGeneration,
                expiresAt: Date.now() + expiresAtDelta * 1000,
              },
            });
          } else if (resultCode === ResultCode.AUTH_FAILED || resultCode === ResultCode.RATE_LIMITED) {
            resolveOnce({ ok: false, resultCode });
          }
        },
      );

      try {
        // §4.5 step 3 — read authChallenge (C2) → N.
        const challengeCharacteristic = await device.readCharacteristicForService(
          BLE_SERVICE_UUID,
          BLE_CHARACTERISTIC_UUIDS.authChallenge,
        );
        if (!challengeCharacteristic.value) {
          throw new Error('authChallenge read returned no value');
        }
        const nonce = base64ToBytes(challengeCharacteristic.value);
        if (nonce.length !== AUTH_NONCE_LENGTH_BYTES) {
          throw new Error(`authChallenge: expected ${AUTH_NONCE_LENGTH_BYTES} bytes, got ${nonce.length}`);
        }

        // §4.5 step 4 — compute the proof.
        const proof = computeProof({ kSess, nonce, sessionId, expiresAtDelta });

        // §4.5 step 5 — write frame 1, fully awaited before frame 2.
        const frame1 = buildFrame1(sessionId, keyGeneration);
        await device.writeCharacteristicWithResponseForService(
          BLE_SERVICE_UUID,
          BLE_CHARACTERISTIC_UUIDS.authResponse,
          bytesToBase64(frame1),
        );

        // §4.5 step 6 — write frame 2, as a separate write.
        const frame2 = buildFrame2(proof, expiresAtDelta);
        await device.writeCharacteristicWithResponseForService(
          BLE_SERVICE_UUID,
          BLE_CHARACTERISTIC_UUIDS.authResponse,
          bytesToBase64(frame2),
        );

        // §4.5 step 7 — await the commandResult notification, or time out.
        // `resolveOnce` is idempotent, so whichever fires first — the
        // monitor callback above, or this timer — wins; the other is a no-op.
        const timeoutHandle = setTimeout(
          () => resolveOnce({ ok: false, reason: 'timeout' }),
          HANDSHAKE_RESPONSE_TIMEOUT_MS,
        );
        try {
          return await resultPromise;
        } finally {
          clearTimeout(timeoutHandle);
        }
      } finally {
        // §4.5 step 9 — unsubscribe in a finally, whichever branch was taken.
        subscription.remove();
      }
    },
  };
}
