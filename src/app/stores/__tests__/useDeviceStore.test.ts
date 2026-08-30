import {
  useDeviceStore,
  addPairedDevice,
  removePairedDevice,
  setDeviceConnectionStatus,
  applyLockSnapshot,
  renameDevice,
  canConnectAnotherDevice,
  MAX_CONCURRENT_CONNECTIONS,
  __resetDeviceStoreForTests,
} from '../useDeviceStore';
import { LockState } from '@/features/ble/protocol';

describe('useDeviceStore', () => {
  beforeEach(() => {
    __resetDeviceStoreForTests();
  });

  it('adds a device disconnected, with no lock snapshot and nothing pending sync', () => {
    addPairedDevice('mock-device-0001', 'Kitchen BlueSmoke');

    expect(useDeviceStore.getState().devices['mock-device-0001']).toEqual({
      id: 'mock-device-0001',
      nickname: 'Kitchen BlueSmoke',
      connectionStatus: 'disconnected',
      lock: null,
      nicknamePendingSync: false,
    });
  });

  it('removePairedDevice drops exactly that device, leaving the rest untouched', () => {
    addPairedDevice('mock-device-0001', 'A');
    addPairedDevice('mock-device-0002', 'B');

    removePairedDevice('mock-device-0001');

    const devices = useDeviceStore.getState().devices;
    expect(devices['mock-device-0001']).toBeUndefined();
    expect(devices['mock-device-0002']).toBeDefined();
  });

  it('setDeviceConnectionStatus is a no-op for an unknown device id (never crashes on a stale callback)', () => {
    expect(() => setDeviceConnectionStatus('never-added', 'connected')).not.toThrow();
    expect(useDeviceStore.getState().devices['never-added']).toBeUndefined();
  });

  it('applyLockSnapshot replaces the whole snapshot, and only for the targeted device', () => {
    addPairedDevice('mock-device-0001', 'A');
    addPairedDevice('mock-device-0002', 'B');

    applyLockSnapshot('mock-device-0001', {
      state: LockState.UNLOCKED,
      batteryPercent: 55,
      lowBattery: false,
      updatedAt: 1000,
    });

    expect(useDeviceStore.getState().devices['mock-device-0001'].lock).toEqual({
      state: LockState.UNLOCKED,
      batteryPercent: 55,
      lowBattery: false,
      updatedAt: 1000,
    });
    expect(useDeviceStore.getState().devices['mock-device-0002'].lock).toBeNull();
  });

  it('renameDevice updates the local nickname and marks it pending sync', () => {
    addPairedDevice('mock-device-0001', 'Old name');

    renameDevice('mock-device-0001', 'New name');

    expect(useDeviceStore.getState().devices['mock-device-0001']).toMatchObject({
      nickname: 'New name',
      nicknamePendingSync: true,
    });
  });

  it('canConnectAnotherDevice allows connections up to the limit and refuses beyond it', () => {
    for (let i = 0; i < MAX_CONCURRENT_CONNECTIONS; i += 1) {
      addPairedDevice(`mock-device-${i}`, `Device ${i}`);
      setDeviceConnectionStatus(`mock-device-${i}`, 'connected');
    }
    expect(canConnectAnotherDevice()).toBe(false);

    setDeviceConnectionStatus('mock-device-0', 'disconnected');
    expect(canConnectAnotherDevice()).toBe(true);
  });

  it('counts connecting the same as connected against the limit', () => {
    for (let i = 0; i < MAX_CONCURRENT_CONNECTIONS; i += 1) {
      addPairedDevice(`mock-device-${i}`, `Device ${i}`);
      setDeviceConnectionStatus(`mock-device-${i}`, 'connecting');
    }
    expect(canConnectAnotherDevice()).toBe(false);
  });
});
