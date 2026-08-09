/**
 * Layer 2 — a fake implementing the slice of `react-native-ble-plx`'s
 * `BleManager` / `Device` / `Characteristic` surface the app actually uses,
 * backed by Layer 1 (deviceCore.ts). This is what unblocks Phases 1 and 3
 * on a machine/CI with no BLE radio — see brief §3.2.
 *
 * Characteristic values are base64 strings, exactly as `react-native-ble-plx`
 * represents them — app code written against this adapter needs the same
 * base64 (de)serialisation it would need against the real library.
 *
 * Does NOT exercise react-native-ble-plx itself, the iOS/Android BLE stack,
 * LESC bonding, or background execution. See brief §5's honesty note and
 * this package's README.
 */

import {
  ADVERTISING_LOCAL_NAME_PREFIX,
  BLE_CHARACTERISTIC_UUIDS,
  BLE_SERVICE_UUID,
} from '../../src/features/ble/protocol';
import { DeviceCore, type CharacteristicKey, type DeviceCoreConfig } from './deviceCore';

type CharacteristicListener = (error: Error | null, characteristic: { value: string } | null) => void;

export interface Subscription {
  remove(): void;
}

function characteristicKeyForUuid(uuid: string): CharacteristicKey {
  const entry = (Object.entries(BLE_CHARACTERISTIC_UUIDS) as [CharacteristicKey, string][]).find(
    ([, candidateUuid]) => candidateUuid.toLowerCase() === uuid.toLowerCase(),
  );
  if (!entry) {
    throw new Error(`MockDevice: unknown characteristic UUID ${uuid}`);
  }
  return entry[0];
}

export interface MockDeviceOptions {
  id: string;
  name: string;
  /** Scripted RSSI series consumed in call order by readRSSI(); last value repeats once exhausted. */
  rssiSeries?: number[];
  /**
   * P1-3.0 — RSSI carried on the *advertisement*, i.e. what a scan result
   * reports before any connection exists. Deliberately separate from
   * `rssiSeries`: seeding `rssi` from the series would consume its first entry
   * before `readRSSI()` ever ran, and the §7.2 proximity tests depend on that
   * series starting at index 0.
   */
  advertisedRssi?: number;
  /**
   * P1-3.0 — §4.1 manufacturer data, 4 bytes:
   * `[protocolVersion | stateHint | battery | flags]`. Omit for a device that
   * advertises none, which the app must still list.
   */
  manufacturerData?: Uint8Array;
}

/**
 * The fake `Device`. Backed 1:1 by a DeviceCore — this adapter models a
 * single peripheral, matching the mock's scope (one device under test).
 */
export class MockDevice {
  readonly id: string;
  readonly name: string;
  /** §4.1 — `react-native-ble-plx` exposes both; the app prefers `name`, falling back to this. */
  readonly localName: string | null;
  rssi: number | null = null;
  /** §4.1 manufacturer data as base64, exactly as ble-plx delivers it. `null` if none. */
  readonly manufacturerData: string | null;

  private readonly core: DeviceCore;
  private rssiSeries: number[];
  private rssiIndex = 0;
  private connectedFlag = false;
  private readonly disconnectListeners = new Set<(error: Error | null, device: MockDevice) => void>();

  constructor(core: DeviceCore, options: MockDeviceOptions) {
    this.core = core;
    this.id = options.id;
    this.name = options.name;
    this.localName = options.name;
    this.rssiSeries = options.rssiSeries ?? [];
    this.rssi = options.advertisedRssi ?? null;
    this.manufacturerData = options.manufacturerData
      ? Buffer.from(options.manufacturerData).toString('base64')
      : null;
  }

  async connect(): Promise<MockDevice> {
    this.core.connect();
    this.connectedFlag = true;
    return this;
  }

  async discoverAllServicesAndCharacteristics(): Promise<MockDevice> {
    // The mock exposes exactly one, well-known service — nothing to discover.
    return this;
  }

  isConnected(): boolean {
    return this.connectedFlag;
  }

  async readCharacteristicForService(
    serviceUUID: string,
    characteristicUUID: string,
  ): Promise<{ value: string }> {
    this.assertServiceUuid(serviceUUID);
    const key = characteristicKeyForUuid(characteristicUUID);
    return { value: Buffer.from(this.core.read(key)).toString('base64') };
  }

