import { createContext, useContext, type PropsWithChildren } from 'react';
import type { AuthClient } from './client';
import { supabaseAuthClient } from './supabaseAuthClient';

/**
 * P1-1.0 §3.5 — the composition root. Screens call `useAuthClient()`, never
 * `supabaseAuthClient` or `mockAuthClient` by name, so swapping
 * implementations (or wiring a test's `createMockAuthClient()` instance) is
 * the one-line change the brief calls for: wrap in
 * `<AuthClientProvider value={...}>`.
 *
 * Default is `supabaseAuthClient` — the real implementation, which itself
 * degrades to a clear config error until P0-3.0 supplies env config (see
 * that file's header). `AppProviders` (src/app/providers.tsx) wires this at
 * app boot with no explicit value, i.e. the real client.
 */
const AuthClientContext = createContext<AuthClient>(supabaseAuthClient);

export function AuthClientProvider({
  client = supabaseAuthClient,
  children,
}: PropsWithChildren<{ client?: AuthClient }>) {
  return <AuthClientContext.Provider value={client}>{children}</AuthClientContext.Provider>;
}

export function useAuthClient(): AuthClient {
  return useContext(AuthClientContext);
}
