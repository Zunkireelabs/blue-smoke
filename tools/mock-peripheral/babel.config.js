// Deliberately NOT the root babel.config.js (module:@react-native/babel-preset).
// The RN preset assumes a React Native runtime and fights plain Node test
// files under tools/ — see brief §8. This is a minimal, isolated config:
// strip TypeScript types, target the current Node, nothing else.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  plugins: ['@babel/plugin-transform-typescript'],
};
