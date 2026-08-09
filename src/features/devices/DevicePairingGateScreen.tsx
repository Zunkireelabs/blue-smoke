import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BluetoothGateScreen } from '@/features/onboarding/BluetoothGateScreen';
import type { RootStackParamList } from '@/app/navigation';

/**
 * F7.E1 / F7.E2 (`USER_FLOWS.md`) — mounts `BluetoothGateScreen`, the already-built, already-
 * tested ON-7/8/9 selector (P1-2.0). This screen is the first real caller: `Home` → priming
 * (ON-4) → here → resolved → `DeviceScan`.
 *
 * 🔴 `BluetoothGateScreen`'s resolve effect depends on `[state, onResolved]` — an inline arrow
 * passed as `onResolved` changes identity every render and re-fires the effect, which can loop.
 * `handleResolved` is `useCallback`'d against `navigation`, which React Navigation keeps
 * referentially stable across re-renders of this mounted screen, so its identity — and the
 * effect's — stays stable too.
 */
export function DevicePairingGateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const handleResolved = useCallback(() => {
    // `replace`, not `navigate` — resolving the gate isn't a step the user should be able to
    // navigate "back" into (F2.5's "success is not a screen" reasoning, applied to a gate
    // rather than a success message).
    navigation.replace('DeviceScan');
  }, [navigation]);

  return <BluetoothGateScreen onResolved={handleResolved} />;
}
