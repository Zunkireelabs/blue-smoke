/**
 * P2-6.0 (UI-BUILD-B) — coverage for the fix to F6.X / SD-3: `useVerificationStatus` used to
 * fall back to `data ?? 'none'` on any query error, which meant a transport failure on the very
 * first read (no cached data yet) was indistinguishable from "never verified" and sent the user
 * into an ID scan — see `USER_FLOWS.md`'s note on `useVerificationStatus.ts:95`.
 *
 * The two behaviours that matter, both asserted here:
 *   1. A first-ever read failing (no cached data) reports 'error', not 'none'.
 *   2. An error on a LATER background refetch never evicts already-cached data — a transient
 *      blip must not bounce an already-verified (or pending/declined) user.
 */
import React, { type PropsWithChildren } from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useVerificationStatus } from '../useVerificationStatus';
import { useSessionStore } from '@/app/stores/useSessionStore';

jest.mock('@/shared/lib/supabaseClient');
const { getSupabaseClient } = require('@/shared/lib/supabaseClient');

function mockSupabaseRow(impl: () => Promise<{ data: unknown; error: unknown }>) {
  (getSupabaseClient as jest.Mock).mockReturnValue({
    from: () => ({
      select: () => ({
        order: () => ({
          limit: () => ({
            maybeSingle: impl,
          }),
        }),
      }),
    }),
  });
}

const renderers: ReactTestRenderer.ReactTestRenderer[] = [];
const clients: QueryClient[] = [];

function renderHookIn(client: QueryClient, useHook: () => unknown, onValue: (v: unknown) => void) {
  function Probe() {
    onValue(useHook());
    return null;
  }
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <Wrapper>
        <Probe />
      </Wrapper>,
    );
  });
  renderers.push(renderer);
  return renderer;
}

function freshClient(): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return client;
}

// TanStack Query's `notifyManager` batches subscriber notifications through a real
// `setTimeout`, not just microtasks — a plain `await Promise.resolve()` chain never
// observes them, so this waits on a real (short) timer instead, inside `act` so the
// resulting React update is captured rather than warned about.
async function flush() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 10));
  });
}

afterEach(() => {
  // `pending` state schedules a real 5s refetchInterval (POLL_INTERVAL_MS) — leaving it
  // running past the test that created it is exactly what kept a full jest run from ever
  // exiting. Unmounting stops the subscription; clearing the client cancels anything in flight.
  for (const renderer of renderers.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
  for (const client of clients.splice(0)) {
    client.clear();
  }
});

beforeEach(() => {
  useSessionStore.setState({
    status: 'signedIn',
    session: null,
    user: { id: 'user-1', email: 'a@b.test' } as never,
  });
});

describe('useVerificationStatus — transport-error handling', () => {
  it("reports 'error' when the very first read fails (no cached data)", async () => {
    mockSupabaseRow(async () => {
      throw new Error('network down');
    });

    let latest: { state: string } | undefined;
    renderHookIn(freshClient(), useVerificationStatus, (v) => {
      latest = v as { state: string };
    });
    await flush();

    expect(latest?.state).toBe('error');
  });

  it('never evicts cached data when a later background refetch errors', async () => {
    let call = 0;
    mockSupabaseRow(async () => {
      call += 1;
      if (call === 1) {
        return { data: { age_verified: false, provider_status: 'pending' }, error: null };
      }
      throw new Error('network blip');
    });

    const client = freshClient();
    let latest: { state: string; refetch: () => Promise<unknown> } | undefined;
    renderHookIn(client, useVerificationStatus, (v) => {
      latest = v as { state: string; refetch: () => Promise<unknown> };
    });
    await flush();
    expect(latest?.state).toBe('pending');

    await act(async () => {
      await latest!.refetch();
    });

    // The refetch failed (call 2 threw), but the cached 'pending' value must survive it —
    // this is the regression the fix guards: an error must never downgrade known data to
    // 'error' or 'none'.
    expect(latest?.state).toBe('pending');
  });
});
