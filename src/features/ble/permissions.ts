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
import {
  PERMISSIONS,
  RESULTS,
  checkMultiple,
  requestMultiple,
  type Permission,
  type PermissionStatus,
} from 'react-native-permissions';

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
 * `requestMultiple` and `checkMultiple` have the same shape, and the two
 * exported functions below must not drift apart in how they pick permissions
 * or fold statuses — only in whether the OS is allowed to show a dialog. So
 * the whole body lives here once and each wrapper supplies the verb.
 */
type PermissionQuery = (permissions: Permission[]) => Promise<Record<Permission, PermissionStatus>>;

async function resolveBlePermissions(query: PermissionQuery): Promise<BlePermissionResult> {
  if (Platform.OS !== 'android') {
    return 'granted';
  }

  const permissions = androidPermissionsForApiLevel(Platform.Version as number);
  const statuses = await query(permissions);
  return Object.values(statuses)
    .map(toBlePermissionResult)
    .reduce(worstResult, 'granted');
}

/**
 * Request whatever this OS/API level needs before a scan. Call at the moment
 * of need — opening the pairing screen — never at launch (P1-2.0): asking for
 * Bluetooth before the user has any reason to want it is the pattern that
 * trains people to reflexively deny.
 */
export async function requestBlePermissions(): Promise<BlePermissionResult> {
  return resolveBlePermissions(requestMultiple);
}

/**
 * Read the current permission state **without prompting** — P1-2.0 item 8,
 * "permission state re-checked on app foreground".
 *
 * 🔴 This is not interchangeable with `requestBlePermissions()`, and using
 * that one here would be a bug in two directions:
 *
 * - On a `denied` permission, `requestMultiple` re-opens the OS dialog. A
 *   foreground handler runs on every app switch, notification tap and
 *   incoming call, so that turns the permission prompt into a popup the user
 *   cannot escape — the fastest way to train someone to deny permanently.
 * - On a `blocked` one it does nothing at all, silently, so it cannot even
 *   detect the state it would need to route to Settings.
 *
 * `request` is for the moment of need; `check` is for recovery.
 *
 * iOS returns `granted` here for the same reason it does above: there is no
 * pre-flight permission to inspect. iOS surfaces Bluetooth denial as the
 * adapter state `unauthorized`, which `scanner.ts` already handles as a
 * `ScanBlockedReason` — a different channel that needs no foreground poll
 * because CoreBluetooth pushes it.
 */
export async function checkBlePermissions(): Promise<BlePermissionResult> {
  return resolveBlePermissions(checkMultiple);
}
