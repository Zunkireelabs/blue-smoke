/**
 * §4.3 `deviceInfo` read — app-side coverage for `readDeviceInfo()`, mirroring
 * `auth.test.ts`'s split between "drive the real mock" and "manager/device
 * doubles for the paths the mock can't reach" (e.g. a foreign
 * `protocolVersion`, which the mock always reports as ours).
 */
import { createMockPeripheral } from '../../../../tools/mock-peripheral/bleAdapter';
import { FakeClock } from '../../../../tools/mock-peripheral/clock';
import { nodeDeviceCoreCrypto, nodeNonceSource } from '../../../../tools/mock-peripheral/crypto';
import { readDeviceInfo } from '../deviceInfo';
import {
  CHARACTERISTIC_LENGTH_BYTES,
  DEVICE_INFO_LAYOUT,
  PROTOCOL_VERSION,
  ProvisioningState,
} from '../protocol';
import { writeBytes, writeUint8 } from '../byteLayout';
import type { BleDeviceLike } from '../BleClientContext';

const K_DEV = Uint8Array.from({ length: 16 }, (_, i) => 0x10 + i);
const DEVICE_ID = 'mock-device-0001';

// Distinct-byte fixture (brief §5's "fixture rule" — a uniform or repeated
// byte cannot distinguish a wrong offset/length from a correct one). Every
// scalar below is a different value from every other scalar in this fixture.
const MOCK_DEVICE_UID = Uint8Array.from({ length: 12 }, (_, i) => 0x40 + i); // 0x40..0x4B
const MOCK_HW_REVISION = 0x05;
const MOCK_FW_VERSION = { major: 0x0a, minor: 0x0b };
const MOCK_KEY_GENERATION = 0x0c;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Builds a raw §4.3 deviceInfo buffer, offsets always taken from DEVICE_INFO_LAYOUT. */
function buildDeviceInfoBytes(fields: {
  protocolVersion: number;
  hwRevision: number;
  fwVersion: { major: number; minor: number };
  deviceUid: Uint8Array;
  provisioningState: number;
  keyGeneration: number;
}): Uint8Array {
  const buffer = new Uint8Array(CHARACTERISTIC_LENGTH_BYTES.deviceInfo);
  writeUint8(buffer, DEVICE_INFO_LAYOUT.protocolVersion.offset, fields.protocolVersion);
  writeUint8(buffer, DEVICE_INFO_LAYOUT.hwRevision.offset, fields.hwRevision);
  writeUint8(buffer, DEVICE_INFO_LAYOUT.fwVersion.offset, fields.fwVersion.major);
  writeUint8(buffer, DEVICE_INFO_LAYOUT.fwVersion.offset + 1, fields.fwVersion.minor);
  writeBytes(buffer, DEVICE_INFO_LAYOUT.deviceUid.offset, fields.deviceUid);
  writeUint8(buffer, DEVICE_INFO_LAYOUT.provisioningState.offset, fields.provisioningState);
  writeUint8(buffer, DEVICE_INFO_LAYOUT.keyGeneration.offset, fields.keyGeneration);
  return buffer;
}

/** A `BleDeviceLike` double whose deviceInfo read is fully scripted; nothing else is used by readDeviceInfo(). */
function deviceInfoOnlyDevice(
  readCharacteristicForService: BleDeviceLike['readCharacteristicForService'],
): BleDeviceLike {
  const device: BleDeviceLike = {
    id: DEVICE_ID,
    discoverAllServicesAndCharacteristics: async () => device,
    readCharacteristicForService,
    writeCharacteristicWithResponseForService: async () => ({ value: null }),
    monitorCharacteristicForService: () => ({ remove: () => {} }),
  };
  return device;
}

function buildMockPeripheral(provisioningState?: ProvisioningState) {
  const clock = new FakeClock(0);
  return createMockPeripheral({
    kDev: K_DEV,
    clock,
    deviceId: DEVICE_ID,
    deviceUid: MOCK_DEVICE_UID,
    hwRevision: MOCK_HW_REVISION,
    fwVersion: MOCK_FW_VERSION,
    keyGeneration: MOCK_KEY_GENERATION,
    crypto: nodeDeviceCoreCrypto,
    nonceSource: nodeNonceSource,
    ...(provisioningState === undefined ? {} : { provisioningState }),
  });
}

describe('readDeviceInfo — §4.3, against the mock peripheral', () => {
  test('a real mock read parses every field correctly, deviceUid byte-for-byte', async () => {
    // protocolVersion (1) and provisioningState must differ (brief §5's
    // fixture rule) — ACTIVATED (2), not UNPROVISIONED (0), which is what a
    // zeroed buffer produces and would reintroduce a different blind spot.
    const { manager } = buildMockPeripheral(ProvisioningState.ACTIVATED);
    const device = await manager.connectToDevice(DEVICE_ID);
    await device.discoverAllServicesAndCharacteristics();

    const outcome = await readDeviceInfo(device);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.info.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(outcome.info.hwRevision).toBe(MOCK_HW_REVISION);
    expect(outcome.info.fwVersion).toEqual(MOCK_FW_VERSION);
    expect(Array.from(outcome.info.deviceUid)).toEqual(Array.from(MOCK_DEVICE_UID));
    expect(outcome.info.provisioningState).toBe(ProvisioningState.ACTIVATED);
    expect(outcome.info.keyGeneration).toBe(MOCK_KEY_GENERATION);
  });

  test('compatible: true against the mock, which speaks PROTOCOL_VERSION', async () => {
    const { manager } = buildMockPeripheral();
    const device = await manager.connectToDevice(DEVICE_ID);
    await device.discoverAllServicesAndCharacteristics();

    const outcome = await readDeviceInfo(device);

    expect(outcome).toMatchObject({ ok: true, compatible: true });
  });

  test.each([
    ['UNPROVISIONED', ProvisioningState.UNPROVISIONED],
    ['PROVISIONED', ProvisioningState.PROVISIONED],
    ['ACTIVATED', ProvisioningState.ACTIVATED],
  ] as const)('provisioningState %s round-trips through the mock', async (_label, state) => {
    const { manager } = buildMockPeripheral(state);
    const device = await manager.connectToDevice(DEVICE_ID);
    await device.discoverAllServicesAndCharacteristics();

    const outcome = await readDeviceInfo(device);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.info.provisioningState).toBe(state);
    }
  });
});

