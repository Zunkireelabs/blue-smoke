import { StyleSheet, View } from 'react-native';
import { Button, GradientGround, Text, tokens } from '@/shared/ui';

export interface BluetoothDeniedScreenProps {
  onTryAgain: () => void;
}

/**
 * ON-7 / F1.D1 (`SCREEN_MAP.md`) — "denied once," can still re-prompt. `Try again` calls back
 * into `requestAndroidBluetoothPermission` (via the caller — `bluetoothPermission.ts`), which
 * re-shows the real OS dialog.
 *
 * 🔴 Android-reachable only. iOS's `CBManagerState` makes no "denied once vs. permanently
 * denied" distinction at all — the one-time permission dialog is answered once, ever — so
 * `readBluetoothGateState` never resolves to `deniedOnce` there (see its own doc comment). This
 * screen still exists as a genuinely separate component (not a variant of ON-8) because on
 * Android it is real, and folding it into ON-8 would make ON-8's copy wrong on the platform
 * where ON-7 does apply.
 */
export function BluetoothDeniedScreen({ onTryAgain }: BluetoothDeniedScreenProps) {
  return (
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        We need permission to continue
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        Without it we can't connect to your device.
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
