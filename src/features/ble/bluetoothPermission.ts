import { PermissionsAndroid, Platform } from 'react-native';
import type { BleManagerLike } from './BleClientContext';

/**
 * P1-2.0 — real detection for ON-7/ON-8/ON-9 (F1.D1/F1.D2/F1.D5), decided against adding
 * `react-native-permissions`: the distinction those two screens exist to draw ("denied once,
 * can re-prompt" vs. "permanently denied, only Settings") doesn't actually exist on iOS at the
 * OS level, so a cross-platform permission-status library wouldn't buy anything real there —
 * see the note on `readBluetoothGateState` below.
 */
export type BluetoothGateState =
  | 'poweredOn'
  | 'poweredOff'
  | 'deniedOnce'
  | 'permanentlyDenied'
  | 'unsupported'
  | 'unknown';

const ANDROID_BLE_PERMISSIONS = [
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
] as const;

/**
 * Reads the real state from the BLE seam's `manager.state()` (ble-plx, wrapping
 * `CBManagerState` on iOS / `BluetoothAdapter` on Android) — never a mock, never a guess.
 *
 * 🔴 The platform asymmetry this function exists to make explicit: `Unauthorized` is the ONLY
 * value either OS reports for "no Bluetooth permission," on both power-on and power-off. iOS
 * shows its one-time permission dialog exactly once per install; there is no OS-level "ask
 * again" afterward, ever — only Settings. So on iOS, `Unauthorized` always means
 * `permanentlyDenied` (ON-8); `deniedOnce` (ON-7) is not a reachable state there, no matter how
 * this function is written, because the OS itself makes no such distinction.
 *
 * Android is where ON-7 is real: `PermissionsAndroid.requestMultiple`'s per-permission result
 * distinguishes `denied` (askable again) from `never_ask_again` (blocked) — but only right after
 * a request call, which is what `requestAndroidBluetoothPermission` below is for. A passive
 * `state()` read on Android can only ever report "currently unauthorized," not which of the two
 * it is — that distinction is surfaced through the *return value of asking*, not a status read.
 */
export async function readBluetoothGateState(manager: BleManagerLike): Promise<BluetoothGateState> {
  // 🔴 2026-08-24 fix — checked BEFORE `manager.state()` on Android. `state()` reports the
  // adapter's power state (`BluetoothAdapter.getState()`), which is a system-wide fact
  // independent of this app's own runtime permission grants: it reports `PoweredOn` whenever
  // Bluetooth is switched on, whether or not BLUETOOTH_SCAN/BLUETOOTH_CONNECT were ever granted
  // to this app. Manifest-declaring those two (`AndroidManifest.xml`) is necessary but not
  // sufficient — Android 12+ treats them as dangerous, runtime-requestable permissions, and
  // nothing was ever checking/requesting them before this gate declared itself resolved. Found
  // on real hardware: `manager.state()` returned `PoweredOn` with both permissions
  // `granted=false` (never even prompted), and the very next `startDeviceScan()` call threw
  // "Device is not authorized to use BluetoothLE" — a scan-time failure for a gate that had
  // already said "you're through." Reported as `deniedOnce`, the same state Android's own
  // `Unauthorized` adapter value already maps to below — same recovery screen (ON-7), whose
  // "Try again" already calls `requestAndroidBluetoothPermission()` to trigger the real OS
  // dialog and (if answered `never_ask_again`) correctly upgrades to `permanentlyDenied`.
  if (Platform.OS === 'android') {
    const granted = await Promise.all(
      ANDROID_BLE_PERMISSIONS.map((permission) => PermissionsAndroid.check(permission)),
    );
    if (!granted.every(Boolean)) {
      return 'deniedOnce';
    }
  }

  const state = await manager.state();
  switch (state) {
    case 'PoweredOn':
      return 'poweredOn';
    case 'PoweredOff':
      return 'poweredOff';
    case 'Unsupported':
      return 'unsupported';
    case 'Unauthorized':
      return Platform.OS === 'android' ? 'deniedOnce' : 'permanentlyDenied';
    default:
      // 'Resetting' / 'Unknown' (ble-plx's own transient states) — not any of the three gate
      // screens' business; the caller treats this the same as "nothing to show yet."
      return 'unknown';
  }
}

/**
 * Android only — triggers the real OS permission dialog (or, if already answered, returns the
 * OS's own record of how) via `PermissionsAndroid.requestMultiple`. This is what ON-7's "Try
 * again" actually calls: if the OS now reports `never_ask_again`, the caller must switch to
 * ON-8, not keep re-showing ON-7's copy over a request that can no longer succeed.
 */
export async function requestAndroidBluetoothPermission(): Promise<
  'granted' | 'deniedOnce' | 'permanentlyDenied'
> {
  const results = await PermissionsAndroid.requestMultiple([...ANDROID_BLE_PERMISSIONS]);
  const values = Object.values(results);
  if (values.every((r) => r === PermissionsAndroid.RESULTS.GRANTED)) {
    return 'granted';
  }
  if (values.some((r) => r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) {
    return 'permanentlyDenied';
  }
  return 'deniedOnce';
}
