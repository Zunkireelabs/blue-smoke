import { useCallback } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { BluetoothGateScreen } from '@/features/onboarding/BluetoothGateScreen';
import type { RootStackParamList } from '@/app/navigation';

/**
 * Real-hardware counterpart to `DevicePairingGateScreen.tsx` — same reused
 * `BluetoothGateScreen` (ON-7/8/9 selector), different destination once resolved: `H158Pair`
 * instead of the §4 `DeviceScan`. See `H158PairScreen.tsx` for why this is a separate chain
 * rather than a branch inside the existing one.
 *
 * P1-5.0 — forwards an optional `deviceId` straight through to `H158Pair`: this screen is a
 * permission CHECK, not a decision point, so it has no opinion on which device the caller meant
 * (a scan-to-add-new, from Home's "Pair a device", vs. a resume/reconnect for one specific row).
 *
 * `replace`, not `navigate`, for the same reason `DevicePairingGateScreen` uses it — resolving
 * the gate isn't a step the user should navigate "back" into.
 */
export function H158GateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'H158Gate'>>();
  const deviceId = route.params?.deviceId;

  const handleResolved = useCallback(() => {
    navigation.replace('H158Pair', deviceId ? { deviceId } : undefined);
  }, [navigation, deviceId]);

  return <BluetoothGateScreen onResolved={handleResolved} />;
}
