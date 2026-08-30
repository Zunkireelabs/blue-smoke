/**
 * Routes a tap on either OS notification built on this branch — the low-battery alert
 * (`batteryNotifications.ts`) and the persistent connected-device notice
 * (`connectionNotification.ts`) — to Home, since that's already where the connected-device
 * card, lock/unlock, and battery surface. A single shared handler covers both notification IDs
 * rather than two separate registrations: notifee only supports one `onBackgroundEvent`
 * handler app-wide, and there is already a second one on `feature/app-update-notification`
 * (`initAppUpdateCheck.ts`) — whoever reconciles that merge needs to combine both handlers into
 * one registration, not just pick one. Flagging here again, and in the PR description.
 *
 * Press events fire outside the React tree, so this navigates via `navigationRef`
 * (`../../../app/navigation.tsx`), not `useNavigation()`. `isReady()` guards a press landing
 * before `<NavigationContainer>` has mounted — a cold start from a killed state.
 */
import notifee, { EventType } from '@notifee/react-native';
import { navigationRef } from '@/app/navigation';
import { LOW_BATTERY_NOTIFICATION_ID } from './batteryNotifications';
import { CONNECTION_NOTIFICATION_ID } from './connectionNotification';

const HOME_ROUTED_NOTIFICATION_IDS: ReadonlySet<string> = new Set([
  LOW_BATTERY_NOTIFICATION_ID,
  CONNECTION_NOTIFICATION_ID,
]);

export function navigateHomeOnNotificationPress(
  type: number,
  notificationId: string | undefined,
): void {
  if (type !== EventType.PRESS) {
    return;
  }
  if (!notificationId || !HOME_ROUTED_NOTIFICATION_IDS.has(notificationId)) {
    return;
  }
  if (navigationRef.isReady()) {
    navigationRef.navigate('Home');
  }
}

let registered = false;

/**
 * Wires both the foreground and background notifee press listeners. Call once at app boot
 * (`initBleNotifications.ts`). Foreground events cover a press while the app is already open;
 * background events cover a press that brings a backgrounded or killed app forward.
 */
export function registerNotificationPressNavigation(): void {
  if (registered) {
    return;
  }
  registered = true;

  notifee.onForegroundEvent(({ type, detail }) => {
    navigateHomeOnNotificationPress(type, detail.notification?.id);
  });
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    navigateHomeOnNotificationPress(type, detail.notification?.id);
  });
}

/** Test-only — same reasoning as `initBleNotifications.ts`'s `__resetBleNotificationsForTests`. */
export function __resetNotificationPressNavigationForTests(): void {
  registered = false;
}
