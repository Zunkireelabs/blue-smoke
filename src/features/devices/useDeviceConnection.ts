import { useCallback, useRef } from 'react';
import { useBleManager, type BleDeviceLike } from '@/features/ble/BleClientContext';
import { readLockState, monitorLockState, type LockStateSubscription } from '@/features/ble/lockState';
import {
  applyLockSnapshot,
  canConnectAnotherDevice,
  setDeviceConnectionStatus,
} from '@/app/stores/useDeviceStore';

export type ConnectResult =
  | { ok: true }
  | { ok: false; reason: 'connection-limit' }
  | { ok: false; reason: 'transport'; detail: string };

interface ActiveConnection {
  device: BleDeviceLike;
  subscription: LockStateSubscription;
}

/**
 * P1-5.0 — per-device connect/disconnect, driving `useDeviceStore`'s `connectionStatus` and
 * `lock` fields. Status polling is notify-driven (spec §9.3): one `readLockState()` for an
 * immediate value, then `monitorLockState()` for every change after — never a re-poll timer.
 *
 * Holds live `BleDeviceLike` handles + subscriptions in a ref, not the store: those aren't
 * serializable UI state, and `BleClientContext`'s own doc explains why re-`connectToDevice()`ing
 * to fetch a handle back would force a disconnect+reconnect on Android. One hook instance owns
 * this map for as long as its host component is mounted — see the module doc on multi-instance
 * use before rendering this from more than one place at once.
 */
export function useDeviceConnection() {
  const manager = useBleManager();
  const activeRef = useRef<Map<string, ActiveConnection>>(new Map());

  const disconnect = useCallback(
    async (deviceId: string): Promise<void> => {
      const active = activeRef.current.get(deviceId);
      if (active) {
        active.subscription.remove();
        activeRef.current.delete(deviceId);
      }
      setDeviceConnectionStatus(deviceId, 'disconnected');
      try {
        await manager.cancelDeviceConnection(deviceId);
      } catch {
        // Already gone (radio drop, OS-level teardown) — not a failure this flow surfaces.
      }
    },
    [manager],
  );

  const connect = useCallback(
    async (deviceId: string): Promise<ConnectResult> => {
      if (!canConnectAnotherDevice()) {
        return { ok: false, reason: 'connection-limit' };
      }
      setDeviceConnectionStatus(deviceId, 'connecting');

      try {
        const device = await manager.connectToDevice(deviceId);
        await device.discoverAllServicesAndCharacteristics();

        const initialRead = await readLockState(device);
        if (initialRead.ok) {
          applyLockSnapshot(deviceId, {
            state: initialRead.info.state,
            batteryPercent: initialRead.info.batteryPercent,
            lowBattery: initialRead.info.lowBattery,
            updatedAt: Date.now(),
          });
        }
        // A failed initial read is not fatal — §4.4 notifies on every state change, so a
        // connected device with no snapshot yet still self-corrects on the next real change.
        // The list's staleness indicator (spec §9.3) is what tells the user nothing has
        // arrived, not a connect-time failure.

        const subscription = monitorLockState(
          device,
          (info) => {
            applyLockSnapshot(deviceId, {
              state: info.state,
              batteryPercent: info.batteryPercent,
              lowBattery: info.lowBattery,
              updatedAt: Date.now(),
            });
          },
          () => {
            // A malformed notification is not a disconnect. The last-known-good snapshot stays
            // on screen; its staleness indicator is the honest signal, not a dropped connection.
          },
        );

        activeRef.current.set(deviceId, { device, subscription });
        setDeviceConnectionStatus(deviceId, 'connected');
        return { ok: true };
      } catch (error) {
        setDeviceConnectionStatus(deviceId, 'error');
        return {
          ok: false,
          reason: 'transport',
          detail: error instanceof Error ? error.message : 'unknown error',
        };
      }
    },
    [manager],
  );

  return { connect, disconnect };
}
