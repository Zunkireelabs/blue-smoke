import { Linking, StyleSheet, View } from 'react-native';
import { Button, GradientGround, Text, tokens } from '@/shared/ui';

export interface BluetoothOffScreenProps {
  /** Defaults to the real `Linking.openSettings()` — override only for tests. */
  onOpenSettings?: () => void;
}

/**
 * ON-9 / F1.D5 (`SCREEN_MAP.md`) — Bluetooth is OFF, which is not the same thing as DENIED.
 * `screenSpecs.ts`'s original placeholder CTA was "Turn on Bluetooth" — the exact lie the
 * execution brief calls out: neither this app nor `Linking.openSettings()` can flip the OS
 * Bluetooth radio on iOS. `Open Settings` here is honest about what it actually does — it opens
 * this app's Settings page, not a system Bluetooth toggle (no such deep link exists on iOS) —
 * offered as a secondary "get closer" affordance, not the primary fix. The real fix is the
 * caller re-checking `readBluetoothGateState` on `AppState` foreground (`BluetoothGateScreen`),
 * which is what actually notices the user flipped the toggle themselves.
 */
export function BluetoothOffScreen({
  onOpenSettings = () => {
    Linking.openSettings();
  },
}: BluetoothOffScreenProps) {
  return (
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        Bluetooth is off
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        Turn it on and we'll keep looking — nothing else to fix here.
      </Text>

      <View style={styles.actions}>
        <Button label="Open Settings" variant="secondary" onPress={onOpenSettings} />
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
  },
  actions: {
    marginTop: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
});
