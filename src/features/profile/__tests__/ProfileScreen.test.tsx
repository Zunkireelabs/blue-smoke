/**
 * P1-1.0 PR 2 — proves the Security section on Profile is gated on
 * `user?.email`: a phone-only account (email `""`, see below) must never see
 * "Set a password", since `signInWithEmail` has no way to consume that credential.
 */
import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { ProfileScreen } from '../ProfileScreen';
import { AuthClientProvider } from '@/features/auth/AuthClientContext';
import { createMockAuthClient } from '@/features/auth/mockAuthClient';
import { useSessionStore } from '@/app/stores/useSessionStore';
import { renderedText } from '@/features/auth/testUtils';
import type { RootStackParamList } from '@/app/navigation';

jest.mock('@/shared/lib/supabaseClient');
const { getSupabaseClient } = require('@/shared/lib/supabaseClient');

function makeQueryBuilder(data: unknown) {
  const builder = {
    select: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data, error: null }),
  };
  return builder;
}

function mockSupabase() {
  (getSupabaseClient as jest.Mock).mockReturnValue({
    from: (table: string) =>
      makeQueryBuilder(
        table === 'profiles'
          ? { display_name: null, created_at: '2026-01-01T00:00:00.000Z' }
          : null,
      ),
  });
}

const Stack = createNativeStackNavigator<Pick<RootStackParamList, 'Profile' | 'SetPassword'>>();

function SetPasswordPlaceholder() {
  return <Text>SET PASSWORD SCREEN</Text>;
}

const renderers: ReactTestRenderer.ReactTestRenderer[] = [];
const clients: QueryClient[] = [];

// TanStack Query's `notifyManager` batches subscriber notifications through a real
// `setTimeout`, not just microtasks — matches the wait pattern already proven in
// `useVerificationStatus.test.tsx`.
async function flush() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  });
}

function renderProfile() {
  mockSupabase();
  const authClient = createMockAuthClient();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <AuthClientProvider client={authClient}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Profile" component={ProfileScreen} />
              <Stack.Screen name="SetPassword" component={SetPasswordPlaceholder} />
            </Stack.Navigator>
          </AuthClientProvider>
        </NavigationContainer>
      </QueryClientProvider>,
    );
  });
  renderers.push(renderer);
  return renderer;
}

describe('ProfileScreen — Security section email gate', () => {
  afterEach(() => {
    for (const renderer of renderers.splice(0)) {
      act(() => {
        renderer.unmount();
      });
    }
    for (const client of clients.splice(0)) {
      client.clear();
    }
    act(() => {
      useSessionStore.setState({ status: 'hydrating', session: null, user: null });
    });
  });

  it('renders "Set a password" for an account with an email', async () => {
    act(() => {
      useSessionStore.setState({
        status: 'signedIn',
        session: null,
        user: { id: 'user-1', email: 'someone@example.com' } as User,
      });
    });

    const renderer = renderProfile();
    await flush();

    expect(renderedText(renderer)).toContain('Set a password');

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'Set a password' }).props.onPress();
    });
    expect(renderedText(renderer)).toContain('SET PASSWORD SCREEN');
  });

  /**
   * 🔴 `email` is the EMPTY STRING for a phone-only account, not null — measured against
   * `bluesmoke-dev` 2026-08-11 (`GET /auth/v1/user` with a `+1415212777x` session returns
   * `"email": ""`). This fixture must keep using `''`, because that is the only value that
   * gives this test teeth: with `null` here, mutating the gate to `user?.email !== null` —
   * the obvious "be explicit" refactor — passes the entire suite while shipping the exact
   * dead-end row the gate exists to prevent (`'' !== null` is true). Verified by mutation:
   * `null` fixture → mutant survives; `''` fixture → mutant caught.
   */
  it('does not render Security for a phone-only account (email is "")', async () => {
    act(() => {
      useSessionStore.setState({
        status: 'signedIn',
        session: null,
        user: { id: 'user-2', email: '', phone: '+14152127779' } as unknown as User,
      });
    });

    const renderer = renderProfile();
    await flush();

    expect(renderedText(renderer)).not.toContain('Set a password');
    expect(() => renderer.root.findByProps({ accessibilityLabel: 'Set a password' })).toThrow();
  });

  /**
   * Defence in depth: `''` is what the provider actually sends today, but the gate must also
   * hold if that ever becomes null/absent — so neither shape can regress unnoticed.
   */
  it('does not render Security when email is absent entirely', async () => {
    act(() => {
      useSessionStore.setState({
        status: 'signedIn',
        session: null,
        user: { id: 'user-3', phone: '+14152127779' } as unknown as User,
      });
    });

    const renderer = renderProfile();
    await flush();

    expect(renderedText(renderer)).not.toContain('Set a password');
  });
});
