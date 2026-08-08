/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

// P1-4.0 brief §2.2 — force the "config absent" branch regardless of what's
// in `.env`. `babel.config.js`'s `loadDotEnv()` runs for the Jest transform
// too, so once `.env` exists this test would otherwise exercise a real,
// configured Supabase client instead of the fail-open path CI always takes
// (CI has no `.env`) — same pattern as
// `src/features/auth/__tests__/supabaseAuthClient.test.ts`.
jest.mock('@/shared/lib/supabaseClient', () => ({
  getSupabaseClient: () => {
    throw new Error(
      'SUPABASE_URL and SUPABASE_ANON_KEY are not set. Configure them via env (spec §10.1).',
    );
  },
}));

import App from '../App';

test('renders correctly', async () => {
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
  // Mutation guard (brief §2.3): if the mock above stops taking effect (wrong
  // path, wrong specifier), initSessionListener() would take the real-client
  // branch instead and this assertion would fail loudly rather than the test
  // silently passing via a different code path.
  expect(warnSpy).toHaveBeenCalledWith(
    '[session] Supabase client unavailable, treating as signed out:',
    expect.any(Error),
  );
  warnSpy.mockRestore();
});
