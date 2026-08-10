/**
 * What the user signed in with, rendered for display.
 *
 * Lives in `shared/lib` rather than in either feature because both `devices/HomeScreen` and
 * `profile/ProfileScreen` show it, and a `devices → profile` import would couple two features
 * that have nothing else to say to each other.
 *
 * ── The bug this exists to prevent ────────────────────────────────────────────────────
 *
 * The obvious spelling, `email ?? 'Signed in'`, is wrong for phone-only accounts. GoTrue
 * returns `email` as an **empty string** rather than null for them, and `??` falls back only
 * on null/undefined — so the empty string passes straight through and the UI renders a blank
 * line: no identifier, and no fallback either. HomeScreen shipped with exactly that and showed
 * phone users an unlabelled header. Check for `''` explicitly, not just nullish.
 */
export function accountIdentifier(
  email: string | undefined,
  phone: string | undefined,
): string {
  if (email !== undefined && email !== '') {
    return email;
  }
  if (phone !== undefined && phone !== '') {
    // GoTrue stores E.164 without the leading '+'; put it back for display.
    return phone.startsWith('+') ? phone : `+${phone}`;
  }
  return 'Signed in';
}
