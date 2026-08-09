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
