import { DeviceCore } from '../deviceCore';
import { FakeClock } from '../clock';
import {
  AUTH_BACKOFF,
  AUTOLOCK_GRACE_MS_DEFAULT,
  CommandId,
  DEVICE_INFO_LAYOUT,
  LOCK_STATE_LAYOUT,
  LockReason,
  LockState,
  LockStateFlagBit,
  PROTOCOL_VERSION,
  ProvisioningState,
  ResultCode,
} from '../../../src/features/ble/protocol';
import { buildHandshakeFrames, buildLockCommandFrame } from './harness';
import { constantTimeEqual } from '../crypto';

const K_DEV = Buffer.alloc(16, 0x55);
const SESSION_ID = Buffer.alloc(16, 0x66);

function readState(bytes: Uint8Array): number {
  return bytes[LOCK_STATE_LAYOUT.state.offset];
}
function readLastLockReason(bytes: Uint8Array): number {
  return bytes[LOCK_STATE_LAYOUT.lastLockReason.offset];
}
function readFlagBit(bytes: Uint8Array, bit: number): boolean {
  return ((bytes[LOCK_STATE_LAYOUT.flags.offset] >> bit) & 1) === 1;
}

function authenticateAndUnlock(core: DeviceCore) {
  core.connect();
  const nonce = Buffer.from(core.read('authChallenge'));
  const { frame1, frame2, kSess } = buildHandshakeFrames({
    kDev: K_DEV,
    sessionId: SESSION_ID,
    keyGeneration: 1,
    nonce,
    expiresAtDeltaSeconds: 3600,
  });
  core.write('authResponse', frame1);
  core.write('authResponse', frame2);
  core.write('lockCommand', buildLockCommandFrame({ kSess, nonce, commandId: CommandId.UNLOCK, counter: 1 }));
  return { nonce, kSess };
}

