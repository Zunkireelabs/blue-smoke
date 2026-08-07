// Deliberately NOT the root babel.config.js. That one loads
// module:@react-native/babel-preset and the module-resolver '@' alias, both of which assume a
// React Native bundle; Edge Functions are Deno and their tests run in plain Node. Same
// reasoning as tools/mock-peripheral/babel.config.js.
//
// Minimal and isolated: strip TypeScript types, target the current Node, nothing else.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  plugins: ['@babel/plugin-transform-typescript'],
};
