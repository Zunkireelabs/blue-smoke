/**
 * §4.1 scan & discovery — app-side coverage for `parseAdvertisement()` and
 * `createDeviceScanner()` (P1-3.0).
 *
 * Same split as `deviceInfo.test.ts`: drive the real mock peripheral where it
 * can reach the behaviour, and use a hand-rolled `BleScannerLike` double for
 * the paths it can't — adapter-state transitions mid-scan, scan errors, and
 * the staleness window.
 *
 * Fixture rule (inherited from the P1-4.0 brief §5): every byte in the
 * manufacturer-data fixture is a distinct value, so a wrong offset cannot
 * produce a passing assertion.
 */
import { createMockPeripheral } from '../../../../tools/mock-peripheral/bleAdapter';
import { FakeClock } from '../../../../tools/mock-peripheral/clock';
import type { BleAdvertisementLike, BleScannerLike } from '../BleClientContext';
import {
  BleAdapterState,
  createDeviceScanner,
  parseAdvertisement,
  type ScanState,
} from '../scanner';
import {
  ADVERTISING_MANUFACTURER_DATA_OFFSETS,
  BATTERY_PERCENT_UNKNOWN,
  BLE_SERVICE_UUID,
  PROTOCOL_VERSION,
} from '../protocol';

const K_DEV = Uint8Array.from({ length: 16 }, (_, i) => 0x10 + i);

const STATE_HINT = 0x02;
const BATTERY = 0x4d; // 77% — distinct from every other fixture byte
const FLAGS = 0x09;

function buildManufacturerData(overrides: Partial<Record<keyof typeof ADVERTISING_MANUFACTURER_DATA_OFFSETS, number>> = {}): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[ADVERTISING_MANUFACTURER_DATA_OFFSETS.protocolVersion] =
    overrides.protocolVersion ?? PROTOCOL_VERSION;
  bytes[ADVERTISING_MANUFACTURER_DATA_OFFSETS.stateHint] = overrides.stateHint ?? STATE_HINT;
  bytes[ADVERTISING_MANUFACTURER_DATA_OFFSETS.battery] = overrides.battery ?? BATTERY;
  bytes[ADVERTISING_MANUFACTURER_DATA_OFFSETS.flags] = overrides.flags ?? FLAGS;
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

// ── parseAdvertisement — §4.1 manufacturer data ─────────────────────────────

describe('parseAdvertisement — §4.1 manufacturer data', () => {
  test('reads all four fields from their specified offsets', () => {
    const parsed = parseAdvertisement(toBase64(buildManufacturerData()));

    expect(parsed).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      compatible: true,
      stateHintRaw: STATE_HINT,
      batteryPercent: BATTERY,
      flagsRaw: FLAGS,
    });
  });

  test('reports an incompatible protocolVersion as a fact, without discarding the rest', () => {
    const parsed = parseAdvertisement(toBase64(buildManufacturerData({ protocolVersion: 0x02 })));

    // §4.3's precedent: `compatible` reports, it does not decide. The state
    // hint and battery from a newer device are still readable and still true.
    expect(parsed?.compatible).toBe(false);
    expect(parsed?.protocolVersion).toBe(0x02);
    expect(parsed?.stateHintRaw).toBe(STATE_HINT);
  });

  test('battery 0xFF is unknown, not 255%', () => {
    const parsed = parseAdvertisement(
      toBase64(buildManufacturerData({ battery: BATTERY_PERCENT_UNKNOWN })),
    );
    expect(parsed?.batteryPercent).toBeNull();
  });

  test('a battery byte above 100 is unknown rather than clamped', () => {
    // §4.1 gives the byte no encoding, so an out-of-range value is a device we
    // do not understand — reporting "100%" would invent a reading.
    expect(parseAdvertisement(toBase64(buildManufacturerData({ battery: 101 })))?.batteryPercent).toBeNull();
    expect(parseAdvertisement(toBase64(buildManufacturerData({ battery: 100 })))?.batteryPercent).toBe(100);
    expect(parseAdvertisement(toBase64(buildManufacturerData({ battery: 0 })))?.batteryPercent).toBe(0);
  });

  test('returns null — never a partial object — for absent, short, long or corrupt data', () => {
    expect(parseAdvertisement(null)).toBeNull();
    expect(parseAdvertisement('')).toBeNull();
    expect(parseAdvertisement(toBase64(new Uint8Array(3)))).toBeNull();
    expect(parseAdvertisement(toBase64(new Uint8Array(5)))).toBeNull();
    expect(parseAdvertisement('not base64 $$$')).toBeNull();
  });
});

