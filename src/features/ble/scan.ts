/**
 * §4.1 device discovery: scan for peripherals advertising our service UUID,
 * de-duplicate them, and report a live list to the caller.
 *
 * Same conventions as the rest of this module: the BLE dependency is injected
 * (never `react-native-ble-plx` or a mock by name), the scan is bounded by an
 * explicit timeout rather than running forever, and nothing throws across the
 * public boundary — a scan failure arrives on `onError`, not as a rejection.
 *
 * What this module does NOT do: connect, bond, or read anything. Discovery
 * ends at "here are the devices in range"; `connection.ts` owns what happens
 * next. Keeping the two apart is what lets a pairing screen show a list and a
 * connection screen own the link, without either knowing the other's state.
 */

import {
  type BleScannerLike,
  type ScannedDevice,
} from './BleClientContext';
import { BLE_SERVICE_UUID } from './protocol';

// App-level operational choices, not §4 constants — §4.1 specifies what a
// device advertises, never how long a central should listen for it. Same
// reasoning as auth.ts:29-38 for its timeouts.
const SCAN_TIMEOUT_MS = 15_000;

export type ScanEndReason = 'timeout' | 'stopped';

export interface ScanCallbacks {
  /** Fires on every change to the de-duplicated result set, newest RSSI wins. */
  onUpdate(devices: ScannedDevice[]): void;
  /** Fires once, when the scan stops — whether by timeout or by `stop()`. */
  onFinished?(reason: ScanEndReason): void;
  /**
   * A scan-level failure (adapter off, permission denied, native error).
   * `detail` carries the transport message only — there is no key material in
   * this module, but the same discipline as `auth.ts` applies regardless.
   */
  onError?(detail: string): void;
}

export interface ScanHandle {
  /** Idempotent: safe to call after a timeout has already ended the scan. */
  stop(): void;
}

export interface DeviceScanner {
  start(callbacks: ScanCallbacks, options?: { timeoutMs?: number }): ScanHandle;
}

export function createDeviceScanner(scanner: BleScannerLike): DeviceScanner {
  return {
    start(callbacks: ScanCallbacks, options: { timeoutMs?: number } = {}): ScanHandle {
      const timeoutMs = options.timeoutMs ?? SCAN_TIMEOUT_MS;

      // Insertion-ordered, so the list a user sees doesn't reshuffle itself
      // as RSSI updates arrive — a device that jumps rows mid-tap is how you
      // connect to the wrong one.
      const found = new Map<string, ScannedDevice>();
      let finished = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      const finish = (reason: ScanEndReason): void => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(timeoutHandle);
        // Stopping the radio scan is what actually costs battery if skipped,
        // so it happens before any callback that could throw.
        scanner.stopDeviceScan();
        callbacks.onFinished?.(reason);
      };

      timeoutHandle = setTimeout(() => finish('timeout'), timeoutMs);

      // §4.1 — filter on the service UUID rather than scanning everything and
      // matching names client-side: the OS filters in the radio layer, and a
      // name-based filter would both miss devices whose name is truncated out
      // of the advertisement and match anything that borrowed the prefix.
      scanner.startDeviceScan([BLE_SERVICE_UUID], null, (error, device) => {
        if (finished) {
          return;
        }
        if (error) {
          callbacks.onError?.(error.message);
          finish('stopped');
          return;
        }
        if (!device) {
          return;
        }

        const existing = found.get(device.id);
        // A peripheral is re-reported on every advertising interval. Only
        // surface an update when something a caller can see actually changed,
        // otherwise this re-renders a list several times a second for nothing.
        if (existing && existing.rssi === device.rssi && existing.name === device.name) {
          return;
        }
        found.set(device.id, { id: device.id, name: device.name, rssi: device.rssi });
        callbacks.onUpdate([...found.values()]);
      });

      return {
        stop() {
          finish('stopped');
        },
      };
    },
  };
}
