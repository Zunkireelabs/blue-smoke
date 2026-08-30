/**
 * §4.4 `lockState` — app-side coverage for `readLockState()`/`monitorLockState()`, mirroring
 * `deviceInfo.test.ts`'s split between a real mock peripheral and hand-scripted `BleDeviceLike`
 * doubles for paths the mock can't reach (a corrupt/short notification).
 */
import { createMockPeripheral, createMockBleFleet } from '../../../../tools/mock-peripheral/bleAdapter';
import { FakeClock } from '../../../../tools/mock-peripheral/clock';
import { nodeDeviceCoreCrypto, nodeNonceSource } from '../../../../tools/mock-peripheral/crypto';
import { parseLockState, readLockState, monitorLockState } from '../lockState';
import { CHARACTERISTIC_LENGTH_BYTES, LOCK_STATE_LAYOUT, LockState, LockReason } from '../protocol';
import { writeUint8 } from '../byteLayout';
import type { BleDeviceLike } from '../BleClientContext';

const K_DEV = Uint8Array.from({ length: 16 }, (_, i) => 0x20 + i);

function buildLockStateBytes(fields: {
  state: number;
  flags: number;
  batteryPercent: number;
  lastLockReason: number;
  secondsSinceStateChange: number;
  protocolVersion: number;
}): Uint8Array {
  const buffer = new Uint8Array(CHARACTERISTIC_LENGTH_BYTES.lockState);
  writeUint8(buffer, LOCK_STATE_LAYOUT.state.offset, fields.state);
  writeUint8(buffer, LOCK_STATE_LAYOUT.flags.offset, fields.flags);
  writeUint8(buffer, LOCK_STATE_LAYOUT.batteryPercent.offset, fields.batteryPercent);
  writeUint8(buffer, LOCK_STATE_LAYOUT.lastLockReason.offset, fields.lastLockReason);
  buffer[LOCK_STATE_LAYOUT.secondsSinceStateChange.offset] = fields.secondsSinceStateChange & 0xff;
  buffer[LOCK_STATE_LAYOUT.secondsSinceStateChange.offset + 1] =
    (fields.secondsSinceStateChange >>> 8) & 0xff;
  writeUint8(buffer, LOCK_STATE_LAYOUT.protocolVersion.offset, fields.protocolVersion);
  return buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function scriptedDevice(
  id: string,
  readCharacteristicForService: BleDeviceLike['readCharacteristicForService'],
  monitorCharacteristicForService?: BleDeviceLike['monitorCharacteristicForService'],
): BleDeviceLike {
  const device: BleDeviceLike = {
    id,
    discoverAllServicesAndCharacteristics: async () => device,
    readCharacteristicForService,
    writeCharacteristicWithResponseForService: async () => ({ value: null }),
    monitorCharacteristicForService: monitorCharacteristicForService ?? (() => ({ remove: () => {} })),
  };
  return device;
}

describe('parseLockState — pure decode', () => {
  test('decodes every field from distinct-byte offsets (fixture rule)', () => {
    const bytes = buildLockStateBytes({
      state: LockState.LOCKED_PENDING_ACTIVATION,
      // bit0 authenticated=1, bit1 charging=0, bit2 lowBattery=1, bit3 deadMan=0, bit4 expired=1
      flags: 0b10101,
      batteryPercent: 63,
      lastLockReason: LockReason.SESSION_EXPIRY,
      secondsSinceStateChange: 0x1234,
      protocolVersion: 1,
    });

    const info = parseLockState(bytes);

    expect(info).toEqual({
      state: LockState.LOCKED_PENDING_ACTIVATION,
      authenticatedSessionActive: true,
      charging: false,
      lowBattery: true,
      deadManTimerArmed: false,
      sessionExpired: true,
      batteryPercent: 63,
      lastLockReason: LockReason.SESSION_EXPIRY,
      secondsSinceStateChange: 0x1234,
      protocolVersion: 1,
    });
  });

  test('0xFF batteryPercent decodes to null (unknown), not the literal 255', () => {
    const bytes = buildLockStateBytes({
      state: LockState.LOCKED,
      flags: 0,
      batteryPercent: 0xff,
      lastLockReason: LockReason.USER_COMMAND,
      secondsSinceStateChange: 0,
      protocolVersion: 1,
    });

    expect(parseLockState(bytes).batteryPercent).toBeNull();
  });

  test('rejects an out-of-range state byte rather than silently accepting it', () => {
    const bytes = buildLockStateBytes({
      state: 0x09,
      flags: 0,
      batteryPercent: 50,
      lastLockReason: LockReason.USER_COMMAND,
      secondsSinceStateChange: 0,
      protocolVersion: 1,
    });

    expect(() => parseLockState(bytes)).toThrow(/state/);
  });

  test('rejects an out-of-range lastLockReason byte', () => {
    const bytes = buildLockStateBytes({
      state: LockState.LOCKED,
      flags: 0,
      batteryPercent: 50,
      lastLockReason: 0x09,
      secondsSinceStateChange: 0,
      protocolVersion: 1,
    });

    expect(() => parseLockState(bytes)).toThrow(/lastLockReason/);
  });
});

describe('readLockState — against the real mock peripheral', () => {
  function buildMockPeripheral(deviceId: string, batteryPercent: number) {
    return createMockPeripheral({
      kDev: K_DEV,
      clock: new FakeClock(0),
      deviceId,
      initialBatteryPercent: batteryPercent,
      crypto: nodeDeviceCoreCrypto,
      nonceSource: nodeNonceSource,
    });
  }

  test('reads battery and low-battery flag straight off the device — no client-side threshold logic', async () => {
    const { manager } = buildMockPeripheral('mock-device-0001', 12); // below the device's own 15% latch
    const device = await manager.connectToDevice('mock-device-0001');
    await device.discoverAllServicesAndCharacteristics();

    const outcome = await readLockState(device);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.info.batteryPercent).toBe(12);
    expect(outcome.info.lowBattery).toBe(true);
    expect(outcome.info.state).toBe(LockState.LOCKED);
  });

  test('an unauthenticated (bonded-only) connection can still read lockState — §8.2', async () => {
    const { manager } = buildMockPeripheral('mock-device-0001', 80);
    const device = await manager.connectToDevice('mock-device-0001');
    await device.discoverAllServicesAndCharacteristics();

    // No handshake performed — this is exactly the "bonded but unauthenticated" case.
    const outcome = await readLockState(device);
    expect(outcome.ok).toBe(true);
  });

  test('reads two mock peripherals independently and simultaneously', async () => {
    const { manager, devices } = createMockBleFleet([
      { kDev: K_DEV, clock: new FakeClock(0), deviceId: 'mock-device-0001', initialBatteryPercent: 90, crypto: nodeDeviceCoreCrypto, nonceSource: nodeNonceSource },
      { kDev: K_DEV, clock: new FakeClock(0), deviceId: 'mock-device-0002', initialBatteryPercent: 40, crypto: nodeDeviceCoreCrypto, nonceSource: nodeNonceSource },
    ]);

    const [deviceA, deviceB] = await Promise.all(
      devices.map((d) => manager.connectToDevice(d.id).then((connected) => connected.discoverAllServicesAndCharacteristics())),
    );

    const [outcomeA, outcomeB] = await Promise.all([readLockState(deviceA), readLockState(deviceB)]);

    expect(outcomeA.ok && outcomeA.info.batteryPercent).toBe(90);
    expect(outcomeB.ok && outcomeB.info.batteryPercent).toBe(40);
  });
});

