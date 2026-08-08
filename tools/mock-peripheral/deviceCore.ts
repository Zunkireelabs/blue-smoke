/**
 * Layer 1 — pure §4 firmware semantics. No I/O, no sockets, no real timers.
 * Every §4 UUID/offset/command id/result code is imported from protocol.ts;
 * nothing here is redeclared (CLAUDE.md — no magic bytes anywhere).
 *
 * This is the single place §4 is implemented. Layer 2 (bleAdapter.ts) is a
 * thin transport shim over this; Layer 3 (a real radio bridge) would be
 * another thin shim over the same core — see brief §3.
 *
 * Ambiguities resolved here that §4 does not spell out (§4 has never been
 * reviewed by the firmware team — OQ-6). Each is a judgement call, written
 * down per brief §8 rather than guessed silently:
 *
 *  1. RESOLVED by §4.5 (v1.8) F12. authResponse (C3) frames now carry
 *     `frameIndex` in byte 0, so the mock validates frame identity from the
 *     wire byte itself (never from write order or an internal cursor) —
 *     see `writeAuthResponseFrame` below. F12 has two halves: (a) a repeated
 *     frame 1 REPLACES the buffered session_id/keyGeneration and the device
 *     keeps awaiting frame 2 — a duplicated GATT write is the ordinary BLE
 *     retransmit case and must not dead-end the handshake; (b) every other
 *     unexpected `frameIndex` (a frame 2 with nothing buffered, or any value
 *     that is neither 0x01 nor 0x02) resets — discards pending state and
 *     awaits a fresh frame 1. Left numbered here so ambiguities #2–#6 keep
 *     their original numbers.
 *  2. §4.5 step 5d says a handshake mismatch "writes AUTH_FAILED to
 *     commandResult", but commandResult's `commandId` field is defined only
 *     for the 7 §4.6 command ids (0x01–0x07). This mock echoes `0x00` as a
 *     sentinel "this was the handshake, not a command" — 0x00 is unused by
 *     every real command id.
 *  3. §4.8 F6 backoff is driven by "consecutive auth failures". §4.6's
 *     firmware rules table applies backoff to bad-tag *and* replayed
 *     *commands*, not only handshake mismatches — so the failure counter is
 *     shared across both. Backoff itself only blocks the next handshake
 *     attempt (RATE_LIMITED on authResponse); it does not revoke an
 *     already-authenticated session's commands. Narrowed by §4.5 (v1.8)
 *     F12: a framing event (a repeated frame 1, or any other unexpected
 *     `frameIndex`) is explicitly NOT an auth failure — it never touches
 *     this counter and never invalidates the connection nonce `N`.
 *  4. `commandResult`'s SESSION_EXPIRED (0x05) is distinct from the passive
 *     lock F5 performs on `tick()`. This mock fires SESSION_EXPIRED on the
 *     first `lockCommand` write that lands after an expiry the device has
 *     not yet reported to anything; every write after that (until the next
 *     handshake) gets the ordinary UNAUTHENTICATED, matching a firmware
 *     that reports the expiry once, not on every subsequent attempt.
 *  5. FACTORY_UNPAIR's `confirm` mismatch and SET_AUTOLOCK_GRACE's
 *     out-of-range `graceMs` are both `INVALID_PARAM` (§4.6 says so
 *     explicitly for the grace value; FACTORY_UNPAIR's confirm mismatch is
 *     inferred by analogy — a malformed command-specific payload).
 *  6. `BUSY` (0x07) has no naturally-reachable trigger: this mock is
 *     single-threaded and processes commands atomically, so there is never
 *     a moment a second command arrives mid-processing. It is reachable
 *     only via failure injection — documented, not faked as "tested".
 */

import {
  AUTH_BACKOFF,
  AUTH_HKDF_INFO,
  AUTH_NONCE_LENGTH_BYTES,
  AUTH_NONCE_TTL_MS,
  AUTH_PROOF_FIXED_PREFIX,
  AUTH_PROOF_LENGTH_BYTES,
  AUTH_RESPONSE_FRAME_1_LAYOUT,
  AUTH_RESPONSE_FRAME_2_LAYOUT,
  AUTOLOCK_GRACE_MS_DEFAULT,
  AUTOLOCK_GRACE_MS_MAX,
  AUTOLOCK_GRACE_MS_MIN,
  AuthResponseFrameIndex,
  BLE_CHARACTERISTIC_UUIDS,
  CHARACTERISTIC_LENGTH_BYTES,
  COMMAND_RESULT_LAYOUT,
  CommandId,
  DEVICE_INFO_LAYOUT,
  FACTORY_UNPAIR_CONFIRM,
  LOCK_COMMAND_LAYOUT,
  LOCK_STATE_LAYOUT,
  LOW_BATTERY_CLEAR_PERCENT,
  LOW_BATTERY_LATCH_PERCENT,
  LockReason,
  LockState,
  LockStateFlagBit,
  PROTOCOL_VERSION,
  ProvisioningState,
  ResultCode,
  SECONDS_SINCE_STATE_CHANGE_SATURATION,
  SESSION_EXPIRY_MAX_DAYS,
} from '../../src/features/ble/protocol';
import { aesCmac, constantTimeEqual, hkdfSha256 } from './crypto';
import type { Clock } from './clock';
import {
  readBytes,
  readUint16LE,
  readUint24LE,
  readUint32LE,
  readUint8,
  writeBytes,
  writeUint16LE,
  writeUint24LE,
  writeUint8,
} from './byteLayout';
import { randomBytes } from 'node:crypto';

