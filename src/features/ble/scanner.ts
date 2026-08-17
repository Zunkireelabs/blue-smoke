/**
 * §4.1 device scan and discovery — P1-3.0.
 *
 * Finds Blue Smoke devices by filtering advertisements on the service UUID,
 * parses the 4-byte manufacturer data for a pre-connect state hint, and
 * presents a de-duplicated, stably-ordered list.
 *
 * Same convention as `auth.ts` / `deviceInfo.ts`: **nothing across this
 * boundary throws.** Every failure arrives at the caller as a typed
 * `ScanState`, because a scan failure is a screen state, not an exception.
 *
 * **OQ-13 is resolved** (docs/hardware/manufacturer-supplied-2026-08-17/) —
 * but the answer is that the real H158/YP65-AT hardware does not implement
 * §4 at all: no FFF0 advertising, a different frame format, no
 * authentication. `BLE_SERVICE_UUID` below is still the §4 constant, correct
 * for that (currently unimplemented) protocol; the real device is scanned
 * for via the `filter.namePrefix` option (see `CreateDeviceScannerOptions`
 * and `../h158/h158Protocol.ts`), because a wrong or absent UUID **fails
 * silently** — no results, indistinguishable from no devices in range —
 * which is why `ScanState.noDevicesFound` carries `filteredOnServiceUuid`:
 * whatever renders it can say what was searched for rather than only that
 * nothing was found.
 */

import { base64ToBytes } from './base64';
import type { BleAdvertisementLike, BleScannerLike, BleSubscriptionLike } from './BleClientContext';
import { readUint8 } from './byteLayout';
import {
  ADVERTISING_MANUFACTURER_DATA_LENGTH_BYTES,
  ADVERTISING_MANUFACTURER_DATA_OFFSETS,
  BATTERY_PERCENT_UNKNOWN,
  BLE_SERVICE_UUID,
  PROTOCOL_VERSION,
} from './protocol';

// Not §4 constants — app-level operational choices, so they stay out of
// protocol.ts (same reasoning as auth.ts:29-38).
//
// 15 s: §4.1 advertises at 100 ms for 30 s after wake, then drops to 1 s. The
// budget has to clear the *slow* interval by enough that a single missed
// advertisement isn't a failed scan, so 15 slow-mode chances — while staying
// inside the 30 s fast window, so a user who presses the device button and
// then opens the app is scanning during fast advertising.
const SCAN_TIMEOUT_MS = 15_000;

// How long a device may go unheard before it drops off the list. Two slow-mode
// intervals plus margin: long enough not to flicker on one missed packet, short
// enough that a device switched off mid-scan does not linger and get tapped.
const DEVICE_STALE_AFTER_MS = 10_000;

/**
 * `react-native-ble-plx`'s `State` enum, as strings. Not §4 — this is the
 * library's/OS adapter's vocabulary. Handled **exhaustively and distinctly**
 * (CLAUDE.md: no generic catch-all), because these mean genuinely different
 * things to the user: `PoweredOff` is "turn Bluetooth on", `Unauthorized` is
 * "grant the permission in Settings", and `Unsupported` is unrecoverable.
 */
export const BleAdapterState = {
  UNKNOWN: 'Unknown',
  RESETTING: 'Resetting',
  UNSUPPORTED: 'Unsupported',
  UNAUTHORIZED: 'Unauthorized',
  POWERED_OFF: 'PoweredOff',
  POWERED_ON: 'PoweredOn',
} as const;
export type BleAdapterState = (typeof BleAdapterState)[keyof typeof BleAdapterState];

/** Why a scan cannot run. Each maps to a different user-facing recovery path. */
export type ScanBlockedReason =
  | 'bluetoothOff' // PoweredOff — prompt to enable
  | 'unauthorized' // Unauthorized — deep-link to Settings
  | 'unsupported' // Unsupported — no BLE radio; terminal
  | 'resetting' // Resetting — transient; the adapter is cycling
  | 'unknown'; // Unknown — not yet determined; treat as transient

/**
 * §4.1 manufacturer data: `[protocolVersion(1) | stateHint(1) | battery(1) | flags(1)]`.
 *
 * `stateHintRaw` and `flagsRaw` are deliberately **raw bytes**. §4.1 names both
 * fields and defines the value semantics of neither — it does not say that
 * `stateHint` uses §4.4's `LockState` encoding, and inventing that mapping is
 * exactly the guess CLAUDE.md forbids. Parsed and carried, not interpreted;
 * interpreting them is blocked pending the spec gap noted in the module docs.
 */
