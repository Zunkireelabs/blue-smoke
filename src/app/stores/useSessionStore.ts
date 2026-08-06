import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/shared/lib/supabaseClient';

export type SessionStatus = 'hydrating' | 'signedOut' | 'signedIn';

interface SessionState {
  status: SessionStatus;
  session: Session | null;
  user: User | null;
}

/**
 * Mirrors `supabase.auth`'s current session into app state — Zustand
 * convention (CLAUDE.md, see useAppReadyStore.ts), one store per concern.
 *
 * This store does not itself talk to Keychain or call `signOut`/`signIn`:
 * persistence lives in the `auth.storage` adapter wired into
 * `getSupabaseClient()` (src/shared/lib/authKeychainStorage.ts), and the
 * actual auth calls live in src/features/auth/api.ts. This store only
 * reflects `onAuthStateChange`, so it's the single source of truth for "is
 * anyone signed in" across every feature, not just P1-1.0's own screens.
 */
export const useSessionStore = create<SessionState>(() => ({
  status: 'hydrating',
  session: null,
  user: null,
}));

let listenerInitialized = false;

/**
 * Call once at app boot (src/app/App.tsx). Fires on sign-in, sign-out, token
 * refresh, and — because the storage adapter is Keychain-backed — on
 * restoring a session from a previous launch. Safe to call more than once;
 * only the first call attaches a listener.
 *
 * Note: sign-out here only clears the Supabase session (via the storage
 * adapter's removeItem, triggered internally by supabase.auth.signOut()).
 * TODO-phase-1.md's "Sign-out clears all local secrets, including any
 * K_sess" is broader than this store's scope — K_sess doesn't exist until
 * P1-4.0 (device pairing); wiring that clear-out is that task's job, not
 * invented here.
 */
export function initSessionListener(): void {
  if (listenerInitialized) {
    return;
  }
  listenerInitialized = true;

  let supabase;
  try {
    supabase = getSupabaseClient();
  } catch (err) {
    // Missing SUPABASE_URL / SUPABASE_ANON_KEY in env — see .env.example.
    // Fails open to "signedOut" rather than leaving the app stuck on
    // "hydrating" forever.
    console.warn('[session] Supabase client unavailable, treating as signed out:', err);
    useSessionStore.setState({ status: 'signedOut', session: null, user: null });
    listenerInitialized = false;
    return;
  }

  supabase.auth.getSession().then(({ data }) => {
    useSessionStore.setState({
      status: data.session ? 'signedIn' : 'signedOut',
      session: data.session,
      user: data.session?.user ?? null,
    });
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    useSessionStore.setState({
      status: session ? 'signedIn' : 'signedOut',
      session,
      user: session?.user ?? null,
    });
  });
}