export type CharacteristicKey = keyof typeof BLE_CHARACTERISTIC_UUIDS;

export type NotificationListener = (value: Uint8Array) => void;

/** §4.5 — the handshake sentinel commandId written to commandResult (see ambiguity #2 above). */
const HANDSHAKE_COMMAND_ID_SENTINEL = 0x00;

export interface DeviceCoreConfig {
  /** K_dev — 16 bytes, burned into OTP at manufacture. Never leaves the mock. */
  kDev: Uint8Array;
  keyGeneration?: number;
  deviceUid?: Uint8Array;
  hwRevision?: number;
  fwVersion?: { major: number; minor: number };
  /** Initial §4.3 provisioningState. Default PROVISIONED — has K_dev, not yet activated. */
  provisioningState?: (typeof ProvisioningState)[keyof typeof ProvisioningState];
  autoLockGraceMs?: number;
  initialBatteryPercent?: number;
  /** Percent drained per hour of clock time. Default 0 — battery is static unless a test asks for drain. */
  batteryDrainPercentPerHour?: number;
  clock: Clock;
  /** §4.8 F8 — hardware RNG source for nonces. Default node:crypto.randomBytes; inject for deterministic tests. */
  nonceSource?: () => Uint8Array;
}

type ForcedHandshakeResult = 'AUTH_FAILED' | 'RATE_LIMITED';

interface PendingFrame1 {
  sessionId: Buffer;
  keyGeneration: number;
}

interface AuthenticatedSession {
  kSess: Buffer;
  sessionExpiryUptimeMs: number;
  lastAcceptedCounter: number;
}

export class DeviceCore {
  private readonly kDev: Buffer;
  private keyGeneration: number;
  private readonly deviceUid: Buffer;
  private readonly hwRevision: number;
  private readonly fwVersion: { major: number; minor: number };
  private provisioningState: (typeof ProvisioningState)[keyof typeof ProvisioningState];
  private autoLockGraceMs: number;
  private readonly clock: Clock;
  private readonly nonceSource: () => Uint8Array;

  // §4.4 lockState
  private state: (typeof LockState)[keyof typeof LockState] = LockState.LOCKED;
  private lastLockReason: (typeof LockReason)[keyof typeof LockReason] =
    LockReason.POWER_ON_DEFAULT;
  private stateChangedAtMs = 0;
  private charging = false;

  // §4.4 battery
  private batteryPercentAtEpoch: number;
  private batteryEpochMs = 0;
  private readonly batteryDrainPercentPerHour: number;
  private lowBatteryLatched = false;

  // Per-connection handshake state
  private connected = false;
  private currentNonce: Buffer | null = null;
  private nonceIssuedAtMs = 0;
  private nonceConsumed = false;
  /** §4.5 (v1.4) F12 — the frameIndex expected next; never a position/order cursor. */
  private expectedFrameIndex: AuthResponseFrameIndex = AuthResponseFrameIndex.FRAME_1;
  private pendingFrame1: PendingFrame1 | null = null;

  private session: AuthenticatedSession | null = null;
  private sessionExpiredUnacknowledged = false;

  // §4.8 F2/F3 dead-man timer
  private deadManDeadlineMs: number | null = null;

  // §4.8 F6 backoff
  private consecutiveAuthFailures = 0;
  private backoffUntilMs: number | null = null;

  private readonly notifyListeners: Map<CharacteristicKey, Set<NotificationListener>> = new Map();

  // Failure injection
  private forcedHandshakeResult: ForcedHandshakeResult | null = null;
  private forcedCommandResult: (typeof ResultCode)[keyof typeof ResultCode] | null = null;

