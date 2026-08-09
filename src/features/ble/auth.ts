/**
 * §4.5 auth challenge–response handshake: read nonce, compute the CMAC
 * proof, write the two-frame authResponse.
 *
 * Implementation for P1-4.0 Part 1 (execution brief §6). Everything a
 * BLE-failure path can do resolves to a typed `HandshakeOutcome` — nothing
 * across this boundary throws, same convention as `AuthClient`'s
 * `AuthResult`.
 */

import { base64ToBytes, bytesToBase64 } from './base64';
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

// None of the timeouts below are spec-defined values; they are app-level
// operational choices, not §4 constants, so they do not belong in
// protocol.ts. Each handshake stage gets its own budget rather than one
// number for everything — connecting to a real device legitimately takes
// longer than a single characteristic read/write, and a shared budget would
// either time out real connects or let a hung read/write stall too long.
const CONNECT_TIMEOUT_MS = 10_000; // BLE connection setup, incl. Android's slower stack
const DISCOVER_TIMEOUT_MS = 5000; // GATT service/characteristic discovery
const READ_TIMEOUT_MS = 3000; // single characteristic read (authChallenge)
const WRITE_TIMEOUT_MS = 3000; // single characteristic write (one authResponse frame)
// §4.5 step 2 — well inside AUTH_NONCE_TTL_MS (30s) so a timeout here still
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

export type HandshakeStage = 'connect' | 'discover' | 'read' | 'write' | 'result';

export type HandshakeOutcome =
  // P1-7.0 — `device` is the same connected handle `authenticate()` already
  // holds internally, handed back so a caller (connection.ts) can monitor
  // BleDeviceLike.onDisconnected() without a second connectToDevice() call —
  // see that method's doc comment for why a second call is unsafe on Android.
  | { ok: true; session: AuthSession; device: BleDeviceLike }
  | { ok: false; resultCode: typeof ResultCode.AUTH_FAILED | typeof ResultCode.RATE_LIMITED }
  | { ok: false; reason: 'timeout'; stage: HandshakeStage }
  | { ok: false; reason: 'transport'; stage: HandshakeStage; detail: string }
  | { ok: false; reason: 'unexpected-result-code'; resultCode: ResultCode };

export interface AuthHandshake {
  authenticate(deviceId: string, input: AuthResponseInput): Promise<HandshakeOutcome>;
}

class HandshakeTimeoutError extends Error {
  readonly stage: HandshakeStage;

  constructor(stage: HandshakeStage) {
    super(`§4.5 handshake stage "${stage}" exceeded its timeout budget`);
    this.name = 'HandshakeTimeoutError';
    this.stage = stage;
  }
}

// Bounds every BLE operation (CLAUDE.md: "Every BLE operation has an
// explicit timeout. No unbounded await."). Rejects with a typed
// HandshakeTimeoutError on expiry rather than resolving to an outcome
// directly, so it composes as a plain awaited promise at each call site;
// authenticate()'s single catch block is what turns that into the typed
// HandshakeOutcome that crosses the function boundary.
async function withTimeout<T>(operation: Promise<T>, ms: number, stage: HandshakeStage): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new HandshakeTimeoutError(stage)), ms);
  });
  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// Base64 lives in `./base64` — hand-rolled, not `btoa`/`atob`, because
