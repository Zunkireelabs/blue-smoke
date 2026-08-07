// Three projects: the RN app, tools/mock-peripheral, and supabase/functions — the latter
// two are plain Node with no RN runtime, each with its own jest.config.js explaining why it
// can't share the RN preset.
module.exports = {
  projects: [
    {
      displayName: 'app',
      preset: '@react-native/jest-preset',
      // The default preset only whitelists react-native/@react-native packages
      // for transformation; several of our deps ship untranspiled ESM and need
      // the same treatment.
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-.*)/)',
      ],
      testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/tools/',
        '<rootDir>/supabase/',
      ],
    },
    '<rootDir>/tools/mock-peripheral/jest.config.js',
    '<rootDir>/supabase/functions/jest.config.js',
  ],
};
