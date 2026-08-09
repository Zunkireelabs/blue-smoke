import { Linking, StyleSheet, View } from 'react-native';
import { Button, GradientGround, Text, tokens } from '@/shared/ui';

export interface BluetoothBlockedScreenProps {
  /** Defaults to the real `Linking.openSettings()` — override only for tests. */
  onOpenSettings?: () => void;
}

/**
 * ON-8 / F1.D2 (`SCREEN_MAP.md`) — permanently denied, on iOS this is where EVERY denial ends up
 * (see `bluetoothPermission.ts`'s note on why iOS never reaches ON-7). `Open Settings` is real:
 * `Linking.openSettings()` deep-links to this app's own page in the OS Settings app, which is
 * exactly where the Bluetooth permission toggle for this app lives on both platforms — unlike
 * ON-9, where there is no equivalent deep link for the system Bluetooth radio itself.
 */
export function BluetoothBlockedScreen({
  onOpenSettings = () => {
    Linking.openSettings();
  },
}: BluetoothBlockedScreenProps) {
  return (
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        Permission is turned off
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        We can't show that prompt again — this has to be turned back on in Settings.
      </Text>

      <View style={styles.actions}>
        <Button label="Open Settings" onPress={onOpenSettings} />
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
