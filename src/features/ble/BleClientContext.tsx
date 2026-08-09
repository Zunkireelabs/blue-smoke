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
  monitorCharacteristicForService(
    serviceUUID: string,
    characteristicUUID: string,
    listener: (error: Error | null, characteristic: { value: string | null } | null) => void,
  ): { remove(): void };
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
  // Added for P1-7.0 — the only way to observe an involuntary disconnect
  // (supervision timeout / radio loss), which connection.ts's reconnect
  // logic needs and no existing member exposes.
  onDeviceDisconnected(
    deviceId: string,
    listener: (error: Error | null, deviceId: string) => void,
  ): { remove(): void };
}

/**
 * §4.1 — what a scan result carries before anything is connected: an id to
 * connect with, the advertised local name (`BlueSmoke-xxxx`), and signal
 * strength for the "which of these is nearest me" question pairing UI asks.
 */
export interface ScannedDevice {
  readonly id: string;
  readonly name: string | null;
  readonly rssi: number | null;
}

/**
 * Scanning is a SEPARATE interface from `BleManagerLike`, deliberately.
 * Adding two more required members to `BleManagerLike` would break every
 * hand-rolled fake manager literal that implements it (11 in auth.test.ts
 * alone — the exact ripple adding `onDeviceDisconnected` already caused).
 * Only `scan.ts` needs these, so only `scan.ts` depends on them. The real
 * `BleManager`, `MockBleManager`, and the dev fake all satisfy this
 * structurally without any of them changing shape.
 */
export interface BleScannerLike {
  startDeviceScan(
    serviceUUIDs: string[] | null,
    options: unknown,
    listener: (error: Error | null, device: ScannedDevice | null) => void,
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
// The real BleManager.onDeviceDisconnected(deviceId, listener) hands the
// listener a full Device, not a deviceId (see node_modules/react-native-ble-plx
// /src/Device.js's onDisconnected doc) — narrower than BleManagerLike's
// deviceId-only listener, so a direct `new BleManager()` no longer satisfies
// this interface once that member exists. Wrap rather than widen the
// interface back to leaking a Device handle here.
function wrapRealManager(real: BleManager): BleManagerLike {
  return {
    state: () => real.state(),
    connectToDevice: (deviceId) => real.connectToDevice(deviceId),
    isDeviceConnected: (deviceId) => real.isDeviceConnected(deviceId),
    cancelDeviceConnection: (deviceId) => real.cancelDeviceConnection(deviceId),
    onDeviceDisconnected: (deviceId, listener) =>
      real.onDeviceDisconnected(deviceId, (error, device) => listener(error, device?.id ?? deviceId)),
  };
}

let lazyDefaultManager: BleManagerLike | undefined;
function getLazyDefaultManager(): BleManagerLike {
  if (!lazyDefaultManager) {
    lazyDefaultManager = wrapRealManager(new BleManager());
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
