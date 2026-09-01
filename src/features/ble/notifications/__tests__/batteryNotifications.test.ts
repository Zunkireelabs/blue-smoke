/**
 * Hysteresis state machine for the low-battery notification — spec §4.4: latch at <15%,
 * clear at 20%, fire once per latch (not on every reading below threshold). `notifee` itself
 * is faked via `__mocks__/@notifee/react-native.js`, same convention as `react-native-persona`'s
 * mock — these tests exercise `nextBatteryLatchState`'s pure decision table plus
 * `startBatteryNotifications`'s subscription wiring, not notifee.
 *
 * `@/app/navigation` is mocked the same way `notificationNavigation.test.ts` mocks it — a
 * hand-rolled `navigationRef` fake, since the real module pulls in the whole screen tree, which
 * a unit test over the battery latch has no reason to import.
 */
const mockNavigate = jest.fn();
jest.mock('@/app/navigation', () => ({
  navigationRef: {
    isReady: () => true,
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
}));

import {
  LOW_BATTERY_CLEAR_PERCENT,
  LOW_BATTERY_LATCH_PERCENT,
  LOW_BATTERY_NOTIFICATION_ID,
  nextBatteryLatchState,
  startBatteryNotifications,
  __resetBatteryNotificationsForTests,
} from '../batteryNotifications';
import {
  setH158Connected,
  setH158BatteryPercent,
  setH158Disconnected,
  __resetH158ConnectionStoreForTests,
} from '../../h158/useH158ConnectionStore';
import { useBannerStore, __resetBannerStoreForTests } from '@/shared/ui/useBannerStore';

const notifee = require('@notifee/react-native');

/**
 * `showLowBatteryNotification`/`clearLowBatteryNotification` are fire-and-forget (`void`d) from
 * the store subscriber, and chain through `ensureChannel()`'s own await before reaching the
 * notifee call under test — so a bare synchronous assertion right after a store update races
 * unresolved microtasks. `setImmediate` runs after the microtask queue drains, same technique
 * as flushing promises elsewhere in this codebase's async tests.
 */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('nextBatteryLatchState', () => {
  test('null reading is a no-op regardless of latch state', () => {
    expect(nextBatteryLatchState({ latched: false }, null)).toEqual({
      state: { latched: false },
      action: 'none',
    });
    expect(nextBatteryLatchState({ latched: true }, null)).toEqual({
      state: { latched: true },
      action: 'none',
    });
  });

  test('crossing below the latch threshold fires "show" exactly once', () => {
    const first = nextBatteryLatchState({ latched: false }, LOW_BATTERY_LATCH_PERCENT - 1);
    expect(first).toEqual({ state: { latched: true }, action: 'show' });

    // Still below threshold on the next reading — already latched, must not re-fire.
    const second = nextBatteryLatchState(first.state, LOW_BATTERY_LATCH_PERCENT - 1);
    expect(second).toEqual({ state: { latched: true }, action: 'none' });
  });

  test('sitting between 15% and 20% while latched neither re-fires nor clears', () => {
    const result = nextBatteryLatchState({ latched: true }, 17);
    expect(result).toEqual({ state: { latched: true }, action: 'none' });
  });

  test('reaching the clear threshold fires "clear" exactly once', () => {
    const first = nextBatteryLatchState({ latched: true }, LOW_BATTERY_CLEAR_PERCENT);
    expect(first).toEqual({ state: { latched: false }, action: 'clear' });

    const second = nextBatteryLatchState(first.state, LOW_BATTERY_CLEAR_PERCENT);
    expect(second).toEqual({ state: { latched: false }, action: 'none' });
  });

  test('not yet latched and above threshold is a no-op', () => {
    expect(nextBatteryLatchState({ latched: false }, 50)).toEqual({
      state: { latched: false },
      action: 'none',
    });
  });
});

describe('startBatteryNotifications — wired to the real store', () => {
  const DEVICE = { id: 'h158-mock-0001', name: 'H158' };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetH158ConnectionStoreForTests();
    __resetBatteryNotificationsForTests();
    __resetBannerStoreForTests();
  });

  test('displays once when battery drops under 15%, cancels once when it recovers to 20%', async () => {
    const unsubscribe = startBatteryNotifications();
    try {
      setH158Connected(DEVICE, {} as never);

      setH158BatteryPercent(30);
      await flush();
      expect(notifee.displayNotification).not.toHaveBeenCalled();

      setH158BatteryPercent(14);
      await flush();
      expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
      expect(useBannerStore.getState().message?.id).toBe(LOW_BATTERY_NOTIFICATION_ID);

      // Still under threshold — must not display again.
      setH158BatteryPercent(10);
      await flush();
      expect(notifee.displayNotification).toHaveBeenCalledTimes(1);

      // Between 15 and 20 — neither displays nor cancels.
      setH158BatteryPercent(18);
      await flush();
      expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
      expect(notifee.cancelNotification).not.toHaveBeenCalled();

      setH158BatteryPercent(20);
      await flush();
      expect(notifee.cancelNotification).toHaveBeenCalledTimes(1);
      expect(useBannerStore.getState().message).toBeNull();

      setH158Disconnected();
    } finally {
      unsubscribe();
    }
  });

  test('tapping the banner clears it and navigates to Home', async () => {
    const unsubscribe = startBatteryNotifications();
    try {
      setH158Connected(DEVICE, {} as never);
      setH158BatteryPercent(14);
      await flush();

      const message = useBannerStore.getState().message;
      expect(message).not.toBeNull();
      // Dismissing on tap is `Banner`'s own job (`Banner.test.tsx`) — this only exercises the
      // module's `onPress`, which is purely the navigate side effect.
      message?.onPress?.();

      expect(mockNavigate).toHaveBeenCalledWith('Home');
    } finally {
      unsubscribe();
    }
  });

  test('unsubscribing stops the latch from reacting to further store updates', async () => {
    const unsubscribe = startBatteryNotifications();
    setH158Connected(DEVICE, {} as never);
    unsubscribe();

    setH158BatteryPercent(5);
    await flush();
    expect(notifee.displayNotification).not.toHaveBeenCalled();
  });
});
