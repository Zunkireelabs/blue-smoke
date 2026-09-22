/**
 * Jest automock for `react-native-ble-plx`, picked up automatically for a node_modules package
 * by virtue of living in this directory (same as `react-native-permissions.js` beside it).
 *
 * Why it became necessary (2026-09-22): the real `BleManager` constructor reaches straight into
 * the native module — `new NativeEventEmitter(NativeModules.BlePlx)` — which does not exist
 * under Jest and throws `Invariant Violation: 'new NativeEventEmitter()' requires a non-null
 * argument`. `BleClientContext.tsx` already constructs it lazily to avoid that at import time,
 * but `H158AutoReconnect` now mounts in the `home` stack inside its own bare
 * `<BleClientProvider>` (it needs the REAL radio, not the `__DEV__` mock peripheral), so
 * rendering `RootNavigator` in its signed-in state reaches the lazy constructor for real.
 *
 * Deliberately inert rather than clever: every test that exercises BLE behaviour injects its own
 * manager through `<BleClientProvider manager={...}>` or straight into the function under test.
 * Nothing should be asserting against this object — if a test ever needs real manager behaviour
 * it should inject a double explicitly, so the methods here resolve to empty values rather than
 * pretending to be a device.
 */
class BleManager {
  state() {
    return Promise.resolve('Unknown');
  }
  onStateChange() {
    return { remove() {} };
  }
  startDeviceScan() {}
  stopDeviceScan() {}
  connectToDevice() {
    return Promise.reject(new Error('react-native-ble-plx is mocked in tests'));
  }
  isDeviceConnected() {
    return Promise.resolve(false);
  }
  cancelDeviceConnection() {
    return Promise.resolve(undefined);
  }
  destroy() {}
}

module.exports = { BleManager };
