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
 *
 * `useH158ConnectionStore.connections` is a map, so this tracks one notification per connected
 * device id rather than a single global one — pairing a second unit no longer makes the first
 * one's notification vanish. The foreground service itself is still registered once and stays
 * alive for as long as any device is connected.
 */
import { Platform } from 'react-native';
import notifee, { AndroidImportance, AndroidCategory } from '@notifee/react-native';
import { useH158ConnectionStore } from '@/features/ble/h158/useH158ConnectionStore';
import { clearBanner, showBanner } from '@/shared/ui/useBannerStore';
import { navigationRef } from '@/app/navigation';

const CONNECTION_CHANNEL_ID = 'h158-connection';
export const CONNECTION_NOTIFICATION_ID = 'h158-connection-notification';

export function connectionNotificationId(deviceId: string): string {
  return `${CONNECTION_NOTIFICATION_ID}-${deviceId}`;
}

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

async function showConnectionNotification(
  deviceId: string,
  deviceName: string | null,
  batteryPercent: number | null,
): Promise<void> {
  await ensureChannel();
  await notifee.displayNotification({
    id: connectionNotificationId(deviceId),
    title: deviceName ?? 'BlueSmoke device',
    body: connectedBody(batteryPercent),
    android: {
      channelId: CONNECTION_CHANNEL_ID,
      importance: AndroidImportance.LOW,
      category: AndroidCategory.SERVICE,
      asForegroundService: true,
      ongoing: true,
      // notifee requires a registered foreground service task to keep the service alive —
      // it never resolves for as long as any connection notification should be shown;
      // `stopConnectionNotification` is what tears it down via `notifee.stopForegroundService()`,
      // called only once the last connected device's notification is cleared.
      pressAction: { id: 'default' },
    },
  });
}

async function clearConnectionNotification(deviceId: string): Promise<void> {
  await notifee.cancelNotification(connectionNotificationId(deviceId));
}

async function stopForegroundService(): Promise<void> {
  await notifee.stopForegroundService();
}

let unsubscribe: (() => void) | null = null;
const shownDeviceIds = new Set<string>();

/**
 * Subscribes to `useH158ConnectionStore` and starts/stops one foreground-service-backed
 * notification per connected device, updating its battery text on every
 * `setH158BatteryPercent`. Call once at app boot (`initBleNotifications.ts`); returns an
 * unsubscribe function for tests. A no-op on iOS.
 */
export function startConnectionNotification(): () => void {
  if (Platform.OS !== 'android') {
    return () => {};
  }
  shownDeviceIds.clear();
  notifee.registerForegroundService(() => new Promise(() => {}));

  return useH158ConnectionStore.subscribe((state) => {
    const connectedIds = new Set(Object.keys(state.connections));

    for (const deviceId of shownDeviceIds) {
      if (!connectedIds.has(deviceId)) {
        shownDeviceIds.delete(deviceId);
        void clearConnectionNotification(deviceId);
        clearBanner(connectionNotificationId(deviceId));
      }
    }

    for (const [deviceId, connection] of Object.entries(state.connections)) {
      shownDeviceIds.add(deviceId);
      void showConnectionNotification(deviceId, connection.device.name, connection.batteryPercent);
      showBanner({
        id: connectionNotificationId(deviceId),
        text: `${connection.device.name ?? 'BlueSmoke device'} — ${connectedBody(connection.batteryPercent)}`,
        onPress: () => {
          if (navigationRef.isReady()) {
            navigationRef.navigate('Home');
          }
        },
      });
    }

    if (shownDeviceIds.size === 0) {
      void stopForegroundService();
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
  shownDeviceIds.clear();
}
