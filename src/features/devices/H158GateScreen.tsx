import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BluetoothGateScreen } from '@/features/onboarding/BluetoothGateScreen';
import type { RootStackParamList } from '@/app/navigation';

/**
 * Real-hardware counterpart to `DevicePairingGateScreen.tsx` — same reused
 * `BluetoothGateScreen` (ON-7/8/9 selector), different destination once resolved: `H158Pair`
 * instead of the §4 `DeviceScan`. See `H158PairScreen.tsx` for why this is a separate chain
 * rather than a branch inside the existing one.
 *
 * `replace`, not `navigate`, for the same reason `DevicePairingGateScreen` uses it — resolving
 * the gate isn't a step the user should navigate "back" into.
 */
export function H158GateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleResolved = useCallback(() => {
    navigation.replace('H158Pair');
  }, [navigation]);

  return <BluetoothGateScreen onResolved={handleResolved} />;
}
