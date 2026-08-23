// Four projects: the RN app, tools/mock-peripheral, supabase/functions, and
// tools/lint-guard — the latter three are plain Node with no RN runtime, each with its own
// jest.config.js explaining why it can't share the RN preset.
module.exports = {
  projects: [
    {
      displayName: 'app',
      preset: '@react-native/jest-preset',
      // The default preset only whitelists react-native/@react-native packages
      // for transformation; several of our deps ship untranspiled ESM and need
      // the same treatment.
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-.*|@noble/.*)/)',
      ],
      testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/tools/',
        '<rootDir>/supabase/',
      ],
      // Fails the test that produced it on any unexpected console.error — see
      // docs/execution-briefs/UI-BUILD-E-console-error-guard.md.
      setupFilesAfterEnv: [require.resolve('./tools/jest/failOnConsoleError.js')],
    },
    '<rootDir>/tools/mock-peripheral/jest.config.js',
    '<rootDir>/supabase/functions/jest.config.js',
    '<rootDir>/tools/lint-guard/jest.config.js',
  ],
};
