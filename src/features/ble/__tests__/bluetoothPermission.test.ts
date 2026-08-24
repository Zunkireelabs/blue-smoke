import { PermissionsAndroid, Platform } from 'react-native';
import {
  readBluetoothGateState,
  requestAndroidBluetoothPermission,
} from '../bluetoothPermission';
import type { BleManagerLike } from '../BleClientContext';

function fakeManager(state: string): BleManagerLike {
  return {
    state: () => Promise.resolve(state),
  } as unknown as BleManagerLike;
}

/**
 * `requestMultiple`'s real type demands every Android permission key the OS defines, not just
 * the two BLE ones this module actually requests — this test only cares about those two, so the
 * cast is confined to this one helper rather than sprinkled across every `mockResolvedValue`.
 */
type RequestMultipleResult = Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>;
function bleResults(
  overrides: Record<string, (typeof PermissionsAndroid.RESULTS)[keyof typeof PermissionsAndroid.RESULTS]>,
): RequestMultipleResult {
  return overrides as unknown as RequestMultipleResult;
}

describe('readBluetoothGateState', () => {
  const originalOS = Platform.OS;
  let checkSpy: jest.SpyInstance;

  beforeEach(() => {
    // Granted by default — most existing cases below exercise the adapter-state mapping below
    // this check, not the check itself (see the two `checkSpy.mockResolvedValueOnce(false)`
    // cases for that).
    checkSpy = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  });

  afterEach(() => {
    Platform.OS = originalOS;
    checkSpy.mockRestore();
  });

  it('maps PoweredOn/PoweredOff/Unsupported the same on every platform', async () => {
    expect(await readBluetoothGateState(fakeManager('PoweredOn'))).toBe('poweredOn');
    expect(await readBluetoothGateState(fakeManager('PoweredOff'))).toBe('poweredOff');
    expect(await readBluetoothGateState(fakeManager('Unsupported'))).toBe('unsupported');
  });

  it('an unknown/transient ble-plx state resolves to "unknown", not a crash', async () => {
    expect(await readBluetoothGateState(fakeManager('Resetting'))).toBe('unknown');
  });

  // The regression this file exists for: ON-7 (denied once) must never be reachable on iOS,
  // because CBManagerState makes no such distinction — the OS shows its permission dialog
  // exactly once, ever. Getting this wrong would render a "Try again" button that silently does
  // nothing on a real device, the exact bug class ON-7/ON-8 exist to prevent.
  it('Unauthorized resolves to permanentlyDenied on iOS — ON-7 is not reachable there', async () => {
    Platform.OS = 'ios';
    expect(await readBluetoothGateState(fakeManager('Unauthorized'))).toBe('permanentlyDenied');
  });

  it('Unauthorized resolves to deniedOnce on Android — the OS genuinely allows a re-prompt', async () => {
    Platform.OS = 'android';
    expect(await readBluetoothGateState(fakeManager('Unauthorized'))).toBe('deniedOnce');
  });

  // Regression, 2026-08-24, reproduced on real hardware: `manager.state()` reports the BLE
  // adapter's power state, which is independent of this app's own runtime permission grant —
  // it returned `PoweredOn` with BLUETOOTH_SCAN/BLUETOOTH_CONNECT both ungranted (never even
  // prompted), and the gate let the user straight through to a scan that immediately failed
  // with "Device is not authorized to use BluetoothLE". This locks in the fix: an ungranted
  // runtime permission must report `deniedOnce` regardless of what the adapter itself reports.
  it('an ungranted runtime BLE permission on Android reports deniedOnce even when the adapter is PoweredOn', async () => {
    Platform.OS = 'android';
    checkSpy.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    expect(await readBluetoothGateState(fakeManager('PoweredOn'))).toBe('deniedOnce');
  });

  it('does not check runtime permissions at all on iOS — there is no such API there', async () => {
    Platform.OS = 'ios';
    checkSpy.mockResolvedValue(false);

    expect(await readBluetoothGateState(fakeManager('PoweredOn'))).toBe('poweredOn');
    expect(checkSpy).not.toHaveBeenCalled();
  });
});

describe('requestAndroidBluetoothPermission', () => {
  let request: jest.SpyInstance;

  beforeEach(() => {
    request = jest.spyOn(PermissionsAndroid, 'requestMultiple');
  });

  afterEach(() => {
    request.mockRestore();
  });

  it('returns granted when every requested permission is granted', async () => {
    request.mockResolvedValue(
      bleResults({
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.GRANTED,
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED,
      }),
    );

    expect(await requestAndroidBluetoothPermission()).toBe('granted');
  });

  it('returns permanentlyDenied when any permission comes back never_ask_again', async () => {
    request.mockResolvedValue(
      bleResults({
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED,
      }),
    );

    expect(await requestAndroidBluetoothPermission()).toBe('permanentlyDenied');
  });

  it('returns deniedOnce for a plain denial the OS will still re-prompt for', async () => {
    request.mockResolvedValue(
      bleResults({
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.DENIED,
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED,
      }),
    );

    expect(await requestAndroidBluetoothPermission()).toBe('deniedOnce');
  });
});
