import { create } from 'zustand';
import { hasSeenOnboarding, markOnboardingSeen } from '@/features/onboarding/onboardingStorage';

export type OnboardingStatus = 'hydrating' | 'unseen' | 'seen';

interface OnboardingState {
  status: OnboardingStatus;
}

/**
 * Mirrors `useSessionStore.ts`'s shape deliberately: same "hydrating until we know" pattern,
 * because `selectStack()` needs both answered before it can pick a stack (P1-2.0 §navigation).
 * `hydrating` here specifically means "AsyncStorage hasn't answered yet" — not to be confused
 * with session hydration, which is a separate concern this store knows nothing about.
 */
export const useOnboardingStore = create<OnboardingState>(() => ({
  status: 'hydrating',
}));

let listenerInitialized = false;

/** Call once at app boot (`src/app/App.tsx`), alongside `initSessionListener()`. */
export function initOnboardingListener(): void {
  if (listenerInitialized) {
    return;
  }
  listenerInitialized = true;

  hasSeenOnboarding()
    .then((seen) => {
      useOnboardingStore.setState({ status: seen ? 'seen' : 'unseen' });
    })
    .catch((err) => {
      // Fails open to "unseen" rather than leaving the app stuck on the boot splash forever —
      // the worst case is a returning user sees the carousel again, not a stuck app.
      console.warn('[onboarding] AsyncStorage read failed, treating as unseen:', err);
      useOnboardingStore.setState({ status: 'unseen' });
    });
}

/**
 * The carousel's completion action — marks the flag and flips the gate to `auth`.
 *
 * The write failing must NOT hold back the state flip. The carousel is a whole mounted stack
 * with exactly one exit, and that exit is this function: if a rejected `setItem` skipped the
 * `setState`, "Get started" would silently do nothing and strand the user there permanently —
 * across relaunches too, since the flag never lands. Fails open in the same direction the read
 * path above already does; the worst case is the carousel returns next launch.
 */
export async function completeOnboarding(): Promise<void> {
  try {
    await markOnboardingSeen();
  } catch (err) {
    console.warn('[onboarding] AsyncStorage write failed, advancing anyway:', err);
  }
  useOnboardingStore.setState({ status: 'seen' });
}

/**
 * Test-only. `listenerInitialized` exists so a real app boot never attaches the listener
 * twice; a test suite exercising `initOnboardingListener()` repeatedly needs to undo that
 * guard between cases without `jest.resetModules()`, which would also reset the AsyncStorage
 * mock module into a second, disconnected instance.
 */
export function __resetOnboardingListenerForTests(): void {
  listenerInitialized = false;
  useOnboardingStore.setState({ status: 'hydrating' });
}
