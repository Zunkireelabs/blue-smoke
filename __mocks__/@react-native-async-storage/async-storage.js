/**
 * Manual Jest mock for @react-native-async-storage/async-storage, mirroring
 * __mocks__/react-native-persona.js: the real module reaches a native module at import time,
 * which doesn't exist under Jest. An in-memory Map is enough for what this project's storage
 * wrapper (src/features/onboarding/onboardingStorage.ts) actually calls.
 */

let store = new Map();

module.exports = {
  getItem: jest.fn((key) => Promise.resolve(store.has(key) ? store.get(key) : null)),
  setItem: jest.fn((key, value) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  removeItem: jest.fn((key) => {
    store.delete(key);
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    store.clear();
    return Promise.resolve();
  }),
  __resetMockStorage: () => {
    store = new Map();
  },
};
