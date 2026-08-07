// Fourth Jest project, alongside 'app', 'mock-peripheral', and 'edge' (see the root
// jest.config.js). This test shells out to `npx eslint` and does real file I/O against the
// repo root — it needs a plain Node environment, not the RN preset, and it lives outside
// `tools/mock-peripheral` and `supabase/functions` because it isn't testing either of those,
// it's testing the root `.eslintrc.js`. Same reasoning as those two configs' own headers.
module.exports = {
  displayName: 'lint-guard',
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['babel-jest', { configFile: require.resolve('./babel.config.js') }],
  },
};