// ── createDeviceScanner — against the real mock peripheral ──────────────────

describe('createDeviceScanner — driven by the mock peripheral', () => {
  function setup(extra: Parameters<typeof createMockPeripheral>[0] extends infer T ? Partial<T> : never = {}) {
    return createMockPeripheral({
      kDev: K_DEV,
      clock: new FakeClock(0),
      advertisedRssi: -55,
      manufacturerData: buildManufacturerData(),
      ...extra,
    });
  }

  test('finds the device, filtered on the §4.2 service UUID, and parses its advertisement', () => {
    const { manager, device } = setup();
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();

    const state = scanner.getState();
    expect(state.status).toBe('scanning');
    const found = state.status === 'scanning' ? state.devices : [];
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(device.id);
    expect(found[0].name).toBe(device.name);
    expect(found[0].rssi).toBe(-55);
    expect(found[0].advertisement?.batteryPercent).toBe(BATTERY);

    scanner.dispose();
  });

  test('the scan is filtered at the radio, not after the fact', () => {
    const { manager } = setup();
    const startDeviceScan = jest.spyOn(manager, 'startDeviceScan');
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();

    // §4.1: "The app must filter scan results on the service UUID." Passing
    // null and filtering afterwards would satisfy the visible behaviour of
    // every other test in this file while breaking the requirement.
    expect(startDeviceScan).toHaveBeenCalledWith([BLE_SERVICE_UUID], null, expect.any(Function));

    scanner.dispose();
  });

  test('duplicate advertisements update the row instead of adding one', () => {
    const { manager } = setup();
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();
    manager.emitAdvertisement();
    manager.emitAdvertisement();

    const state = scanner.getState();
    const devices = state.status === 'scanning' ? state.devices : [];
    expect(devices).toHaveLength(1);
    expect(devices[0].advertisementCount).toBe(3);

    scanner.dispose();
  });

  test('list order is discovery order and does not resort as RSSI moves', () => {
    // The failure this pins down: sorting by signal strength makes rows swap
    // under the user's thumb, because RSSI swings between advertisements from
    // a device that has not moved.
    const { manager, device } = setup({
      additionalAdvertisers: [
        { id: 'mock-device-0002', name: 'BlueSmoke-0002', advertisedRssi: -40 },
        { id: 'mock-device-0003', name: 'BlueSmoke-0003', advertisedRssi: -90 },
      ],
    } as never);
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();
    const before = scanner.getState();
    const orderBefore = before.status === 'scanning' ? before.devices.map((d) => d.id) : [];
    expect(orderBefore).toEqual([device.id, 'mock-device-0002', 'mock-device-0003']);

    // The strongest device re-advertises; order must not change.
    manager.emitAdvertisement();
    const after = scanner.getState();
    const orderAfter = after.status === 'scanning' ? after.devices.map((d) => d.id) : [];
    expect(orderAfter).toEqual(orderBefore);

    scanner.dispose();
  });

  test('a device advertising no manufacturer data is still listed', () => {
    const { manager } = setup({ manufacturerData: undefined } as never);
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();

    const state = scanner.getState();
    const devices = state.status === 'scanning' ? state.devices : [];
    expect(devices).toHaveLength(1);
    expect(devices[0].advertisement).toBeNull();

    scanner.dispose();
  });

  test('stop() halts the radio scan — no battery leak on screen exit', () => {
    const { manager } = setup();
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();
    expect(manager.isScanning()).toBe(true);

    scanner.stop();

    expect(manager.isScanning()).toBe(false);
    expect(scanner.getState().status).toBe('stopped');

    scanner.dispose();
  });

  test('stop() and dispose() are idempotent', () => {
    const { manager } = setup();
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();
    scanner.stop();
    scanner.stop();
    scanner.dispose();
    scanner.dispose();

    expect(manager.isScanning()).toBe(false);
  });

  test('start() while already scanning does not start a second radio scan', () => {
    const { manager } = setup();
    const startDeviceScan = jest.spyOn(manager, 'startDeviceScan');
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();
    scanner.start();
    scanner.start();

    expect(startDeviceScan).toHaveBeenCalledTimes(1);

    scanner.dispose();
  });

  test('Bluetooth off before the scan blocks it with a distinct, recoverable reason', () => {
    const { manager } = setup();
    manager.setAdapterState(BleAdapterState.POWERED_OFF);
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();

    expect(scanner.getState()).toEqual({ status: 'blocked', reason: 'bluetoothOff' });
    expect(manager.isScanning()).toBe(false);

    scanner.dispose();
  });

  test('turning Bluetooth on recovers without the user restarting the scan', () => {
    const { manager, device } = setup();
    manager.setAdapterState(BleAdapterState.POWERED_OFF);
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();
    expect(scanner.getState().status).toBe('blocked');

    manager.setAdapterState(BleAdapterState.POWERED_ON);

    const state = scanner.getState();
    expect(state.status).toBe('scanning');
    expect(state.status === 'scanning' && state.devices[0].id).toBe(device.id);

    scanner.dispose();
  });

  test('Bluetooth switched off mid-scan stops the scan and reports it', () => {
    const { manager } = setup();
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();
    expect(manager.isScanning()).toBe(true);

    manager.setAdapterState(BleAdapterState.POWERED_OFF);

    expect(scanner.getState()).toEqual({ status: 'blocked', reason: 'bluetoothOff' });
    expect(manager.isScanning()).toBe(false);

    scanner.dispose();
  });

  test.each([
    [BleAdapterState.UNAUTHORIZED, 'unauthorized'],
    [BleAdapterState.UNSUPPORTED, 'unsupported'],
    [BleAdapterState.RESETTING, 'resetting'],
    [BleAdapterState.UNKNOWN, 'unknown'],
  ])('adapter state %s maps to its own reason %s, not a shared catch-all', (adapterState, reason) => {
    const { manager } = setup();
    manager.setAdapterState(adapterState);
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();

    expect(scanner.getState()).toEqual({ status: 'blocked', reason });

    scanner.dispose();
  });

  test('a scan error stops the scan and surfaces as a failure, not a silent empty list', () => {
    const { manager } = setup();
    const scanner = createDeviceScanner({ scanner: manager });

    scanner.start();
    manager.emitScanError(new Error('BluetoothLE scan failed: 2'));

    expect(scanner.getState()).toEqual({
      status: 'failed',
      detail: 'BluetoothLE scan failed: 2',
    });
    expect(manager.isScanning()).toBe(false);

    scanner.dispose();
  });

  test('subscribers are notified on every state change and unsubscribe cleanly', () => {
    const { manager } = setup();
    const scanner = createDeviceScanner({ scanner: manager });
    const seen: ScanState['status'][] = [];
    const unsubscribe = scanner.subscribe((state) => seen.push(state.status));

    scanner.start();
    manager.emitAdvertisement();
    unsubscribe();
    scanner.stop();

    expect(seen).toEqual(['scanning', 'scanning', 'scanning']);
    expect(scanner.getState().status).toBe('stopped');

    scanner.dispose();
  });
});