  constructor(config: DeviceCoreConfig) {
    if (config.kDev.length !== 16) {
      throw new Error('DeviceCore: kDev must be 16 bytes (AES-128)');
    }
    this.kDev = Buffer.from(config.kDev);
    this.keyGeneration = config.keyGeneration ?? 1;
    this.deviceUid = Buffer.from(config.deviceUid ?? Buffer.alloc(12, 0xab));
    this.hwRevision = config.hwRevision ?? 1;
    this.fwVersion = config.fwVersion ?? { major: 0, minor: 1 };
    this.provisioningState = config.provisioningState ?? ProvisioningState.PROVISIONED;
    this.autoLockGraceMs = config.autoLockGraceMs ?? AUTOLOCK_GRACE_MS_DEFAULT;
    this.clock = config.clock;
    this.nonceSource = config.nonceSource ?? (() => randomBytes(AUTH_NONCE_LENGTH_BYTES));
    this.batteryPercentAtEpoch = config.initialBatteryPercent ?? 100;
    this.batteryDrainPercentPerHour = config.batteryDrainPercentPerHour ?? 0;
    this.stateChangedAtMs = this.clock.nowMs();
    this.batteryEpochMs = this.clock.nowMs();
  }

  // ── Connection lifecycle ────────────────────────────────────────────────

  /** A fresh BLE connection. Does NOT cancel a pending dead-man countdown (F3). */
  connect(): void {
    this.applyTimeDrivenTransitions();
    this.connected = true;
    this.currentNonce = Buffer.from(this.nonceSource().slice(0, AUTH_NONCE_LENGTH_BYTES));
    this.nonceIssuedAtMs = this.clock.nowMs();
    this.nonceConsumed = false;
    this.expectedFrameIndex = AuthResponseFrameIndex.FRAME_1;
    this.pendingFrame1 = null;
    this.notify('authChallenge', this.currentNonce);
  }

  /**
   * §4.8 F2 — "disconnect" always models an abrupt/uncontrolled loss of
   * link (BLE has no application-level goodbye); this is also how the mock
   * exercises the "ABRUPT_DISCONNECT" failure-injection item in brief §3.3.
   */
  disconnect(): void {
    this.applyTimeDrivenTransitions();
    this.connected = false;
    this.currentNonce = null;
    this.expectedFrameIndex = AuthResponseFrameIndex.FRAME_1;
    this.pendingFrame1 = null;
    this.session = null;
    this.connectionNonceForTagging = null;
    // §4.5 — "Disconnect ALWAYS ends the session."
    this.deadManDeadlineMs = this.clock.nowMs() + this.autoLockGraceMs;
    this.setLockStateFlags();
  }

  /** §4.8 F1/F4 — power-on/reset always boots LOCKED. Provisioning survives (it's OTP/NVM, not RAM). */
  powerCycle(): void {
    this.connected = false;
    this.currentNonce = null;
    this.expectedFrameIndex = AuthResponseFrameIndex.FRAME_1;
    this.pendingFrame1 = null;
    this.session = null;
    this.connectionNonceForTagging = null;
    this.sessionExpiredUnacknowledged = false;
    this.deadManDeadlineMs = null;
    this.consecutiveAuthFailures = 0;
    this.backoffUntilMs = null;
    this.transitionTo(LockState.LOCKED, LockReason.POWER_ON_DEFAULT);
  }

  // ── Time ────────────────────────────────────────────────────────────────

  /**
   * Proactively evaluates every time-driven transition (nonce TTL, dead-man
   * expiry, backoff window closing, session expiry, battery drain). Also
   * called at the top of every read/write/connect/disconnect so results are
   * correct even if a test never calls tick() directly.
   */
  tick(): void {
    this.applyTimeDrivenTransitions();
  }

  private applyTimeDrivenTransitions(): void {
    const now = this.clock.nowMs();

    // §4.5 — nonce invalidated after one use or 30s, whichever first.
    if (this.currentNonce && !this.nonceConsumed && now - this.nonceIssuedAtMs >= AUTH_NONCE_TTL_MS) {
      this.currentNonce = null;
    }

    // §4.8 F6 — backoff window closes on its own; does not reset the failure counter.
    if (this.backoffUntilMs !== null && now >= this.backoffUntilMs) {
      this.backoffUntilMs = null;
    }

    // §4.8 F5 — session expiry is enforced against monotonic uptime,
    // unconditionally: lastLockReason updates even if already LOCKED, since
    // it's recording *why* the session ended, not just a state change.
    if (this.session && now > this.session.sessionExpiryUptimeMs) {
      this.session = null;
      this.connectionNonceForTagging = null;
      this.sessionExpiredUnacknowledged = true;
      this.transitionTo(LockState.LOCKED, LockReason.SESSION_EXPIRY);
    }

    // §4.8 F2 — dead-man countdown. Same reasoning: always record the reason.
    if (this.deadManDeadlineMs !== null && now >= this.deadManDeadlineMs) {
      this.deadManDeadlineMs = null;
      this.transitionTo(LockState.LOCKED, LockReason.RANGE_LOSS_DEAD_MAN);
    }

    this.maybeUpdateLowBatteryLatch(now);
  }

