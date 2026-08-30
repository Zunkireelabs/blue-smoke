/**
 * App-boot-once init for the two OS-notification-bar features on this branch: low-battery
 * alerts and (Android) the persistent "connected" notification. Same module-level
 * `initialized` flag pattern as `useSessionStore.ts`'s `initSessionListener()` — not the
 * per-screen `createAppStateCoordinator()` pattern, since this has no screen lifecycle to
 * attach to; it lives for the whole app session.
 */
import { Platform } from 'react-native';
import notifee from '@notifee/react-native';
import { requestAndroidNotificationPermission } from './notificationPermission';
import { initBatteryNotifications } from './batteryNotifications';
import { initConnectionNotification } from './connectionNotification';
import { registerNotificationPressNavigation } from './notificationNavigation';

let initialized = false;

export function initBleNotifications(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  void (async () => {
    if (Platform.OS === 'android') {
      await requestAndroidNotificationPermission();
    } else {
      // iOS: notifee's own permission request covers the local low-battery alert. There is
      // no persistent/foreground-service notification to gate on iOS (see
      // `connectionNotification.ts`).
      await notifee.requestPermission();
    }
    initBatteryNotifications();
    initConnectionNotification();
    registerNotificationPressNavigation();
  })();
}

/** Test-only, same reasoning as `useSessionStore.ts`'s `__resetSessionListenerForTests`. */
export function __resetBleNotificationsForTests(): void {
  initialized = false;
}
