/**
 * Android-only ongoing "device connected" notification, backed by a notifee
 * foreground service (`android:foregroundServiceType="connectedDevice"` —
 * `AndroidManifest.xml`). This is the OS-notification-bar half of the P1-7.0 TODO item
 * ("Android: foreground service (type connectedDevice) with a clear persistent
 * notification") — the rest of that item (reconnect/background-BLE-survival) is
 * `feature/P1-7.0-connection-lifecycle`'s, not this branch's; see the PR description for the
 * coordination note.
 *
 * iOS has no equivalent "ongoing/ambient" notification concept — there is deliberately no
 * iOS branch here, only a `Platform.OS === 'android'` guard, same honesty CLAUDE.md asks of
 * force-quit behaviour: don't claim parity that doesn't exist.
 */
import { Platform } from 'react-native';
import notifee, { AndroidImportance, AndroidCategory } from '@notifee/react-native';
import { useH158ConnectionStore } from '@/features/ble/h158/useH158ConnectionStore';

const CONNECTION_CHANNEL_ID = 'h158-connection';
export const CONNECTION_NOTIFICATION_ID = 'h158-connection-notification';

function connectedBody(batteryPercent: number | null): string {
  return batteryPercent === null ? 'Connected' : `Connected · Battery ${batteryPercent}%`;
}

async function ensureChannel(): Promise<void> {
  await notifee.createChannel({
    id: CONNECTION_CHANNEL_ID,
    name: 'Device connection',
    importance: AndroidImportance.LOW,
  });
}

async function showConnectionNotification(deviceName: string | null, batteryPercent: number | null): Promise<void> {
  await ensureChannel();
  await notifee.displayNotification({
    id: CONNECTION_NOTIFICATION_ID,
    title: deviceName ?? 'BlueSmoke device',
    body: connectedBody(batteryPercent),
    android: {
      channelId: CONNECTION_CHANNEL_ID,
      importance: AndroidImportance.LOW,
      category: AndroidCategory.SERVICE,
      asForegroundService: true,
      ongoing: true,
      // notifee requires a registered foreground service task to keep the service alive —
      // it never resolves for as long as the connection notification should be shown;
      // `stopConnectionNotification` is what tears it down via `notifee.stopForegroundService()`.
      pressAction: { id: 'default' },
    },
  });
}

async function stopConnectionNotification(): Promise<void> {
  await notifee.stopForegroundService();
  await notifee.cancelNotification(CONNECTION_NOTIFICATION_ID);
}

let unsubscribe: (() => void) | null = null;
let shown = false;

/**
 * Subscribes to `useH158ConnectionStore` and starts/stops the foreground-service-backed
 * notification on connect/disconnect, updating its battery text on every
 * `setH158BatteryPercent`. Call once at app boot (`initBleNotifications.ts`); returns an
 * unsubscribe function for tests. A no-op on iOS.
 */
export function startConnectionNotification(): () => void {
  if (Platform.OS !== 'android') {
    return () => {};
  }
  shown = false;
  notifee.registerForegroundService(() => new Promise(() => {}));

  return useH158ConnectionStore.subscribe((state) => {
    if (state.device) {
      shown = true;
      void showConnectionNotification(state.device.name, state.batteryPercent);
    } else if (shown) {
      shown = false;
      void stopConnectionNotification();
    }
  });
}

export function initConnectionNotification(): void {
  if (unsubscribe) {
    return;
  }
  unsubscribe = startConnectionNotification();
}

/** Test-only — same reasoning as `useH158ConnectionStore.ts`'s `__resetH158ConnectionStoreForTests`. */
export function __resetConnectionNotificationForTests(): void {
  unsubscribe?.();
  unsubscribe = null;
  shown = false;
}
