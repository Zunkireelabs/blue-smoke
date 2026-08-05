const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Mirrors the "@/*" alias declared in tsconfig.json and babel.config.js
    // so the alias resolves the same way for the typechecker, Babel, and Metro.
    extraNodeModules: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
