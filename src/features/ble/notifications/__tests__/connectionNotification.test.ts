/**
 * `connectionNotification.ts` previously had no dedicated suite — added alongside the in-app
 * banner wiring so both the notifee foreground-service notification and the banner are covered
 * together. `@/app/navigation` is mocked the same way `batteryNotifications.test.ts` and
 * `notificationNavigation.test.ts` mock it — a hand-rolled `navigationRef` fake, since the real
 * module pulls in the whole screen tree.
 */
const mockNavigate = jest.fn();
jest.mock('@/app/navigation', () => ({
  navigationRef: {
    isReady: () => true,
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
}));

import { Platform } from 'react-native';
import {
  connectionNotificationId,
  startConnectionNotification,
  __resetConnectionNotificationForTests,
} from '../connectionNotification';
import {
  setH158Connected,
  setH158BatteryPercent,
  setH158Disconnected,
  __resetH158ConnectionStoreForTests,
} from '../../h158/useH158ConnectionStore';
import { useBannerStore, __resetBannerStoreForTests } from '@/shared/ui/useBannerStore';

const notifee = require('@notifee/react-native');

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('startConnectionNotification — banner wiring (Android)', () => {
  const DEVICE = { id: 'h158-mock-0001', name: 'H158' };
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    Platform.OS = 'android';
    __resetH158ConnectionStoreForTests();
    __resetConnectionNotificationForTests();
    __resetBannerStoreForTests();
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  test('shows a banner on connect, clears it on disconnect', async () => {
    const unsubscribe = startConnectionNotification();
    try {
      setH158Connected(DEVICE, {} as never);
      await flush();

      expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
      expect(useBannerStore.getState().message?.id).toBe(connectionNotificationId(DEVICE.id));
      expect(useBannerStore.getState().message?.text).toContain('H158');

      setH158Disconnected(DEVICE.id);
      await flush();

      expect(useBannerStore.getState().message).toBeNull();
    } finally {
      unsubscribe();
    }
  });

  test('battery updates while connected refresh the banner text', async () => {
    const unsubscribe = startConnectionNotification();
    try {
      setH158Connected(DEVICE, {} as never);
      await flush();

      setH158BatteryPercent(DEVICE.id, 42);
      await flush();

      expect(useBannerStore.getState().message?.text).toContain('42%');
    } finally {
      unsubscribe();
    }
  });

  test('tapping the connection banner clears it and navigates to Home', async () => {
    const unsubscribe = startConnectionNotification();
    try {
      setH158Connected(DEVICE, {} as never);
      await flush();

      const message = useBannerStore.getState().message;
      // Dismissing on tap is `Banner`'s own job (`Banner.test.tsx`) — this only exercises the
      // module's `onPress`, which is purely the navigate side effect.
      message?.onPress?.();

      expect(mockNavigate).toHaveBeenCalledWith('Home');
    } finally {
      unsubscribe();
    }
  });
});
