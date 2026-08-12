/**
 * §4.1 discovery tests. Driven through hand-rolled `BleScannerLike` fakes
 * rather than the Node mock's `MockBleManager`: that mock emits its single
 * peripheral once, synchronously, which cannot express the cases this module
 * exists to handle — repeat advertisements, RSSI drift, a mid-scan error, or
 * a timeout. The mock stays the target for the byte-level modules.
 */

import { createDeviceScanner, YP65_DISCOVERY } from '../scan';
import { BLE_SERVICE_UUID } from '../protocol';
import type { BleScannerLike, ScannedDevice } from '../BleClientContext';

type Emit = (error: Error | null, device: ScannedDevice | null) => void;

function createFakeScanner(): {
  scanner: BleScannerLike;
  emit: Emit;
  requestedUuids: () => string[] | null;
  stopCount: () => number;
} {
  let listener: Emit | undefined;
  let requested: string[] | null = null;
  let stops = 0;

  return {
    scanner: {
      startDeviceScan(serviceUUIDs, _options, incoming) {
        requested = serviceUUIDs;
        listener = incoming;
      },
      stopDeviceScan() {
        stops += 1;
      },
    },
    emit: (error, device) => listener?.(error, device),
    requestedUuids: () => requested,
    stopCount: () => stops,
  };
}

const deviceA: ScannedDevice = { id: 'dev-a', name: 'BlueSmoke-A1B2', rssi: -50 };
const deviceB: ScannedDevice = { id: 'dev-b', name: 'BlueSmoke-C3D4', rssi: -70 };

describe('createDeviceScanner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('filters the scan on the §4.1 service UUID', () => {
    const fake = createFakeScanner();
    createDeviceScanner(fake.scanner).start({ onUpdate: () => {} });

    expect(fake.requestedUuids()).toEqual([BLE_SERVICE_UUID]);
  });

  it('reports each discovered device, in discovery order', () => {
    const fake = createFakeScanner();
    const updates: ScannedDevice[][] = [];
    createDeviceScanner(fake.scanner).start({ onUpdate: (devices) => updates.push(devices) });

    fake.emit(null, deviceA);
    fake.emit(null, deviceB);

    expect(updates).toHaveLength(2);
    expect(updates[1].map((device) => device.id)).toEqual(['dev-a', 'dev-b']);
  });

  it('de-duplicates repeat advertisements from the same device', () => {
    const fake = createFakeScanner();
    const updates: ScannedDevice[][] = [];
    createDeviceScanner(fake.scanner).start({ onUpdate: (devices) => updates.push(devices) });

    fake.emit(null, deviceA);
    fake.emit(null, deviceA);
    fake.emit(null, deviceA);

    // One entry, and — the point of the check — no re-render per advertisement.
    expect(updates).toHaveLength(1);
    expect(updates[0]).toHaveLength(1);
  });

  it('updates in place when a known device reports a new RSSI', () => {
    const fake = createFakeScanner();
    const updates: ScannedDevice[][] = [];
    createDeviceScanner(fake.scanner).start({ onUpdate: (devices) => updates.push(devices) });

    fake.emit(null, deviceA);
    fake.emit(null, { ...deviceA, rssi: -42 });

    expect(updates).toHaveLength(2);
    expect(updates[1]).toHaveLength(1);
    expect(updates[1][0].rssi).toBe(-42);
  });

  it('stops itself and reports "timeout" once the budget elapses', () => {
    const fake = createFakeScanner();
    const finished: string[] = [];
    createDeviceScanner(fake.scanner).start(
      { onUpdate: () => {}, onFinished: (reason) => finished.push(reason) },
      { timeoutMs: 5000 },
    );

    jest.advanceTimersByTime(5000);

    expect(finished).toEqual(['timeout']);
    expect(fake.stopCount()).toBe(1);
  });

  it('ignores devices that arrive after the scan has ended', () => {
    const fake = createFakeScanner();
    const updates: ScannedDevice[][] = [];
    createDeviceScanner(fake.scanner).start({ onUpdate: (devices) => updates.push(devices) }, { timeoutMs: 1000 });

    jest.advanceTimersByTime(1000);
    fake.emit(null, deviceA);

    expect(updates).toHaveLength(0);
  });

  it('stop() ends the scan, and is idempotent', () => {
    const fake = createFakeScanner();
    const finished: string[] = [];
    const handle = createDeviceScanner(fake.scanner).start({
      onUpdate: () => {},
      onFinished: (reason) => finished.push(reason),
    });

    handle.stop();
    handle.stop();

    expect(finished).toEqual(['stopped']);
    expect(fake.stopCount()).toBe(1);
  });

  it('surfaces a scan error and ends the scan rather than leaving the radio running', () => {
    const fake = createFakeScanner();
    const errors: string[] = [];
    const finished: string[] = [];
    createDeviceScanner(fake.scanner).start({
      onUpdate: () => {},
      onError: (detail) => errors.push(detail),
      onFinished: (reason) => finished.push(reason),
    });

    fake.emit(new Error('bluetooth adapter is off'), null);

    expect(errors).toEqual(['bluetooth adapter is off']);
    expect(finished).toEqual(['stopped']);
    expect(fake.stopCount()).toBe(1);
  });

  it('does not fire the timeout after an explicit stop', () => {
    const fake = createFakeScanner();
    const finished: string[] = [];
    const handle = createDeviceScanner(fake.scanner).start(
      { onUpdate: () => {}, onFinished: (reason) => finished.push(reason) },
      { timeoutMs: 3000 },
    );

    handle.stop();
    jest.advanceTimersByTime(3000);

    expect(finished).toEqual(['stopped']);
  });
});