// ── the paths the mock cannot reach: timers and staleness ───────────────────

describe('createDeviceScanner — timeout and staleness', () => {
  let advertise: ((error: Error | null, device: BleAdvertisementLike | null) => void) | null = null;
  let clockMs = 0;

  function fakeScanner(): BleScannerLike & { stopped: boolean } {
    const double = {
      stopped: false,
      async state() {
        return BleAdapterState.POWERED_ON;
      },
      onStateChange(listener: (state: string) => void, emitCurrentState?: boolean) {
        if (emitCurrentState) {
          listener(BleAdapterState.POWERED_ON);
        }
        return { remove: () => undefined };
      },
      startDeviceScan(
        _uuids: string[] | null,
        _options: unknown,
        listener: (error: Error | null, device: BleAdvertisementLike | null) => void,
      ) {
        double.stopped = false;
        advertise = listener;
      },
      stopDeviceScan() {
        double.stopped = true;
        advertise = null;
      },
    };
    return double;
  }

  const anAdvertisement = (id: string): BleAdvertisementLike => ({
    id,
    name: `BlueSmoke-${id}`,
    rssi: -60,
    manufacturerData: toBase64(buildManufacturerData()),
  });

  beforeEach(() => {
    jest.useFakeTimers();
    advertise = null;
    clockMs = 0;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('an empty scan times out into noDevicesFound, naming what it filtered on', () => {
    const double = fakeScanner();
    const scanner = createDeviceScanner({
      scanner: double,
      now: () => clockMs,
      scanTimeoutMs: 15_000,
    });

    scanner.start();
    jest.advanceTimersByTime(15_000);

    // The UUID travels with the state because a wrong UUID (OQ-13) produces
    // exactly this screen, and "found nothing" alone cannot tell the two apart.
    expect(scanner.getState()).toEqual({
      status: 'noDevicesFound',
      filteredOnServiceUuid: BLE_SERVICE_UUID,
    });
    expect(double.stopped).toBe(true);

    scanner.dispose();
  });

  test('a timeout with devices found is a completed scan, not an empty one', () => {
    const double = fakeScanner();
    const scanner = createDeviceScanner({
      scanner: double,
      now: () => clockMs,
      scanTimeoutMs: 15_000,
      deviceStaleAfterMs: 20_000,
    });

    scanner.start();
    advertise?.(null, anAdvertisement('aaaa'));
    jest.advanceTimersByTime(15_000);

    const state = scanner.getState();
    expect(state.status).toBe('stopped');
    expect(state.status === 'stopped' && state.devices).toHaveLength(1);

    scanner.dispose();
  });

  test('a device unheard past the staleness window drops off the list', () => {
    const double = fakeScanner();
    const scanner = createDeviceScanner({
      scanner: double,
      now: () => clockMs,
      scanTimeoutMs: 60_000,
      deviceStaleAfterMs: 10_000,
    });

    scanner.start();
    advertise?.(null, anAdvertisement('aaaa'));

    clockMs = 5_000;
    advertise?.(null, anAdvertisement('bbbb'));
    let devices = scanner.getState().status === 'scanning'
      ? (scanner.getState() as { devices: { id: string }[] }).devices
      : [];
    expect(devices.map((d) => d.id)).toEqual(['aaaa', 'bbbb']);

    // 11 s after 'aaaa' was last heard, 6 s after 'bbbb'.
    clockMs = 11_000;
    advertise?.(null, anAdvertisement('bbbb'));
    devices = scanner.getState().status === 'scanning'
      ? (scanner.getState() as { devices: { id: string }[] }).devices
      : [];
    expect(devices.map((d) => d.id)).toEqual(['bbbb']);

    scanner.dispose();
  });

  test('firstSeenAtMs is carried from the original sighting, not reset on every re-advertisement', () => {
    const double = fakeScanner();
    const scanner = createDeviceScanner({
      scanner: double,
      now: () => clockMs,
      scanTimeoutMs: 60_000,
      deviceStaleAfterMs: 60_000,
    });

    scanner.start();
    advertise?.(null, anAdvertisement('aaaa'));

    clockMs = 5_000;
    advertise?.(null, anAdvertisement('aaaa'));

    const state = scanner.getState();
    const devices = state.status === 'scanning' ? state.devices : [];
    expect(devices).toHaveLength(1);
    expect(devices[0].firstSeenAtMs).toBe(0);
    expect(devices[0].lastSeenAtMs).toBe(5_000);

    scanner.dispose();
  });

  test('stop() clears the timeout — a stopped scan never becomes noDevicesFound', () => {
    const double = fakeScanner();
    const scanner = createDeviceScanner({
      scanner: double,
      now: () => clockMs,
      scanTimeoutMs: 15_000,
    });

    scanner.start();
    scanner.stop();
    jest.advanceTimersByTime(60_000);

    expect(scanner.getState().status).toBe('stopped');

    scanner.dispose();
  });

  test('dispose() clears the timeout and releases the adapter subscription', () => {
    const removed = jest.fn();
    const double: BleScannerLike = {
      async state() {
        return BleAdapterState.POWERED_ON;
      },
      onStateChange(listener, emitCurrentState) {
        if (emitCurrentState) {
          listener(BleAdapterState.POWERED_ON);
        }
        return { remove: removed };
      },
      startDeviceScan(_uuids, _options, listener) {
        advertise = listener;
      },
      stopDeviceScan() {
        advertise = null;
      },
    };
    const scanner = createDeviceScanner({ scanner: double, now: () => clockMs });

    scanner.start();
    scanner.dispose();
    jest.advanceTimersByTime(60_000);

    expect(removed).toHaveBeenCalledTimes(1);
    expect(scanner.getState().status).toBe('scanning'); // unchanged by the dead timer
  });

  test('start() after stop() scans again', () => {
    const double = fakeScanner();
    const scanner = createDeviceScanner({ scanner: double, now: () => clockMs });

    scanner.start();
    scanner.stop();
    expect(double.stopped).toBe(true);

    scanner.start();
    return Promise.resolve().then(() => {
      expect(double.stopped).toBe(false);
      expect(scanner.getState().status).toBe('scanning');
      scanner.dispose();
    });
  });
});
