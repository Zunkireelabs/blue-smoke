import { StyleSheet, View } from 'react-native';
import { Button, GradientGround, Text, tokens } from '@/shared/ui';

export interface NotificationPrimingScreenProps {
  /**
   * 🔴 Push has no backend yet (SY-2/SY-3 are unbuilt — `UI-BUILD-B-seam-and-verification.md`
   * §0). This screen never calls a permission API itself; `onEnable` is the interface a future
   * phase wires to an actual request once there is something to notify about. Do not wire this
   * to `PermissionsAndroid`/an iOS notification request in the meantime — that would ask for a
   * permission the app cannot yet use for anything.
   */
  onEnable: () => void;
  onNotNow: () => void;
}

/** ON-6 — notification priming, shown after the first successful pair (not this phase's trigger to wire). */
export function NotificationPrimingScreen({ onEnable, onNotNow }: NotificationPrimingScreenProps) {
  return (
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        Know when it locks
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        We can tell you when your device locks itself or runs low on battery.
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        Your device locks itself either way — this is just so you hear about it sooner.
      </Text>

      <View style={styles.actions}>
        <Button label="Enable notifications" onPress={onEnable} />
        <Button label="Not now" variant="secondary" onPress={onNotNow} />
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
