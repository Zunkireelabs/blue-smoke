import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { Button, GradientGround, Text, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';

/**
 * 🔴 HARD BOUNDARY — P1-3.0 stops here. Selecting a device in `DeviceScanScreen` (F7.5) lands
 * on this screen instead of connect/bond/deviceInfo-read/the auth handshake/`issue-device-
 * session` (F7.6–F7.9, DV-6/DV-7). Those are blocked on OQ-12, the `serial_hash` salt
 * (`USER_FLOWS.md` F7, `docs/TECHNICAL_SPEC.md` §13) — a guessed salt produces a well-formed
 * hash that's accepted and silently wrong, so nothing past device selection is built until it's
 * answered.
 *
 * This is deliberately not a progress spinner and not a success screen — either would claim
 * something is happening that isn't. It states the honest state and gives every screen's
 * required exit (design rule 1, `USER_FLOWS.md`) back to the device list.
 */
export function PairingBoundaryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'DevicePairingBoundary'>>();
  const { deviceName } = route.params;

  return (
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        Pairing isn&apos;t finished in this build yet
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        We found {deviceName ?? 'your device'}. Setting up its secure session isn&apos;t
        available in this build yet — check back soon.
      </Text>

      <View style={styles.actions}>
        <Button label="Back to devices" onPress={() => navigation.popToTop()} />
      </View>
    </GradientGround>
  );
}

const styles = StyleSheet.create({
  sheet: {
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: tokens.spacing.lg,
  },
  body: {
    textAlign: 'center',
    marginBottom: tokens.spacing.sm,
  },
  actions: {
    marginTop: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
});
