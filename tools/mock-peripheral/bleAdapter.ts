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
import { bytesToBase64, base64ToBytes } from './byteLayout';

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
  /**
   * Delay before this device's advertisement reaches `startDeviceScan`'s listener, milliseconds.
   * Defaults to 0 — every existing caller's assumption before this option existed (`devFixture.ts`
   * is the only one that sets it, to stagger its scan fixture so results trickle in the way real
   * BLE advertisements do, rather than a "several devices" fixture dumping its whole list on
   * screen in the same tick a real scan never would).
   */
  advertiseDelayMs?: number;
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
  /**
   * P1-3.0 — populated at construction, not left `null` until the first `readRSSI()` call: real
   * `react-native-ble-plx` delivers RSSI on the scan callback itself. `advertisedRssi` wins when
   * given explicitly; otherwise falls back to `rssiSeries[0]` so "weak RSSI device"/"several
   * devices" scan fixtures that only set a series still show a signal value immediately.
   */
  rssi: number | null;
  /** §4.1 manufacturer data as base64, exactly as ble-plx delivers it. `null` if none. */
  readonly manufacturerData: string | null;
  /** See `MockDeviceOptions.advertiseDelayMs` — read by `MockBleManager.startDeviceScan`. */
  readonly advertiseDelayMs: number;

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
    this.rssi = options.advertisedRssi ?? (this.rssiSeries.length > 0 ? this.rssiSeries[0] : null);
    this.manufacturerData = options.manufacturerData
      ? Buffer.from(options.manufacturerData).toString('base64')
      : null;
    this.advertiseDelayMs = options.advertiseDelayMs ?? 0;
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
    return { value: bytesToBase64(this.core.read(key)) };
  }

  async writeCharacteristicWithResponseForService(
    serviceUUID: string,
    characteristicUUID: string,
    base64Value: string,
  ): Promise<{ value: string }> {
    this.assertServiceUuid(serviceUUID);
    const key = characteristicKeyForUuid(characteristicUUID);
    this.core.write(key, base64ToBytes(base64Value));
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
      listener(null, { value: bytesToBase64(bytes) });
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

/**
 * P1-3.0 §3.1 — the five states `react-native-ble-plx`'s `BleManager.state()` actually reports
 * (`CBManagerState` on iOS, `BluetoothAdapter`'s wrapped states on Android), and the only ones
 * `readBluetoothGateState` (`src/features/ble/bluetoothPermission.ts`) distinguishes. `Resetting`
 * is a real sixth ble-plx value but isn't one of the states that selector branches on (it falls
 * into the same "unknown" bucket as `Unknown`), so it isn't part of this mock's selectable set.
 */
export type BleRadioState = 'PoweredOn' | 'PoweredOff' | 'Unauthorized' | 'Unsupported' | 'Unknown';

const DEFAULT_RADIO_STATE: BleRadioState = 'PoweredOn';

type AdapterStateListener = (state: string) => void;

/**
 * The fake `BleManager`. Backed by one or more `MockDevice`s — `createMockPeripheral()` (the
 * single-device convenience every existing test uses) always builds exactly one; multi-device
 * scan fixtures (P1-3.0 §3.2 — "none / one / several / weak RSSI") go through
 * `createMockBleFleet()` below instead, which shares this same class over several devices. Every
 * device in the array is independently connectable — `createMockPeripheral`'s
 * `additionalAdvertisers` build theirs sharing the primary's `DeviceCore` (they're meant as
 * scan-only decoys), but nothing here enforces that; nothing has ever needed it to.
 */
export class MockBleManager {
  private readonly devices: MockDevice[];
  /**
   * `string`, not `BleRadioState` — `setAdapterState` (test hook) needs to drive values outside
   * the mock's typed "selectable set" too, e.g. `scanner.test.ts`'s `BleAdapterState.RESETTING`
   * (`Resetting` is real ble-plx but deliberately excluded from `BleRadioState`, see that type's
   * doc comment). `state()`/`BleScannerLike` are already `Promise<string>`/`(state: string)`, so
   * nothing narrower is actually required here.
   */
  private adapterState: string;
  private readonly adapterStateListeners = new Set<AdapterStateListener>();
  private activeScan: { serviceUUIDs: string[] | null; listener: ScanListener } | null = null;
  /** Pending `advertiseDelayMs` arrivals from the in-flight scan — cleared on `stopDeviceScan()`
   * so a cancelled scan can't still deliver a device after the caller stopped listening. */
  private scanTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(devices: MockDevice[], radioState: BleRadioState = DEFAULT_RADIO_STATE) {
    this.devices = devices;
    this.adapterState = radioState;
  }

  async state(): Promise<string> {
    return this.adapterState;
  }

  /**
   * P1-3.0 — `BleScannerLike`'s subscribe half (`BleClientContext.tsx`). `scanner.ts` reacts to a
   * radio state change mid-scan (e.g. Bluetooth switched off); the simpler `useDeviceScan.ts`
   * path never subscribes and only ever calls `state()`/`setState()` directly.
   */
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

  /** Alias for `setAdapterState` — same operation, kept for `bleAdapter.radioStateAndFleet.test.ts`. */
  setState(radioState: BleRadioState): void {
    this.setAdapterState(radioState);
  }

  /** §4.1 — the app must filter scan results on the service UUID; these mocks only ever advertise it. */
  startDeviceScan(serviceUUIDs: string[] | null, _options: unknown, listener: ScanListener): void {
    if (this.adapterState !== 'PoweredOn') {
      throw new Error(`MockBleManager: cannot scan while adapter is ${this.adapterState}`);
    }
    // Clears any previous scan's `activeScan`/pending timers first — must run BEFORE the new
    // `activeScan` is assigned below, not after, or it would wipe out the scan this call is
    // starting rather than the stale one it's meant to replace.
    this.stopDeviceScan();
    this.activeScan = { serviceUUIDs, listener };
    if (!this.matchesFilter(serviceUUIDs)) {
      return;
    }
    for (const device of this.devices) {
      // `advertiseDelayMs` defaults to 0, delivered synchronously here exactly like before that
      // option existed — every existing caller (every test, `createMockPeripheral`) sees no
      // behaviour change. Only a device built with a real delay (`devFixture.ts`'s dev fixture)
      // arrives async.
      if (device.advertiseDelayMs <= 0) {
        listener(null, device);
      } else {
        this.scanTimers.push(setTimeout(() => listener(null, device), device.advertiseDelayMs));
      }
    }
  }

  stopDeviceScan(): void {
    this.activeScan = null;
    for (const timer of this.scanTimers) {
      clearTimeout(timer);
    }
    this.scanTimers = [];
  }

  /**
   * Mock-only test hook: re-deliver an advertisement for an already-scanned
   * peripheral, which is what both platforms do continuously during a real
   * scan. The app's dedupe path (P1-3.0) has nothing to exercise without it.
   * No-op when no scan is running — matching the radio.
   */
  emitAdvertisement(device: MockDevice = this.devices[0]): void {
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
    return this.findKnownDevice(deviceId).connect();
  }

  async isDeviceConnected(deviceId: string): Promise<boolean> {
    return this.devices.some((device) => device.id === deviceId && device.isConnected());
  }

  async cancelDeviceConnection(deviceId: string): Promise<MockDevice> {
    return this.findKnownDevice(deviceId).cancelConnection();
  }

  private matchesFilter(serviceUUIDs: string[] | null): boolean {
    return (
      !serviceUUIDs ||
      serviceUUIDs.some((uuid) => uuid.toLowerCase() === BLE_SERVICE_UUID.toLowerCase())
    );
  }

  private findKnownDevice(deviceId: string): MockDevice {
    const device = this.devices.find((candidate) => candidate.id === deviceId);
    if (!device) {
      throw new Error(`MockBleManager: unknown device ${deviceId}`);
    }
    return device;
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
   * P1-3.0 — extra peripherals that appear in scan results, sharing the primary's `DeviceCore`.
   * For exercising dedupe, ordering, and multi-device list behaviour where a full independent
   * `DeviceCore` per device isn't the point — see `createMockBleFleet` below for that case.
   */
  additionalAdvertisers?: MockDeviceOptions[];
  /** Defaults to `'PoweredOn'` — every existing caller's assumption before this option existed. */
  radioState?: BleRadioState;
  /** See `MockDeviceOptions.advertiseDelayMs`. Defaults to 0 (synchronous), same as that option. */
  advertiseDelayMs?: number;
}

function buildDeviceAndCore(options: CreateMockPeripheralOptions): { device: MockDevice; core: DeviceCore } {
  const core = new DeviceCore(options);
  const device = new MockDevice(core, {
    id: options.deviceId ?? 'mock-device-0001',
    name: `${ADVERTISING_LOCAL_NAME_PREFIX}${options.deviceUidSuffixHex ?? '0000'}`,
    rssiSeries: options.rssiSeries,
    advertisedRssi: options.advertisedRssi,
    manufacturerData: options.manufacturerData,
    advertiseDelayMs: options.advertiseDelayMs,
  });
  return { device, core };
}

export function createMockPeripheral(options: CreateMockPeripheralOptions): {
  manager: MockBleManager;
  device: MockDevice;
  core: DeviceCore;
} {
  const { device, core } = buildDeviceAndCore(options);
  const additional = (options.additionalAdvertisers ?? []).map(
    (advertiserOptions) => new MockDevice(core, advertiserOptions),
  );
  const manager = new MockBleManager([device, ...additional], options.radioState);
  return { manager, device, core };
}

/**
 * P1-3.0 §3.2 — one manager backed by several devices, for scan fixtures a single-device
 * `createMockPeripheral()` can't shape: "several devices" and "weak RSSI device" scan states.
 * "No devices found" needs no fixture at all — pass `[]`. Each entry still gets a full,
 * §4-faithful `DeviceCore` (not a scan-only stub), so selecting any of them and connecting is
 * exactly as real as the single-device path — see this package's README on why a second, looser
 * mock is not an option.
 */
export function createMockBleFleet(
  devices: CreateMockPeripheralOptions[],
  radioState: BleRadioState = DEFAULT_RADIO_STATE,
): {
  manager: MockBleManager;
  devices: MockDevice[];
  cores: DeviceCore[];
} {
  const built = devices.map(buildDeviceAndCore);
  const manager = new MockBleManager(
    built.map((b) => b.device),
    radioState,
  );
  return { manager, devices: built.map((b) => b.device), cores: built.map((b) => b.core) };
}
