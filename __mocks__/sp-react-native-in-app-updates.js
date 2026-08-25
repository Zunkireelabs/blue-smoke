/**
 * Manual Jest mock for sp-react-native-in-app-updates. Its Android path reaches Google Play
 * Core's native module at call time; on Jest's default iOS-platform resolution it would instead
 * hit the real iTunes lookup HTTP API on every test run. Neither is appropriate for a unit test
 * — same reasoning as `react-native-device-info.js`'s mock. `checkNeedsUpdate` is a `jest.fn()`
 * so individual tests can control `shouldUpdate`/`other` per case; the rest are no-ops.
 */

class SpInAppUpdates {
  constructor() {}
}

SpInAppUpdates.prototype.checkNeedsUpdate = jest.fn(async () => ({ shouldUpdate: false }));
SpInAppUpdates.prototype.startUpdate = jest.fn(async () => {});
SpInAppUpdates.prototype.installUpdate = jest.fn(() => {});
SpInAppUpdates.prototype.addStatusUpdateListener = jest.fn(() => {});
SpInAppUpdates.prototype.removeStatusUpdateListener = jest.fn(() => {});
SpInAppUpdates.prototype.addIntentSelectionListener = jest.fn(() => {});
SpInAppUpdates.prototype.removeIntentSelectionListener = jest.fn(() => {});

module.exports = SpInAppUpdates;
module.exports.default = SpInAppUpdates;