  private maybeUpdateLowBatteryLatch(now: number): void {
    const percent = this.computeBatteryPercent(now);
    const wasLatched = this.lowBatteryLatched;
    if (!this.lowBatteryLatched && percent < LOW_BATTERY_LATCH_PERCENT) {
      this.lowBatteryLatched = true;
    } else if (this.lowBatteryLatched && percent >= LOW_BATTERY_CLEAR_PERCENT) {
      this.lowBatteryLatched = false;
    }
    if (wasLatched !== this.lowBatteryLatched) {
      this.notify('lockState', this.encodeLockState());
    }
  }

  private computeBatteryPercent(now: number): number {
    if (this.batteryDrainPercentPerHour === 0) {
      return this.batteryPercentAtEpoch;
    }
    const elapsedHours = (now - this.batteryEpochMs) / (60 * 60 * 1000);
    const drained = this.batteryDrainPercentPerHour * elapsedHours;
    return Math.max(0, Math.min(100, this.batteryPercentAtEpoch - drained));
  }

  private transitionTo(
    state: (typeof LockState)[keyof typeof LockState],
    reason: (typeof LockReason)[keyof typeof LockReason],
  ): void {
    this.state = state;
    this.lastLockReason = reason;
    this.stateChangedAtMs = this.clock.nowMs();
    this.setLockStateFlags();
  }

  private setLockStateFlags(): void {
    this.notify('lockState', this.encodeLockState());
  }

  // ── GATT surface ────────────────────────────────────────────────────────

  read(characteristic: CharacteristicKey): Uint8Array {
    this.applyTimeDrivenTransitions();
    switch (characteristic) {
      case 'deviceInfo':
        return this.encodeDeviceInfo();
      case 'authChallenge':
        return this.currentNonce ?? Buffer.alloc(AUTH_NONCE_LENGTH_BYTES, 0);
      case 'lockState':
        return this.encodeLockState();
      case 'commandResult':
        return this.lastCommandResult ?? Buffer.alloc(CHARACTERISTIC_LENGTH_BYTES.commandResult, 0);
      case 'authResponse':
      case 'lockCommand':
        throw new Error(`DeviceCore: ${characteristic} is write-only`);
      default:
        throw new Error(`DeviceCore: unknown characteristic ${String(characteristic)}`);
    }
  }

  write(characteristic: CharacteristicKey, bytes: Uint8Array): void {
    this.applyTimeDrivenTransitions();
    const expectedLength = CHARACTERISTIC_LENGTH_BYTES[characteristic];
    if (bytes.length !== expectedLength) {
      throw new Error(
        `DeviceCore: write to ${characteristic} must be ${expectedLength} bytes, got ${bytes.length}`,
      );
    }
    switch (characteristic) {
      case 'authResponse':
        this.writeAuthResponseFrame(bytes);
        return;
      case 'lockCommand':
        this.handleLockCommand(bytes);
        return;
      default:
        throw new Error(`DeviceCore: ${characteristic} is not writable`);
    }
  }

  subscribe(characteristic: CharacteristicKey, listener: NotificationListener): () => void {
    if (!this.notifyListeners.has(characteristic)) {
      this.notifyListeners.set(characteristic, new Set());
    }
    this.notifyListeners.get(characteristic)!.add(listener);
    return () => this.notifyListeners.get(characteristic)?.delete(listener);
  }

  private notify(characteristic: CharacteristicKey, value: Uint8Array): void {
    for (const listener of this.notifyListeners.get(characteristic) ?? []) {
      listener(value);
    }
  }

  // ── §4.3 deviceInfo ─────────────────────────────────────────────────────

  private encodeDeviceInfo(): Buffer {
    const buffer = Buffer.alloc(CHARACTERISTIC_LENGTH_BYTES.deviceInfo, 0);
    writeUint8(buffer, DEVICE_INFO_LAYOUT.protocolVersion.offset, PROTOCOL_VERSION);
    writeUint8(buffer, DEVICE_INFO_LAYOUT.hwRevision.offset, this.hwRevision);
    writeUint8(buffer, DEVICE_INFO_LAYOUT.fwVersion.offset, this.fwVersion.major);
    writeUint8(buffer, DEVICE_INFO_LAYOUT.fwVersion.offset + 1, this.fwVersion.minor);
    writeBytes(buffer, DEVICE_INFO_LAYOUT.deviceUid.offset, this.deviceUid);
    writeUint8(buffer, DEVICE_INFO_LAYOUT.provisioningState.offset, this.provisioningState);
    writeUint8(buffer, DEVICE_INFO_LAYOUT.keyGeneration.offset, this.keyGeneration);
    return buffer;
  }

