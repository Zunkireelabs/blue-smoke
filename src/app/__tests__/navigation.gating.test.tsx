/**
 * The gate decides which of five mutually exclusive stacks mounts. Its failure modes are
 * silent — a wrong branch renders a perfectly normal-looking screen — so every state is
 * asserted explicitly.
 *
 * The case that matters most is `loading`: an unresolved verification query must NOT reach
 * home. That is the difference between "we don't know yet" and "you're verified", and it is
 * what a refactor is most likely to break, because the naive
 * `verification === 'verified' ? home : verify` shape passes every other assertion here.
 *
 * Tested against `selectStack` rather than the rendered tree, deliberately. React Navigation
 * mounts only the focused screen, so "is Home reachable" is not observable from the output —
 * an earlier version of this file asserted on rendered routes and silently checked nothing,
 * matching an empty array every time.
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { selectStack, RootNavigator, type GatedStack } from '../navigation';
import { useSessionStore } from '../stores/useSessionStore';
import type { VerificationState } from '@/features/verification/useVerificationStatus';

jest.mock('@/features/verification/useVerificationStatus');
const { useVerificationStatus } = require('@/features/verification/useVerificationStatus');

const ALL_VERIFICATION_STATES: VerificationState[] = [
  'loading',
  'none',
  'pending',
  'verified',
  'declined',
  'error',
];

describe('selectStack — session gating', () => {
  it.each(ALL_VERIFICATION_STATES)(
    'shows the boot splash while hydrating, whatever the verification state (%s)',
    (verification) => {
      // Hydrating outranks everything: we do not yet know whether anyone is signed in, and
      // showing the auth stack would flash a login screen at a signed-in user every launch.
      expect(selectStack('hydrating', verification)).toBe<GatedStack>('boot');
    },
  );

  it.each(ALL_VERIFICATION_STATES)(
    'sends a signed-out user to auth, whatever the verification state (%s)',
    (verification) => {
      // Verification state is meaningless without a user — a stale 'verified' left in the
      // query cache after sign-out must not leak the signed-out user into the app.
      expect(selectStack('signedOut', verification)).toBe<GatedStack>('auth');
    },
  );
});

describe('selectStack — the age gate', () => {
  it('reaches home only on an explicit verified', () => {
    expect(selectStack('signedIn', 'verified')).toBe<GatedStack>('home');
  });

  it('NEVER reaches home for any non-verified state', () => {
    // The regression this file exists for. Stated as a sweep rather than case-by-case so a
    // newly added VerificationState is covered the moment it is added to the union.
    const nonVerified = ALL_VERIFICATION_STATES.filter((s) => s !== 'verified');
    for (const state of nonVerified) {
      expect(selectStack('signedIn', state)).not.toBe<GatedStack>('home');
    }
  });

  it('treats an unresolved query as pending, not as verified', () => {
    expect(selectStack('signedIn', 'loading')).toBe<GatedStack>('pending');
  });

  it('waits while the vendor decision is outstanding', () => {
    expect(selectStack('signedIn', 'pending')).toBe<GatedStack>('pending');
  });

  it.each<VerificationState>(['none', 'declined'])(
    'sends a %s user into the Persona flow',
    (state) => {
      // Both share a branch on purpose: a declined user may retry, and splitting them in the
      // UI would mean telling someone why they failed.
      expect(selectStack('signedIn', state)).toBe<GatedStack>('verify');
    },
  );

  it('sends a transport-read failure to its own stack, never the Persona flow', () => {
    // F6.X / VF-7 — must never land on 'verify', which would render VF-2's ID-scan UI over an
    // outcome that isn't a decline at all, just an unanswered question.
    expect(selectStack('signedIn', 'error')).toBe<GatedStack>('transportError');
  });
});

describe('RootNavigator', () => {
  it('renders without crashing in every gated state', async () => {
    // Cheap smoke test over the wiring the pure function cannot cover: that each branch's
    // screens actually mount. A typo in a component import fails here, not at runtime.
    for (const state of ALL_VERIFICATION_STATES) {
      (useVerificationStatus as jest.Mock).mockReturnValue({
        state,
        error: null,
        refetch: jest.fn(),
      });
      useSessionStore.setState({
        status: 'signedIn',
        session: null,
        user: { id: 'user-1', email: 'a@b.test' } as never,
      });

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(<RootNavigator />);
      });
      expect(renderer.toJSON()).toBeTruthy();
      await ReactTestRenderer.act(() => renderer.unmount());
    }
  });
});
