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
import { useOnboardingStore } from '../stores/useOnboardingStore';
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

// Most cases below don't care about onboarding at all — 'seen' is the state that lets every
// pre-existing assertion (written before P1-2.0) keep meaning exactly what it said.
const SEEN = 'seen';

describe('selectStack — session gating', () => {
  it.each(ALL_VERIFICATION_STATES)(
    'shows the boot splash while hydrating, whatever the verification state (%s)',
    (verification) => {
      // Hydrating outranks everything: we do not yet know whether anyone is signed in, and
      // showing the auth stack would flash a login screen at a signed-in user every launch.
      expect(selectStack('hydrating', verification, SEEN)).toBe<GatedStack>('boot');
    },
  );

  it.each(ALL_VERIFICATION_STATES)(
    'sends a signed-out user who has already seen onboarding to auth (%s)',
    (verification) => {
      // Verification state is meaningless without a user — a stale 'verified' left in the
      // query cache after sign-out must not leak the signed-out user into the app.
      expect(selectStack('signedOut', verification, SEEN)).toBe<GatedStack>('auth');
    },
  );
});

describe('selectStack — onboarding gating (P1-2.0)', () => {
  it('shows the boot splash while the onboarding flag is still hydrating, even for an otherwise-resolved signed-in session', () => {
    expect(selectStack('signedIn', 'verified', 'hydrating')).toBe<GatedStack>('boot');
    expect(selectStack('signedOut', 'none', 'hydrating')).toBe<GatedStack>('boot');
  });

  it('sends a signed-out, first-launch user to onboarding before auth', () => {
    expect(selectStack('signedOut', 'none', 'unseen')).toBe<GatedStack>('onboarding');
  });

  it('never sends a signed-out user to onboarding twice — seen wins once written', () => {
    expect(selectStack('signedOut', 'none', 'seen')).toBe<GatedStack>('auth');
  });

  it('a signed-IN user is never routed to onboarding, even if the flag reads unseen', () => {
    // Onboarding only ever gates the PRE-auth path (CLAUDE.md rule 3: no path into a gated
    // stack). A signed-in user with a stale/missing local flag — e.g. a second device — must
    // still reach their normal gate, not get routed backwards into the carousel.
    for (const verification of ALL_VERIFICATION_STATES) {
      expect(selectStack('signedIn', verification, 'unseen')).not.toBe<GatedStack>('onboarding');
    }
  });
});

describe('selectStack — the age gate', () => {
  it('reaches home only on an explicit verified', () => {
    expect(selectStack('signedIn', 'verified', SEEN)).toBe<GatedStack>('home');
  });

  it('NEVER reaches home for any non-verified state', () => {
    // The regression this file exists for. Stated as a sweep rather than case-by-case so a
    // newly added VerificationState is covered the moment it is added to the union.
    const nonVerified = ALL_VERIFICATION_STATES.filter((s) => s !== 'verified');
    for (const state of nonVerified) {
      expect(selectStack('signedIn', state, SEEN)).not.toBe<GatedStack>('home');
    }
  });

  it('treats an unresolved query as pending, not as verified', () => {
    expect(selectStack('signedIn', 'loading', SEEN)).toBe<GatedStack>('pending');
  });

  it('waits while the vendor decision is outstanding', () => {
    expect(selectStack('signedIn', 'pending', SEEN)).toBe<GatedStack>('pending');
  });

  it.each<VerificationState>(['none', 'declined'])(
    'sends a %s user into the Persona flow',
    (state) => {
      // Both share a branch on purpose: a declined user may retry, and splitting them in the
      // UI would mean telling someone why they failed.
      expect(selectStack('signedIn', state, SEEN)).toBe<GatedStack>('verify');
    },
  );

  it('sends a transport-read failure to its own stack, never the Persona flow', () => {
    // F6.X / VF-7 — must never land on 'verify', which would render VF-2's ID-scan UI over an
    // outcome that isn't a decline at all, just an unanswered question.
    expect(selectStack('signedIn', 'error', SEEN)).toBe<GatedStack>('transportError');
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
      // Every case above is signed-in, so onboarding is irrelevant to which stack mounts
      // (selectStack never routes a signed-in user to 'onboarding') — 'seen' just keeps this
      // loop from accidentally depending on the store's untouched initial 'hydrating' value.
      useOnboardingStore.setState({ status: 'seen' });

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(<RootNavigator />);
      });
      expect(renderer.toJSON()).toBeTruthy();
      await ReactTestRenderer.act(() => renderer.unmount());
    }
  });

  it('renders the onboarding carousel without crashing for a signed-out, first-launch user', async () => {
    useSessionStore.setState({ status: 'signedOut', session: null, user: null });
    useOnboardingStore.setState({ status: 'unseen' });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<RootNavigator />);
    });
    expect(renderer.toJSON()).toBeTruthy();
    await ReactTestRenderer.act(() => renderer.unmount());
  });
});
