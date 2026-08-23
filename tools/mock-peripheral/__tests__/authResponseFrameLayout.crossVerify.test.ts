/**
 * Cross-verification that `protocol.ts` and the mock agree on the §4.5 (v1.4)
 * `authResponse` frame layouts — not merely that both claim to follow §4.5.
 *
 * Modeled on the K_sess cross-check in
 * `supabase/functions/_shared/__tests__/deriveSessionKey.test.ts`: build the
 * expected wire bytes independently, from the spec's byte table restated as
 * raw literals (NOT by importing `AUTH_RESPONSE_FRAME_1_LAYOUT` /
 * `AUTH_RESPONSE_FRAME_2_LAYOUT`, and not via `harness.ts`, which itself
 * builds frames from those same constants), then drive DeviceCore — which
 * parses frames using `protocol.ts`'s constants — with those bytes. If
 * `protocol.ts`'s offsets ever diverged from the table below, this would
 * fail even though `deviceCore.ts` and `protocol.ts` "agree" with each
 * other by construction (deviceCore imports its offsets from protocol.ts) —
 * the point is to pin both against the spec's literal byte table, which is
 * the one thing neither file can drift against silently.
 */
import { DeviceCore } from '../deviceCore';
import { FakeClock } from '../clock';
import { aesCmac, hkdfSha256, nodeDeviceCoreCrypto, nodeNonceSource } from '../crypto';
import {
  AUTH_HKDF_INFO,
  AUTH_PROOF_FIXED_PREFIX,
  AUTH_RESPONSE_FRAME_1_LAYOUT,
  AUTH_RESPONSE_FRAME_2_LAYOUT,
  COMMAND_RESULT_LAYOUT,
  PROTOCOL_VERSION,
  ResultCode,
} from '../../../src/features/ble/protocol';

// §4.5 (v1.4) / addendum §3.1 byte table, restated as raw literals — the
// independent reference both protocol.ts and the mock are checked against.
const SPEC_FRAME_1_TABLE = {
  frameIndex: { offset: 0, length: 1 },
  sessionId: { offset: 1, length: 16 },
  keyGeneration: { offset: 17, length: 1 },
  reserved: { offset: 18, length: 2 },
};
const SPEC_FRAME_2_TABLE = {
  frameIndex: { offset: 0, length: 1 },
  proof: { offset: 1, length: 16 },
  expiresAtDelta: { offset: 17, length: 3 },
};
const SPEC_FRAME_1_INDEX = 0x01;
const SPEC_FRAME_2_INDEX = 0x02;

const K_DEV = Buffer.alloc(16, 0x77);
const SESSION_ID = Buffer.alloc(16, 0x88);
const KEY_GENERATION = 3;
const EXPIRES_AT_DELTA_SECONDS = 7200;

function readResultCode(bytes: Uint8Array): number {
  return bytes[COMMAND_RESULT_LAYOUT.resultCode.offset];
}

describe('protocol.ts / mock cross-verification — §4.5 (v1.4) authResponse frame layouts', () => {
  test('protocol.ts layout constants match the spec byte table verbatim', () => {
    expect(AUTH_RESPONSE_FRAME_1_LAYOUT).toEqual(SPEC_FRAME_1_TABLE);
    expect(AUTH_RESPONSE_FRAME_2_LAYOUT).toEqual(SPEC_FRAME_2_TABLE);
  });

  test('a frame pair built purely from the raw spec table is accepted by the mock', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, crypto: nodeDeviceCoreCrypto, nonceSource: nodeNonceSource });
    core.connect();
    const nonce = Buffer.from(core.read('authChallenge'));

    // frame 1, built with literal offsets from SPEC_FRAME_1_TABLE — independent
    // of protocol.ts's AUTH_RESPONSE_FRAME_1_LAYOUT and of harness.ts.
    const frame1 = Buffer.alloc(20, 0);
    frame1.writeUInt8(SPEC_FRAME_1_INDEX, 0);
    SESSION_ID.copy(frame1, 1);
    frame1.writeUInt8(KEY_GENERATION, 17);
    // bytes 18-19 stay reserved/zero.

    // Independent K_sess + proof derivation, matching §4.5 exactly but computed
    // here rather than reused from deviceCore.ts or harness.ts.
    const kSess = hkdfSha256(
      K_DEV,
      SESSION_ID,
      Buffer.concat([Buffer.from(AUTH_HKDF_INFO, 'utf8'), Buffer.from([KEY_GENERATION])]),
      16,
    );
    const expiresAtDeltaBytes = Buffer.alloc(3);
    expiresAtDeltaBytes.writeUIntLE(EXPIRES_AT_DELTA_SECONDS, 0, 3);
    const proofInput = Buffer.concat([
      Buffer.from([AUTH_PROOF_FIXED_PREFIX]),
      Buffer.from([PROTOCOL_VERSION]),
      nonce,
      SESSION_ID.subarray(0, 4),
      expiresAtDeltaBytes,
    ]);
    const proof = aesCmac(kSess, proofInput).subarray(0, 16);

    // frame 2, built with literal offsets from SPEC_FRAME_2_TABLE.
    const frame2 = Buffer.alloc(20, 0);
    frame2.writeUInt8(SPEC_FRAME_2_INDEX, 0);
    proof.copy(frame2, 1);
    expiresAtDeltaBytes.copy(frame2, 17);

    core.write('authResponse', frame1);
    core.write('authResponse', frame2);

    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.OK);
    expect(core.isAuthenticated()).toBe(true);
  });

  test('a frame pair built from the pre-v1.4 (superseded) offsets is rejected by the mock', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, crypto: nodeDeviceCoreCrypto, nonceSource: nodeNonceSource });
    core.connect();
    core.read('authChallenge');

    // Pre-v1.4 shape: no frameIndex byte, sessionId at offset 0. Writing this
    // means byte 0 (0x88, the first SESSION_ID byte) is read as frameIndex —
    // it matches neither FRAME_1 (0x01) nor FRAME_2 (0x02), so F12 discards it.
    const staleFrame1 = Buffer.alloc(20, 0);
    SESSION_ID.copy(staleFrame1, 0);
    staleFrame1.writeUInt8(KEY_GENERATION, 16);

    core.write('authResponse', staleFrame1);

    // A framing reset writes no commandResult at all.
    expect(core.read('commandResult')).toEqual(new Uint8Array(4));
    expect(core.isAuthenticated()).toBe(false);
  });
});
