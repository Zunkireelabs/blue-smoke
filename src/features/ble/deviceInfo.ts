/**
 * §4.3 `deviceInfo` (C1) read: parse the characteristic and report whether
 * the device's `protocolVersion` matches ours.
 *
 * Execution brief: docs/execution-briefs/P1-4.0-part2a-deviceinfo-protocol-version.md
 * (P1-4.0 Part 2a). Same "nothing throws across this boundary" convention as
 * `auth.ts`'s `AuthHandshake` — every failure path resolves to a typed
 * `DeviceInfoOutcome`.
 */

import type { BleDeviceLike } from './BleClientContext';
import { readBytes, readUint8 } from './byteLayout';
import {
  BLE_CHARACTERISTIC_UUIDS,
  BLE_SERVICE_UUID,
  CHARACTERISTIC_LENGTH_BYTES,
  DEVICE_INFO_LAYOUT,
  PROTOCOL_VERSION,
  ProvisioningState,
} from './protocol';

// Not a §4 constant — an app-level operational choice for this one read,
// same reasoning as auth.ts:29-38 (READ_TIMEOUT_MS there covers exactly one
// characteristic read too). Only one stage exists here (the brief §4.1: this
// function takes an already-connected device, so connect/discover are the
// caller's concern, not this module's), so there is only one budget.
const READ_TIMEOUT_MS = 3000;

export interface DeviceInfo {
  protocolVersion: number;
  hwRevision: number;
  fwVersion: { major: number; minor: number };
  deviceUid: Uint8Array; // §2 of the brief — in memory only, never logged/persisted/sent
  provisioningState: ProvisioningState;
  keyGeneration: number;
}

export type DeviceInfoOutcome =
  | { ok: true; info: DeviceInfo; compatible: boolean }
  | { ok: false; reason: 'timeout' }
  | { ok: false; reason: 'transport'; detail: string };

class DeviceInfoTimeoutError extends Error {
  constructor() {
    super('§4.3 deviceInfo read exceeded its timeout budget');
    this.name = 'DeviceInfoTimeoutError';
  }
}

// Bounds the read (CLAUDE.md: "Every BLE operation has an explicit timeout.
// No unbounded await."). Same shape as auth.ts's withTimeout, but there is
// only one stage here, so there is nothing to tag it with.
async function withTimeout<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new DeviceInfoTimeoutError()), ms);
  });
  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// Hand-rolled base64 decoder, duplicated from auth.ts's base64ToBytes (not
// exported there, and exporting it would mean editing auth.ts — out of scope
// per the execution brief §4.4/§1). Flagged in this task's report as a
// follow-up: extract a shared base64 helper now that a second module needs
// one. Same alphabet/algorithm as auth.ts; kept local rather than imported.
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

const VALID_PROVISIONING_STATES: ReadonlySet<number> = new Set(Object.values(ProvisioningState));

function isValidProvisioningState(value: number): value is ProvisioningState {
  return VALID_PROVISIONING_STATES.has(value);
}

function parseDeviceInfo(bytes: Uint8Array): DeviceInfo {
  const rawProvisioningState = readUint8(bytes, DEVICE_INFO_LAYOUT.provisioningState.offset);
  if (!isValidProvisioningState(rawProvisioningState)) {
    throw new Error(`deviceInfo: provisioningState ${rawProvisioningState} is not a valid §4.3 state`);
  }

  return {
    protocolVersion: readUint8(bytes, DEVICE_INFO_LAYOUT.protocolVersion.offset),
    hwRevision: readUint8(bytes, DEVICE_INFO_LAYOUT.hwRevision.offset),
    fwVersion: {
      major: readUint8(bytes, DEVICE_INFO_LAYOUT.fwVersion.offset),
      minor: readUint8(bytes, DEVICE_INFO_LAYOUT.fwVersion.offset + 1),
    },
    // §2 of the brief — deviceUid lives here, in memory, and nowhere else.
    deviceUid: readBytes(bytes, DEVICE_INFO_LAYOUT.deviceUid.offset, DEVICE_INFO_LAYOUT.deviceUid.length),
    provisioningState: rawProvisioningState,
    keyGeneration: readUint8(bytes, DEVICE_INFO_LAYOUT.keyGeneration.offset),
  };
}

/**
 * §4.3 — read `deviceInfo` off an already-connected device and report
 * `protocolVersion` compatibility.
 *
 * Takes a connected `BleDeviceLike`, not a `deviceId`: `BleManagerLike` has
 * no way to fetch a handle for an existing connection other than calling
 * `connectToDevice()` again, which forces a disconnect+reconnect on Android
 * (auth.ts:199-204 documents the same trap). Taking the already-connected
 * device keeps this a pure post-connect read and leaves connect/discover in
 * exactly one place — see the execution brief §4.1.
 *
 * `compatible` REPORTS a fact (`info.protocolVersion === PROTOCOL_VERSION`);
 * it does not decide anything. §4.3 never defines client behaviour on a
 * mismatch, so `ok: true, compatible: false` is a valid, intentional outcome
 * — the read succeeded, the device just speaks a different version. See the
 * execution report's findings for the spec gap this leaves open (OQ-6).
 */
export async function readDeviceInfo(device: BleDeviceLike): Promise<DeviceInfoOutcome> {
  try {
    const characteristic = await withTimeout(
      device.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUIDS.deviceInfo),
      READ_TIMEOUT_MS,
    );
    if (!characteristic.value) {
      throw new Error('deviceInfo read returned no value');
    }

    const bytes = base64ToBytes(characteristic.value);
    if (bytes.length !== CHARACTERISTIC_LENGTH_BYTES.deviceInfo) {
      throw new Error(
        `deviceInfo: expected ${CHARACTERISTIC_LENGTH_BYTES.deviceInfo} bytes, got ${bytes.length}`,
      );
    }

    const info = parseDeviceInfo(bytes);
    return { ok: true, info, compatible: info.protocolVersion === PROTOCOL_VERSION };
  } catch (error) {
    if (error instanceof DeviceInfoTimeoutError) {
      return { ok: false, reason: 'timeout' };
    }
    // Never across this boundary throws (module doc above). `detail` carries
    // lengths/values only, per the brief §2 — never the raw deviceUid bytes,
    // which this catch never even has access to (parseDeviceInfo throws
    // before constructing a DeviceInfo whenever the read itself is bad).
    const detail = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, reason: 'transport', detail };
  }
}