describe('readLockState — failure paths (scripted doubles)', () => {
  test('a read that never resolves surfaces as a timeout, not a hang', async () => {
    jest.useFakeTimers();
    const device = scriptedDevice('never-resolves', () => new Promise(() => {}));

    const promise = readLockState(device);
    jest.advanceTimersByTime(3000);
    const outcome = await promise;

    expect(outcome).toEqual({ ok: false, reason: 'timeout' });
    jest.useRealTimers();
  });

  test('a null characteristic value is a transport error, not a thrown exception', async () => {
    const device = scriptedDevice('null-value', async () => ({ value: null }));
    const outcome = await readLockState(device);
    expect(outcome).toEqual({ ok: false, reason: 'transport', detail: expect.stringContaining('no value') });
  });

  test('a short/corrupt characteristic value is a transport error, never a wrong-length parse', async () => {
    const shortBytes = new Uint8Array(3);
    const device = scriptedDevice('short-value', async () => ({ value: bytesToBase64(shortBytes) }));
    const outcome = await readLockState(device);
    expect(outcome).toEqual({ ok: false, reason: 'transport', detail: expect.stringContaining('expected 8 bytes') });
  });
});

describe('monitorLockState — notify-driven, not polled', () => {
  test('delivers every notification to onUpdate, parsed', async () => {
    const { manager, core } = createMockPeripheral({
      kDev: K_DEV,
      clock: new FakeClock(0),
      deviceId: 'mock-device-0001',
      initialBatteryPercent: 50,
      crypto: nodeDeviceCoreCrypto,
      nonceSource: nodeNonceSource,
    });
    const device = await manager.connectToDevice('mock-device-0001');
    await device.discoverAllServicesAndCharacteristics();

    const updates: number[] = [];
    const sub = monitorLockState(
      device,
      (info) => updates.push(info.batteryPercent ?? -1),
      () => {},
    );

    // §4.4 — a battery-threshold crossing fires a lockState notification.
    core.setBatteryPercent(10);

    expect(updates).toContain(10);
    sub.remove();
  });

  test('two simultaneously-monitored mock peripherals notify independently, never cross-wired', async () => {
    const { manager, devices, cores } = createMockBleFleet([
      { kDev: K_DEV, clock: new FakeClock(0), deviceId: 'mock-device-0001', initialBatteryPercent: 90, crypto: nodeDeviceCoreCrypto, nonceSource: nodeNonceSource },
      { kDev: K_DEV, clock: new FakeClock(0), deviceId: 'mock-device-0002', initialBatteryPercent: 90, crypto: nodeDeviceCoreCrypto, nonceSource: nodeNonceSource },
    ]);
    const [deviceA, deviceB] = await Promise.all(
      devices.map((d) => manager.connectToDevice(d.id).then((connected) => connected.discoverAllServicesAndCharacteristics())),
    );

    const updatesA: number[] = [];
    const updatesB: number[] = [];
    const subA = monitorLockState(deviceA, (info) => updatesA.push(info.batteryPercent ?? -1), () => {});
    const subB = monitorLockState(deviceB, (info) => updatesB.push(info.batteryPercent ?? -1), () => {});

    cores[0].setBatteryPercent(5);

    expect(updatesA).toContain(5);
    expect(updatesB).toEqual([]); // device B's monitor must not see device A's notification

    subA.remove();
    subB.remove();
  });

  test('a corrupt notification goes to onError, never to onUpdate or an uncaught throw', () => {
    let capturedListener: Parameters<BleDeviceLike['monitorCharacteristicForService']>[2] | undefined;
    const device = scriptedDevice('mock-device-0001', async () => ({ value: null }), (_svc, _char, listener) => {
      capturedListener = listener;
      return { remove: () => {} };
    });

    const onUpdate = jest.fn();
    const onError = jest.fn();
    monitorLockState(device, onUpdate, onError);

    expect(capturedListener).toBeDefined();
    capturedListener?.(null, { value: bytesToBase64(new Uint8Array(2)) });

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('expected 8 bytes'));
  });
});
