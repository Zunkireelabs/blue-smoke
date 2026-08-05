module.exports = {
  preset: '@react-native/jest-preset',
  // The default preset only whitelists react-native/@react-native packages
  // for transformation; several of our deps ship untranspiled ESM and need
  // the same treatment.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-.*)/)',
  ],
};