  // ── §4.4 lockState ──────────────────────────────────────────────────────

  private encodeLockState(): Buffer {
    const buffer = Buffer.alloc(CHARACTERISTIC_LENGTH_BYTES.lockState, 0);
    writeUint8(buffer, LOCK_STATE_LAYOUT.state.offset, this.state);

    let flags = 0;
    if (this.session !== null) flags |= 1 << LockStateFlagBit.AUTHENTICATED_SESSION_ACTIVE;
    if (this.charging) flags |= 1 << LockStateFlagBit.CHARGING;
    if (this.lowBatteryLatched) flags |= 1 << LockStateFlagBit.LOW_BATTERY;
    if (this.deadManDeadlineMs !== null) flags |= 1 << LockStateFlagBit.DEAD_MAN_TIMER_ARMED;
    if (this.sessionExpiredUnacknowledged) flags |= 1 << LockStateFlagBit.SESSION_EXPIRED;
    writeUint8(buffer, LOCK_STATE_LAYOUT.flags.offset, flags);

    const batteryPercent = Math.round(this.computeBatteryPercent(this.clock.nowMs()));
    writeUint8(buffer, LOCK_STATE_LAYOUT.batteryPercent.offset, batteryPercent);
    writeUint8(buffer, LOCK_STATE_LAYOUT.lastLockReason.offset, this.lastLockReason);

    const secondsSinceChange = Math.floor((this.clock.nowMs() - this.stateChangedAtMs) / 1000);
    writeUint16LE(
      buffer,
      LOCK_STATE_LAYOUT.secondsSinceStateChange.offset,
      Math.min(secondsSinceChange, SECONDS_SINCE_STATE_CHANGE_SATURATION),
    );

    writeUint8(buffer, LOCK_STATE_LAYOUT.protocolVersion.offset, PROTOCOL_VERSION);
    return buffer;
  }

  // ── §4.5 handshake ──────────────────────────────────────────────────────

  /**
   * §4.5 (v1.8) F12 — frame identity comes ONLY from `frameIndex` (byte 0 of
   * the wire bytes), never from write order or a position cursor. A repeated
   * frame 1 REPLACES the buffered one and keeps awaiting frame 2 (F12a); any
   * other unexpected `frameIndex` resets (F12b). This is also the explicit
   * test hook (see ambiguity #1 in the module doc comment): tests can pass
   * bytes with any `frameIndex` value to exercise either path directly.
   */
  writeAuthResponseFrame(bytes: Uint8Array): void {
    this.applyTimeDrivenTransitions();
    const frameIndex = readUint8(bytes, AUTH_RESPONSE_FRAME_1_LAYOUT.frameIndex.offset);

    if (frameIndex === AuthResponseFrameIndex.FRAME_1) {
      // F12(a) — frame 1 is always accepted, whatever expectedFrameIndex is.
      // A repeated frame 1 REPLACES the buffered session_id/keyGeneration
      // and the device keeps awaiting frame 2 — this is the ordinary BLE
      // retransmit case, not a reset. This is a FRAMING event, not a
      // cryptographic one: it must not touch consecutiveAuthFailures and
      // must not invalidate the connection nonce N.
      const sessionId = readBytes(
        bytes,
        AUTH_RESPONSE_FRAME_1_LAYOUT.sessionId.offset,
        AUTH_RESPONSE_FRAME_1_LAYOUT.sessionId.length,
      );
      const keyGeneration = readUint8(bytes, AUTH_RESPONSE_FRAME_1_LAYOUT.keyGeneration.offset);
      this.pendingFrame1 = { sessionId: Buffer.from(sessionId), keyGeneration };
      this.expectedFrameIndex = AuthResponseFrameIndex.FRAME_2;
      return;
    }

    if (frameIndex === AuthResponseFrameIndex.FRAME_2 && this.expectedFrameIndex === AuthResponseFrameIndex.FRAME_2) {
      // The only way expectedFrameIndex reaches FRAME_2 is via an accepted
      // frame 1 above, so pendingFrame1 is guaranteed set here.
      if (this.pendingFrame1 === null) {
        throw new Error('DeviceCore: invariant violated — expected FRAME_2 with no pending frame 1');
      }
      const frame1 = this.pendingFrame1;
      this.pendingFrame1 = null;
      this.expectedFrameIndex = AuthResponseFrameIndex.FRAME_1;

      const proof = readBytes(
        bytes,
        AUTH_RESPONSE_FRAME_2_LAYOUT.proof.offset,
        AUTH_RESPONSE_FRAME_2_LAYOUT.proof.length,
      );
      const expiresAtDelta = readUint24LE(bytes, AUTH_RESPONSE_FRAME_2_LAYOUT.expiresAtDelta.offset);

      this.evaluateHandshake(frame1, proof, expiresAtDelta);
      return;
    }

    // F12(b) — everything else (a frame 2 arriving with nothing buffered, or
    // any value that is neither 0x01 nor 0x02) discards all pending
    // handshake state and awaits a fresh frame 1. This is a FRAMING reset,
    // not a cryptographic failure: it must not touch consecutiveAuthFailures
    // and must not invalidate the connection nonce N (evaluateHandshake,
    // and therefore nonce consumption, is never reached on this path).
    this.pendingFrame1 = null;
    this.expectedFrameIndex = AuthResponseFrameIndex.FRAME_1;
  }

