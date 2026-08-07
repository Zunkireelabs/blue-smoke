// Isolated Jest project for the mock peripheral — see brief §8: the RN
// jest-preset assumes a React Native runtime (haste, RN mocks, jsdom-ish
// globals) and fights plain Node test files. This project opts out of it
// entirely: node test environment, its own babel.config.js (not the root
// one), no RN preset.
module.exports = {
  displayName: 'mock-peripheral',
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['babel-jest', { configFile: require.resolve('./babel.config.js') }],
  },
};
