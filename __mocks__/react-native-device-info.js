/**
 * Manual Jest mock for react-native-device-info. The real module reaches
 * `TurboModuleRegistry`/`NativeModules` at import time, same problem
 * `react-native-permissions.js`'s mock docblock describes — and the same reason it's needed
 * here even for tests that never touch `checkAppUpdate.ts`: `App.tsx`'s static import chain
 * reaches `initAppUpdateCheck.ts` -> `checkAppUpdate.ts` -> this module.
 */

const DeviceInfo = {
  getVersion: jest.fn(() => '1.0'),
};

module.exports = DeviceInfo;
module.exports.default = DeviceInfo;
