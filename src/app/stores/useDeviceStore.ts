import { create } from 'zustand';
import type { LockState } from '@/features/ble/protocol';

export type DeviceConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * P1-5.0 — spec §9.3: "Lock state shown in the UI is only ever the last received `lockState`
 * notification, with a staleness indicator." `updatedAt` is the wall-clock time that snapshot
 * arrived; the UI derives staleness by comparing it to "now", not by storing a boolean here —
 * "stale" has no fixed threshold in the spec, so that comparison belongs at render time, not in
 * this store.
 */
export interface PairedDeviceLockSnapshot {
  state: LockState;
  batteryPercent: number | null;
  lowBattery: boolean;
  updatedAt: number;
}

export interface PairedDevice {
  id: string;
  nickname: string;
  connectionStatus: DeviceConnectionStatus;
  /** `null` until the first read or notification lands — never a fabricated default. */
  lock: PairedDeviceLockSnapshot | null;
  /**
   * Set by `renameDevice()`. `device_ownership.nickname` is the backend column (spec §5.2), but
   * no client anywhere calls Supabase for it yet — P1-6.0 (device↔account sync) is unbuilt, and
   * P1-4.0's session/bonding path it would ride on is blocked on OQ-12. Renaming here only ever
   * updates the local copy; this flag is the honest record of that gap, not a queued-retry flag
   * (there's nothing yet to retry against).
   */
  nicknamePendingSync: boolean;
}

interface DeviceStoreState {
  devices: Record<string, PairedDevice>;
}

/**
 * Not a §4/§5 spec value — P1-5.0's TODO asks for "multi-device connection policy defined: how
 * many concurrent connections, and what happens beyond it," and neither the spec nor
 * `protocol.ts` sets one. 3 concurrent GATT connections is comfortably inside what both iOS
 * CoreBluetooth and Android's stack support without contention (real-world central-role limits
 * run higher; this is a deliberately conservative product default, not a platform ceiling) and
 * matches the "up to a few devices" shape used elsewhere in this app's scan fixtures. "What
 * happens beyond it": `connectDevice()` below refuses with `'connection-limit'` rather than
 * queueing — a silent queue would leave a user who tapped "Connect" with no feedback at all.
 */
export const MAX_CONCURRENT_CONNECTIONS = 3;

export const useDeviceStore = create<DeviceStoreState>(() => ({
  devices: {},
}));

function countActiveConnections(devices: Record<string, PairedDevice>): number {
  return Object.values(devices).filter(
    (d) => d.connectionStatus === 'connected' || d.connectionStatus === 'connecting',
  ).length;
}

/** True if a new connection would stay within `MAX_CONCURRENT_CONNECTIONS`. */
export function canConnectAnotherDevice(): boolean {
  return countActiveConnections(useDeviceStore.getState().devices) < MAX_CONCURRENT_CONNECTIONS;
}

/** Adds a device the app already considers paired (dev-seeded today — P1-6.0 hydrates this for real). */
export function addPairedDevice(id: string, nickname: string): void {
  useDeviceStore.setState((s) => ({
    devices: {
      ...s.devices,
      [id]: { id, nickname, connectionStatus: 'disconnected', lock: null, nicknamePendingSync: false },
    },
  }));
}

/** Unpair's local half only — see `PairedDevice.nicknamePendingSync` doc for why the sync half can't exist yet. */
export function removePairedDevice(id: string): void {
  useDeviceStore.setState((s) => {
    if (!(id in s.devices)) return s;
    const devices = { ...s.devices };
    delete devices[id];
    return { devices };
  });
}

export function setDeviceConnectionStatus(id: string, status: DeviceConnectionStatus): void {
  useDeviceStore.setState((s) => {
    const device = s.devices[id];
    if (!device) return s;
    return { devices: { ...s.devices, [id]: { ...device, connectionStatus: status } } };
  });
}

export function applyLockSnapshot(id: string, snapshot: PairedDeviceLockSnapshot): void {
  useDeviceStore.setState((s) => {
    const device = s.devices[id];
    if (!device) return s;
    return { devices: { ...s.devices, [id]: { ...device, lock: snapshot } } };
  });
}

/** Local rename — see `PairedDevice.nicknamePendingSync` doc. */
export function renameDevice(id: string, nickname: string): void {
  useDeviceStore.setState((s) => {
    const device = s.devices[id];
    if (!device) return s;
    return { devices: { ...s.devices, [id]: { ...device, nickname, nicknamePendingSync: true } } };
  });
}

/** Test-only — mirrors `useOnboardingStore.ts`'s `__reset*ForTests` convention. */
export function __resetDeviceStoreForTests(): void {
  useDeviceStore.setState({ devices: {} });
}