  private evaluateHandshake(frame1: PendingFrame1, proof: Uint8Array, expiresAtDeltaSeconds: number): void {
    const now = this.clock.nowMs();

    if (this.backoffUntilMs !== null && now < this.backoffUntilMs) {
      this.writeHandshakeCommandResult(ResultCode.RATE_LIMITED);
      return;
    }

    if (this.forcedHandshakeResult === 'RATE_LIMITED') {
      this.forcedHandshakeResult = null;
      this.writeHandshakeCommandResult(ResultCode.RATE_LIMITED);
      return;
    }

    // §4.5 — the nonce that must be bound into the proof is THIS connection's,
    // single-use.
    if (!this.currentNonce || this.nonceConsumed) {
      this.recordAuthFailure(now);
      this.writeHandshakeCommandResult(ResultCode.AUTH_FAILED);
      return;
    }
    const nonce = this.currentNonce;
    this.nonceConsumed = true;
    this.currentNonce = null;

    const forced = this.forcedHandshakeResult === 'AUTH_FAILED';
    if (forced) this.forcedHandshakeResult = null;

    const kSess = hkdfSha256(
      this.kDev,
      frame1.sessionId,
      Buffer.concat([Buffer.from(AUTH_HKDF_INFO, 'utf8'), Buffer.from([frame1.keyGeneration])]),
      16,
    );

    // §4.5 (v1.4) proof = CMAC(K_sess, 0x01 ‖ protocolVersion ‖ N ‖ session_id[0..3] ‖ expiresAtDelta),
    // expiresAtDelta now 3 bytes (uint24 LE) — total input 25B, not 26B. frameIndex is
    // deliberately excluded (§4.5 (v1.4), §4.1 of the addendum): it is framing, not security.
    const expiresAtDeltaBytes = Buffer.alloc(3);
    writeUint24LE(expiresAtDeltaBytes, 0, expiresAtDeltaSeconds);
    const proofInput = Buffer.concat([
      Buffer.from([AUTH_PROOF_FIXED_PREFIX]),
      Buffer.from([PROTOCOL_VERSION]),
      nonce,
      frame1.sessionId.subarray(0, 4),
      expiresAtDeltaBytes,
    ]);
    const expectedProof = aesCmac(kSess, proofInput).subarray(0, AUTH_PROOF_LENGTH_BYTES);

    const proofMatches = !forced && constantTimeEqual(proof, expectedProof);

    if (!proofMatches) {
      this.recordAuthFailure(now);
      this.writeHandshakeCommandResult(ResultCode.AUTH_FAILED);
      return;
    }

    this.consecutiveAuthFailures = 0;
    const cappedDeltaSeconds = Math.min(expiresAtDeltaSeconds, SESSION_EXPIRY_MAX_DAYS * 24 * 60 * 60);
    this.session = {
      kSess,
      sessionExpiryUptimeMs: now + cappedDeltaSeconds * 1000,
      lastAcceptedCounter: 0,
    };
    this.sessionExpiredUnacknowledged = false;
    this.keyGeneration = frame1.keyGeneration;
    // §4.8 F11 — this connection's nonce stays bound for command tag checks
    // even though it's now consumed for handshake purposes.
    this.connectionNonceForTagging = nonce;
    // §4.8 F3 — only a successful handshake cancels the dead-man countdown.
    this.deadManDeadlineMs = null;
    this.setLockStateFlags();
    this.writeHandshakeCommandResult(ResultCode.OK);
  }

