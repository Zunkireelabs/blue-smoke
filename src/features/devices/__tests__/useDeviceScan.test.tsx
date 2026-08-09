/**
 * P1-3.0 — the scan hook underneath DV-3/DV-4/DV-5. Covers the things a screenshot can't show:
 * the scan is filtered on `BLE_SERVICE_UUID`, `stopDeviceScan` fires on unmount and on timeout,
 * and the 20s timeout only flips to `noDevicesFound` when nothing was found by then.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BleClientProvider, type BleDeviceLike, type BleManagerLike } from '@/features/ble/BleClientContext';
import { BLE_SERVICE_UUID } from '@/features/ble/protocol';
import { SCAN_TIMEOUT_MS, useDeviceScan, type DeviceScanState } from '../useDeviceScan';

function fakeDevice(id: string, overrides: Partial<BleDeviceLike> = {}): BleDeviceLike {
  return {
    id,
    rssi: -60,
    name: `BlueSmoke-${id}`,
    discoverAllServicesAndCharacteristics: async () => {
      throw new Error('not used by this test');
    },
    readCharacteristicForService: async () => {
      throw new Error('not used by this test');
    },
    writeCharacteristicWithResponseForService: async () => {
      throw new Error('not used by this test');
    },
    monitorCharacteristicForService: () => ({ remove: () => {} }),
    ...overrides,
  };
}

interface FakeManager {
  manager: BleManagerLike;
  scanCalls: Array<{ serviceUUIDs: string[] | null }>;
  stopCalls: number;
  emit: (device: BleDeviceLike | null, error?: Error | null) => void;
}

function createFakeManager(): FakeManager {
  const scanCalls: Array<{ serviceUUIDs: string[] | null }> = [];
  let stopCalls = 0;
  let listener: ((error: Error | null, device: BleDeviceLike | null) => void) | undefined;

  const manager: BleManagerLike = {
    state: async () => 'PoweredOn',
    startDeviceScan: (serviceUUIDs, _options, cb) => {
      scanCalls.push({ serviceUUIDs });
      listener = cb;
    },
    stopDeviceScan: () => {
      stopCalls += 1;
    },
    connectToDevice: async () => {
      throw new Error('not used by this test');
    },
    isDeviceConnected: async () => false,
    cancelDeviceConnection: async () => {
      throw new Error('not used by this test');
    },
  };

  return {
    manager,
    scanCalls,
    get stopCalls() {
      return stopCalls;
    },
    emit: (device, error = null) => listener?.(error, device),
  };
}

function Harness({ onState }: { onState: (s: DeviceScanState) => void }) {
  onState(useDeviceScan());
  return null;
}

function renderHook(manager: BleManagerLike) {
  let latest!: DeviceScanState;
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <BleClientProvider manager={manager}>
        <Harness onState={(s) => (latest = s)} />
      </BleClientProvider>,
    );
  });
  return { renderer, getState: () => latest };
}

describe('useDeviceScan', () => {
  // Fake timers throughout: `useDeviceScan` always schedules a real 20s `setTimeout` for the
  // scan window, and a test that neither advances nor unmounts would otherwise leave it
  // dangling — exactly the "worker process failed to exit gracefully" class of leak.
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('filters the scan on BLE_SERVICE_UUID — §4.1 requires the app not present arbitrary peripherals', () => {
    const fake = createFakeManager();
    renderHook(fake.manager);
    expect(fake.scanCalls).toEqual([{ serviceUUIDs: [BLE_SERVICE_UUID] }]);
  });

  it('adds discovered devices as they arrive, deduped by id', () => {
    const fake = createFakeManager();
    const { getState } = renderHook(fake.manager);

    act(() => {
      fake.emit(fakeDevice('a', { rssi: -55 }));
    });
    expect(getState().devices).toEqual([{ id: 'a', name: 'BlueSmoke-a', rssi: -55 }]);
    expect(getState().status).toBe('scanning');

    act(() => {
      fake.emit(fakeDevice('a', { rssi: -70 })); // a re-advertisement of the same device
      fake.emit(fakeDevice('b'));
    });
    expect(getState().devices.map((d) => d.id)).toEqual(['a', 'b']);
    // The first-seen entry wins — not overwritten by a later advertisement of the same id.
    expect(getState().devices[0].rssi).toBe(-55);
  });

  it('stops the scan on unmount — a running scan left behind is a battery bug', () => {
    const fake = createFakeManager();
    const { renderer } = renderHook(fake.manager);
    // `start()` defensively stops any prior scan before starting its own, so mount alone
    // already accounts for one `stopDeviceScan` call — what this test cares about is unmount
    // producing at least one MORE, not the absolute count.
    const stopCallsAtMount = fake.stopCalls;

    act(() => {
      renderer.unmount();
    });
    expect(fake.stopCalls).toBeGreaterThan(stopCallsAtMount);
  });

  it('times out to noDevicesFound (DV-5) after SCAN_TIMEOUT_MS with zero results, and stops the radio', () => {
    const fake = createFakeManager();
    const { getState } = renderHook(fake.manager);

    act(() => {
      jest.advanceTimersByTime(SCAN_TIMEOUT_MS);
    });

    expect(getState().status).toBe('noDevicesFound');
    expect(getState().devices).toEqual([]);
    expect(fake.stopCalls).toBeGreaterThanOrEqual(1);
  });

  it('never flips to noDevicesFound at the timeout if a device was already found — no wait imposed on a successful scan', () => {
    const fake = createFakeManager();
    const { getState } = renderHook(fake.manager);

    act(() => {
      fake.emit(fakeDevice('found-early'));
    });

    act(() => {
      jest.advanceTimersByTime(SCAN_TIMEOUT_MS);
    });

    // Results are kept and DV-5's failure state is NOT shown — that is the property this test
    // exists to protect. It deliberately does NOT assert 'scanning': the earlier version did,
    // which froze in the defect below.
    expect(getState().status).not.toBe('noDevicesFound');
    expect(getState().devices).toHaveLength(1);
  });

  it('stops claiming to scan once the radio is off — the status ends at the timeout, with results', () => {
    // Regression: the timeout stopped the radio but left status on 'scanning' whenever anything
    // had been found, so DV-3 showed a spinner and "Looking for your device…" forever over a
    // dead scan. A user waiting on a second device would have waited indefinitely.
    const fake = createFakeManager();
    const { getState } = renderHook(fake.manager);

    act(() => {
      fake.emit(fakeDevice('found-early'));
    });
    expect(getState().status).toBe('scanning');

    act(() => {
      jest.advanceTimersByTime(SCAN_TIMEOUT_MS);
    });

    expect(getState().status).toBe('stopped');
    expect(getState().devices).toHaveLength(1);
    expect(fake.stopCalls).toBeGreaterThanOrEqual(1);
  });

  it('restart() re-arms from stopped too, not just from noDevicesFound', () => {
    const fake = createFakeManager();
    const { getState } = renderHook(fake.manager);

    act(() => {
      fake.emit(fakeDevice('found-early'));
    });
    act(() => {
      jest.advanceTimersByTime(SCAN_TIMEOUT_MS);
    });
    expect(getState().status).toBe('stopped');

    act(() => {
      getState().restart();
    });

    expect(getState().status).toBe('scanning');
    expect(getState().devices).toEqual([]);
  });

  it('restart() re-arms a fresh scan from noDevicesFound — DV-5\'s "Scan again"', () => {
    const fake = createFakeManager();
    const { getState } = renderHook(fake.manager);

    act(() => {
      jest.advanceTimersByTime(SCAN_TIMEOUT_MS);
    });
    expect(getState().status).toBe('noDevicesFound');

    act(() => {
      getState().restart();
    });
    expect(getState().status).toBe('scanning');
    expect(getState().devices).toEqual([]);
    expect(fake.scanCalls.length).toBeGreaterThanOrEqual(2);

    act(() => {
      fake.emit(fakeDevice('after-restart'));
    });
    expect(getState().devices.map((d) => d.id)).toEqual(['after-restart']);
  });

  it('ignores a null device from the scan listener rather than crashing', () => {
    const fake = createFakeManager();
    const { getState } = renderHook(fake.manager);

    act(() => {
      fake.emit(null, new Error('transient scan error'));
    });

    expect(getState().devices).toEqual([]);
    expect(getState().status).toBe('scanning');
  });
});
