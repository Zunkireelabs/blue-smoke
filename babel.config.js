const fs = require('fs');
const path = require('path');

/**
 * Loads `.env` into `process.env` so the inline-env plugin below can see it.
 *
 * Without this, `.env.example`'s own instruction — "Copy this to .env for local development" —
 * DOES NOT WORK. `transform-inline-environment-variables` reads the SHELL ENVIRONMENT of the
 * build process, and nothing else in this repo loads `.env` into it. Verified by running the
 * plugin directly:
 *
 *   with shell env :  const u = "https://…supabase.co";
 *   without        :  const u = undefined;            ← what a .env file alone produced
 *
 * The failure is quiet and misleading rather than loud: `getSupabaseClient()` throws,
 * `initSessionListener` catches it and sets status `signedOut`, so the app renders the auth
 * stack and looks healthy while every signup and login fails, with one `console.warn` as the
 * only clue.
 *
 * Shell and CI values WIN — a variable already in `process.env` is never overwritten. So
 * `SUPABASE_URL=… npm run ios` still overrides the file, and EAS Build (which puts its project
 * env vars in the process environment) is unaffected.
 *
 * Hand-parsed rather than adding `dotenv`: `package.json` is a contested shared file
 * (CLAUDE.md) and a new dependency plus lockfile churn is a poor trade for ~12 lines. This
 * remains a stopgap — P0-5.0 replaces it with real per-environment injection.
 */
function loadDotEnv() {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    '@babel/plugin-transform-export-namespace-from',
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