/**
 * The YP65 module does not advertise the service it serves — its advertising
 * payload carries 0x1812 (HID) and nothing else useful. These tests pin the
 * consequence: discovery must not depend on the service UUID being on air.
 *
 * This is the failure that has already cost this project two bench sessions,
 * and it is invisible when it happens — a filtered scan that matches nothing
 * looks exactly like a device that is off, out of range, or asleep. Catching
 * it here is the cheap version.
 */
describe('createDeviceScanner — YP65_DISCOVERY against real-hardware advertising', () => {
  function scannerSpy() {
    let seen: { serviceUUIDs: string[] | null } | undefined;
    let emit: (error: Error | null, device: ScannedDevice | null) => void = () => {};
    const scanner: BleScannerLike = {
      startDeviceScan(serviceUUIDs, _options, listener) {
        seen = { serviceUUIDs };
        emit = listener;
      },
      stopDeviceScan() {},
    };
    return {
      scanner,
      get filter() {
        return seen;
      },
      emit: (device: ScannedDevice | null) => emit(null, device),
    };
  }

  const yp65: ScannedDevice = { id: 'aa:bb', name: 'YP65-AT2A079820286 6', rssi: -44 };

  test('scans UNFILTERED — a service filter would match nothing on this hardware', () => {
    const spy = scannerSpy();
    const handle = createDeviceScanner(spy.scanner, YP65_DISCOVERY).start({ onUpdate: () => {} });
    handle.stop();

    expect(spy.filter?.serviceUUIDs).toBeNull();
  });

  test('finds a device that advertises no service UUID at all, by name prefix', () => {
    const spy = scannerSpy();
    const found: ScannedDevice[][] = [];
    const handle = createDeviceScanner(spy.scanner, YP65_DISCOVERY).start({
      onUpdate: (devices) => found.push(devices),
    });

    spy.emit(yp65);
    handle.stop();

    expect(found.at(-1)).toEqual([yp65]);
  });

  test('ignores the unrelated traffic an unfiltered scan necessarily picks up', () => {
    const spy = scannerSpy();
    const found: ScannedDevice[][] = [];
    const handle = createDeviceScanner(spy.scanner, YP65_DISCOVERY).start({
      onUpdate: (devices) => found.push(devices),
    });

    // Taken from a real nRF Connect capture during bring-up: a laptop, a
    // Windows advertising beacon, an air conditioner, and nameless peripherals.
    spy.emit({ id: '01', name: "Sadin's MacBook Pro", rssi: -72 });
    spy.emit({ id: '02', name: 'DESKTOP-J2R9SMK', rssi: -95 });
    spy.emit({ id: '03', name: null, rssi: -64 });
    spy.emit({ id: '04', name: 'net', rssi: -88 });
    handle.stop();

    expect(found).toHaveLength(0);
  });

  test('the §4 profile is unchanged and still filters in the radio layer', () => {
    const spy = scannerSpy();
    const handle = createDeviceScanner(spy.scanner).start({ onUpdate: () => {} });
    handle.stop();

    expect(spy.filter?.serviceUUIDs).toEqual([BLE_SERVICE_UUID]);
  });
});
