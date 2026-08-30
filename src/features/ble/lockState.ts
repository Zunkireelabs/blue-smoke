/**
 * §4.4 `lockState` (C4) read + notify: parse the characteristic into a typed snapshot.
 *
 * For P1-5.0 — device list battery/lock-state/staleness. Same "nothing throws across this
 * boundary" convention as `deviceInfo.ts`/`auth.ts`: every failure path resolves to a typed
 * outcome, never a rejected promise or an uncaught listener exception.
 */

import type { BleDeviceLike } from './BleClientContext';
import { readUint8, readUint16LE } from './byteLayout';
import {
  BLE_CHARACTERISTIC_UUIDS,
  BLE_SERVICE_UUID,
  CHARACTERISTIC_LENGTH_BYTES,
  LOCK_STATE_LAYOUT,
  LockState,
  LockStateFlagBit,
  LockReason,
  BATTERY_PERCENT_UNKNOWN,
} from './protocol';

// Not a §4 constant — an app-level operational choice for this one read, same reasoning as
// `deviceInfo.ts`'s READ_TIMEOUT_MS.
const READ_TIMEOUT_MS = 3000;

export interface LockStateInfo {
  state: LockState;
  authenticatedSessionActive: boolean;
  charging: boolean;
  /**
   * §4.4 — the device already applies the 15%/20% hysteresis before setting this bit (see
   * `tools/mock-peripheral/deviceCore.ts`'s battery model). The app reads it as-is; it does not
   * recompute the threshold, so `protocol.ts`'s `LOW_BATTERY_LATCH_PERCENT`/`CLEAR_PERCENT`
   * constants are the device-side simulation's inputs, not a value this module consumes.
   */
  lowBattery: boolean;
  deadManTimerArmed: boolean;
  sessionExpired: boolean;
  /** §4.4 — 0-100, or `null` when the device reported `0xFF` (unknown). */
  batteryPercent: number | null;
  lastLockReason: LockReason;
  secondsSinceStateChange: number;
  protocolVersion: number;
}

export type LockStateOutcome =
  | { ok: true; info: LockStateInfo }
  | { ok: false; reason: 'timeout' }
  | { ok: false; reason: 'transport'; detail: string };

class LockStateTimeoutError extends Error {
  constructor() {
    super('§4.4 lockState read exceeded its timeout budget');
    this.name = 'LockStateTimeoutError';
  }
}

// Bounds the read (CLAUDE.md: "Every BLE operation has an explicit timeout. No unbounded await.")
async function withTimeout<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new LockStateTimeoutError()), ms);
  });
  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// Hand-rolled base64 decoder — duplicated from `deviceInfo.ts`/`auth.ts` rather than extracted,
// per those files' own follow-up notes; extracting a shared helper touches modules outside this
// task's scope. Same alphabet/algorithm as both.
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

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

const VALID_LOCK_STATES: ReadonlySet<number> = new Set(Object.values(LockState));
const VALID_LOCK_REASONS: ReadonlySet<number> = new Set(Object.values(LockReason));

function isValidLockState(value: number): value is LockState {
  return VALID_LOCK_STATES.has(value);
}

function isValidLockReason(value: number): value is LockReason {
  return VALID_LOCK_REASONS.has(value);
}

function hasBit(byte: number, bit: number): boolean {
  return ((byte >> bit) & 1) === 1;
}

export function parseLockState(bytes: Uint8Array): LockStateInfo {
  const rawState = readUint8(bytes, LOCK_STATE_LAYOUT.state.offset);
  if (!isValidLockState(rawState)) {
    throw new Error(`lockState: state ${rawState} is not a valid §4.4 state`);
  }
  const rawReason = readUint8(bytes, LOCK_STATE_LAYOUT.lastLockReason.offset);
  if (!isValidLockReason(rawReason)) {
    throw new Error(`lockState: lastLockReason ${rawReason} is not a valid §4.4 reason`);
  }

  const flags = readUint8(bytes, LOCK_STATE_LAYOUT.flags.offset);
  const rawBattery = readUint8(bytes, LOCK_STATE_LAYOUT.batteryPercent.offset);

  return {
    state: rawState,
    authenticatedSessionActive: hasBit(flags, LockStateFlagBit.AUTHENTICATED_SESSION_ACTIVE),
    charging: hasBit(flags, LockStateFlagBit.CHARGING),
    lowBattery: hasBit(flags, LockStateFlagBit.LOW_BATTERY),
    deadManTimerArmed: hasBit(flags, LockStateFlagBit.DEAD_MAN_TIMER_ARMED),
    sessionExpired: hasBit(flags, LockStateFlagBit.SESSION_EXPIRED),
    batteryPercent: rawBattery === BATTERY_PERCENT_UNKNOWN ? null : rawBattery,
    lastLockReason: rawReason,
    secondsSinceStateChange: readUint16LE(bytes, LOCK_STATE_LAYOUT.secondsSinceStateChange.offset),
    protocolVersion: readUint8(bytes, LOCK_STATE_LAYOUT.protocolVersion.offset),
  };
}

function decodeCharacteristicValue(value: string | null): LockStateInfo {
  if (!value) {
    throw new Error('lockState: characteristic returned no value');
  }
  const bytes = base64ToBytes(value);
  if (bytes.length !== CHARACTERISTIC_LENGTH_BYTES.lockState) {
    throw new Error(
      `lockState: expected ${CHARACTERISTIC_LENGTH_BYTES.lockState} bytes, got ${bytes.length}`,
    );
  }
  return parseLockState(bytes);
}

/**
 * §4.4 — one-shot read off an already-connected device. Takes a connected `BleDeviceLike`, not a
 * `deviceId`, for the same reason as `deviceInfo.ts`'s `readDeviceInfo`: connect/discover stay the
 * caller's job.
 */
export async function readLockState(device: BleDeviceLike): Promise<LockStateOutcome> {
  try {
    const characteristic = await withTimeout(
      device.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUIDS.lockState),
      READ_TIMEOUT_MS,
    );
    return { ok: true, info: decodeCharacteristicValue(characteristic.value) };
  } catch (error) {
    if (error instanceof LockStateTimeoutError) {
      return { ok: false, reason: 'timeout' };
    }
    const detail = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, reason: 'transport', detail };
  }
}

export interface LockStateSubscription {
  remove(): void;
}

/**
 * §4.4 — "Notify on every `state` change, every `lastLockReason` change, and on battery crossing
 * the low-battery threshold." This is the notify-driven half of P1-5.0's status polling box: the
 * device list subscribes once per connected device and never re-polls on a timer.
 *
 * `onUpdate` never receives a stale/partial parse — a corrupt or short notification goes to
 * `onError` instead, matching this module's "nothing throws across the boundary" convention.
 */
export function monitorLockState(
  device: BleDeviceLike,
  onUpdate: (info: LockStateInfo) => void,
  onError: (detail: string) => void,
): LockStateSubscription {
  return device.monitorCharacteristicForService(
    BLE_SERVICE_UUID,
    BLE_CHARACTERISTIC_UUIDS.lockState,
    (error, characteristic) => {
      if (error) {
        onError(error.message);
        return;
      }
      try {
        onUpdate(decodeCharacteristicValue(characteristic?.value ?? null));
      } catch (parseError) {
        onError(parseError instanceof Error ? parseError.message : 'unknown error');
      }
    },
  );
}
