import { DeviceCore } from '../deviceCore';
import { FakeClock } from '../clock';
import {
  AUTH_BACKOFF,
  AUTH_NONCE_LENGTH_BYTES,
  AUTH_NONCE_TTL_MS,
  AUTH_RESPONSE_FRAME_2_LAYOUT,
  COMMAND_RESULT_LAYOUT,
  LOCK_STATE_LAYOUT,
  LockStateFlagBit,
  ResultCode,
  SESSION_EXPIRY_MAX_DAYS,
} from '../../../src/features/ble/protocol';
import { readUint24LE, writeUint24LE } from '../byteLayout';
import { buildHandshakeFrames } from './harness';

const K_DEV = Buffer.alloc(16, 0x11);
const SESSION_ID = Buffer.alloc(16, 0x22);

function makeCore(clock: FakeClock) {
  return new DeviceCore({ kDev: K_DEV, clock });
}

function readResultCode(bytes: Uint8Array): number {
  return bytes[COMMAND_RESULT_LAYOUT.resultCode.offset];
}

function readLockStateFlagBit(bytes: Uint8Array, bit: number): boolean {
  return ((bytes[LOCK_STATE_LAYOUT.flags.offset] >> bit) & 1) === 1;
}

describe('DeviceCore — §4.5 handshake', () => {
  test('a valid handshake opens an authenticated session', () => {
    const clock = new FakeClock(0);
    const core = makeCore(clock);
    core.connect();
    const nonce = core.read('authChallenge');

    const { frame1, frame2 } = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 7,
      nonce,
      expiresAtDeltaSeconds: 3600,
    });

    core.write('authResponse', frame1);
    core.write('authResponse', frame2);

    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.OK);
    expect(core.isAuthenticated()).toBe(true);
    expect(readLockStateFlagBit(core.read('lockState'), LockStateFlagBit.AUTHENTICATED_SESSION_ACTIVE)).toBe(
      true,
    );
  });

  test('a stale nonce (past the 30s TTL) fails the handshake', () => {
    const clock = new FakeClock(0);
    const core = makeCore(clock);
    core.connect();
    const nonce = core.read('authChallenge');

    clock.advanceMs(AUTH_NONCE_TTL_MS);

    const { frame1, frame2 } = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: 3600,
    });
    core.write('authResponse', frame1);
    core.write('authResponse', frame2);

    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.AUTH_FAILED);
    expect(core.isAuthenticated()).toBe(false);
  });

  test('FW-19(a) — frame 2 sent first is discarded by frameIndex, no session opens', () => {
    const clock = new FakeClock(0);
    const core = makeCore(clock);
    core.connect();
    const nonce = core.read('authChallenge');

    const { frame1, frame2 } = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: 3600,
    });

    // Out-of-order: frame 2 (frameIndex = 0x02) arrives while FRAME_1 is expected.
    core.writeAuthResponseFrame(frame2);
    // No commandResult should have been written for the bogus frame 2 — a framing
    // reset is silent, not an evaluated (and failed) handshake attempt.
    expect(core.read('commandResult')).toEqual(Buffer.alloc(4, 0));
    expect(core.isAuthenticated()).toBe(false);

    // FW-19(c) — the reset leaves the core ready for a clean attempt, no reconnect needed.
    core.write('authResponse', frame1);
    core.write('authResponse', frame2);
    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.OK);
  });

  test('FW-19(b) — frame 1 sent twice discards the first via frameIndex mismatch, recovers without reconnect', () => {
    const clock = new FakeClock(0);
    const core = makeCore(clock);
    core.connect();
    const nonce = core.read('authChallenge');

    const { frame1, frame2 } = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: 3600,
    });

    // First frame 1: accepted, device now expects FRAME_2.
    core.write('authResponse', frame1);
    // A second frame 1 arrives instead — frameIndex (0x01) does not match the
    // expected FRAME_2, so per F12 this is a framing reset: no commandResult,
    // pending state discarded, device back to expecting a fresh FRAME_1.
    core.write('authResponse', frame1);
    expect(core.read('commandResult')).toEqual(Buffer.alloc(4, 0));
    expect(core.isAuthenticated()).toBe(false);

    // FW-19(c) — a clean frame 1 → frame 2 sequence still succeeds, no reconnect.
    core.write('authResponse', frame1);
    core.write('authResponse', frame2);
    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.OK);
  });

  test('FW-19(c) — a framing reset consumes no F6 backoff attempt and does not invalidate N', () => {
    const clock = new FakeClock(0);
    const core = makeCore(clock);
    core.connect();
    const nonce = core.read('authChallenge');

    const { frame1, frame2 } = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: 3600,
    });

    // Drive AUTH_BACKOFF.shortThresholdFailures - 1 worth of framing resets — if a
    // reset burned an F6 attempt, this alone would trip the short backoff.
    for (let i = 0; i < AUTH_BACKOFF.shortThresholdFailures - 1; i += 1) {
      core.writeAuthResponseFrame(frame2); // frame 2 first — a reset, every time
    }

    // The connection's original nonce N must still be live (not invalidated by any
    // reset) — a clean frame1 → frame2 handshake using it must still succeed.
    core.write('authResponse', frame1);
    core.write('authResponse', frame2);
    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.OK);
    expect(core.isAuthenticated()).toBe(true);
  });

  test('a wrong K_dev produces a mismatched proof → AUTH_FAILED', () => {
    const clock = new FakeClock(0);
    const core = makeCore(clock);
    core.connect();
    const nonce = core.read('authChallenge');

    const wrongKDev = Buffer.alloc(16, 0x99);
    const { frame1, frame2 } = buildHandshakeFrames({
      kDev: wrongKDev,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: 3600,
    });
    core.write('authResponse', frame1);
    core.write('authResponse', frame2);

    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.AUTH_FAILED);
  });

  test('tampering expiresAtDelta in transit invalidates the proof (v1.2 fix, FW-17)', () => {
    const clock = new FakeClock(0);
    const core = makeCore(clock);
    core.connect();
    const nonce = core.read('authChallenge');

    const { frame1, frame2 } = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: 3600,
    });
    const tamperedFrame2 = Buffer.from(frame2);
    const offset = AUTH_RESPONSE_FRAME_2_LAYOUT.expiresAtDelta.offset;
    writeUint24LE(tamperedFrame2, offset, readUint24LE(tamperedFrame2, offset) + 1); // bump expiresAtDelta by 1s

    core.write('authResponse', frame1);
    core.write('authResponse', tamperedFrame2);

    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.AUTH_FAILED);
    expect(core.isAuthenticated()).toBe(false);
  });

  test('expiresAtDelta is capped at SESSION_EXPIRY_MAX_DAYS even if a larger value is requested', () => {
    const clock = new FakeClock(0);
    const core = makeCore(clock);
    core.connect();
    const nonce = core.read('authChallenge');

    const requestedSeconds = (SESSION_EXPIRY_MAX_DAYS + 30) * 24 * 60 * 60; // 30 days past the cap
    const { frame1, frame2 } = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: requestedSeconds,
    });
    core.write('authResponse', frame1);
    core.write('authResponse', frame2);
    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.OK);

    // Advance past the cap (90 days) — the session must already be gone,
    // proving the device capped it rather than honouring the requested value.
    clock.advanceMs(SESSION_EXPIRY_MAX_DAYS * 24 * 60 * 60 * 1000 + 1000);
    core.tick();
    expect(core.isAuthenticated()).toBe(false);
  });

  test('FW-20 — expiresAtDelta of 0xFFFFFF (uint24 max, ~194 days) clamps to 90 days, not rejected', () => {
    const clock = new FakeClock(0);
    const core = makeCore(clock);
    core.connect();
    const nonce = core.read('authChallenge');

    const uint24Max = 0xffffff; // ~194 days — fits the wire field exactly, no overflow
    const { frame1, frame2 } = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: uint24Max,
    });
    core.write('authResponse', frame1);
    core.write('authResponse', frame2);
    // Not rejected: the handshake still succeeds.
    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.OK);
    expect(core.isAuthenticated()).toBe(true);

    // Not honoured: the session is gone at 90 days + 1s, long before the
    // ~194 days 0xFFFFFF would have granted if uncapped.
    clock.advanceMs(SESSION_EXPIRY_MAX_DAYS * 24 * 60 * 60 * 1000 + 1000);
    core.tick();
    expect(core.isAuthenticated()).toBe(false);
  });

  test('each connection issues a fresh nonce (§4.8 F8)', () => {
    const clock = new FakeClock(0);
    const core = makeCore(clock);
    core.connect();
    const firstNonce = Buffer.from(core.read('authChallenge'));
    expect(firstNonce).toHaveLength(AUTH_NONCE_LENGTH_BYTES);

    core.disconnect();
    core.connect();
    const secondNonce = Buffer.from(core.read('authChallenge'));

    expect(secondNonce.equals(firstNonce)).toBe(false);
  });

  test('an injected nonce source is honoured (determinism for tests)', () => {
    const clock = new FakeClock(0);
    const fixedNonce = Buffer.alloc(AUTH_NONCE_LENGTH_BYTES, 0x42);
    const core = new DeviceCore({ kDev: K_DEV, clock, nonceSource: () => fixedNonce });
    core.connect();
    expect(Buffer.from(core.read('authChallenge')).equals(fixedNonce)).toBe(true);
  });
});
