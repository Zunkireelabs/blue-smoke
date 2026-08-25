import { createContext, useContext, type PropsWithChildren } from 'react';
import { BleManager } from 'react-native-ble-plx';

/**
 * P1-4.0 §4 — the composition-root seam for BLE, mirroring
 * `AuthClientContext.tsx`: code under `src/features/ble/**` depends on this
 * interface, never on `react-native-ble-plx` or `tools/mock-peripheral` by
 * name, so a test can swap in `MockBleManager` (`createMockPeripheral()`)
 * the same one-line way a test swaps in `mockAuthClient` — wrap in
 * `<BleClientProvider manager={...}>`.
 *
 * Deliberately the narrow slice of `BleManager`/`Device` that
 * `MockBleManager`/`MockDevice` (tools/mock-peripheral/bleAdapter.ts)
 * already implement — nothing wider.
 */

export interface BleDeviceLike {
  readonly id: string;
  /**
   * §4.1 — populated from the scan/advertisement, same as real `react-native-ble-plx`'s
   * `Device.rssi`/`Device.name`: no extra call is needed to read either at scan time (that's
   * what `readRSSI()` is for — a live re-read on an already-connected device, §7.2's job, not
   * this one). Both already exist as public fields on `MockDevice`
   * (`tools/mock-peripheral/bleAdapter.ts`) — this only widens the interface to match what's
   * already there, per this file's "narrow slice ... nothing wider" rule above.
   *
   * Optional, not just nullable: several existing hand-rolled fake devices (P1-4.0's
   * `auth.test.ts`/`deviceInfo.test.ts`) satisfy `BleDeviceLike` without either field, since
   * they never scan — only connect directly. Making these required would force edits across
   * another task's in-flight test files for no benefit to them. Callers that DO care (P1-3.0's
   * scan) normalize a missing value to `null` themselves.
   */
  readonly rssi?: number | null;
  readonly name?: string | null;
  discoverAllServicesAndCharacteristics(): Promise<BleDeviceLike>;
  readCharacteristicForService(
    serviceUUID: string,
    characteristicUUID: string,
  ): Promise<{ value: string | null }>;
  writeCharacteristicWithResponseForService(
    serviceUUID: string,
    characteristicUUID: string,
    base64Value: string,
  ): Promise<{ value: string | null }>;
  /**
   * H158/YP65-AT's FFF1 pipe is Write-Without-Response only
   * (docs/hardware/manufacturer-supplied-2026-08-17/ —
   * `ble-manual-test.md`), unlike every §4 write characteristic, which is
   * Write w/ response. Optional, for the same reason `onDisconnected` and
   * `cancelConnection` above are optional: existing narrow test doubles
   * predate it and don't need it.
   */
  writeCharacteristicWithoutResponseForService?(
    serviceUUID: string,
    characteristicUUID: string,
    base64Value: string,
  ): Promise<{ value: string | null }>;
  monitorCharacteristicForService(
    serviceUUID: string,
    characteristicUUID: string,
    listener: (error: Error | null, characteristic: { value: string | null } | null) => void,
  ): { remove(): void };
  /**
   * P1-7.0 — fires on any disconnect, clean or abrupt, matching
   * `react-native-ble-plx`'s `Device.onDisconnected` (index.d.ts:1559).
   * `connection.ts` uses this to detect a drop without a second
   * `connectToDevice()` call, which auth.ts's module doc already documents as
   * forcing a disconnect+reconnect on Android when a connection is already open.
   *
   * Optional, not required: `auth.test.ts`/`deviceInfo.test.ts` already hand-roll
   * several narrow `BleDeviceLike` doubles that predate P1-7.0 and don't (and
   * don't need to) implement it — same reasoning as `BleScannerLike` being kept
   * separate from `BleManagerLike`. `connection.ts` falls back to polling
   * `BleManagerLike.isDeviceConnected()` when it's absent.
   */
  onDisconnected?(listener: (error: Error | null, device: BleDeviceLike) => void): { remove(): void };
  /** P1-7.0 — a clean, application-initiated disconnect. Optional for the same reason as above. */
  cancelConnection?(): Promise<BleDeviceLike>;
}

