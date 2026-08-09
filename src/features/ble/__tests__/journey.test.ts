/**
 * P1-3.0/P1-7.0 — one continuous walk through scan → connect → drop →
 * reconnect → reject, against the real mock peripheral.
 *
 * Every other suite in this directory tests one unit in isolation:
 * scanner.test.ts proves scanning, connection.test.ts proves reconnect. That
 * leaves the seams between them unexercised — a scan result whose shape the
 * connection manager can't consume, a state transition that strands the UI —
 * and each of those would pass every existing test. This suite is the chain.
 *
 * Deliberately **not** independent-per-test: the tests below share one
 * `createMockPeripheral()` and one `FakeClock` built in `beforeAll`, and run
 * in file order, each depending on state the previous one left behind. That
 * violates the usual test-isolation instinct on purpose — the point is to
 * prove the chain holds, not to re-prove each link alone (that's what the
 * other suites already do).
 *
 * It narrates to stdout as it goes (`process.stdout.write`, not
 * `console.log` — Jest prefixes `console.log` with a header that breaks up
 * the transcript) so a non-programmer can read what the stack did without
 * reading the code. Reading the transcript is the actual deliverable here,
 * not just the pass/fail count.
 *
 * Scope, so it isn't overclaimed: this proves our §4 logic, not that BLE
 * works. No react-native-ble-plx, no platform BLE stack, no bonding, no
 * radio. It cannot validate `BLE_SERVICE_UUID` — the scanner and the mock
 * both read the same constant, so the filter matches by construction while
 * OQ-13 is open. See `tools/mock-peripheral/README.md:116`.
 */
import { createMockPeripheral, type MockBleManager, type MockDevice } from '../../../../tools/mock-peripheral/bleAdapter';
import { FakeClock } from '../../../../tools/mock-peripheral/clock';
import { K_DEV, validCredentials, wrongCredentials } from '../../../../tools/mock-peripheral/testCredentials';
import { createConnectionManager, type ConnectionManager } from '../connection';
import { createDeviceScanner, type DeviceScanner } from '../scanner';
import { ADVERTISING_MANUFACTURER_DATA_OFFSETS, PROTOCOL_VERSION, ResultCode } from '../protocol';

const PRIMARY_ID = 'mock-device-0001';
const SECONDARY_ID = 'mock-device-0002';
const STATE_HINT = 0x02;
const BATTERY = 77; // distinct from every other fixture byte, per the P1-4.0 fixture rule
const FLAGS = 0x09;

function say(line: string): void {
  process.stdout.write(`  ${line}\n`);
}

function buildManufacturerData(): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[ADVERTISING_MANUFACTURER_DATA_OFFSETS.protocolVersion] = PROTOCOL_VERSION;
  bytes[ADVERTISING_MANUFACTURER_DATA_OFFSETS.stateHint] = STATE_HINT;
  bytes[ADVERTISING_MANUFACTURER_DATA_OFFSETS.battery] = BATTERY;
  bytes[ADVERTISING_MANUFACTURER_DATA_OFFSETS.flags] = FLAGS;
  return bytes;
}