  async writeCharacteristicWithResponseForService(
    serviceUUID: string,
    characteristicUUID: string,
    base64Value: string,
  ): Promise<{ value: string }> {
    this.assertServiceUuid(serviceUUID);
    const key = characteristicKeyForUuid(characteristicUUID);
    this.core.write(key, Buffer.from(base64Value, 'base64'));
    return { value: base64Value };
  }

  monitorCharacteristicForService(
    serviceUUID: string,
    characteristicUUID: string,
    listener: CharacteristicListener,
  ): Subscription {
    this.assertServiceUuid(serviceUUID);
    const key = characteristicKeyForUuid(characteristicUUID);
    const unsubscribe = this.core.subscribe(key, (bytes) => {
      listener(null, { value: Buffer.from(bytes).toString('base64') });
    });
    return { remove: unsubscribe };
  }

  async readRSSI(): Promise<MockDevice> {
    this.rssi = this.consumeNextRssi();
    return this;
  }

  /** Mock-only test hook: load a new scripted RSSI series, e.g. mid-test. */
  setScriptedRssi(values: number[]): void {
    this.rssiSeries = values;
    this.rssiIndex = 0;
  }

  onDisconnected(listener: (error: Error | null, device: MockDevice) => void): Subscription {
    this.disconnectListeners.add(listener);
    return { remove: () => this.disconnectListeners.delete(listener) };
  }

  /** A clean, application-initiated disconnect. */
  async cancelConnection(): Promise<MockDevice> {
    this.performDisconnect();
    return this;
  }

  /**
   * Mock-only failure injection (brief §3.3 "abrupt disconnect"): models a
   * link supervision timeout or radio loss — no `cancelConnection()` call,
   * exactly what F2's "on BLE disconnect, any cause" must cover.
   */
  simulateAbruptDisconnect(): void {
    this.performDisconnect();
  }

  private performDisconnect(): void {
    this.connectedFlag = false;
    this.core.disconnect();
    for (const listener of this.disconnectListeners) {
      listener(null, this);
    }
  }

  private consumeNextRssi(): number {
    if (this.rssiSeries.length === 0) {
      return this.rssi ?? -60;
    }
    const index = Math.min(this.rssiIndex, this.rssiSeries.length - 1);
    if (this.rssiIndex < this.rssiSeries.length - 1) {
      this.rssiIndex += 1;
    }
    return this.rssiSeries[index];
  }

  private assertServiceUuid(serviceUUID: string): void {
    if (serviceUUID.toLowerCase() !== BLE_SERVICE_UUID.toLowerCase()) {
      throw new Error(`MockDevice: unknown service UUID ${serviceUUID}`);
    }
  }
}

type ScanListener = (error: Error | null, device: MockDevice | null) => void;

type AdapterStateListener = (state: string) => void;

/**
 * The fake `BleManager`.
 *
 * Originally backed by exactly one MockDevice. P1-3.0 needs a *list* — dedupe,
 * ordering and "no devices found" are untestable against a single peripheral —
 * so it now holds several while keeping `device` pointing at the first, which
 * is what every pre-existing caller uses. The GATT half is still single-device:
 * only `devices[0]` has a `DeviceCore` behind it, and the extra peripherals
 * exist to be *discovered*, not connected to.
 */
export class MockBleManager {
  /** The primary peripheral — the one with a DeviceCore. Unchanged for existing callers. */
  private readonly device: MockDevice;
  private readonly devices: MockDevice[];
  private adapterState: string = 'PoweredOn';
  private readonly adapterStateListeners = new Set<AdapterStateListener>();
  private activeScan: { serviceUUIDs: string[] | null; listener: ScanListener } | null = null;

  constructor(device: MockDevice, additionalDevices: MockDevice[] = []) {
    this.device = device;
    this.devices = [device, ...additionalDevices];
  }

  async state(): Promise<string> {
    return this.adapterState;
  }

  onStateChange(listener: AdapterStateListener, emitCurrentState = false): Subscription {
    this.adapterStateListeners.add(listener);
    if (emitCurrentState) {
      listener(this.adapterState);
    }
    return { remove: () => this.adapterStateListeners.delete(listener) };
  }

  /**
   * Mock-only test hook: drive the adapter through `PoweredOff` / `Unauthorized`
   * / etc. Switching away from `PoweredOn` kills any in-flight scan, which is
   * what the OS does when the user turns Bluetooth off mid-scan.
   */
  setAdapterState(state: string): void {
    this.adapterState = state;
    if (state !== 'PoweredOn') {
      this.activeScan = null;
    }
    for (const listener of this.adapterStateListeners) {
      listener(state);
    }
  }

