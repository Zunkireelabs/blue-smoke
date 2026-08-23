/**
 * P1-8.0 — regression cover for the blank-header bug.
 *
 * HomeScreen shipped with `email ?? 'Signed in'` and rendered an empty line for every
 * phone-only account, because GoTrue returns `email` as `''` rather than null and `??` does
 * not treat an empty string as absent. The empty-string cases below are the ones that matter;
 * the null/undefined cases only guard against someone "simplifying" this back to `??`.
 */
import { accountIdentifier } from '../accountIdentifier';

describe('accountIdentifier', () => {
  it('prefers the email when there is one', () => {
    expect(accountIdentifier('a@example.com', undefined)).toBe('a@example.com');
  });

  it('falls back to the phone when email is an EMPTY STRING, not just null', () => {
    // The exact shape GoTrue returns for a phone-only account.
    expect(accountIdentifier('', '14152127777')).toBe('+14152127777');
  });

  it('falls back to the phone when email is undefined', () => {
    expect(accountIdentifier(undefined, '14152127777')).toBe('+14152127777');
  });

  it('does not double the + when the phone already carries one', () => {
    expect(accountIdentifier('', '+14152127777')).toBe('+14152127777');
  });

  it('never renders an empty string, whatever the combination', () => {
    for (const [email, phone] of [
      ['', ''],
      ['', undefined],
      [undefined, ''],
      [undefined, undefined],
    ] as const) {
      expect(accountIdentifier(email, phone)).toBe('Signed in');
    }
  });
});