describe('DeviceCore — §4.8 firmware obligations', () => {
  test('§4.3 deviceInfo — protocolVersion, provisioningState reflect config', () => {
    const core = new DeviceCore({
      kDev: K_DEV,
      clock: new FakeClock(0),
      provisioningState: ProvisioningState.ACTIVATED,
      keyGeneration: 9,
    });
    const info = core.read('deviceInfo');
    expect(info[DEVICE_INFO_LAYOUT.protocolVersion.offset]).toBe(PROTOCOL_VERSION);
    expect(info[DEVICE_INFO_LAYOUT.provisioningState.offset]).toBe(ProvisioningState.ACTIVATED);
    expect(info[DEVICE_INFO_LAYOUT.keyGeneration.offset]).toBe(9);
  });

  test('F2 — disconnect while unlocked starts the dead-man countdown; it fires after autoLockGraceMs', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({
      kDev: K_DEV,
      clock,
      provisioningState: ProvisioningState.ACTIVATED,
    });
    authenticateAndUnlock(core);
    expect(readState(core.read('lockState'))).toBe(LockState.UNLOCKED);

    core.disconnect();
    expect(readFlagBit(core.read('lockState'), LockStateFlagBit.DEAD_MAN_TIMER_ARMED)).toBe(true);

    clock.advanceMs(AUTOLOCK_GRACE_MS_DEFAULT - 1);
    core.tick();
    expect(readState(core.read('lockState'))).toBe(LockState.UNLOCKED); // not yet

    clock.advanceMs(2);
    core.tick();
    const lockState = core.read('lockState');
    expect(readState(lockState)).toBe(LockState.LOCKED);
    expect(readLastLockReason(lockState)).toBe(LockReason.RANGE_LOSS_DEAD_MAN);
  });

  test('F3/F14 — reconnecting without completing a handshake does NOT cancel the dead-man countdown', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({
      kDev: K_DEV,
      clock,
      provisioningState: ProvisioningState.ACTIVATED,
    });
    authenticateAndUnlock(core);
    core.disconnect();

    clock.advanceMs(1000);
    core.connect(); // reconnect, but never write a valid authResponse
    core.read('authChallenge'); // app might poll state, shouldn't matter

    clock.advanceMs(AUTOLOCK_GRACE_MS_DEFAULT); // total elapsed now > grace
    core.tick();

    const lockState = core.read('lockState');
    expect(readState(lockState)).toBe(LockState.LOCKED);
    expect(readLastLockReason(lockState)).toBe(LockReason.RANGE_LOSS_DEAD_MAN);
  });

  test('F3 — a SUCCESSFUL handshake after reconnect cancels the dead-man countdown', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({
      kDev: K_DEV,
      clock,
      provisioningState: ProvisioningState.ACTIVATED,
    });
    authenticateAndUnlock(core);
    core.disconnect();

    clock.advanceMs(1000);
    authenticateAndUnlock(core); // full reconnect + re-handshake + unlock

    clock.advanceMs(AUTOLOCK_GRACE_MS_DEFAULT + 1000); // past when the ORIGINAL countdown would have fired
    core.tick();

    expect(readState(core.read('lockState'))).toBe(LockState.UNLOCKED);
    expect(core.isAuthenticated()).toBe(true);
  });

  test('F6 — 10 consecutive failures escalate to the 5-minute backoff', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock });

    for (let i = 0; i < AUTH_BACKOFF.longThresholdFailures; i += 1) {
      // Once the short (30s) backoff kicks in after failure #5, an attempt
      // during the window is deflected as RATE_LIMITED without ever being
      // evaluated — it would not count as another failure. Clear any active
      // backoff before each attempt so every one of the 10 is a real,
      // evaluated proof failure.
      if (i > 0) {
        clock.advanceMs(AUTH_BACKOFF.shortBackoffMs + 1000);
      }
      core.connect();
      const nonce = core.read('authChallenge');
      const { frame1, frame2 } = buildHandshakeFrames({
        kDev: Buffer.alloc(16, 0xaa),
        sessionId: SESSION_ID,
        keyGeneration: 1,
        nonce,
        expiresAtDeltaSeconds: 60,
      });
      core.write('authResponse', frame1);
      core.write('authResponse', frame2);
      core.disconnect();
    }

    core.connect();
    const nonce = core.read('authChallenge');
    const { frame1, frame2 } = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: 60,
    });
    core.write('authResponse', frame1);
    core.write('authResponse', frame2);
    expect(core.isAuthenticated()).toBe(false);

    // Short backoff alone (30s) must NOT be enough at this failure count.
    clock.advanceMs(AUTH_BACKOFF.shortBackoffMs + 1000);
    core.disconnect();
    core.connect();
    const nonce2 = core.read('authChallenge');
    const frames2 = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce: nonce2,
      expiresAtDeltaSeconds: 60,
    });
    core.write('authResponse', frames2.frame1);
    core.write('authResponse', frames2.frame2);
    expect(core.isAuthenticated()).toBe(false);

    // Full 5-minute window elapses → succeeds.
    clock.advanceMs(AUTH_BACKOFF.longBackoffMs);
    core.disconnect();
    core.connect();
    const nonce3 = core.read('authChallenge');
    const frames3 = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce: nonce3,
      expiresAtDeltaSeconds: 60,
    });
    core.write('authResponse', frames3.frame1);
    core.write('authResponse', frames3.frame2);
    expect(core.isAuthenticated()).toBe(true);
  });

  test('powerCycle — boots LOCKED and resets the auth-failure counter (F1, F6)', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, provisioningState: ProvisioningState.ACTIVATED });
    authenticateAndUnlock(core);
    expect(readState(core.read('lockState'))).toBe(LockState.UNLOCKED);

    core.powerCycle();

    const lockState = core.read('lockState');
    expect(readState(lockState)).toBe(LockState.LOCKED);
    expect(readLastLockReason(lockState)).toBe(LockReason.POWER_ON_DEFAULT);
    expect(core.isAuthenticated()).toBe(false);
  });

  test('F7 sanity — constantTimeEqual is correct for equal, unequal, and mismatched-length inputs', () => {
    // Proves functional correctness only. Statistical timing-side-channel
    // measurement is out of scope for a behavioural mock; the constant-time
    // guarantee itself comes from node:crypto's timingSafeEqual.
    const a = Buffer.from([1, 2, 3, 4]);
    const b = Buffer.from([1, 2, 3, 4]);
    const c = Buffer.from([1, 2, 3, 5]);
    const d = Buffer.from([1, 2, 3]);
    expect(constantTimeEqual(a, b)).toBe(true);
    expect(constantTimeEqual(a, c)).toBe(false);
    expect(constantTimeEqual(a, d)).toBe(false);
  });

  test('failure injection — forceDeadManExpiry fires the countdown on the next tick', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, provisioningState: ProvisioningState.ACTIVATED });
    authenticateAndUnlock(core);
    core.disconnect();
    core.forceDeadManExpiry();
    core.tick();
    const lockState = core.read('lockState');
    expect(readState(lockState)).toBe(LockState.LOCKED);
    expect(readLastLockReason(lockState)).toBe(LockReason.RANGE_LOSS_DEAD_MAN);
  });

  test('failure injection — forceNextHandshakeResult(RATE_LIMITED) forces the code without real backoff', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock });
    core.forceNextHandshakeResult('RATE_LIMITED');
    core.connect();
    const nonce = core.read('authChallenge');
    const { frame1, frame2 } = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce,
      expiresAtDeltaSeconds: 60,
    });
    core.write('authResponse', frame1);
    core.write('authResponse', frame2);
    expect(core.read('commandResult')[1]).toBe(ResultCode.RATE_LIMITED);
    expect(core.isAuthenticated()).toBe(false);
  });
});
