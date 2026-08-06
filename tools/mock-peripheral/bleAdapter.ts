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
}

/**
 * The fake `Device`. Backed 1:1 by a DeviceCore — this adapter models a
 * single peripheral, matching the mock's scope (one device under test).
 */
export class MockDevice {
  readonly id: string;
  readonly name: string;
  rssi: number | null = null;

  private readonly core: DeviceCore;
  private rssiSeries: number[];
  private rssiIndex = 0;
  private connectedFlag = false;
  private readonly disconnectListeners = new Set<(error: Error | null, device: MockDevice) => void>();

  constructor(core: DeviceCore, options: MockDeviceOptions) {
    this.core = core;
    this.id = options.id;
    this.name = options.name;
    this.rssiSeries = options.rssiSeries ?? [];
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

/** The fake `BleManager`. Backed by a single MockDevice — see MockDevice's doc comment. */
export class MockBleManager {
  private readonly device: MockDevice;

  constructor(device: MockDevice) {
    this.device = device;
  }

  async state(): Promise<'PoweredOn'> {
    return 'PoweredOn';
  }

  /** §4.1 — the app must filter scan results on the service UUID; this mock only ever advertises it. */
  startDeviceScan(serviceUUIDs: string[] | null, _options: unknown, listener: ScanListener): void {
    if (serviceUUIDs && !serviceUUIDs.some((uuid) => uuid.toLowerCase() === BLE_SERVICE_UUID.toLowerCase())) {
      return;
    }
    listener(null, this.device);
  }

  stopDeviceScan(): void {
    // No background scan loop to cancel in this synchronous mock.
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

  private assertKnownDevice(deviceId: string): void {
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
  });
  const manager = new MockBleManager(device);
  return { manager, device, core };
}
