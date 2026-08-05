import { StatusBar, useColorScheme } from 'react-native';
import { AppProviders } from './providers';
import { RootNavigator } from './navigation';
import { useAppReadyStore } from './stores/useAppReadyStore';

export function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const isReady = useAppReadyStore(state => state.isReady);

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
