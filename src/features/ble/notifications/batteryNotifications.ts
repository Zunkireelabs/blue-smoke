/**
 * Low-battery OS notification — spec §4.4: "Notify ... on battery crossing the 15%
 * low-battery threshold (with hysteresis: clears at 20%)." That line describes the H158's own
 * BLE notify behaviour on `lockState.flags` bit2, but the H158 transport (`../h158/h158Protocol.ts`)
 * is a different transport that pushes no unsolicited notification at all (reply item 13 —
 * see `h158Session.ts`) — so `useH158ConnectionStore`'s `setH158BatteryPercent` already
 * re-implements the same 15%/20% hysteresis per connection (`applyLowBatteryHysteresis`) and
 * exposes the result as each connection's `lowBattery` field. This module only watches that
 * field's true/false *transitions*, per device id — the connections map (post multi-device
 * store) may hold several devices at once, each needing its own latch and its own notification,
 * since one `notifee.cancelNotification` id can't stand for two different devices' batteries.
 *
 * `nextBatteryLatchState` stays as the pure show/clear/none decision table so it's testable in
 * isolation without a store — driven here by `lowBattery ?? false` rather than recomputing the
 * hysteresis a second time from `batteryPercent` (the store already did that once).
 */
import { Platform } from 'react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { useH158ConnectionStore } from '@/features/ble/h158/useH158ConnectionStore';
import { clearBanner, showBanner } from '@/shared/ui/useBannerStore';
import { navigationRef } from '@/app/navigation';

const LOW_BATTERY_CHANNEL_ID = 'h158-low-battery';
export const LOW_BATTERY_NOTIFICATION_ID = 'h158-low-battery-notification';

export function lowBatteryNotificationId(deviceId: string): string {
  return `${LOW_BATTERY_NOTIFICATION_ID}-${deviceId}`;
}

export interface BatteryLatchState {
  latched: boolean;
}

export type BatteryLatchAction = 'show' | 'clear' | 'none';

/** Pure show/clear/none decision from the store's own `lowBattery` flag (`null` = no reading yet). */
export function nextBatteryLatchState(
  state: BatteryLatchState,
  lowBattery: boolean | null,
): { state: BatteryLatchState; action: BatteryLatchAction } {
  if (lowBattery === null) {
    return { state, action: 'none' };
  }
  if (!state.latched && lowBattery) {
    return { state: { latched: true }, action: 'show' };
  }
  if (state.latched && !lowBattery) {
    return { state: { latched: false }, action: 'clear' };
  }
  return { state, action: 'none' };
}

const latchStates = new Map<string, BatteryLatchState>();
let unsubscribe: (() => void) | null = null;

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await notifee.createChannel({
    id: LOW_BATTERY_CHANNEL_ID,
    name: 'Low battery',
    importance: AndroidImportance.DEFAULT,
  });
}

async function showLowBatteryNotification(deviceId: string, batteryPercent: number): Promise<void> {
  await ensureChannel();
  await notifee.displayNotification({
    id: lowBatteryNotificationId(deviceId),
    title: 'Device battery low',
    body: `Your BlueSmoke device is at ${batteryPercent}%. Charge it soon.`,
    android: {
      channelId: LOW_BATTERY_CHANNEL_ID,
      importance: AndroidImportance.DEFAULT,
      pressAction: { id: 'default' },
    },
  });
}

async function clearLowBatteryNotification(deviceId: string): Promise<void> {
  await notifee.cancelNotification(lowBatteryNotificationId(deviceId));
}

/**
 * Subscribes to `useH158ConnectionStore.connections` and drives one hysteresis latch per
 * connected device off each connection's `lowBattery` field. Call once at app boot
 * (`initBleNotifications.ts`); returns an unsubscribe function for tests.
 */
export function startBatteryNotifications(): () => void {
  latchStates.clear();
  return useH158ConnectionStore.subscribe((state) => {
    const connectedIds = new Set(Object.keys(state.connections));

    for (const deviceId of latchStates.keys()) {
      if (!connectedIds.has(deviceId)) {
        latchStates.delete(deviceId);
        void clearLowBatteryNotification(deviceId);
        clearBanner(lowBatteryNotificationId(deviceId));
      }
    }

    for (const [deviceId, connection] of Object.entries(state.connections)) {
      const previous = latchStates.get(deviceId) ?? { latched: false };
      const { state: nextState, action } = nextBatteryLatchState(previous, connection.lowBattery);
      latchStates.set(deviceId, nextState);

      if (action === 'show') {
        const batteryPercent = connection.batteryPercent as number;
        void showLowBatteryNotification(deviceId, batteryPercent);
        showBanner({
          id: lowBatteryNotificationId(deviceId),
          text: `Device battery low — ${batteryPercent}%. Charge it soon.`,
          onPress: () => {
            if (navigationRef.isReady()) {
              navigationRef.navigate('Home');
            }
          },
        });
      } else if (action === 'clear') {
        void clearLowBatteryNotification(deviceId);
        clearBanner(lowBatteryNotificationId(deviceId));
      }
    }
  });
}

export function initBatteryNotifications(): void {
  if (unsubscribe) {
    return;
  }
  unsubscribe = startBatteryNotifications();
}

/** Test-only — same reasoning as `useH158ConnectionStore.ts`'s `__resetH158ConnectionStoreForTests`. */
export function __resetBatteryNotificationsForTests(): void {
  unsubscribe?.();
  unsubscribe = null;
  latchStates.clear();
}
