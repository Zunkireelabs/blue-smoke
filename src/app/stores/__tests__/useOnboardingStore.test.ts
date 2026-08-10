import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useOnboardingStore,
  initOnboardingListener,
  completeOnboarding,
  __resetOnboardingListenerForTests,
} from '../useOnboardingStore';

describe('useOnboardingStore', () => {
  beforeEach(() => {
    (AsyncStorage as unknown as { __resetMockStorage: () => void }).__resetMockStorage();
    __resetOnboardingListenerForTests();
  });

  it('starts hydrating, then resolves to unseen when nothing was stored', async () => {
    expect(useOnboardingStore.getState().status).toBe('hydrating');

    initOnboardingListener();
    await flushMicrotasks();

    expect(useOnboardingStore.getState().status).toBe('unseen');
  });

  it('resolves to seen when the flag was already written', async () => {
    await AsyncStorage.setItem('onboarding.seen.v1', 'true');

    initOnboardingListener();
    await flushMicrotasks();

    expect(useOnboardingStore.getState().status).toBe('seen');
  });

  it('completeOnboarding writes the flag and flips the store to seen', async () => {
    initOnboardingListener();
    await flushMicrotasks();
    expect(useOnboardingStore.getState().status).toBe('unseen');

    await completeOnboarding();

    expect(useOnboardingStore.getState().status).toBe('seen');
    expect(await AsyncStorage.getItem('onboarding.seen.v1')).toBe('true');
  });

  it('still flips to seen when the AsyncStorage WRITE fails — the carousel has no other exit', async () => {
    // Regression: `await markOnboardingSeen()` used to run before the `setState`, so a rejected
    // write skipped the flip entirely and "Get started" became a dead CTA that stranded the user
    // in the carousel forever — the flag never lands, so relaunching does not help either.
    initOnboardingListener();
    await flushMicrotasks();
    const setItem = AsyncStorage.setItem as jest.Mock;
    setItem.mockRejectedValueOnce(new Error('disk full'));
    // The failure is deliberately logged by the store; keep it out of the suite's output.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await completeOnboarding();

    expect(useOnboardingStore.getState().status).toBe('seen');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a second initOnboardingListener call does not reset an already-resolved status', async () => {
    initOnboardingListener();
    await flushMicrotasks();
    await completeOnboarding();
    expect(useOnboardingStore.getState().status).toBe('seen');

    initOnboardingListener();
    await flushMicrotasks();

    expect(useOnboardingStore.getState().status).toBe('seen');
  });
});

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
