import { useCallback, useEffect, useRef, useState } from 'react';
import { useBleManager } from '@/features/ble/BleClientContext';
import { BLE_SERVICE_UUID } from '@/features/ble/protocol';

/**
 * F7.4 (`USER_FLOWS.md`) — "the empty-after-N-seconds state" never gives N; it isn't in the
 * spec or `protocol.ts` either, because it's a UX decision, not a §4 value. Fixed here rather
 * than in `protocol.ts`, which is for spec constants only.
 *
 * UX decision (Sadin, 2026-08-09): 20 seconds, not 10. DV-3's actual job (F7.3) is telling a
 * first-time user what to do PHYSICALLY to make the device discoverable — pick it up, wake it.
 * Ten seconds can expire before they've finished acting on the instruction, producing a
 * "no devices found" that is really "you read too slowly": the worst kind of false negative,
 * because DV-5's coaching then sends them to check things that were never wrong.
 */
export const SCAN_TIMEOUT_MS = 20_000;

export interface ScannedDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export type DeviceScanStatus = 'scanning' | 'noDevicesFound';

export interface DeviceScanState {
  status: DeviceScanStatus;
  devices: ScannedDevice[];
  /** Re-arms the scan from a clean slate — DV-5's "Scan again". */
  restart: () => void;
}

/**
 * Owns one scan session end to end: filters on `BLE_SERVICE_UUID` (§4.1 — the app must not
 * present arbitrary peripherals), dedupes by device id as results arrive, and always calls
 * `stopDeviceScan()` — on unmount, and when the timeout fires — so a scan never keeps running
 * as an invisible battery drain.
 *
 * DV-3 stays responsive throughout (`USER_FLOWS.md` F7.4): a device found at second 2 is in
 * `devices` at second 2, immediately selectable. The 20s timeout only flips `status` to
 * `noDevicesFound` when nothing was found by then — reaching it with results already in hand
 * just stops the radio quietly; the results stay exactly as they are.
 */
export function useDeviceScan(): DeviceScanState {
  const manager = useBleManager();
  const [status, setStatus] = useState<DeviceScanStatus>('scanning');
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const devicesRef = useRef<ScannedDevice[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stop = useCallback(() => {
    manager.stopDeviceScan();
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, [manager]);

  const start = useCallback(() => {
    stop();
    devicesRef.current = [];
    setDevices([]);
    setStatus('scanning');

    manager.startDeviceScan([BLE_SERVICE_UUID], null, (_error, device) => {
      // A transient scan error is not one of this phase's five screens to distinguish — the
      // 20s timeout still resolves the honest outcome (results found, or DV-5) either way.
      if (!device) {
        return;
      }
      if (devicesRef.current.some((known) => known.id === device.id)) {
        return;
      }
      devicesRef.current = [
        ...devicesRef.current,
        { id: device.id, name: device.name ?? null, rssi: device.rssi ?? null },
      ];
      setDevices(devicesRef.current);
    });

    timeoutRef.current = setTimeout(() => {
      manager.stopDeviceScan();
      if (devicesRef.current.length === 0) {
        setStatus('noDevicesFound');
      }
    }, SCAN_TIMEOUT_MS);
  }, [manager, stop]);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  return { status, devices, restart: start };
}