export interface ParsedAdvertisement {
  protocolVersion: number;
  /** `protocolVersion === PROTOCOL_VERSION`. A fact, not a policy — §4.3's precedent. */
  compatible: boolean;
  stateHintRaw: number;
  /** 0–100, or `null` when the byte is `0xFF` (unknown) or out of range. */
  batteryPercent: number | null;
  flagsRaw: number;
}

export interface DiscoveredDevice {
  id: string;
  name: string | null;
  /** Latest observed RSSI. Noisy by nature — see the ordering note on `ScanState`. */
  rssi: number | null;
  firstSeenAtMs: number;
  lastSeenAtMs: number;
  advertisementCount: number;
  /** `null` when the advertisement carried no manufacturer data, or malformed data. */
  advertisement: ParsedAdvertisement | null;
}

export type ScanState =
  | { status: 'idle' }
  | { status: 'blocked'; reason: ScanBlockedReason }
  | { status: 'scanning'; devices: DiscoveredDevice[] }
  | { status: 'noDevicesFound'; filteredOnServiceUuid: string }
  | { status: 'stopped'; devices: DiscoveredDevice[] }
  | { status: 'failed'; detail: string };

export interface DeviceScanner {
  /**
   * Idempotent: calling it while already scanning is a no-op rather than a
   * second radio scan. A user double-tapping "Scan" is the ordinary case.
   */
  start(): void;
  /** Idempotent, and safe to call from a screen-unmount cleanup. */
  stop(): void;
  /** Stops the scan and releases the adapter-state subscription. Not restartable. */
  dispose(): void;
  getState(): ScanState;
  subscribe(listener: (state: ScanState) => void): () => void;
}

/**
 * What the radio-level scan filters on. Defaults to the §4.1 service-UUID
 * filter — every existing caller and test keeps that behaviour unchanged.
 *
 * A `namePrefix` filter exists for devices that don't advertise their
 * service UUID at all — the H158/YP65-AT is one (see
 * `../h158/h158Protocol.ts`): it advertises its name in the scan response
 * only, never FFF0, so a UUID-filtered radio scan finds nothing, silently,
 * same failure mode as a wrong UUID. `serviceUuids: null` skips the
 * radio-level UUID filter entirely so `namePrefix` is the only filter
 * applied, in `onAdvertisement` below.
 */
export interface DeviceScanFilter {
  serviceUuids: string[] | null;
  namePrefix?: string;
}

export interface CreateDeviceScannerOptions {
  scanner: BleScannerLike;
  /** Injectable for tests; defaults to `Date.now`. */
  now?: () => number;
  scanTimeoutMs?: number;
  deviceStaleAfterMs?: number;
  /** Defaults to `{ serviceUuids: [BLE_SERVICE_UUID] }` — today's behaviour, unchanged. */
  filter?: DeviceScanFilter;
}

function adapterStateToBlockedReason(state: string): ScanBlockedReason | null {
  switch (state) {
    case BleAdapterState.POWERED_ON:
      return null;
    case BleAdapterState.POWERED_OFF:
      return 'bluetoothOff';
    case BleAdapterState.UNAUTHORIZED:
      return 'unauthorized';
    case BleAdapterState.UNSUPPORTED:
      return 'unsupported';
    case BleAdapterState.RESETTING:
      return 'resetting';
    case BleAdapterState.UNKNOWN:
      return 'unknown';
    default:
      // A state string the library added after this was written. Transient
      // rather than terminal is the safer default: it keeps a retry path open
      // instead of telling the user their phone has no Bluetooth.
      return 'unknown';
  }
}

/**
 * Returns `null` — not a throw, and not a partially-filled object — when the
 * advertisement has no manufacturer data or the wrong length. A device that
 * advertises the right service UUID with unreadable manufacturer data is still
 * a Blue Smoke device worth showing; it just has no pre-connect hint to show
 * beside it. Dropping it from the list would be worse than showing it plain.
 */
