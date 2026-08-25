import { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { AppProviders } from './providers';
import { RootNavigator } from './navigation';
import { useAppReadyStore } from './stores/useAppReadyStore';
import { initSessionListener } from './stores/useSessionStore';
import { initOnboardingListener } from './stores/useOnboardingStore';
import { initAppUpdateCheck } from '@/features/app-update/initAppUpdateCheck';

export function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const isReady = useAppReadyStore(state => state.isReady);

  useEffect(() => {
    initSessionListener();
    initOnboardingListener();
    initAppUpdateCheck();
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <AppProviders>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <RootNavigator />
    </AppProviders>
  );
}
