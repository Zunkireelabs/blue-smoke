/**
 * Low-battery OS notification — spec §4.4: "Notify ... on battery crossing the 15%
 * low-battery threshold (with hysteresis: clears at 20%)." That line describes the H158's own
 * BLE notify behaviour on `lockState.flags` bit2, but the H158 transport (`../h158/h158Protocol.ts`)
 * is a different transport that pushes no unsolicited notification at all (reply item 13 —
 * see `h158Session.ts`) — so this module re-implements the same hysteresis in JS, driven by
 * `useH158ConnectionStore`'s `batteryPercent`, which only ever updates on a confirmed
 * `readStatus()` reply.
 *
 * Deliberately a hand-rolled latch, not a flat `<= 15` check re-run on every reading:
 * a flat check re-fires (and re-displays) the notification on every single poll while the
 * battery sits below the threshold, which is the exact bug HomeScreen.tsx's own
 * `LOW_BATTERY_PERCENT = 20` flat check has (out of scope here — see the PR description).
 */
import { Platform } from 'react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { useH158ConnectionStore } from '@/features/ble/h158/useH158ConnectionStore';

export const LOW_BATTERY_LATCH_PERCENT = 15;
export const LOW_BATTERY_CLEAR_PERCENT = 20;

const LOW_BATTERY_CHANNEL_ID = 'h158-low-battery';
export const LOW_BATTERY_NOTIFICATION_ID = 'h158-low-battery-notification';

/**
 * Pure latch/clear decision, kept separate from notifee so the hysteresis logic itself is
 * testable without a notifee mock. `null` (no reading yet, or the device disconnected) is
 * treated as "no change" — never as a battery level, and never as a reason to clear a latch
 * that a real reading set.
 */
export interface BatteryLatchState {
  latched: boolean;
}

export type BatteryLatchAction = 'show' | 'clear' | 'none';

export function nextBatteryLatchState(
  state: BatteryLatchState,
  batteryPercent: number | null,
): { state: BatteryLatchState; action: BatteryLatchAction } {
  if (batteryPercent === null) {
    return { state, action: 'none' };
  }
  if (!state.latched && batteryPercent < LOW_BATTERY_LATCH_PERCENT) {
    return { state: { latched: true }, action: 'show' };
  }
  if (state.latched && batteryPercent >= LOW_BATTERY_CLEAR_PERCENT) {
    return { state: { latched: false }, action: 'clear' };
  }
  return { state, action: 'none' };
}

let latchState: BatteryLatchState = { latched: false };
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

async function showLowBatteryNotification(batteryPercent: number): Promise<void> {
  await ensureChannel();
  await notifee.displayNotification({
    id: LOW_BATTERY_NOTIFICATION_ID,
    title: 'Device battery low',
    body: `Your BlueSmoke device is at ${batteryPercent}%. Charge it soon.`,
    android: {
      channelId: LOW_BATTERY_CHANNEL_ID,
      importance: AndroidImportance.DEFAULT,
      pressAction: { id: 'default' },
    },
  });
}

async function clearLowBatteryNotification(): Promise<void> {
  await notifee.cancelNotification(LOW_BATTERY_NOTIFICATION_ID);
}

/**
 * Subscribes to `useH158ConnectionStore.batteryPercent` and drives the notification off the
 * hysteresis latch above. Call once at app boot (`initBleNotifications.ts`); returns an
 * unsubscribe function for tests.
 */
export function startBatteryNotifications(): () => void {
  latchState = { latched: false };
  return useH158ConnectionStore.subscribe((state) => {
    const { state: nextState, action } = nextBatteryLatchState(latchState, state.batteryPercent);
    latchState = nextState;
    if (action === 'show') {
      void showLowBatteryNotification(state.batteryPercent as number);
    } else if (action === 'clear') {
      void clearLowBatteryNotification();
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
  latchState = { latched: false };
}
