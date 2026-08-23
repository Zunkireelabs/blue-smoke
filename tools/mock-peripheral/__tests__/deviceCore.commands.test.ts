import { DeviceCore } from '../deviceCore';
import { FakeClock } from '../clock';
import {
  AUTH_BACKOFF,
  AUTOLOCK_GRACE_MS_MAX,
  AUTOLOCK_GRACE_MS_MIN,
  COMMAND_RESULT_LAYOUT,
  CommandId,
  FACTORY_UNPAIR_CONFIRM,
  LOCK_STATE_LAYOUT,
  LockReason,
  LockState,
  ProvisioningState,
  ResultCode,
} from '../../../src/features/ble/protocol';
import { buildHandshakeFrames, buildLockCommandFrame, NODE_DEPS } from './harness';

const K_DEV = Buffer.alloc(16, 0x33);
const SESSION_ID = Buffer.alloc(16, 0x44);

function readResultCode(bytes: Uint8Array): number {
  return bytes[COMMAND_RESULT_LAYOUT.resultCode.offset];
}

function readState(bytes: Uint8Array): number {
  return bytes[LOCK_STATE_LAYOUT.state.offset];
}

function readLastLockReason(bytes: Uint8Array): number {
  return bytes[LOCK_STATE_LAYOUT.lastLockReason.offset];
}

/** Connects and completes a valid handshake, returning everything needed to send commands. */
function authenticate(
  core: DeviceCore,
  clock: FakeClock,
  options: { expiresAtDeltaSeconds?: number; keyGeneration?: number } = {},
) {
  core.connect();
  const nonce = Buffer.from(core.read('authChallenge'));
  const { frame1, frame2, kSess } = buildHandshakeFrames({
    kDev: K_DEV,
    sessionId: SESSION_ID,
    keyGeneration: options.keyGeneration ?? 1,
    nonce,
    expiresAtDeltaSeconds: options.expiresAtDeltaSeconds ?? 3600,
  });
  core.write('authResponse', frame1);
  core.write('authResponse', frame2);
  return { nonce, kSess };
}

function send(
  core: DeviceCore,
  nonce: Uint8Array,
  kSess: Uint8Array,
  commandId: number,
  counter: number,
  payload?: Uint8Array,
) {
  core.write('lockCommand', buildLockCommandFrame({ kSess, nonce, commandId, counter, payload }));
  return core.read('commandResult');
}

