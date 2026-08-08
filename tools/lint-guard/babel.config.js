// Deliberately NOT the root babel.config.js (module:@react-native/babel-preset) — same
// reasoning as tools/mock-peripheral/babel.config.js and supabase/functions/babel.config.js.
// This test runs in plain Node and only needs TypeScript types stripped.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  plugins: ['@babel/plugin-transform-typescript'],
};