  /** §4.1 — the app must filter scan results on the service UUID; these mocks only ever advertise it. */
  startDeviceScan(serviceUUIDs: string[] | null, _options: unknown, listener: ScanListener): void {
    if (this.adapterState !== 'PoweredOn') {
      throw new Error(`MockBleManager: cannot scan while adapter is ${this.adapterState}`);
    }
    this.activeScan = { serviceUUIDs, listener };
    if (!this.matchesFilter(serviceUUIDs)) {
      return;
    }
    for (const device of this.devices) {
      listener(null, device);
    }
  }

  stopDeviceScan(): void {
    this.activeScan = null;
  }

  /**
   * Mock-only test hook: re-deliver an advertisement for an already-scanned
   * peripheral, which is what both platforms do continuously during a real
   * scan. The app's dedupe path (P1-3.0) has nothing to exercise without it.
   * No-op when no scan is running — matching the radio.
   */
  emitAdvertisement(device: MockDevice = this.device): void {
    if (!this.activeScan || !this.matchesFilter(this.activeScan.serviceUUIDs)) {
      return;
    }
    this.activeScan.listener(null, device);
  }

  /** Mock-only test hook: fail an in-flight scan the way the library reports errors. */
  emitScanError(error: Error): void {
    this.activeScan?.listener(error, null);
  }

  isScanning(): boolean {
    return this.activeScan !== null;
  }

  async connectToDevice(deviceId: string): Promise<MockDevice> {
    this.assertKnownDevice(deviceId);
    return this.device.connect();
  }

  async isDeviceConnected(deviceId: string): Promise<boolean> {
    return deviceId === this.device.id && this.device.isConnected();
  }

  async cancelDeviceConnection(deviceId: string): Promise<MockDevice> {
    this.assertKnownDevice(deviceId);
    return this.device.cancelConnection();
  }

  private matchesFilter(serviceUUIDs: string[] | null): boolean {
    return (
      !serviceUUIDs ||
      serviceUUIDs.some((uuid) => uuid.toLowerCase() === BLE_SERVICE_UUID.toLowerCase())
    );
  }

  private assertKnownDevice(deviceId: string): void {
    // Only the primary peripheral is connectable — the rest have no DeviceCore.
    if (deviceId !== this.device.id) {
      throw new Error(`MockBleManager: unknown device ${deviceId}`);
    }
  }
}

export interface CreateMockPeripheralOptions extends DeviceCoreConfig {
  deviceId?: string;
  /** Last 4 hex chars of the device UID, per §4.1's advertised local name. */
  deviceUidSuffixHex?: string;
  rssiSeries?: number[];
  /** P1-3.0 — see `MockDeviceOptions.advertisedRssi`. */
  advertisedRssi?: number;
  /** P1-3.0 — §4.1 manufacturer data for the primary peripheral. */
  manufacturerData?: Uint8Array;
  /**
   * P1-3.0 — extra peripherals that appear in scan results but have no
   * `DeviceCore` and cannot be connected to. For exercising dedupe, ordering
   * and multi-device list behaviour.
   */
  additionalAdvertisers?: MockDeviceOptions[];
}

export function createMockPeripheral(options: CreateMockPeripheralOptions): {
  manager: MockBleManager;
  device: MockDevice;
  core: DeviceCore;
} {
  const core = new DeviceCore(options);
  const device = new MockDevice(core, {
    id: options.deviceId ?? 'mock-device-0001',
    name: `${ADVERTISING_LOCAL_NAME_PREFIX}${options.deviceUidSuffixHex ?? '0000'}`,
    rssiSeries: options.rssiSeries,
    advertisedRssi: options.advertisedRssi,
    manufacturerData: options.manufacturerData,
  });
  // These share the primary's DeviceCore so the type checks out, but nothing
  // reads through it — `MockBleManager.assertKnownDevice` refuses to connect
  // to them, which is the honest model of "discovered, not connectable".
  const additional = (options.additionalAdvertisers ?? []).map(
    (advertiserOptions) => new MockDevice(core, advertiserOptions),
  );
  const manager = new MockBleManager(device, additional);
  return { manager, device, core };
}
