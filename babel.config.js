module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['.'],
        extensions: ['.ios.ts', '.android.ts', '.ts', '.ios.tsx', '.android.tsx', '.tsx', '.jsx', '.js', '.json'],
        alias: {
          '@': './src',
        },
      },
    ],
    // Stopgap until P0-5.0 lands real per-environment env injection
    // (react-native-config or similar). Inlines process.env.X references at
    // bundle time from whatever env vars are present in the build process —
    // EAS Build's project environment variables land there. Without this,
    // process.env.SUPABASE_URL / PERSONA_TEMPLATE_ID etc. are always
    // undefined at runtime; Metro doesn't do this by default.
    [
      'transform-inline-environment-variables',
      {
        include: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'PERSONA_TEMPLATE_ID', 'PERSONA_ENVIRONMENT'],
      },
    ],
  ],
};
