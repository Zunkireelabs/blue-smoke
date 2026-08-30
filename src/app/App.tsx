import { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { AppProviders } from './providers';
import { RootNavigator } from './navigation';
import { useAppReadyStore } from './stores/useAppReadyStore';
import { initSessionListener } from './stores/useSessionStore';
import { initOnboardingListener } from './stores/useOnboardingStore';
import { initBleNotifications } from '@/features/ble/notifications/initBleNotifications';

export function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const isReady = useAppReadyStore(state => state.isReady);

  useEffect(() => {
    initSessionListener();
    initOnboardingListener();
    initBleNotifications();
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
