/**
 * P1-3.0 §3.1/§3.2 — proves the two capabilities the dev BLE seam brief calls the highest-value
 * part of this task: `MockBleManager.state()` is selectable across all five states
 * `readBluetoothGateState` (`src/features/ble/bluetoothPermission.ts`) distinguishes, and a scan
 * can be shaped to none/one/several/weak-RSSI devices via `createMockBleFleet()`. Neither of
 * these existed before this task — `state()` returned `'PoweredOn'` unconditionally and the
 * manager only ever backed one device — so this file is new coverage, not a rewrite.
 */
import { createMockBleFleet, createMockPeripheral, type BleRadioState } from '../bleAdapter';
import { FakeClock } from '../clock';
import { BLE_SERVICE_UUID } from '../../../src/features/ble/protocol';
import { NODE_DEPS } from './harness';

const K_DEV = Buffer.alloc(16, 0xaa);

function buildDevice(deviceId: string, suffixHex: string, overrides: Partial<Parameters<typeof createMockPeripheral>[0]> = {}) {
  return { kDev: K_DEV, clock: new FakeClock(0), deviceId, deviceUidSuffixHex: suffixHex, ...NODE_DEPS, ...overrides };
}

describe('MockBleManager — selectable radio state (P1-3.0 §3.1)', () => {
  test('defaults to PoweredOn, unchanged from before this task', async () => {
    const { manager } = createMockPeripheral({ kDev: K_DEV, clock: new FakeClock(0), ...NODE_DEPS });
    expect(await manager.state()).toBe('PoweredOn');
  });

  test.each<BleRadioState>(['PoweredOn', 'PoweredOff', 'Unauthorized', 'Unsupported', 'Unknown'])(
    'setState(%s) is reflected by the next state() read',
    async (radioState) => {
      const { manager } = createMockPeripheral({ kDev: K_DEV, clock: new FakeClock(0), ...NODE_DEPS });
      manager.setState(radioState);
      expect(await manager.state()).toBe(radioState);
    },
  );

  test('createMockPeripheral accepts an initial radioState, so a fixture never starts PoweredOn by accident', async () => {
    const { manager } = createMockPeripheral({
      kDev: K_DEV,
      clock: new FakeClock(0),
      radioState: 'PoweredOff',
      ...NODE_DEPS,
    });
    expect(await manager.state()).toBe('PoweredOff');
  });
});

describe('createMockBleFleet — shapeable scan (P1-3.0 §3.2)', () => {
  test('no devices found — an empty fleet scans to nothing', () => {
    const { manager } = createMockBleFleet([]);
    const found: unknown[] = [];
    manager.startDeviceScan([BLE_SERVICE_UUID], null, (_error, device) => found.push(device));
    expect(found).toEqual([]);
  });

  test('one device found — a single-entry fleet behaves like createMockPeripheral', () => {
    const { manager, devices } = createMockBleFleet([buildDevice('mock-device-0001', '0001')]);
    const found: unknown[] = [];
    manager.startDeviceScan([BLE_SERVICE_UUID], null, (_error, device) => found.push(device));
    expect(found).toEqual([devices[0]]);
  });

  test('several devices found — every entry surfaces, each independently connectable', async () => {
    const { manager, devices } = createMockBleFleet([
      buildDevice('mock-device-0001', '0001'),
      buildDevice('mock-device-0002', '0002'),
      buildDevice('mock-device-0003', '0003'),
    ]);
    const found: string[] = [];
    manager.startDeviceScan([BLE_SERVICE_UUID], null, (_error, device) => {
      if (device) found.push(device.id);
    });
    expect(found).toEqual(devices.map((d) => d.id));

    await manager.connectToDevice('mock-device-0002');
    expect(await manager.isDeviceConnected('mock-device-0002')).toBe(true);
    expect(await manager.isDeviceConnected('mock-device-0001')).toBe(false);
  });

  test('weak RSSI device — rssi is populated at scan time, no readRSSI() call needed', () => {
    const { manager } = createMockBleFleet([
      buildDevice('mock-device-weak', '00aa', { rssiSeries: [-92] }),
    ]);
    let scanned: { rssi: number | null } | null = null;
    manager.startDeviceScan([BLE_SERVICE_UUID], null, (_error, device) => {
      scanned = device;
    });
    expect(scanned).not.toBeNull();
    expect((scanned as unknown as { rssi: number | null }).rssi).toBe(-92);
  });

  test('connecting to a device the fleet never advertised throws, same as the single-device path', async () => {
    const { manager } = createMockBleFleet([buildDevice('mock-device-0001', '0001')]);
    await expect(manager.connectToDevice('mock-device-nope')).rejects.toThrow(
      'MockBleManager: unknown device mock-device-nope',
    );
  });
});
