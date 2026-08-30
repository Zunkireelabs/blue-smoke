/**
 * `navigateHomeOnNotificationPress` is the pure decision ("was this a press on one of our two
 * notification IDs?") kept separate from notifee so it's testable without a notifee mock, same
 * split as `batteryNotifications.ts`'s `nextBatteryLatchState`. `navigationRef` is faked here as
 * a hand-rolled object rather than the real `createNavigationContainerRef` result, matching the
 * hand-rolled-fake convention already used in this directory (`useH158ConnectionStore`'s
 * `__resetH158ConnectionStoreForTests` helpers).
 */
const mockNavigate = jest.fn();
let mockIsReady = true;

jest.mock('@/app/navigation', () => ({
  navigationRef: {
    isReady: () => mockIsReady,
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
}));

import { EventType } from '@notifee/react-native';
import { LOW_BATTERY_NOTIFICATION_ID } from '../batteryNotifications';
import { CONNECTION_NOTIFICATION_ID } from '../connectionNotification';
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
});