describe('DeviceCore — §4.6/§4.7 commands and result codes', () => {
  test('F1 — boots LOCKED with lastLockReason POWER_ON_DEFAULT', () => {
    const core = new DeviceCore({ kDev: K_DEV, clock: new FakeClock(0), ...NODE_DEPS });
    const lockState = core.read('lockState');
    expect(readState(lockState)).toBe(LockState.LOCKED);
    expect(readLastLockReason(lockState)).toBe(LockReason.POWER_ON_DEFAULT);
  });

  test('UNAUTHENTICATED — lockCommand write with no session', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });
    core.connect();
    const nonce = core.read('authChallenge'); // never used for a handshake
    const result = send(core, nonce, Buffer.alloc(16, 0), CommandId.LOCK, 1);
    expect(readResultCode(result)).toBe(ResultCode.UNAUTHENTICATED);
  });

  test('NOT_ACTIVATED — UNLOCK before ACTIVATE, then OK after', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });
    const { nonce, kSess } = authenticate(core, clock);

    expect(readResultCode(send(core, nonce, kSess, CommandId.UNLOCK, 1))).toBe(
      ResultCode.NOT_ACTIVATED,
    );

    expect(readResultCode(send(core, nonce, kSess, CommandId.ACTIVATE, 2, Buffer.alloc(4, 1)))).toBe(
      ResultCode.OK,
    );
    expect(readResultCode(send(core, nonce, kSess, CommandId.UNLOCK, 3))).toBe(ResultCode.OK);
    expect(readState(core.read('lockState'))).toBe(LockState.UNLOCKED);
  });

  test('re-ACTIVATE once already activated → INVALID_PARAM (documented interpretation)', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, provisioningState: ProvisioningState.ACTIVATED, ...NODE_DEPS });
    const { nonce, kSess } = authenticate(core, clock);
    expect(readResultCode(send(core, nonce, kSess, CommandId.ACTIVATE, 1, Buffer.alloc(4)))).toBe(
      ResultCode.INVALID_PARAM,
    );
  });

  test('SET_AUTOLOCK_GRACE — clamps out-of-range values to INVALID_PARAM', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });
    const { nonce, kSess } = authenticate(core, clock);

    const tooLow = Buffer.alloc(7, 0);
    tooLow.writeUInt16LE(AUTOLOCK_GRACE_MS_MIN - 1, 0);
    expect(readResultCode(send(core, nonce, kSess, CommandId.SET_AUTOLOCK_GRACE, 1, tooLow))).toBe(
      ResultCode.INVALID_PARAM,
    );

    const tooHigh = Buffer.alloc(7, 0);
    tooHigh.writeUInt16LE(AUTOLOCK_GRACE_MS_MAX + 1, 0);
    expect(readResultCode(send(core, nonce, kSess, CommandId.SET_AUTOLOCK_GRACE, 2, tooHigh))).toBe(
      ResultCode.INVALID_PARAM,
    );

    const valid = Buffer.alloc(7, 0);
    valid.writeUInt16LE(10_000, 0);
    expect(readResultCode(send(core, nonce, kSess, CommandId.SET_AUTOLOCK_GRACE, 3, valid))).toBe(
      ResultCode.OK,
    );
  });

  test('FACTORY_UNPAIR — wrong confirm is INVALID_PARAM, right confirm clears activation', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, provisioningState: ProvisioningState.ACTIVATED, ...NODE_DEPS });
    const { nonce, kSess } = authenticate(core, clock);

    const badConfirm = Buffer.alloc(7, 0);
    badConfirm.writeUInt32LE(0x12345678, 0);
    expect(readResultCode(send(core, nonce, kSess, CommandId.FACTORY_UNPAIR, 1, badConfirm))).toBe(
      ResultCode.INVALID_PARAM,
    );

    const goodConfirm = Buffer.alloc(7, 0);
    goodConfirm.writeUInt32LE(FACTORY_UNPAIR_CONFIRM, 0);
    expect(readResultCode(send(core, nonce, kSess, CommandId.FACTORY_UNPAIR, 2, goodConfirm))).toBe(
      ResultCode.OK,
    );
    expect(core.isAuthenticated()).toBe(false);
  });

  test('END_SESSION — locks and drops the session, requiring re-handshake', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });
    const { nonce, kSess } = authenticate(core, clock);
    expect(readResultCode(send(core, nonce, kSess, CommandId.END_SESSION, 1))).toBe(ResultCode.OK);
    expect(core.isAuthenticated()).toBe(false);
    expect(readState(core.read('lockState'))).toBe(LockState.LOCKED);
  });

  test('PING — OK, keepalive', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });
    const { nonce, kSess } = authenticate(core, clock);
    expect(readResultCode(send(core, nonce, kSess, CommandId.PING, 1))).toBe(ResultCode.OK);
  });

  test('REPLAY — a non-increasing counter is rejected', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });
    const { nonce, kSess } = authenticate(core, clock);
    expect(readResultCode(send(core, nonce, kSess, CommandId.LOCK, 5))).toBe(ResultCode.OK);
    expect(readResultCode(send(core, nonce, kSess, CommandId.LOCK, 5))).toBe(ResultCode.REPLAY);
    expect(readResultCode(send(core, nonce, kSess, CommandId.LOCK, 3))).toBe(ResultCode.REPLAY);
  });

  test('AUTH_FAILED — a corrupted tag is rejected', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });
    const { nonce, kSess } = authenticate(core, clock);
    const frame = buildLockCommandFrame({ kSess, nonce, commandId: CommandId.LOCK, counter: 1 });
    frame[frame.length - 1] ^= 0xff; // flip a tag byte
    core.write('lockCommand', frame);
    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.AUTH_FAILED);
  });

  test('F11 — a command captured in one connection fails tag verification in another (FW-16)', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });

    const first = authenticate(core, clock);
    const capturedFrame = buildLockCommandFrame({
      kSess: first.kSess,
      nonce: first.nonce,
      commandId: CommandId.LOCK,
      counter: 1,
    });

    core.disconnect();
    clock.advanceMs(100);
    const second = authenticate(core, clock);

    // The captured frame's counter (1) is lower than nothing yet accepted in
    // this new session, so a naive replay check alone wouldn't catch it —
    // it must fail on the connection-scoped tag.
    core.write('lockCommand', capturedFrame);
    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.AUTH_FAILED);
    expect(second.nonce.equals(first.nonce)).toBe(false);
  });

  test('FAULT — an unrecoverable fault answers every subsequent command with FAULT', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });
    const { nonce, kSess } = authenticate(core, clock);
    core.injectFault({ recoverable: false });
    expect(readState(core.read('lockState'))).toBe(LockState.FAULT);
    expect(readResultCode(send(core, nonce, kSess, CommandId.PING, 99))).toBe(ResultCode.FAULT);
  });

  test('a recoverable fault locks but does not stick in FAULT state', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });
    authenticate(core, clock);
    core.injectFault({ recoverable: true });
    const lockState = core.read('lockState');
    expect(readState(lockState)).toBe(LockState.LOCKED);
    expect(readLastLockReason(lockState)).toBe(LockReason.FAULT_WATCHDOG);
    expect(core.isAuthenticated()).toBe(false);
  });

  test('BUSY — reachable only via failure injection (no natural trigger in a single-threaded mock)', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });
    const { nonce, kSess } = authenticate(core, clock);
    core.forceNextCommandResult(ResultCode.BUSY);
    expect(readResultCode(send(core, nonce, kSess, CommandId.PING, 1))).toBe(ResultCode.BUSY);
    // The force is one-shot — the next command behaves normally again.
    expect(readResultCode(send(core, nonce, kSess, CommandId.PING, 2))).toBe(ResultCode.OK);
  });

  test('§4.8 F6 — 5 consecutive auth failures trigger a 30s backoff (RATE_LIMITED)', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });

    for (let i = 0; i < AUTH_BACKOFF.shortThresholdFailures; i += 1) {
      core.connect();
      const nonce = core.read('authChallenge');
      const { frame1, frame2 } = buildHandshakeFrames({
        kDev: Buffer.alloc(16, 0xee), // wrong key → guaranteed AUTH_FAILED
        sessionId: SESSION_ID,
        keyGeneration: 1,
        nonce,
        expiresAtDeltaSeconds: 60,
      });
      core.write('authResponse', frame1);
      core.write('authResponse', frame2);
      expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.AUTH_FAILED);
      core.disconnect();
    }

    // The 6th attempt, even with a CORRECT key, is rejected by backoff.
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
    expect(readResultCode(core.read('commandResult'))).toBe(ResultCode.RATE_LIMITED);
    expect(core.isAuthenticated()).toBe(false);

    // After the 30s window, a correct handshake succeeds again.
    clock.advanceMs(AUTH_BACKOFF.shortBackoffMs);
    core.disconnect();
    const { kSess, nonce: nonce2 } = authenticate(core, clock);
    expect(core.isAuthenticated()).toBe(true);
    expect(readResultCode(send(core, nonce2, kSess, CommandId.PING, 1))).toBe(ResultCode.OK);
  });

  test('SESSION_EXPIRED — reported once on the first command after expiry, UNAUTHENTICATED after', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, ...NODE_DEPS });
    const { nonce, kSess } = authenticate(core, clock, { expiresAtDeltaSeconds: 5 });

    clock.advanceMs(6000);

    expect(readResultCode(send(core, nonce, kSess, CommandId.PING, 1))).toBe(
      ResultCode.SESSION_EXPIRED,
    );
    const lockState = core.read('lockState');
    expect(readState(lockState)).toBe(LockState.LOCKED);
    expect(readLastLockReason(lockState)).toBe(LockReason.SESSION_EXPIRY);

    expect(readResultCode(send(core, nonce, kSess, CommandId.PING, 2))).toBe(
      ResultCode.UNAUTHENTICATED,
    );
  });

  test('F5 — session expiry locks immediately even without any command attempt', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({ kDev: K_DEV, clock, provisioningState: ProvisioningState.ACTIVATED, ...NODE_DEPS });
    const { nonce, kSess } = authenticate(core, clock, { expiresAtDeltaSeconds: 5 });
    send(core, nonce, kSess, CommandId.UNLOCK, 1);
    expect(readState(core.read('lockState'))).toBe(LockState.UNLOCKED);

    clock.advanceMs(6000);
    core.tick();

    const lockState = core.read('lockState');
    expect(readState(lockState)).toBe(LockState.LOCKED);
    expect(readLastLockReason(lockState)).toBe(LockReason.SESSION_EXPIRY);
  });
});
