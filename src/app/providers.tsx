import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthClientProvider } from '@/features/auth/AuthClientContext';

const queryClient = new QueryClient();

/**
 * App-wide providers — spec §9.2 app/. TanStack Query owns server state via
 * this provider. Zustand stores (src/app/stores, and one per feature
 * concern) need no provider — components import the hook directly.
 *
 * `AuthClientProvider` with no `client` prop wires the real
 * `supabaseAuthClient` (P1-1.0 §3.5) — the composition root's one-line
 * default. Tests substitute `createMockAuthClient()` here instead.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthClientProvider>{children}</AuthClientProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
