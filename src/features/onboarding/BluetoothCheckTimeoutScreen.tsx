import { StyleSheet, View } from 'react-native';
import { Button, GradientGround, Text, tokens } from '@/shared/ui';

export interface BluetoothCheckTimeoutScreenProps {
  onTryAgain: () => void;
}

/**
 * P1-2.0 — the recoverable half of `BluetoothGateScreen`'s `null`/`'unknown'` bounded wait
 * (`GATE_UNKNOWN_TIMEOUT_MS`). Deliberately not ON-10: `'unsupported'` is a final answer about
 * the hardware, this is "we haven't learned the real state yet" — ble-plx's own `Unknown` /
 * `Resetting` values are transient in practice and usually settle inside the timeout, so most
 * users on real hardware never see this screen at all. `Try again` calls back into the exact same
 * `check()` the gate already uses for its initial read and its `AppState` foreground re-check, so
 * it is a genuine re-read, not a dead button — and it's pushed on the `Home` stack like every
 * other gate screen, so the header back chevron is a real exit too.
 */
export function BluetoothCheckTimeoutScreen({ onTryAgain }: BluetoothCheckTimeoutScreenProps) {
  return (
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        Still checking Bluetooth
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        This is taking longer than it should. You can try again, or come back to it later — the
        rest of the app still works.
      </Text>

      <View style={styles.actions}>
        <Button label="Try again" onPress={onTryAgain} />
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