  private recordAuthFailure(now: number): void {
    this.consecutiveAuthFailures += 1;
    if (this.consecutiveAuthFailures >= AUTH_BACKOFF.longThresholdFailures) {
      this.backoffUntilMs = now + AUTH_BACKOFF.longBackoffMs;
    } else if (this.consecutiveAuthFailures >= AUTH_BACKOFF.shortThresholdFailures) {
      this.backoffUntilMs = now + AUTH_BACKOFF.shortBackoffMs;
    }
  }

  private lastCommandResult: Buffer | null = null;

  private writeHandshakeCommandResult(code: (typeof ResultCode)[keyof typeof ResultCode]): void {
    this.writeCommandResult(HANDSHAKE_COMMAND_ID_SENTINEL, code, 0);
  }

  private writeCommandResult(
    commandId: number,
    code: (typeof ResultCode)[keyof typeof ResultCode],
    counter: number,
  ): void {
    const buffer = Buffer.alloc(CHARACTERISTIC_LENGTH_BYTES.commandResult, 0);
    writeUint8(buffer, COMMAND_RESULT_LAYOUT.commandId.offset, commandId);
    writeUint8(buffer, COMMAND_RESULT_LAYOUT.resultCode.offset, code);
    writeUint16LE(buffer, COMMAND_RESULT_LAYOUT.counterLow16.offset, counter & 0xffff);
    this.lastCommandResult = buffer;
    this.notify('commandResult', buffer);
  }

  // ── §4.6 lockCommand ────────────────────────────────────────────────────

  private handleLockCommand(bytes: Uint8Array): void {
    const commandId = readUint8(bytes, LOCK_COMMAND_LAYOUT.commandId.offset);
    const counter = readUint32LE(bytes, LOCK_COMMAND_LAYOUT.counter.offset);
    const payload = readBytes(
      bytes,
      LOCK_COMMAND_LAYOUT.payload.offset,
      LOCK_COMMAND_LAYOUT.payload.length,
    );
    const tag = readBytes(bytes, LOCK_COMMAND_LAYOUT.tag.offset, LOCK_COMMAND_LAYOUT.tag.length);

    if (this.forcedCommandResult !== null) {
      const forced = this.forcedCommandResult;
      this.forcedCommandResult = null;
      this.applyCommandSideEffectsIfOk(forced, commandId, payload);
      this.writeCommandResult(commandId, forced, counter);
      return;
    }

    if (this.state === LockState.FAULT) {
      this.writeCommandResult(commandId, ResultCode.FAULT, counter);
      return;
    }

    if (!this.session) {
      if (this.sessionExpiredUnacknowledged) {
        this.sessionExpiredUnacknowledged = false;
        this.writeCommandResult(commandId, ResultCode.SESSION_EXPIRED, counter);
        return;
      }
      this.writeCommandResult(commandId, ResultCode.UNAUTHENTICATED, counter);
      return;
    }

    const now = this.clock.nowMs();

    // §4.6 — tag is checked against THIS connection's nonce, even though the
    // nonce itself was already consumed by the handshake (F11: connection
    // scoping, not single-use-of-N-for-commands).
    const tagInput = Buffer.concat([this.sessionNonceForTagging(), bytes.subarray(0, 12)]);
    const expectedTag = aesCmac(this.session.kSess, tagInput).subarray(0, LOCK_COMMAND_LAYOUT.tag.length);
    if (!constantTimeEqual(tag, expectedTag)) {
      this.recordAuthFailure(now);
      this.writeCommandResult(commandId, ResultCode.AUTH_FAILED, counter);
      return;
    }

    if (counter <= this.session.lastAcceptedCounter) {
      this.recordAuthFailure(now);
      this.writeCommandResult(commandId, ResultCode.REPLAY, counter);
      return;
    }

    const sessionBeforeCommand = this.session;
    const result = this.applyCommand(commandId, payload);
    // A command (END_SESSION, FACTORY_UNPAIR) may have dropped the session
    // as its own side effect — nothing to record the counter against then.
    if (result === ResultCode.OK && sessionBeforeCommand) {
      sessionBeforeCommand.lastAcceptedCounter = counter;
    }
    this.writeCommandResult(commandId, result, counter);
  }

  /** The nonce bound into command tags for this connection (§4.6, §4.8 F11). Frozen at handshake success. */
  private connectionNonceForTagging: Buffer | null = null;

  private sessionNonceForTagging(): Buffer {
    if (!this.connectionNonceForTagging) {
      throw new Error('DeviceCore: no authenticated session — command tag has no nonce to check against');
    }
    return this.connectionNonceForTagging;
  }

