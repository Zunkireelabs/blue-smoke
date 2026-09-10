import { useEffect } from 'react';
import { AppProviders } from './providers';
import { RootNavigator } from './navigation';
import { useAppReadyStore } from './stores/useAppReadyStore';
import { initSessionListener } from './stores/useSessionStore';
import { initOnboardingListener } from './stores/useOnboardingStore';

export function App() {
  const isReady = useAppReadyStore(state => state.isReady);

  useEffect(() => {
    initSessionListener();
    initOnboardingListener();
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}
