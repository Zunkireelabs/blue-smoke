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