export interface BleManagerLike {
  state(): Promise<string>;
  /** §4.1 — the app must filter scan results on the service UUID; `serviceUUIDs` carries that filter. */
  startDeviceScan(
    serviceUUIDs: string[] | null,
    options: unknown,
    listener: (error: Error | null, device: BleDeviceLike | null) => void,
  ): void;
  stopDeviceScan(): void;
  connectToDevice(deviceId: string): Promise<BleDeviceLike>;
  isDeviceConnected(deviceId: string): Promise<boolean>;
  cancelDeviceConnection(deviceId: string): Promise<BleDeviceLike>;
}

export interface BleSubscriptionLike {
  remove(): void;
}

/**
 * P1-3.0 — a peripheral as it appears in a **scan result**, before any
 * connection exists. Distinct from `BleDeviceLike` on purpose: at scan time
 * all we have is what the advertisement carried (§4.1), and none of
 * `BleDeviceLike`'s GATT operations are callable yet. `react-native-ble-plx`
 * happens to use one `Device` class for both phases; keeping them apart here
 * stops scan-phase code from reaching for a characteristic read that would
 * throw.
 *
 * `manufacturerData` is base64, as the library delivers it.
 */
export interface BleAdvertisementLike {
  readonly id: string;
  readonly name: string | null;
  readonly localName?: string | null;
  readonly rssi: number | null;
  readonly manufacturerData: string | null;
}

/**
 * P1-3.0 — the scan slice, kept **separate from `BleManagerLike`** rather
 * than added to it. Both the real `BleManager` and `MockBleManager` satisfy
 * both interfaces structurally, but widening `BleManagerLike` would break
 * every existing narrow test double that implements only the four
 * connection methods. Depend on the smallest interface that does the job.
 */
export interface BleScannerLike {
  state(): Promise<string>;
  onStateChange(
    listener: (state: string) => void,
    emitCurrentState?: boolean,
  ): BleSubscriptionLike;
  startDeviceScan(
    serviceUUIDs: string[] | null,
    options: unknown,
    listener: (error: Error | null, device: BleAdvertisementLike | null) => void,
  ): void;
  stopDeviceScan(): void;
}

/**
 * The real `BleManager` is expensive and unsafe to construct at module load:
 * its constructor reaches straight into the native module
 * (`NativeEventEmitter` → `NativeModules.BlePlx`), which doesn't exist under
 * Jest and throws immediately (confirmed while building this file — see the
 * execution report). `createContext(new BleManager())`, evaluated eagerly at
 * import time, would reintroduce exactly the eager-native/client-construction
 * failure class that `__tests__/App.test.tsx` was just fixed for (P1-4.0
 * brief §2). So the default is constructed lazily, on first real use, not at
 * import time or provider-mount time.
 */
let lazyDefaultManager: BleManagerLike | undefined;
function getLazyDefaultManager(): BleManagerLike {
  if (!lazyDefaultManager) {
    lazyDefaultManager = new BleManager();
  }
  return lazyDefaultManager;
}

const BleManagerContext = createContext<BleManagerLike | undefined>(undefined);

export function BleClientProvider({
  manager,
  children,
}: PropsWithChildren<{ manager?: BleManagerLike }>) {
  return <BleManagerContext.Provider value={manager}>{children}</BleManagerContext.Provider>;
}

export function useBleManager(): BleManagerLike {
  return useContext(BleManagerContext) ?? getLazyDefaultManager();
}

/**
 * P1-3.0 — the scan-phase accessor. The real `BleManager` and `MockBleManager`
 * are each a single object that structurally satisfies both `BleManagerLike`
 * and `BleScannerLike` — this reads the same provider value `useBleManager()`
 * does and widens it, rather than adding scan methods to `BleManagerLike`
 * itself (which would break every existing narrow test double, per the
 * comment on `BleScannerLike` above).
 */
export function useBleScanner(): BleScannerLike {
  return useBleManager() as unknown as BleScannerLike;
}
