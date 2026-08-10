/**
 * VF-7 (TransportErrorScreen) and VF-3/VF-4 (VerificationPendingScreen) — press-and-assert
 * coverage, same pattern as the rest of this phase's new screens.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

import { TransportErrorScreen } from '../TransportErrorScreen';
import { VerificationPendingScreen } from '@/features/devices/HomeScreen';
import { AuthClientProvider } from '@/features/auth/AuthClientContext';
import { createMockAuthClient, type MockAuthClient } from '@/features/auth/mockAuthClient';
import { findByLabel, renderedText } from '@/features/auth/testUtils';

async function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  await act(async () => {
    await findByLabel(renderer, label).props.onPress();
  });
}

describe('VF-7 — TransportErrorScreen', () => {
  it('Retry calls the onRetry it was given, not a no-op', async () => {
    const onRetry = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AuthClientProvider client={createMockAuthClient()}>
          <TransportErrorScreen onRetry={onRetry} />
        </AuthClientProvider>,
      );
    });

    await press(renderer, 'Retry');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('Sign out calls through to authClient.signOut()', async () => {
    const client = createMockAuthClient();
    const spy = jest.spyOn(client, 'signOut');
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AuthClientProvider client={client}>
          <TransportErrorScreen onRetry={jest.fn()} />
        </AuthClientProvider>,
      );
    });

    await press(renderer, 'Sign out');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('reads as a "we could not check" screen, never as a decline', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <AuthClientProvider client={createMockAuthClient()}>
          <TransportErrorScreen onRetry={jest.fn()} />
        </AuthClientProvider>,
      );
    });
    const text = renderedText(renderer);
    expect(text).toContain("couldn't check");
    // The words a decline screen would use — must never appear here (SCREEN_MAP.md: VF-7 must
    // not look like a decline).
    expect(text.toLowerCase()).not.toContain('declined');
    expect(text.toLowerCase()).not.toContain("couldn't confirm your id");
  });
});

const pendingRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderPending(client: MockAuthClient) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <AuthClientProvider client={client}>
        <VerificationPendingScreen />
      </AuthClientProvider>,
    );
  });
  pendingRenderers.push(renderer);
  return renderer;
}

describe('VF-3 / VF-4 — VerificationPendingScreen', () => {
  // The screen's own `TAKING_LONGER_MS` timeout is real and un-awaited by these tests — left
  // running past the test that created it, it is exactly the kind of dangling timer that once
  // hung a whole jest run in this phase (see useVerificationStatus.test.tsx's afterEach for the
  // first time this bit). Unmounting fires the effect's cleanup, clearing it.
  afterEach(() => {
    for (const renderer of pendingRenderers.splice(0)) {
      act(() => {
        renderer.unmount();
      });
    }
  });

  it('VF-3: shows the confirming copy and a sign-out from the start — it used to have neither', async () => {
    const client = createMockAuthClient();
    const spy = jest.spyOn(client, 'signOut');
    const renderer = renderPending(client);

    expect(renderedText(renderer)).toContain('Confirming your verification');

    await press(renderer, 'Sign out');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('VF-4: after ~2 minutes, stops implying imminence and still offers sign-out', async () => {
    jest.useFakeTimers();
    try {
      const client = createMockAuthClient();
      const spy = jest.spyOn(client, 'signOut');
      const renderer = renderPending(client);

      await act(async () => {
        jest.advanceTimersByTime(2 * 60 * 1000);
      });

      expect(renderedText(renderer)).toContain('taking longer than usual');
      await press(renderer, 'Sign out');
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
