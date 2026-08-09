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