describe('readDeviceInfo — protocol-version mismatch, which the mock cannot produce itself', () => {
  test('compatible: false for a device reporting a different protocolVersion, and ok stays true', async () => {
    const mismatchedBytes = buildDeviceInfoBytes({
      protocolVersion: PROTOCOL_VERSION + 1,
      hwRevision: 0x08,
      fwVersion: { major: 0x0d, minor: 0x0e },
      deviceUid: Uint8Array.from({ length: 12 }, (_, i) => 0x50 + i),
      // protocolVersion here is PROTOCOL_VERSION + 1 (2) — provisioningState
      // must differ from it (brief §5's fixture rule), so PROVISIONED (1),
      // not ACTIVATED (2), which would collide.
      provisioningState: ProvisioningState.PROVISIONED,
      keyGeneration: 0x11,
    });
    const device = deviceInfoOnlyDevice(async () => ({ value: bytesToBase64(mismatchedBytes) }));

    const outcome = await readDeviceInfo(device);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.compatible).toBe(false);
    expect(outcome.info.protocolVersion).toBe(PROTOCOL_VERSION + 1);
    expect(outcome.info.hwRevision).toBe(0x08);
    expect(outcome.info.fwVersion).toEqual({ major: 0x0d, minor: 0x0e });
    expect(outcome.info.provisioningState).toBe(ProvisioningState.PROVISIONED);
    expect(outcome.info.keyGeneration).toBe(0x11);
  });
});

describe('readDeviceInfo — typed failure paths, nothing throws', () => {
  test('an out-of-range provisioningState resolves to a typed transport outcome', async () => {
    const badBytes = buildDeviceInfoBytes({
      protocolVersion: PROTOCOL_VERSION,
      hwRevision: 0x09,
      fwVersion: { major: 0x02, minor: 0x03 },
      deviceUid: Uint8Array.from({ length: 12 }, (_, i) => 0x60 + i),
      provisioningState: 3, // not a valid ProvisioningState (0/1/2)
      keyGeneration: 0x13,
    });
    const device = deviceInfoOnlyDevice(async () => ({ value: bytesToBase64(badBytes) }));

    await expect(readDeviceInfo(device)).resolves.toEqual({
      ok: false,
      reason: 'transport',
      detail: 'deviceInfo: provisioningState 3 is not a valid §4.3 state',
    });
  });

  test('a null characteristic value resolves to a typed transport outcome', async () => {
    const device = deviceInfoOnlyDevice(async () => ({ value: null }));

    await expect(readDeviceInfo(device)).resolves.toEqual({
      ok: false,
      reason: 'transport',
      detail: 'deviceInfo read returned no value',
    });
  });

  test.each([
    [
      'under-length',
      Uint8Array.from({ length: 5 }, (_, i) => 0x70 + i),
      5,
    ],
    [
      'over-length',
      (() => {
        const valid = buildDeviceInfoBytes({
          protocolVersion: PROTOCOL_VERSION,
          hwRevision: 0x09,
          fwVersion: { major: 0x02, minor: 0x03 },
          deviceUid: Uint8Array.from({ length: 12 }, (_, i) => 0x60 + i),
          provisioningState: ProvisioningState.PROVISIONED,
          keyGeneration: 0x13,
        });
        const overLength = new Uint8Array(valid.length + 1);
        overLength.set(valid);
        overLength[valid.length] = 0xff;
        return overLength;
      })(),
      CHARACTERISTIC_LENGTH_BYTES.deviceInfo + 1,
    ],
  ] as const)(
    'a wrong-length (%s) deviceInfo resolves to a typed transport outcome naming both lengths',
    async (_label, bytes, gotLength) => {
      const device = deviceInfoOnlyDevice(async () => ({ value: bytesToBase64(bytes) }));

      await expect(readDeviceInfo(device)).resolves.toEqual({
        ok: false,
        reason: 'transport',
        detail: `deviceInfo: expected ${CHARACTERISTIC_LENGTH_BYTES.deviceInfo} bytes, got ${gotLength}`,
      });
    },
  );

  test('a hung read times out instead of hanging', async () => {
    jest.useFakeTimers();
    try {
      const device = deviceInfoOnlyDevice(() => new Promise(() => {}));

      const outcomePromise = readDeviceInfo(device);
      await jest.advanceTimersByTimeAsync(3000);

      await expect(outcomePromise).resolves.toEqual({ ok: false, reason: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });
});
