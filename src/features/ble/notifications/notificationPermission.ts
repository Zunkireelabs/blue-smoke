import { PermissionsAndroid, Platform } from 'react-native';

/**
 * `POST_NOTIFICATIONS` (API 33+) runtime request — same
 * `PermissionsAndroid.request`/`.check` style as `bluetoothPermission.ts`. Below API 33 the
 * permission doesn't exist and notifications are granted by default, so this resolves `true`
 * without ever touching `PermissionsAndroid`. iOS's equivalent prompt is handled by notifee's
 * own `requestPermission()` at the call site (`initBleNotifications.ts`) — this module is
 * Android-only, matching `bluetoothPermission.ts`'s split between the OS-specific runtime
 * dialog and the cross-platform state read.
 */
export async function requestAndroidNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (!permission) {
    // Runs on an API level where the RN version being used doesn't expose the constant
    // (pre-33 devices, older RN typings) — nothing to request, notifications are granted.
    return true;
  }
  const alreadyGranted = await PermissionsAndroid.check(permission);
  if (alreadyGranted) {
    return true;
  }
  const result = await PermissionsAndroid.request(permission);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