describe('the full scan-to-reconnect journey, walked once in order', () => {
  let manager: MockBleManager;
  let primaryDevice: MockDevice;
  let scanner: DeviceScanner;
  let connectionManager: ConnectionManager;
  const credentials = jest.fn(async () => validCredentials());

  beforeAll(() => {
    jest.useFakeTimers();

    const peripheral = createMockPeripheral({
      kDev: K_DEV,
      clock: new FakeClock(0),
      deviceId: PRIMARY_ID,
      advertisedRssi: -55,
      manufacturerData: buildManufacturerData(),
      additionalAdvertisers: [{ id: SECONDARY_ID, name: 'BlueSmoke-0002', advertisedRssi: -70 }],
    });
    manager = peripheral.manager;
    primaryDevice = peripheral.device;
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test('1 — Bluetooth off blocks the scan before it starts', () => {
    manager.setAdapterState('PoweredOff');
    scanner = createDeviceScanner({ scanner: manager });
    scanner.start();

    expect(scanner.getState()).toEqual({ status: 'blocked', reason: 'bluetoothOff' });
    say('Bluetooth is switched off — the app reports "bluetoothOff", not a crash');
  });

  test('2 — Bluetooth coming back on resumes the scan without a restart', () => {
    manager.setAdapterState('PoweredOn');

    expect(scanner.getState().status).toBe('scanning');
    say('Bluetooth on. Scanning…');
  });

  test('3 — two devices found, in stable discovery order, primary advertisement parsed', () => {
    const state = scanner.getState();
    const devices = state.status === 'scanning' ? state.devices : [];

    expect(devices.map((d) => d.id)).toEqual([PRIMARY_ID, SECONDARY_ID]);

    const primary = devices[0];
    expect(primary.rssi).toBe(-55);
    expect(primary.advertisement).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      compatible: true,
      stateHintRaw: STATE_HINT,
      batteryPercent: BATTERY,
      flagsRaw: FLAGS,
    });

    const secondary = devices[1];
    say(
      `Found 2 devices: ${primary.id} (${primary.rssi} dBm, battery ${primary.advertisement?.batteryPercent}%), ${secondary.id} (${secondary.rssi} dBm)`,
    );
  });

  test('4 — a repeated advertisement updates the row, not the list', () => {
    manager.emitAdvertisement(primaryDevice);

    const state = scanner.getState();
    const devices = state.status === 'scanning' ? state.devices : [];

    expect(devices).toHaveLength(2);
    expect(devices[0].advertisementCount).toBe(2);
    say(`Same device advertises again — still ${devices.length} in the list, seen ${devices[0].advertisementCount}x`);
  });

  test('5 — connecting to the primary runs the handshake once and succeeds', async () => {
    // Stops the radio scan before connecting — realistic (you stop scanning
    // once you've picked a device) and it clears the scanner's 15s timeout,
    // which would otherwise still be pending and fire mid-journey.
    scanner.stop();

    connectionManager = createConnectionManager({
      manager,
      credentials,
      backoff: { initialMs: 1000, multiplier: 2, maxMs: 30_000 },
    });

    say(`Connecting to ${PRIMARY_ID}…`);
    await connectionManager.connect(PRIMARY_ID);

    expect(connectionManager.getState(PRIMARY_ID)).toBe('connected');
    expect(credentials).toHaveBeenCalledTimes(1);
    expect(connectionManager.getLastFailure(PRIMARY_ID)).toBeNull();
    say('Connected, handshake passed (credentials requested 1x)');
  });

  test('6 — an abrupt drop, no goodbye, moves the connection to reconnecting', () => {
    primaryDevice.simulateAbruptDisconnect();

    expect(connectionManager.getState(PRIMARY_ID)).toBe('reconnecting');
    say('Link dropped abruptly — no goodbye, like walking out of range');
  });

  test('7 — reconnecting re-runs the full handshake: a session never survives a disconnect', async () => {
    await jest.advanceTimersByTimeAsync(1000);

    expect(connectionManager.getState(PRIMARY_ID)).toBe('connected');
    // The load-bearing assertion. A session-reuse bug leaves this at 1 while
    // every other assertion in this file still passes — the earlier steps
    // can't tell a resumed session from a fresh handshake, only this can.
    expect(credentials).toHaveBeenCalledTimes(2);
    say('Reconnecting… connected, and the handshake ran AGAIN (credentials requested 2x)');
  });

  test('8 — a device offering the wrong key is rejected, not silently accepted', async () => {
    const rejectingManager = createConnectionManager({
      manager,
      credentials: async () => wrongCredentials(),
    });

    await rejectingManager.connect(PRIMARY_ID);

    expect(rejectingManager.getLastFailure(PRIMARY_ID)).toEqual({
      stage: 'handshake',
      outcome: { ok: false, resultCode: ResultCode.AUTH_FAILED },
    });
    say('A device offering the wrong key is rejected: AUTH_FAILED');
  });
});
