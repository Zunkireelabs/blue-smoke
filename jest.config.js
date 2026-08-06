// Two projects: the RN app, and tools/mock-peripheral (plain Node, no RN
// runtime — see tools/mock-peripheral/jest.config.js for why it can't share
// the RN preset).
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
      testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/tools/'],
    },
    '<rootDir>/tools/mock-peripheral/jest.config.js',
  ],
};