export function parseAdvertisement(manufacturerDataBase64: string | null): ParsedAdvertisement | null {
  if (!manufacturerDataBase64) {
    return null;
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(manufacturerDataBase64);
  } catch {
    return null;
  }

  if (bytes.length !== ADVERTISING_MANUFACTURER_DATA_LENGTH_BYTES) {
    return null;
  }

  const protocolVersion = readUint8(bytes, ADVERTISING_MANUFACTURER_DATA_OFFSETS.protocolVersion);
  const rawBattery = readUint8(bytes, ADVERTISING_MANUFACTURER_DATA_OFFSETS.battery);

  // §4.1 gives this byte no encoding beyond the name "battery". §4.4 defines
  // `batteryPercent` as 0–100 with 0xFF meaning unknown, and reusing that
  // convention for the same quantity is the reading that requires no new
  // invention — but §4.1 does not restate it, so anything outside 0–100 is
  // treated as unknown rather than trusted or clamped.
  const batteryPercent =
    rawBattery === BATTERY_PERCENT_UNKNOWN || rawBattery > 100 ? null : rawBattery;

  return {
    protocolVersion,
    compatible: protocolVersion === PROTOCOL_VERSION,
    stateHintRaw: readUint8(bytes, ADVERTISING_MANUFACTURER_DATA_OFFSETS.stateHint),
    batteryPercent,
    flagsRaw: readUint8(bytes, ADVERTISING_MANUFACTURER_DATA_OFFSETS.flags),
  };
}

