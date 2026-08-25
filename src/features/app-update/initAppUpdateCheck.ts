/**
 * App-boot-once init for the app-update notice. Same module-level `initialized` flag pattern
 * as `useSessionStore.ts`'s `initSessionListener()` / `initBleNotifications.ts` — this has no
 * screen lifecycle to attach to, it runs once for the whole app session.
 */
import { Linking } from 'react-native';
import notifee, { EventType, type Event } from '@notifee/react-native';
import { checkAppUpdate } from './checkAppUpdate';

let initialized = false;

function handleNotifeeEvent({ type, detail }: Event): void {
  if (type !== EventType.PRESS) {
    return;
  }
  const storeUrl = detail.notification?.data?.storeUrl;
  if (typeof storeUrl === 'string') {
    void Linking.openURL(storeUrl);
  }
}

export function initAppUpdateCheck(): void {
  if (initialized) {
    return;
  }
  initialized = true;

  notifee.onForegroundEvent(handleNotifeeEvent);
  notifee.onBackgroundEvent(async (event) => handleNotifeeEvent(event));

  void checkAppUpdate();
}

/** Test-only, same reasoning as `initBleNotifications.ts`'s `__resetBleNotificationsForTests`. */
export function __resetAppUpdateCheckForTests(): void {
  initialized = false;
}
