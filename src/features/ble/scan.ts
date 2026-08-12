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
import { BLE_SERVICE_UUID, YP65_LOCAL_NAME_PREFIX, YP65_SERVICE_UUID } from './protocol';

/**
 * How to recognise "one of our devices" during a scan.
 *
 * This exists because the two things we scan for advertise differently, and
 * the difference is not cosmetic — it decides whether a filter finds anything
 * at all.
 *
 * §4 assumed a device that advertises the service it serves, so the radio can
 * filter and the app never sees anything else. The real YP65 module does not:
 * its advertising payload carries 0x1812 (HID) and the passthrough service
 * 0xFFF0 appears nowhere in it (see `YP65_ADVERTISED_SERVICE_UUID`). Filtering
 * on the service we actually want therefore matches nothing, and "no devices
 * found" is indistinguishable from off, out of range, or asleep.
 *
 * So a profile carries both halves: what the radio filters on (cheap, but only
 * usable when the device advertises it) and an optional client-side predicate
 * for when it doesn't.
 */
export interface DiscoveryProfile {
  /** Handed to the radio's own filter. `null` scans everything in range. */
  readonly serviceUUIDs: string[] | null;
  /**
   * Applied to every result the radio returns. Only meaningful when
   * `serviceUUIDs` is null — otherwise the radio has already filtered.
   */
  readonly matches?: (device: ScannedDevice) => boolean;
  /** For logs and dev UI, so a fruitless scan can say what it was looking for. */
  readonly label: string;
}

/**
 * §4.1 — filter in the radio layer. Correct for `tools/mock-peripheral`, which
 * implements §4 and does advertise its service.
 */
export const SPEC_V4_DISCOVERY: DiscoveryProfile = {
  serviceUUIDs: [BLE_SERVICE_UUID],
  label: 'spec §4 service UUID',
};

/**
 * Real hardware. Scans unfiltered and matches on the local name, because the
 * module does not advertise `YP65_SERVICE_UUID`.
 *
 * The name is a PREFIX test: the manufacturer appends the MAC to distinguish
 * units ("YP65-AT" + MAC), so equality would match nothing. The name rides in
 * the scan response rather than the advertisement, which is fine — both
 * CoreBluetooth and Android scan actively by default.
 *
 * ⚠️ This costs us the iOS background-scan path, which requires a service
 * filter. Fixing that properly needs HQD to add 0xFFF0 to the advertising
 * payload via `AT+ADVDA`; until then, background proximity on iOS cannot work.
 * Tracked as a client ask, not something the app can solve.
 */
export const YP65_DISCOVERY: DiscoveryProfile = {
  serviceUUIDs: null,
  matches: (device) => (device.name ?? '').startsWith(YP65_LOCAL_NAME_PREFIX),
  label: `local name "${YP65_LOCAL_NAME_PREFIX}…" (service ${YP65_SERVICE_UUID} is not advertised)`,
};

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

/**
 * `profile` defaults to §4 so every existing caller and test keeps its exact
 * previous behaviour. Real-hardware callers pass `YP65_DISCOVERY`.
 */
export function createDeviceScanner(
  scanner: BleScannerLike,
  profile: DiscoveryProfile = SPEC_V4_DISCOVERY,
): DeviceScanner {
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

      // Filtering in the radio layer is preferred where the device allows it —
      // the OS does the work and the app never sees anything else. Where it
      // doesn't (see DiscoveryProfile), we scan wide and filter here instead.
      scanner.startDeviceScan(profile.serviceUUIDs, null, (error, device) => {
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

        // Normalise before matching or storing. A real `BleManager` leaves
        // `name`/`rssi` undefined when the advertisement carried neither,
        // while every consumer downstream expects null — collapsing the two
        // here is what keeps `undefined` out of the rendered list.
        const scanned: ScannedDevice = {
          id: device.id,
          name: device.name ?? null,
          rssi: device.rssi ?? null,
        };

        if (profile.matches && !profile.matches(scanned)) {
          return;
        }

        const existing = found.get(scanned.id);
        // A peripheral is re-reported on every advertising interval. Only
        // surface an update when something a caller can see actually changed,
        // otherwise this re-renders a list several times a second for nothing.
        if (existing && existing.rssi === scanned.rssi && existing.name === scanned.name) {
          return;
        }
        found.set(scanned.id, scanned);
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
