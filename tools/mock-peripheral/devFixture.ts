/**
 * P1-3.0 §2.1/§3.3 — the app's own crypto/RNG for `DeviceCore`, and a small multi-device scan
 * fixture (§3.2), built for exactly one caller: `src/app/providers.tsx`'s `__DEV__`-gated
 * wiring point. Nothing in this file imports `node:crypto` or `./crypto` — see deviceCore.ts's
 * module doc comment for why a top-level import of either would break every Metro bundle that
 * reaches it. `providers.tsx` reaches `createDevBleManager` below via `require()` inside an
 * `if (__DEV__)` block, never a top-level `import` — see providers.tsx for why that distinction
 * is the whole point.
 *
 * The crypto stub throws instead of faking a result: the §4.5 handshake running in-app is
 * explicitly out of scope for this task (brief §4 — "the §4.5 auth handshake running in-app").
 * `connect()` → `discoverAllServicesAndCharacteristics()` → `readDeviceInfo()` — the path
 * DeviceScan and the pairing flow up to `PairingBoundaryScreen`'s hard boundary need — never
 * reach it. A fake CMAC/HKDF that "worked" would make an unauthenticated dev build's handshake
 * look like it authenticates; a thrown error is the honest failure for a path that was never
 * supposed to be reachable yet.
 */
import { createMockBleFleet, type BleRadioState, type CreateMockPeripheralOptions } from './bleAdapter';
import type { DeviceCoreCrypto } from './deviceCore';
import type { Clock } from './clock';
import { ProvisioningState } from '../../src/features/ble/protocol';

const CRYPTO_NOT_IMPLEMENTED =
  'DeviceCore (dev mock): §4.5/§4.6 crypto is not implemented in-app — P1-3.0 scoped scan/' +
  'connect/discover only. The in-app §4.5 handshake is a separate, not-yet-scoped follow-on ' +
  '(see the P1-3.0 execution brief §4). This is a deliberate throw, not a silent fake.';

/**
 * Every method throws. §4.5/§4.6 never run against this path (see module doc comment above) —
 * if that ever changes, this is the file that needs a real, non-fake CMAC/HKDF supplied.
 */
const throwingDevCrypto: DeviceCoreCrypto = {
  aesCmac(): never {
    throw new Error(CRYPTO_NOT_IMPLEMENTED);
  },
  hkdfSha256(): never {
    throw new Error(CRYPTO_NOT_IMPLEMENTED);
  },
  constantTimeEqual(): never {
    throw new Error(CRYPTO_NOT_IMPLEMENTED);
  },
};

/**
 * Plain `Math.random()` — not cryptographically secure, and doesn't need to be: it is only ever
 * paired with `throwingDevCrypto` above, so even a fully predictable nonce cannot complete a
 * handshake without a real CMAC/HKDF to compute a valid proof, which this dev build never has.
 */
function devNonceSource(): Uint8Array {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/** Wall-clock uptime — the dev app runs indefinitely, unlike a test's `FakeClock`. */
const systemClock: Clock = { nowMs: () => Date.now() };

/** Never real key material — this device can never complete a handshake, see module doc comment. */
const DEV_K_DEV = new Uint8Array(16).fill(0xab);

function devDeviceOptions(overrides: Partial<CreateMockPeripheralOptions> = {}): CreateMockPeripheralOptions {
  return {
    kDev: DEV_K_DEV,
    clock: systemClock,
    crypto: throwingDevCrypto,
    nonceSource: devNonceSource,
    provisioningState: ProvisioningState.ACTIVATED,
    ...overrides,
  };
}

/**
 * §3.2 — "several devices" and "weak RSSI device" in one fixture (`dev-mock-0003`'s -91 dBm).
 * "No devices found" needs no fixture — see `createMockBleFleet([])`'s doc comment; this array
 * isn't used for that state. Edit this array locally to drive a different scan shape.
 *
 * Staggered via `advertiseDelayMs`, not all delivered in the same tick — a real scan's results
 * trickle in as advertisements are actually received, and `DeviceScanScreen`/`useDeviceScan` are
 * built around that (a device found at second 2 is in the list, and selectable, at second 2; see
 * `useDeviceScan.ts`'s own doc comment). Weaker RSSI arrives later, standing in for a weaker/
 * more-intermittent real advertisement — not a spec threshold, just this fixture's own ordering.
 */
const DEV_SCAN_DEVICES: CreateMockPeripheralOptions[] = [
  devDeviceOptions({
    deviceId: 'dev-mock-0001',
    deviceUidSuffixHex: '0001',
    rssiSeries: [-52],
    advertiseDelayMs: 5000,
  }),
  devDeviceOptions({
    deviceId: 'dev-mock-0002',
    deviceUidSuffixHex: '0002',
    rssiSeries: [-68],
    advertiseDelayMs: 8000,
  }),
  devDeviceOptions({
    deviceId: 'dev-mock-0003',
    deviceUidSuffixHex: '0003',
    rssiSeries: [-91],
    advertiseDelayMs: 12000,
  }),
];

/** All five states `readBluetoothGateState` distinguishes — see bleAdapter.ts's `BleRadioState`. */
export const DEV_BLE_RADIO_STATES: BleRadioState[] = [
  'PoweredOn',
  'PoweredOff',
  'Unauthorized',
  'Unsupported',
  'Unknown',
];

/**
 * Builds the dev BLE manager `providers.tsx` wires in. Not memoized here — `providers.tsx`
 * calls this exactly once, at module scope, same as its real `BleManager` counterpart
 * (`BleClientContext.tsx`'s lazy singleton) is constructed once per app process.
 */
export function createDevBleManager(initialRadioState: BleRadioState = 'PoweredOn') {
  return createMockBleFleet(DEV_SCAN_DEVICES, initialRadioState);
}
