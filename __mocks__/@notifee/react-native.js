/**
 * Manual Jest mock for @notifee/react-native. The real module reaches for native modules at
 * import time and has no Jest-safe default export, same problem `react-native-persona.js`'s
 * mock docblock describes. `createChannel`/`displayNotification`/`cancelNotification`/
 * `stopForegroundService`/`registerForegroundService`/`requestPermission` are all no-ops
 * here — the hysteresis/subscription logic in `batteryNotifications.ts` and
 * `connectionNotification.ts` is what their tests exercise, not notifee itself.
 */

const AndroidImportance = {
  NONE: 0,
  MIN: 1,
  LOW: 2,
  DEFAULT: 3,
  HIGH: 4,
};

const AndroidCategory = {
  SERVICE: 'service',
};

const EventType = {
  DISMISSED: 0,
  PRESS: 1,
  ACTION_PRESS: 2,
  DELIVERED: 3,
  APP_BLOCKED: 4,
  CHANNEL_BLOCKED: 5,
  TRIGGER_NOTIFICATION_CREATED: 6,
  CHANNEL_GROUP_BLOCKED: 7,
  FG_ALREADY_EXIST: 8,
};

const notifee = {
  createChannel: jest.fn(async () => 'mock-channel'),
  displayNotification: jest.fn(async () => 'mock-notification-id'),
  cancelNotification: jest.fn(async () => {}),
  stopForegroundService: jest.fn(async () => {}),
  registerForegroundService: jest.fn(() => {}),
  requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
  onForegroundEvent: jest.fn(() => () => {}),
  onBackgroundEvent: jest.fn(() => {}),
};

module.exports = notifee;
module.exports.default = notifee;
module.exports.AndroidImportance = AndroidImportance;
module.exports.AndroidCategory = AndroidCategory;
module.exports.EventType = EventType;
