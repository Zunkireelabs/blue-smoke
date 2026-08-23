// Third jest project, alongside 'app' and 'mock-peripheral' (see the root jest.config.js).
//
// Edge Functions are Deno, not React Native: they must not load the RN preset, and their
// tests run in plain Node, where Web Crypto is a global (Node 18+). Only the
// runtime-agnostic modules under _shared/ are tested here — the index.ts entrypoints import
// Deno URL/JSR specifiers that Node cannot resolve, and are exercised against the real
// runtime via `supabase functions serve`.
module.exports = {
  displayName: 'edge',
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['babel-jest', { configFile: require.resolve('./babel.config.js') }],
  },
  // Fails the test that produced it on any unexpected console.error — see
  // docs/execution-briefs/UI-BUILD-E-console-error-guard.md.
  setupFilesAfterEnv: [require.resolve('../../tools/jest/failOnConsoleError.js')],
};