  private applyCommandSideEffectsIfOk(
    forcedResult: (typeof ResultCode)[keyof typeof ResultCode],
    commandId: number,
    payload: Uint8Array,
  ): void {
    if (forcedResult === ResultCode.OK) {
      this.applyCommand(commandId, payload);
    }
  }

  private applyCommand(
    commandId: number,
    payload: Uint8Array,
  ): (typeof ResultCode)[keyof typeof ResultCode] {
    switch (commandId) {
      case CommandId.LOCK:
        this.transitionTo(LockState.LOCKED, LockReason.USER_COMMAND);
        return ResultCode.OK;

      case CommandId.UNLOCK:
        if (this.provisioningState !== ProvisioningState.ACTIVATED) {
          return ResultCode.NOT_ACTIVATED;
        }
        this.transitionTo(LockState.UNLOCKED, LockReason.USER_COMMAND);
        return ResultCode.OK;

      case CommandId.ACTIVATE: {
        if (this.provisioningState === ProvisioningState.ACTIVATED) {
          // Ambiguity: §4.6 says "First-time only" without specifying the
          // error for a repeat attempt. INVALID_PARAM per the module doc.
          return ResultCode.INVALID_PARAM;
        }
        this.provisioningState = ProvisioningState.ACTIVATED;
        this.transitionTo(LockState.LOCKED, LockReason.USER_COMMAND);
        return ResultCode.OK;
      }

      case CommandId.SET_AUTOLOCK_GRACE: {
        const graceMs = readUint16LE(payload, 0);
        if (graceMs < AUTOLOCK_GRACE_MS_MIN || graceMs > AUTOLOCK_GRACE_MS_MAX) {
          return ResultCode.INVALID_PARAM;
        }
        this.autoLockGraceMs = graceMs;
        return ResultCode.OK;
      }

      case CommandId.END_SESSION:
        this.session = null;
        this.connectionNonceForTagging = null;
        this.transitionTo(LockState.LOCKED, LockReason.USER_COMMAND);
        return ResultCode.OK;

      case CommandId.FACTORY_UNPAIR: {
        const confirm = readUint32LE(payload, 0);
        if (confirm !== FACTORY_UNPAIR_CONFIRM) {
          return ResultCode.INVALID_PARAM;
        }
        this.provisioningState = ProvisioningState.PROVISIONED;
        this.session = null;
        this.connectionNonceForTagging = null;
        this.transitionTo(LockState.LOCKED, LockReason.REVOKED);
        return ResultCode.OK;
      }

      case CommandId.PING:
        // §4.6 — keepalive; refreshes the dead-man timer. By the time PING
        // is usable (requires an authenticated session), F3 has already
        // cancelled any countdown — this is a harmless explicit no-op that
        // documents the intent rather than silently doing nothing.
        this.deadManDeadlineMs = null;
        return ResultCode.OK;

      default:
        return ResultCode.INVALID_PARAM;
    }
  }

  // ── Failure injection (brief §3.3) ─────────────────────────────────────

  forceNextHandshakeResult(result: ForcedHandshakeResult): void {
    this.forcedHandshakeResult = result;
  }

  forceNextCommandResult(code: (typeof ResultCode)[keyof typeof ResultCode]): void {
    this.forcedCommandResult = code;
  }

  /** §4.8 F4 — simulate a watchdog reset or unhandled exception. */
  injectFault(options: { recoverable: boolean }): void {
    if (options.recoverable) {
      this.session = null;
      this.connectionNonceForTagging = null;
      this.transitionTo(LockState.LOCKED, LockReason.FAULT_WATCHDOG);
    } else {
      this.session = null;
      this.connectionNonceForTagging = null;
      this.transitionTo(LockState.FAULT, LockReason.FAULT_WATCHDOG);
    }
  }

  /** Convenience: force the dead-man timer to expire on the next tick/read/write. */
  forceDeadManExpiry(): void {
    this.deadManDeadlineMs = this.clock.nowMs();
  }

  setBatteryPercent(percent: number): void {
    this.batteryPercentAtEpoch = Math.max(0, Math.min(100, percent));
    this.batteryEpochMs = this.clock.nowMs();
    this.maybeUpdateLowBatteryLatch(this.clock.nowMs());
  }

  setCharging(charging: boolean): void {
    this.charging = charging;
    this.setLockStateFlags();
  }

  // ── Introspection (not GATT — test/adapter convenience) ────────────────

  isConnected(): boolean {
    return this.connected;
  }

  isAuthenticated(): boolean {
    return this.session !== null;
  }

  getState(): (typeof LockState)[keyof typeof LockState] {
    return this.state;
  }
}
