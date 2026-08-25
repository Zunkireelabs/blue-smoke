/**
 * `resolveStoreUrl`'s pure per-platform extraction, plus `checkAppUpdate`'s wiring into
 * notifee. `sp-react-native-in-app-updates` and `@notifee/react-native` are both faked via
 * root `__mocks__/`, same convention as `batteryNotifications.test.ts` — these tests exercise
 * this module's own logic, not the vendor libraries.
 */
import { Platform } from 'react-native';
import {
  APP_UPDATE_NOTIFICATION_ID,
  checkAppUpdate,
  resolveStoreUrl,
} from '../checkAppUpdate';

const notifee = require('@notifee/react-native');
const SpInAppUpdates = require('sp-react-native-in-app-updates');

describe('resolveStoreUrl', () => {
  afterEach(() => {
    Platform.OS = 'ios';
  });

  test('no-op when the installed build is already current', () => {
    expect(resolveStoreUrl({ shouldUpdate: false } as never)).toBeNull();
  });

  test('android: builds a Play Store URL from the package name', () => {
    Platform.OS = 'android';
    expect(
      resolveStoreUrl({
        shouldUpdate: true,
        other: { packageName: 'com.zunkireelabs.bluesmoke' },
      } as never),
    ).toBe('https://play.google.com/store/apps/details?id=com.zunkireelabs.bluesmoke');
  });

  test('android: null when the response has no package name', () => {
    Platform.OS = 'android';
    expect(resolveStoreUrl({ shouldUpdate: true, other: {} } as never)).toBeNull();
  });

  test('ios: uses the iTunes lookup trackViewUrl directly', () => {
    Platform.OS = 'ios';
    expect(
      resolveStoreUrl({
        shouldUpdate: true,
        other: { trackViewUrl: 'https://apps.apple.com/app/id123' },
      } as never),
    ).toBe('https://apps.apple.com/app/id123');
  });

  test('ios: null when the response has no trackViewUrl', () => {
    Platform.OS = 'ios';
    expect(resolveStoreUrl({ shouldUpdate: true, other: {} } as never)).toBeNull();
  });
});

describe('checkAppUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
  });

  test('displays the notification when a newer build is listed', async () => {
    SpInAppUpdates.prototype.checkNeedsUpdate.mockResolvedValueOnce({
      shouldUpdate: true,
      other: { trackViewUrl: 'https://apps.apple.com/app/id123' },
    });

    await checkAppUpdate();

    expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
    const call = notifee.displayNotification.mock.calls[0][0];
    expect(call.id).toBe(APP_UPDATE_NOTIFICATION_ID);
    expect(call.data).toEqual({ storeUrl: 'https://apps.apple.com/app/id123' });
  });

  test('no-op when already current', async () => {
    SpInAppUpdates.prototype.checkNeedsUpdate.mockResolvedValueOnce({ shouldUpdate: false });

    await checkAppUpdate();

    expect(notifee.displayNotification).not.toHaveBeenCalled();
  });

  test('no-op when a newer build is listed but no store URL could be resolved', async () => {
    SpInAppUpdates.prototype.checkNeedsUpdate.mockResolvedValueOnce({
      shouldUpdate: true,
      other: {},
    });

    await checkAppUpdate();

    expect(notifee.displayNotification).not.toHaveBeenCalled();
  });
});
