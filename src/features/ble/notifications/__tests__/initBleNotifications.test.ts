/**
 * Init-idempotency — same contract `useSessionStore.test.ts` verifies for
 * `initSessionListener()`: calling the boot-time init more than once (React StrictMode's double
 * effect, or a second screen mounting `App` in a test) must not attach a second subscription.
 * `batteryNotifications`/`connectionNotification` are jest.mock'd here so the assertion is
 * "each subscriber wired exactly once," independent of notifee or store timing.
 */
jest.mock('../batteryNotifications', () => ({
  initBatteryNotifications: jest.fn(),
}));
jest.mock('../connectionNotification', () => ({
  initConnectionNotification: jest.fn(),
}));

import { initBatteryNotifications } from '../batteryNotifications';
import { initConnectionNotification } from '../connectionNotification';
import { initBleNotifications, __resetBleNotificationsForTests } from '../initBleNotifications';

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('initBleNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetBleNotificationsForTests();
  });

  test('calling twice only wires the subscribers once', async () => {
    initBleNotifications();
    initBleNotifications();
    await flush();

    expect(initBatteryNotifications).toHaveBeenCalledTimes(1);
    expect(initConnectionNotification).toHaveBeenCalledTimes(1);
  });

  test('a fresh call after the test-only reset wires again', async () => {
    initBleNotifications();
    await flush();
    __resetBleNotificationsForTests();

    initBleNotifications();
    await flush();

    expect(initBatteryNotifications).toHaveBeenCalledTimes(2);
  });
});