// React Native/Hermes polyfills neither (confirmed absent from RN's
// InitializeCore.js and from node_modules/react-native/types), and
// `react-native-ble-plx` represents characteristic values as base64 either
// way (§4.2). It moved out of this file when `scanner.ts` became the third
// module to need it; the decoder now also rejects invalid characters rather
// than decoding them to garbage, which surfaces here as a `transport`
// outcome like any other malformed read.

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

      // Tracks which stage a plain (non-timeout) thrown error should be
      // attributed to in the catch block below — HandshakeTimeoutError
      // already carries its own stage, this is only for the transport path.
      let stage: HandshakeStage = 'connect';
      // Only assigned once discoverAllServicesAndCharacteristics() has
      // resolved — a connect/discover failure must not try to remove a
      // subscription that was never created.
      let subscription: { remove(): void } | undefined;

      try {
        // §4.5 step 1 — connect. `BleManagerLike` (§4) has no method to fetch
        // a Device handle for an already-open connection other than calling
        // connectToDevice() again, so "if not already connected" can't be
        // implemented against this interface as scoped — see this execution
        // report's findings section (real BleManager.connectToDevice forces a
        // disconnect+reconnect on Android when already connected).
        const device: BleDeviceLike = await withTimeout(
          manager.connectToDevice(deviceId),
          CONNECT_TIMEOUT_MS,
          'connect',
        );

        stage = 'discover';
        await withTimeout(
          device.discoverAllServicesAndCharacteristics(),
          DISCOVER_TIMEOUT_MS,
          'discover',
        );

        // §4.5 step 2 — subscribe to commandResult BEFORE writing anything:
        // the device notifies once, asynchronously, and a read issued after
        // the write could race a notification that already fired.
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

        subscription = device.monitorCharacteristicForService(
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
            const resultCode = readUint8(bytes, COMMAND_RESULT_LAYOUT.resultCode.offset) as ResultCode;
            if (resultCode === ResultCode.OK) {
              resolveOnce({
                ok: true,
                session: {
                  sessionId: bytesToBase64(sessionId),
                  keyGeneration,
                  expiresAt: Date.now() + expiresAtDelta * 1000,
                },
                device,
              });
            } else if (resultCode === ResultCode.AUTH_FAILED || resultCode === ResultCode.RATE_LIMITED) {
              resolveOnce({ ok: false, resultCode });
            } else {
              // §4.7 — every one of the ten result codes is handled
              // distinctly; anything past AUTH_FAILED/RATE_LIMITED still
              // gets a typed outcome rather than falling through to look
              // like a silent timeout.
              resolveOnce({ ok: false, reason: 'unexpected-result-code', resultCode });
            }
          },
        );

        // §4.5 step 3 — read authChallenge (C2) → N.
        stage = 'read';
        const challengeCharacteristic = await withTimeout(
          device.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUIDS.authChallenge),
          READ_TIMEOUT_MS,
          'read',
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
        stage = 'write';
        const frame1 = buildFrame1(sessionId, keyGeneration);
        await withTimeout(
          device.writeCharacteristicWithResponseForService(
            BLE_SERVICE_UUID,
            BLE_CHARACTERISTIC_UUIDS.authResponse,
            bytesToBase64(frame1),
          ),
          WRITE_TIMEOUT_MS,
          'write',
        );

        // §4.5 step 6 — write frame 2, as a separate write.
        const frame2 = buildFrame2(proof, expiresAtDelta);
        await withTimeout(
          device.writeCharacteristicWithResponseForService(
            BLE_SERVICE_UUID,
            BLE_CHARACTERISTIC_UUIDS.authResponse,
            bytesToBase64(frame2),
          ),
          WRITE_TIMEOUT_MS,
          'write',
        );

        // §4.5 step 7 — await the commandResult notification, or time out.
        stage = 'result';
        return await withTimeout(resultPromise, HANDSHAKE_RESPONSE_TIMEOUT_MS, 'result');
      } catch (error) {
        if (error instanceof HandshakeTimeoutError) {
          return { ok: false, reason: 'timeout', stage: error.stage };
        }
        // Never across this boundary throws (module doc above) — every other
        // failure (connect rejection, malformed authChallenge, ...) becomes a
        // typed transport outcome instead. `detail` is for logs: never put
        // kSess, the proof, or the nonce in it — `error.message` here only
        // ever carries lengths/ids, never key material.
        const detail = error instanceof Error ? error.message : 'unknown error';
        return { ok: false, reason: 'transport', stage, detail };
      } finally {
        // §4.5 step 9 — unsubscribe in a finally, whichever branch was taken.
        subscription?.remove();
      }
    },
  };
}
