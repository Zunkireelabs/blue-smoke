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
import { buildHandshakeFrames, NODE_DEPS } from './harness';

const K_DEV = Buffer.alloc(16, 0x11);
const SESSION_ID = Buffer.alloc(16, 0x22);

function makeCore(clock: FakeClock) {
  return new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });
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

    // Out-of-order: frame 2 (frameIndex = 0x02) arrives with nothing buffered.
    core.writeAuthResponseFrame(frame2);
    // No commandResult should have been written for the bogus frame 2 — a framing
    // reset is silent, not an evaluated (and failed) handshake attempt.
    expect(core.read('commandResult')).toEqual(new Uint8Array(4));
    expect(core.isAuthenticated()).toBe(false);

    // FW-19(c) — the reset leaves the core ready for a clean attempt, no reconnect needed.
    core.write('authResponse', frame1);
    core.write('authResponse', frame2);
    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.OK);
  });

  test('FW-19(b) — frame 1 sent twice REPLACES the first (F12a) and completes against the second session_id', () => {
    const clock = new FakeClock(0);
    const core = makeCore(clock);
    core.connect();
    const nonce = core.read('authChallenge');

    const FIRST_SESSION_ID = Buffer.alloc(16, 0x22);
    const SECOND_SESSION_ID = Buffer.alloc(16, 0x33); // deliberately different from the first

    const first = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: FIRST_SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: 3600,
    });
    const second = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SECOND_SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: 3600,
    });

    // First frame 1: accepted, device now expects FRAME_2, buffers FIRST_SESSION_ID.
    core.write('authResponse', first.frame1);
    // A second, different frame 1 arrives instead — per F12(a) this REPLACES the
    // buffered session_id/keyGeneration and the device keeps awaiting FRAME_2. No
    // commandResult is written for the replace itself.
    core.write('authResponse', second.frame1);
    expect(core.read('commandResult')).toEqual(new Uint8Array(4));
    expect(core.isAuthenticated()).toBe(false);

    // Completing with the FIRST session's frame 2 must fail — the device is holding
    // the SECOND session_id now, so that proof does not match.
    core.write('authResponse', first.frame2);
    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.AUTH_FAILED);
    expect(core.isAuthenticated()).toBe(false);
  });

  test('FW-19(b) — frame 1 → frame 1 → frame 2 completes the handshake, does not dead-end', () => {
    const clock = new FakeClock(0);
    const core = makeCore(clock);
    core.connect();
    const nonce = core.read('authChallenge');

    const FIRST_SESSION_ID = Buffer.alloc(16, 0x22);
    const SECOND_SESSION_ID = Buffer.alloc(16, 0x33); // deliberately different from the first

    const first = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: FIRST_SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: 3600,
    });
    const second = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SECOND_SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: 3600,
    });

    core.write('authResponse', first.frame1);
    core.write('authResponse', second.frame1); // replaces — no reconnect, no dead-end
    core.write('authResponse', second.frame2); // matches the SECOND frame 1's session_id

    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.OK);
    expect(core.isAuthenticated()).toBe(true);
  });

  test('FW-19(c) — after a case-(a) reset, a clean frame 1 → frame 2 still succeeds without a reconnect', () => {
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

    // Case (a): a frame 2 arriving with nothing buffered resets.
    core.writeAuthResponseFrame(frame2);
    expect(core.read('commandResult')).toEqual(new Uint8Array(4));

    // No reconnect — same connection, same nonce, a clean attempt still succeeds.
    core.write('authResponse', frame1);
    core.write('authResponse', frame2);
    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.OK);
    expect(core.isAuthenticated()).toBe(true);
  });

  test('FW-19(d) — neither (a) nor (b) consumes an F6 backoff attempt, and N stays valid', () => {
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

    // A framing event with a frameIndex that is neither 0x01 nor 0x02 always
    // resets (F12b), regardless of what is currently expected/buffered — used
    // here purely to unwind state between iterations without ever completing
    // (and therefore without ever consuming N).
    const junkFrame = Buffer.alloc(20, 0);
    junkFrame.writeUInt8(0x03, AUTH_RESPONSE_FRAME_2_LAYOUT.frameIndex.offset);

    // Drive at least AUTH_BACKOFF.shortThresholdFailures framing events, mixing
    // case-(a) stray frame 2s and case-(b) duplicate frame 1s — v1.8's own note:
    // "a loop bound of shortThresholdFailures - 1 makes (d) vacuous", so this
    // drives the full threshold, not one short of it.
    for (let i = 0; i < AUTH_BACKOFF.shortThresholdFailures; i += 1) {
      if (i % 2 === 0) {
        // case (a): frame 2 with nothing buffered.
        core.writeAuthResponseFrame(frame2);
      } else {
        // case (b): a duplicate frame 1 replaces the buffered one; unwind with
        // the junk frame so the next iteration starts from a clean FRAME_1 wait
        // without ever reaching a real frame 2 (which would complete early).
        core.write('authResponse', frame1);
        core.write('authResponse', frame1);
        core.writeAuthResponseFrame(junkFrame);
      }
    }

    // The connection's original nonce N must still be live (not invalidated by
    // any framing event) — a clean frame1 → frame2 handshake using it must still
    // return OK, not RATE_LIMITED (which would prove a framing event silently
    // armed F6 backoff).
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
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS, nonceSource: () => fixedNonce });
    core.connect();
    expect(Buffer.from(core.read('authChallenge')).equals(fixedNonce)).toBe(true);
  });
});
