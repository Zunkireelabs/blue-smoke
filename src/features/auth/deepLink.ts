/**
 * P1-1.0 §3.2 — deep-link config for the password-reset email link.
 * Config only, per the brief §2: this app can't be run on a physical
 * device or simulator from this machine, so the actual link-tap → app-open
 * → recovery-session path is wired but unverified.
 *
 * `bluesmoke://reset-password` is a plain custom URL scheme, not a
 * Universal Link / App Link — those need a verified domain serving an
 * `apple-app-site-association` / `assetlinks.json`, which doesn't exist
 * for this project yet and is out of this task's scope. The scheme name
 * itself isn't specified anywhere in the spec; flagged as a reasonable,
 * unverified choice rather than a silently invented one — trivial to
 * rename before this ships.
 *
 * This must also be registered as the `redirectTo` in Supabase Auth's
 * project settings (URL Configuration → Redirect URLs) once P0-3.0 sets
 * up the project, or Supabase will reject it and fall back to its default.
 */
export const RESET_PASSWORD_URL_SCHEME = 'bluesmoke';
export const RESET_PASSWORD_URL_HOST = 'reset-password';

export const RESET_PASSWORD_REDIRECT_URL = `${RESET_PASSWORD_URL_SCHEME}://${RESET_PASSWORD_URL_HOST}`;