export function createDeviceScanner(options: CreateDeviceScannerOptions): DeviceScanner {
  const { scanner } = options;
  const now = options.now ?? (() => Date.now());
  const scanTimeoutMs = options.scanTimeoutMs ?? SCAN_TIMEOUT_MS;
  const deviceStaleAfterMs = options.deviceStaleAfterMs ?? DEVICE_STALE_AFTER_MS;
  const filter: DeviceScanFilter = options.filter ?? { serviceUuids: [BLE_SERVICE_UUID] };

  // Insertion-ordered by discovery time — a Map preserves that for free.
  //
  // **Ordering is discovery order, deliberately, not signal strength.** RSSI
  // swings several dBm between consecutive advertisements from a stationary
  // device, so sorting by it makes rows swap places under the user's thumb
  // while they are trying to tap one. Strength is shown *on* the row instead.
  const devices = new Map<string, DiscoveredDevice>();

  const listeners = new Set<(state: ScanState) => void>();
  let state: ScanState = { status: 'idle' };
  let scanning = false;
  let disposed = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let stateSubscription: BleSubscriptionLike | undefined;

  function emit(next: ScanState): void {
    state = next;
    for (const listener of listeners) {
      listener(next);
    }
  }

  function visibleDevices(): DiscoveredDevice[] {
    const cutoff = now() - deviceStaleAfterMs;
    return [...devices.values()].filter((device) => device.lastSeenAtMs >= cutoff);
  }

  function emitScanning(): void {
    emit({ status: 'scanning', devices: visibleDevices() });
  }

  function clearScanTimeout(): void {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
      timeoutHandle = undefined;
    }
  }

  /**
   * Stops the radio scan and clears the timer. Split out from `stop()` because
   * the timeout path also has to halt the radio but must emit
   * `noDevicesFound`, not `stopped`.
   */
  function halt(): void {
    clearScanTimeout();
    if (scanning) {
      scanning = false;
      try {
        scanner.stopDeviceScan();
      } catch {
        // A stop that fails still leaves us logically stopped. Surfacing it
        // would replace a usable "stopped" screen with an error the user can
        // do nothing about.
      }
    }
  }

  function onAdvertisement(error: Error | null, advertisement: BleAdvertisementLike | null): void {
    if (error) {
      halt();
      emit({ status: 'failed', detail: error.message });
      return;
    }
    if (!advertisement) {
      return;
    }

    if (filter.namePrefix) {
      const name = advertisement.name ?? advertisement.localName ?? null;
      if (!name || !name.toLowerCase().startsWith(filter.namePrefix.toLowerCase())) {
        return;
      }
    }

    const timestamp = now();
    const existing = devices.get(advertisement.id);

    // The duplicate-advertisement path. Android re-delivers the same peripheral
    // continuously while scanning; iOS does too once `allowDuplicates` is set.
    // Update in place and keep the original Map slot, so the row neither
    // duplicates nor jumps position.
    devices.set(advertisement.id, {
      id: advertisement.id,
      name: advertisement.name ?? advertisement.localName ?? null,
      rssi: advertisement.rssi,
      firstSeenAtMs: existing?.firstSeenAtMs ?? timestamp,
      lastSeenAtMs: timestamp,
      advertisementCount: (existing?.advertisementCount ?? 0) + 1,
      // Re-parsed every time rather than kept from first sight: `stateHint`
      // and battery are live values, and a stale hint beside a fresh RSSI
      // would be the more confusing of the two.
      advertisement: parseAdvertisement(advertisement.manufacturerData) ?? existing?.advertisement ?? null,
    });

    emitScanning();
  }

  function onScanTimeout(): void {
    halt();
    if (visibleDevices().length > 0) {
      // Devices were found; the budget simply expired. That is a completed
      // scan, not an empty one.
      emit({ status: 'stopped', devices: visibleDevices() });
      return;
    }
    // Default filter reports the §4 service UUID, matching every existing
    // caller/test. A non-default filter (e.g. the H158 name-prefix scan)
    // reports what it actually searched for instead — still a fact for
    // whatever renders it, not a lie about a UUID that wasn't used.
    const searched =
      filter.serviceUuids && filter.serviceUuids.length > 0
        ? filter.serviceUuids.join(', ')
        : filter.namePrefix
          ? `name prefix "${filter.namePrefix}"`
          : BLE_SERVICE_UUID;
    emit({ status: 'noDevicesFound', filteredOnServiceUuid: searched });
  }

  function beginScan(): void {
    scanning = true;
    devices.clear();
    emitScanning();

    try {
      // §4.1 — filtered on the service UUID by default. The app must never
      // present arbitrary peripherals, so the filter is passed to the radio
      // rather than applied to the results where possible: an unfiltered
      // scan that discards non-matches afterwards still wakes the CPU for
      // every BLE device in the room, and on Android it is the filtered form
      // that survives background execution limits. A `namePrefix` filter
      // (H158/YP65-AT — see `../h158/h158Protocol.ts`) can't be pushed to the
      // radio the same way, since the OS scan APIs filter on service UUIDs,
      // not names — it's applied in `onAdvertisement` instead.
      scanner.startDeviceScan(filter.serviceUuids, null, onAdvertisement);
    } catch (error) {
      scanning = false;
      emit({ status: 'failed', detail: error instanceof Error ? error.message : 'unknown error' });
      return;
    }

    clearScanTimeout();
    timeoutHandle = setTimeout(onScanTimeout, scanTimeoutMs);
  }

  function handleAdapterState(adapterState: string): void {
    const blocked = adapterStateToBlockedReason(adapterState);

    if (blocked) {
      // The adapter went away mid-scan — Bluetooth switched off in Control
      // Centre is the common case. The radio scan is already dead; catch up
      // with our own bookkeeping so a later start() is not a no-op.
      halt();
      emit({ status: 'blocked', reason: blocked });
      return;
    }

    // PoweredOn. Only start if the caller has asked for a scan and one isn't
    // already running — this same handler fires on the initial subscription,
    // which is what makes "open the screen with Bluetooth off, then switch it
    // on" recover without the user tapping anything.
    if (!scanning) {
      beginScan();
    }
  }

  function start(): void {
    if (disposed || scanning) {
      return;
    }

    if (!stateSubscription) {
      // `emitCurrentState: true` — the current state arrives synchronously as
      // the first callback, so this one subscription covers both "what is the
      // adapter doing now" and "tell me when that changes". Asking `state()`
      // separately would race with it.
      stateSubscription = scanner.onStateChange(handleAdapterState, true);
      return;
    }

    // Restart after a stop(): the subscription is still live but has no new
    // state to report, so drive the scan directly.
    void Promise.resolve(scanner.state())
      .then(handleAdapterState)
      .catch((error: unknown) => {
        emit({ status: 'failed', detail: error instanceof Error ? error.message : 'unknown error' });
      });
  }

  function stop(): void {
    const wasScanning = scanning;
    halt();
    if (wasScanning) {
      emit({ status: 'stopped', devices: visibleDevices() });
    }
  }

  function dispose(): void {
    disposed = true;
    halt();
    stateSubscription?.remove();
    stateSubscription = undefined;
    listeners.clear();
  }

  return {
    start,
    stop,
    dispose,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
