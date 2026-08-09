/**
 * A dev-only, in-app fake peripheral set for the BLE demo screens.
 *
 * Why this exists when `tools/mock-peripheral/` already fakes a device: that
 * mock is a Node artifact — `bleAdapter.ts` and `byteLayout.ts` use `Buffer`
 * throughout and its crypto uses `node:crypto`, neither of which exists in
 * React Native's Hermes runtime. It is the right target for Jest and the
 * wrong one for a running app.
 *
 * Scope: discovery (§4.1) → connection lifecycle → the §4.3 `deviceInfo`
 * read. Those are exactly the paths that need no crypto and no server, so
 * this fake stays RN-safe with no polyfills and no invented key material.
 *
 * 🔴 What this deliberately does NOT do: the §4.5 handshake. `auth.ts` needs
 * a `K_sess` that only `issue-device-session` can mint, and that endpoint is
 * blocked on OQ-12 (the `serial_hash` salt). Faking a session key here would
 * put an "authenticated" badge on screen that proves nothing and invites
 * exactly the wrong conclusion. The handshake stays proven where it is proven:
 * `auth.test.ts`, against the Node mock's independent crypto.
 *
 * Not reachable in production: the screens that consume this are mounted
 * under `__DEV__` only (navigation.tsx).
 */

import type { BleDeviceLike, BleManagerLike, BleScannerLike, ScannedDevice } from './BleClientContext';
import { writeBytes, writeUint8 } from './byteLayout';
import {
  ADVERTISING_LOCAL_NAME_PREFIX,
  BLE_CHARACTERISTIC_UUIDS,
  BLE_SERVICE_UUID,
  CHARACTERISTIC_LENGTH_BYTES,
  DEVICE_INFO_LAYOUT,
  PROTOCOL_VERSION,
  ProvisioningState,
} from './protocol';

/** What the next `connectToDevice()` should do — driven from the demo UI. */
export type NextConnectOutcome = 'success' | 'fail' | 'hang';

interface FakePeripheralSpec {
  id: string;
  /** Last 4 hex of the deviceUid, per §4.1's advertised local name. */
  uidSuffix: string;
  rssi: number;
  hwRevision: number;
  fwVersion: { major: number; minor: number };
  provisioningState: ProvisioningState;
  keyGeneration: number;
  /** Defaults to ours; one fixture overrides it to exercise the mismatch path. */
  protocolVersion?: number;
}

/**
 * Three fixtures, chosen to make the list say something rather than just be
 * long: a normal activated device, an unprovisioned one straight from the
 * factory, and one speaking a protocol version we don't — which is the
 * `compatible: false` outcome `deviceInfo.ts` reports as a fact and takes no
 * action on (§4.3 defines no client behaviour on mismatch — OQ-6).
 */
const PERIPHERALS: readonly FakePeripheralSpec[] = [
  {
    id: 'demo-device-0001',
    uidSuffix: 'A1B2',
    rssi: -46,
    hwRevision: 1,
    fwVersion: { major: 1, minor: 4 },
    provisioningState: ProvisioningState.ACTIVATED,
    keyGeneration: 1,
  },
  {
    id: 'demo-device-0002',
    uidSuffix: 'C3D4',
    rssi: -71,
    hwRevision: 1,
    fwVersion: { major: 1, minor: 4 },
    provisioningState: ProvisioningState.UNPROVISIONED,
    keyGeneration: 1,
  },
  {
    id: 'demo-device-0003',
    uidSuffix: 'E5F6',
    rssi: -88,
    hwRevision: 2,
    fwVersion: { major: 2, minor: 0 },
    provisioningState: ProvisioningState.ACTIVATED,
    keyGeneration: 2,
    protocolVersion: 0x02, // deliberately not ours
  },
];

// Duplicated from auth.ts / deviceInfo.ts, which each carry their own copy and
// have already flagged "extract a shared base64 helper" as a follow-up. Not
// extracting it here too: that would mean editing two shipped modules from a
// dev-only file. Hermes has no btoa, so a local copy is the alternative.
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;

    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

