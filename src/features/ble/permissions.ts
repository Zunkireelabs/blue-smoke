/**
 * §4.1 scan permissions — P1-2.0/P1-3.0.
 *
 * `AndroidManifest.xml` already declares `BLUETOOTH_SCAN` / `BLUETOOTH_CONNECT`
 * (API 31+) and the legacy pre-31 triad (`BLUETOOTH`, `BLUETOOTH_ADMIN`,
 * `ACCESS_FINE_LOCATION`), but a manifest entry alone grants nothing on API 23+
 * — the two dangerous ones (`BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT` on 31+;
 * `ACCESS_FINE_LOCATION` below it) still need a runtime request, and nobody
 * makes it. Without it `startDeviceScan()` fails silently on Android 12+: no
 * error, no results, indistinguishable from an empty room.
 *
 * iOS is a no-op here: `NSBluetoothAlwaysUsageDescription` is already in
 * `Info.plist`, and iOS prompts on first actual BLE use, not on a call to this
 * module — there is nothing to request in advance.
 */

import { Platform } from 'react-native';
import { PERMISSIONS, RESULTS, requestMultiple, type Permission, type PermissionStatus } from 'react-native-permissions';

/**
 * Three outcomes, not the library's five — `LIMITED` never applies to a
 * Bluetooth permission (it exists for scoped photo-library grants) and folds
 * into `granted`; `UNAVAILABLE` (the permission does not exist on this OS
 * build) folds into `blocked`, because it is equally terminal from the
 * caller's point of view: re-prompting does nothing either way.
 *
 * P1-2.0: re-prompting a permanently-denied ("blocked") permission is a
 * button that silently does nothing, so the caller must route `blocked` to
 * Settings and `denied` to a re-prompt — the two need different screens.
 */
export type BlePermissionResult = 'granted' | 'denied' | 'blocked';

function toBlePermissionResult(status: PermissionStatus): BlePermissionResult {
  switch (status) {
    case RESULTS.GRANTED:
    case RESULTS.LIMITED:
      return 'granted';
    case RESULTS.DENIED:
      return 'denied';
    case RESULTS.BLOCKED:
    case RESULTS.UNAVAILABLE:
      return 'blocked';
  }
}

const RESULT_SEVERITY: Record<BlePermissionResult, number> = {
  granted: 0,
  denied: 1,
  blocked: 2,
};

/** The worst of several permission outcomes — one blocked permission blocks the whole scan. */
function worstResult(a: BlePermissionResult, b: BlePermissionResult): BlePermissionResult {
  return RESULT_SEVERITY[b] > RESULT_SEVERITY[a] ? b : a;
}

function androidPermissionsForApiLevel(apiLevel: number): Permission[] {
  // API 31 (Android 12) split BLUETOOTH into the scoped BLUETOOTH_SCAN /
  // BLUETOOTH_CONNECT runtime permissions. Below it, BLUETOOTH and
  // BLUETOOTH_ADMIN are normal (manifest-only, no runtime prompt) — only
  // ACCESS_FINE_LOCATION was ever dangerous pre-31, because scan results
  // could be used to infer location.
  return apiLevel >= 31
    ? [PERMISSIONS.ANDROID.BLUETOOTH_SCAN, PERMISSIONS.ANDROID.BLUETOOTH_CONNECT]
    : [PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION];
}

/**
 * Request whatever this OS/API level needs before a scan. Call at the moment
 * of need — opening the pairing screen — never at launch (P1-2.0): asking for
 * Bluetooth before the user has any reason to want it is the pattern that
 * trains people to reflexively deny.
 */
export async function requestBlePermissions(): Promise<BlePermissionResult> {
  if (Platform.OS !== 'android') {
    return 'granted';
  }

  const permissions = androidPermissionsForApiLevel(Platform.Version as number);
  const statuses = await requestMultiple(permissions);
  return Object.values(statuses)
    .map(toBlePermissionResult)
    .reduce(worstResult, 'granted');
}
