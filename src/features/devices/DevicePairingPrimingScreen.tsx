import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BluetoothPrimingScreen } from '@/features/onboarding/BluetoothPrimingScreen';
import type { RootStackParamList } from '@/app/navigation';

/**
 * F7.2 (`USER_FLOWS.md`) — mounts ON-4 at the START of pairing, from `Home`'s "Pair a device"
 * CTA, never at launch. "Continue" moves to `DevicePairingGateScreen`, which is what actually
 * triggers/interprets the OS Bluetooth dialog (F7.E1/F7.E2). "Not now" honours F1.D4 — pairing
 * cannot proceed, but the rest of the app still works, so it just returns to the device list.
 */
export function DevicePairingPrimingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <BluetoothPrimingScreen
      onContinue={() => navigation.navigate('BluetoothGate')}
      onNotNow={() => navigation.goBack()}
    />
  );
}
