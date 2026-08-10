import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthClientProvider } from '@/features/auth/AuthClientContext';
import { BleClientProvider } from '@/features/ble/BleClientContext';

const queryClient = new QueryClient();

/**
 * App-wide providers — spec §9.2 app/. TanStack Query owns server state via
 * this provider. Zustand stores (src/app/stores, and one per feature
 * concern) need no provider — components import the hook directly.
 *
 * `AuthClientProvider` and `BleClientProvider` are both wired here with no
 * override — P1-4.0's composition-root default, mirroring §3.5: the real
 * `supabaseAuthClient` / lazily-constructed real `BleManager`. Tests
 * substitute `createMockAuthClient()` / a `manager` prop (backed by
 * `tools/mock-peripheral` — see its README) directly at the point of use,
 * never here. `tools/mock-peripheral` is deliberately never imported from
 * this file or anywhere under `src/`: its own README calls it "not a
 * runtime dependency" of the app (it's pure-Node — its `crypto.ts` imports
 * `node:crypto`, which Metro cannot resolve for a device bundle), so it
 * stays test-only, reached only from `__tests__/` files.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthClientProvider>
          <BleClientProvider>{children}</BleClientProvider>
        </AuthClientProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
