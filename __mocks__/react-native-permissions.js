/**
 * Manual Jest mock for react-native-permissions. The real module reaches
 * TurboModuleRegistry.getEnforcing('RNPermissions') at import time (its
 * methods.ios.ts), which requires a linked native module and throws under
 * Jest/Node — there is no device. Same reason __mocks__/react-native-persona.js
 * exists: App.tsx's static import chain (navigation.tsx -> PairDeviceScreen.tsx)
 * reaches this module even in tests that never touch a BLE permission.
 *
 * Individual test files that need to control a specific outcome (permissions.test.ts,
 * PairDeviceScreen.test.tsx) use jest.mock() with their own factory, which
 * takes precedence over this one.
 */

const PERMISSIONS = {
  ANDROID: {
    BLUETOOTH_SCAN: 'android.permission.BLUETOOTH_SCAN',
    BLUETOOTH_CONNECT: 'android.permission.BLUETOOTH_CONNECT',
    ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
  },
  IOS: {
    BLUETOOTH: 'ios.permission.BLUETOOTH',
  },
};

const RESULTS = {
  UNAVAILABLE: 'unavailable',
  BLOCKED: 'blocked',
  DENIED: 'denied',
  GRANTED: 'granted',
  LIMITED: 'limited',
};

module.exports = {
  PERMISSIONS,
  RESULTS,
  requestMultiple: async () => ({}),
  openSettings: async () => undefined,
};
