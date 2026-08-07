import { DeviceCore } from '../deviceCore';
import { FakeClock } from '../clock';
import {
  AUTH_NONCE_LENGTH_BYTES,
  AUTH_NONCE_TTL_MS,
  COMMAND_RESULT_LAYOUT,
  LOCK_STATE_LAYOUT,
  LockStateFlagBit,
  ResultCode,
  SESSION_EXPIRY_MAX_DAYS,
} from '../../../src/features/ble/protocol';
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

  test('frame 2 before frame 1 resets the handshake instead of evaluating garbage', () => {
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

    // Out-of-order: frame 2 arrives with no frame 1 buffered.
    core.writeAuthResponseFrame(2, frame2);
    // No commandResult should have been written for the bogus frame 2.
    expect(core.read('commandResult')).toEqual(Buffer.alloc(4, 0));

    // The reset must leave the core ready for a clean attempt.
    core.write('authResponse', frame1);
    core.write('authResponse', frame2);
    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.OK);
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
    tamperedFrame2.writeUInt32LE(tamperedFrame2.readUInt32LE(16) + 1, 16); // bump expiresAtDelta by 1s

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
