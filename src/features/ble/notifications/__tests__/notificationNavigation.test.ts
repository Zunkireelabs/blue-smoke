/**
 * `navigateHomeOnNotificationPress` is the pure decision ("was this a press on one of our two
 * notification IDs?") kept separate from notifee so it's testable without a notifee mock, same
 * split as `batteryNotifications.ts`'s `nextBatteryLatchState`. `navigationRef` is faked here as
 * a hand-rolled object rather than the real `createNavigationContainerRef` result, matching the
 * hand-rolled-fake convention already used in this directory (`useH158ConnectionStore`'s
 * `__resetH158ConnectionStoreForTests` helpers).
 */
const mockNavigate = jest.fn();
const mockOpenURL = jest.fn();
let mockIsReady = true;

jest.mock('@/app/navigation', () => ({
  navigationRef: {
    isReady: () => mockIsReady,
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
}));

jest.mock('react-native', () => ({
  Linking: { openURL: (...args: unknown[]) => mockOpenURL(...args) },
}));

import { EventType } from '@notifee/react-native';
import { LOW_BATTERY_NOTIFICATION_ID } from '../batteryNotifications';
import { CONNECTION_NOTIFICATION_ID } from '../connectionNotification';
import { APP_UPDATE_NOTIFICATION_ID } from '@/features/app-update/checkAppUpdate';
import { navigateHomeOnNotificationPress } from '../notificationNavigation';

describe('navigateHomeOnNotificationPress', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockIsReady = true;
  });

  test('navigates to Home on a press of the low-battery notification', () => {
    navigateHomeOnNotificationPress(EventType.PRESS, LOW_BATTERY_NOTIFICATION_ID);
    expect(mockNavigate).toHaveBeenCalledWith('Home');
  });

  test('navigates to Home on a press of the connection notification', () => {
    navigateHomeOnNotificationPress(EventType.PRESS, CONNECTION_NOTIFICATION_ID);
    expect(mockNavigate).toHaveBeenCalledWith('Home');
  });

  test('ignores a non-press event', () => {
    navigateHomeOnNotificationPress(EventType.DISMISSED, LOW_BATTERY_NOTIFICATION_ID);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('ignores a press on an unrelated notification id', () => {
    navigateHomeOnNotificationPress(EventType.PRESS, 'some-other-notification');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('ignores a press with no notification id', () => {
    navigateHomeOnNotificationPress(EventType.PRESS, undefined);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('skips navigation when the container is not yet ready (cold start)', () => {
    mockIsReady = false;
    navigateHomeOnNotificationPress(EventType.PRESS, LOW_BATTERY_NOTIFICATION_ID);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('registerNotificationPressNavigation', () => {
  beforeEach(() => {
    jest.resetModules();
    mockNavigate.mockClear();
    mockOpenURL.mockClear();
    mockIsReady = true;
  });

  test('wires both foreground and background notifee listeners exactly once', () => {
    jest.isolateModules(() => {
      const notifee = require('@notifee/react-native');
      const {
        registerNotificationPressNavigation,
      } = require('../notificationNavigation');

      registerNotificationPressNavigation();
      registerNotificationPressNavigation();

      expect(notifee.onForegroundEvent).toHaveBeenCalledTimes(1);
      expect(notifee.onBackgroundEvent).toHaveBeenCalledTimes(1);
    });
  });

  test('routes a press of the app-update notification to its store URL instead of Home', () => {
    jest.isolateModules(() => {
      const notifee = require('@notifee/react-native');
      const {
        registerNotificationPressNavigation,
      } = require('../notificationNavigation');

      registerNotificationPressNavigation();
      const foregroundHandler = notifee.onForegroundEvent.mock.calls[0][0];

      foregroundHandler({
        type: EventType.PRESS,
        detail: {
          notification: {
            id: APP_UPDATE_NOTIFICATION_ID,
            data: { storeUrl: 'https://example.com/app' },
          },
        },
      });

      expect(mockOpenURL).toHaveBeenCalledWith('https://example.com/app');
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  test('routes a press of the low-battery notification to Home without opening a URL', () => {
    jest.isolateModules(() => {
      const notifee = require('@notifee/react-native');
      const {
        registerNotificationPressNavigation,
      } = require('../notificationNavigation');

      registerNotificationPressNavigation();
      const foregroundHandler = notifee.onForegroundEvent.mock.calls[0][0];

      foregroundHandler({
        type: EventType.PRESS,
        detail: { notification: { id: LOW_BATTERY_NOTIFICATION_ID } },
      });

      expect(mockNavigate).toHaveBeenCalledWith('Home');
      expect(mockOpenURL).not.toHaveBeenCalled();
    });
  });
});
