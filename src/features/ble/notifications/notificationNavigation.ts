/**
 * Routes a tap on any OS notification this app displays to its destination. notifee only
 * supports one `onForegroundEvent`/`onBackgroundEvent` registration app-wide, so this is the
 * single shared handler for all of them, dispatching by notification id: the low-battery alert
 * (`batteryNotifications.ts`) and the persistent connected-device notice
 * (`connectionNotification.ts`) go to Home, since that's already where the connected-device
 * card, lock/unlock, and battery surface; the app-update notice
 * (`@/features/app-update/checkAppUpdate.ts`) opens the store URL instead. Call
 * `registerNotificationPressNavigation()` once at app boot (`initBleNotifications.ts`) — do not
 * add another `notifee.onForegroundEvent`/`onBackgroundEvent` registration elsewhere, it will
 * silently replace this one.
 *
 * Press events fire outside the React tree, so this navigates via `navigationRef`
 * (`../../../app/navigation.tsx`), not `useNavigation()`. `isReady()` guards a press landing
 * before `<NavigationContainer>` has mounted — a cold start from a killed state.
 */
import { Linking } from 'react-native';
import notifee, { EventType, type Event } from '@notifee/react-native';
import { navigationRef } from '@/app/navigation';
import { LOW_BATTERY_NOTIFICATION_ID } from './batteryNotifications';
import { CONNECTION_NOTIFICATION_ID } from './connectionNotification';
import { APP_UPDATE_NOTIFICATION_ID } from '@/features/app-update/checkAppUpdate';

const HOME_ROUTED_NOTIFICATION_ID_PREFIXES: readonly string[] = [
  LOW_BATTERY_NOTIFICATION_ID,
  CONNECTION_NOTIFICATION_ID,
];

/**
 * Battery/connection notification ids now carry a per-device suffix (multi-device
 * `useH158ConnectionStore`), so this matches by prefix rather than exact id.
 */
function isHomeRoutedNotificationId(notificationId: string): boolean {
  return HOME_ROUTED_NOTIFICATION_ID_PREFIXES.some(prefix => notificationId.startsWith(prefix));
}

export function navigateHomeOnNotificationPress(
  type: number,
  notificationId: string | undefined,
): void {
  if (type !== EventType.PRESS) {
    return;
  }
  if (!notificationId || !isHomeRoutedNotificationId(notificationId)) {
    return;
  }
  if (navigationRef.isReady()) {
    navigationRef.navigate('Home');
  }
}

function openAppUpdateStoreUrlOnPress(type: number, event: Event): void {
  if (type !== EventType.PRESS) {
    return;
  }
  if (event.detail.notification?.id !== APP_UPDATE_NOTIFICATION_ID) {
    return;
  }
  const storeUrl = event.detail.notification?.data?.storeUrl;
  if (typeof storeUrl === 'string') {
    void Linking.openURL(storeUrl);
  }
}

function handleNotificationPress(event: Event): void {
  const { type, detail } = event;
  navigateHomeOnNotificationPress(type, detail.notification?.id);
  openAppUpdateStoreUrlOnPress(type, event);
}

let registered = false;

/**
 * Wires the single app-wide foreground and background notifee press listeners covering every
 * notification this app displays. Call once at app boot (`initBleNotifications.ts`). Foreground
 * events cover a press while the app is already open; background events cover a press that
 * brings a backgrounded or killed app forward.
 */
export function registerNotificationPressNavigation(): void {
  if (registered) {
    return;
  }
  registered = true;

  notifee.onForegroundEvent(handleNotificationPress);
  notifee.onBackgroundEvent(async event => handleNotificationPress(event));
}

/** Test-only — same reasoning as `initBleNotifications.ts`'s `__resetBleNotificationsForTests`. */
export function __resetNotificationPressNavigationForTests(): void {
  registered = false;
}