/** §4.3 — the 20-byte deviceInfo payload this peripheral answers C1 reads with. */
function buildDeviceInfoBytes(spec: FakePeripheralSpec): Uint8Array {
  const bytes = new Uint8Array(CHARACTERISTIC_LENGTH_BYTES.deviceInfo);
  writeUint8(bytes, DEVICE_INFO_LAYOUT.protocolVersion.offset, spec.protocolVersion ?? PROTOCOL_VERSION);
  writeUint8(bytes, DEVICE_INFO_LAYOUT.hwRevision.offset, spec.hwRevision);
  writeUint8(bytes, DEVICE_INFO_LAYOUT.fwVersion.offset, spec.fwVersion.major);
  writeUint8(bytes, DEVICE_INFO_LAYOUT.fwVersion.offset + 1, spec.fwVersion.minor);

  // A 12-byte deviceUid whose last two bytes match the advertised name suffix,
  // so the list entry and the post-connect read describe the same device.
  const uid = new Uint8Array(DEVICE_INFO_LAYOUT.deviceUid.length);
  for (let i = 0; i < uid.length - 2; i += 1) {
    uid[i] = i + 1;
  }
  uid[uid.length - 2] = parseInt(spec.uidSuffix.slice(0, 2), 16);
  uid[uid.length - 1] = parseInt(spec.uidSuffix.slice(2, 4), 16);
  writeBytes(bytes, DEVICE_INFO_LAYOUT.deviceUid.offset, uid);

  writeUint8(bytes, DEVICE_INFO_LAYOUT.provisioningState.offset, spec.provisioningState);
  writeUint8(bytes, DEVICE_INFO_LAYOUT.keyGeneration.offset, spec.keyGeneration);
  // reserved (2B) left zero-filled per §4.3.
  return bytes;
}

export interface DevFakeControls {
  /**
   * Models a supervision timeout / radio loss: the link drops with no
   * `cancelDeviceConnection()` call, which is exactly the case `connection.ts`
   * must answer with reconnect-and-backoff rather than staying disconnected.
   */
  simulateDrop(): void;
  /** `fail` rejects immediately; `hang` never settles, so the connect timeout fires. */
  setNextConnectOutcome(outcome: NextConnectOutcome): void;
  getNextConnectOutcome(): NextConnectOutcome;
  /** Total `connectToDevice()` calls — makes reconnect attempts visible in the UI. */
  getConnectAttempts(): number;
  isConnected(): boolean;
}

