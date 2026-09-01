/**
 * App-boot-once init for the app-update notice. Same module-level `initialized` flag pattern
 * as `useSessionStore.ts`'s `initSessionListener()` / `initBleNotifications.ts` — this has no
 * screen lifecycle to attach to, it runs once for the whole app session.
 *
 * The notifee press handler for this notification (opening the store URL) lives in
 * `@/features/ble/notifications/notificationNavigation.ts` alongside every other notification's
 * press handler — notifee only supports one app-wide `onForegroundEvent`/`onBackgroundEvent`
 * registration, so it is not duplicated here.
 */
import { checkAppUpdate } from './checkAppUpdate';

let initialized = false;

export function initAppUpdateCheck(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  void checkAppUpdate();
}

/** Test-only, same reasoning as `initBleNotifications.ts`'s `__resetBleNotificationsForTests`. */
export function __resetAppUpdateCheckForTests(): void {
  initialized = false;
}
