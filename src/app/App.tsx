import { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { AppProviders } from './providers';
import { RootNavigator } from './navigation';
import { useAppReadyStore } from './stores/useAppReadyStore';
import { initSessionListener } from './stores/useSessionStore';
import { initOnboardingListener } from './stores/useOnboardingStore';
import { initAppUpdateCheck } from '@/features/app-update/initAppUpdateCheck';
import { initBleNotifications } from '@/features/ble/notifications/initBleNotifications';
import { Banner } from '@/shared/ui';

export function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const isReady = useAppReadyStore(state => state.isReady);

  useEffect(() => {
    initSessionListener();
    initOnboardingListener();
    initAppUpdateCheck();
    initBleNotifications();
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <AppProviders>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <RootNavigator />
      <Banner />
    </AppProviders>
  );
}