export function createDevFakeManager(): {
  manager: BleManagerLike;
  scanner: BleScannerLike;
  controls: DevFakeControls;
} {
  let connectedId: string | null = null;
  let nextOutcome: NextConnectOutcome = 'success';
  let connectAttempts = 0;
  const disconnectListeners = new Map<string, Set<(error: Error | null, deviceId: string) => void>>();
  let scanTimers: ReturnType<typeof setTimeout>[] = [];

  function findSpec(deviceId: string): FakePeripheralSpec | undefined {
    return PERIPHERALS.find((peripheral) => peripheral.id === deviceId);
  }

  /**
   * The connection lifecycle never reads a characteristic; the discovery flow
   * reads exactly one (§4.3 C1). Everything else throws rather than returning
   * a plausible-looking empty value, so a caller reaching past this fake's
   * scope fails loudly instead of appearing to succeed.
   */
  function createFakeDevice(spec: FakePeripheralSpec): BleDeviceLike {
    const unsupported = (method: string): never => {
      throw new Error(
        `devFakeManager: ${method}() is out of scope — this fake covers discovery, the connection lifecycle, and the §4.3 deviceInfo read only. Use tools/mock-peripheral for the handshake and commands.`,
      );
    };

    const device: BleDeviceLike = {
      id: spec.id,
      async discoverAllServicesAndCharacteristics() {
        return device;
      },
      async readCharacteristicForService(serviceUUID: string, characteristicUUID: string) {
        if (serviceUUID.toLowerCase() !== BLE_SERVICE_UUID.toLowerCase()) {
          throw new Error(`devFakeManager: unknown service ${serviceUUID}`);
        }
        if (characteristicUUID.toLowerCase() === BLE_CHARACTERISTIC_UUIDS.deviceInfo.toLowerCase()) {
          return { value: bytesToBase64(buildDeviceInfoBytes(spec)) };
        }
        return unsupported(`readCharacteristicForService(${characteristicUUID})`);
      },
      async writeCharacteristicWithResponseForService() {
        return unsupported('writeCharacteristicWithResponseForService');
      },
      monitorCharacteristicForService() {
        return unsupported('monitorCharacteristicForService');
      },
    };
    return device;
  }

  const manager: BleManagerLike = {
    async state() {
      return 'PoweredOn';
    },

    async connectToDevice(deviceId: string) {
      connectAttempts += 1;
      const spec = findSpec(deviceId);
      if (!spec) {
        throw new Error(`devFakeManager: unknown device ${deviceId}`);
      }
      if (nextOutcome === 'fail') {
        throw new Error('devFakeManager: simulated connect failure');
      }
      if (nextOutcome === 'hang') {
        // Never settles — connection.ts's CONNECT_TIMEOUT_MS is what ends
        // this, which is the behaviour the demo exists to show.
        return new Promise<BleDeviceLike>(() => {});
      }
      connectedId = deviceId;
      return createFakeDevice(spec);
    },

    async isDeviceConnected(deviceId: string) {
      return connectedId === deviceId;
    },

    async cancelDeviceConnection(deviceId: string) {
      const spec = findSpec(deviceId);
      if (!spec) {
        throw new Error(`devFakeManager: unknown device ${deviceId}`);
      }
      connectedId = null;
      // A voluntary disconnect deliberately does NOT notify
      // `onDeviceDisconnected`: connection.ts distinguishes voluntary from
      // involuntary, and firing here would make the app fight its own
      // disconnect with a reconnect loop.
      return createFakeDevice(spec);
    },

    onDeviceDisconnected(deviceId, listener) {
      let listeners = disconnectListeners.get(deviceId);
      if (!listeners) {
        listeners = new Set();
        disconnectListeners.set(deviceId, listeners);
      }
      listeners.add(listener);
      return {
        remove() {
          listeners?.delete(listener);
        },
      };
    },
  };

  const scanner: BleScannerLike = {
    startDeviceScan(serviceUUIDs, _options, listener) {
      // §4.1 — the app is expected to filter on our service UUID; a scan that
      // asked for anything else would find none of these.
      if (
        serviceUUIDs &&
        !serviceUUIDs.some((uuid) => uuid.toLowerCase() === BLE_SERVICE_UUID.toLowerCase())
      ) {
        return;
      }
      // Staggered rather than emitted all at once: a real scan discovers
      // peripherals as their advertising intervals come round, and a list that
      // populates instantly hides whether the UI handles arriving-later
      // results at all.
      scanTimers = PERIPHERALS.map((peripheral, index) =>
        setTimeout(() => {
          const result: ScannedDevice = {
            id: peripheral.id,
            name: `${ADVERTISING_LOCAL_NAME_PREFIX}${peripheral.uidSuffix}`,
            rssi: peripheral.rssi,
          };
          listener(null, result);
        }, 400 * (index + 1)),
      );
    },

    stopDeviceScan() {
      for (const timer of scanTimers) {
        clearTimeout(timer);
      }
      scanTimers = [];
    },
  };

  const controls: DevFakeControls = {
    simulateDrop() {
      if (!connectedId) {
        return;
      }
      const droppedId = connectedId;
      connectedId = null;
      const listeners = disconnectListeners.get(droppedId);
      if (!listeners) {
        return;
      }
      // Copy before iterating: connection.ts removes its subscription inside
      // the handler, which mutates this set mid-loop.
      for (const listener of [...listeners]) {
        listener(null, droppedId);
      }
    },
    setNextConnectOutcome(outcome: NextConnectOutcome) {
      nextOutcome = outcome;
    },
    getNextConnectOutcome() {
      return nextOutcome;
    },
    getConnectAttempts() {
      return connectAttempts;
    },
    isConnected() {
      return connectedId !== null;
    },
  };

  return { manager, scanner, controls };
}
