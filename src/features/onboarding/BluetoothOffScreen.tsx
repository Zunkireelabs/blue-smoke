import { Linking, StyleSheet, View } from 'react-native';
import { Button, GradientGround, Text, tokens } from '@/shared/ui';

export interface BluetoothOffScreenProps {
  /** Defaults to the real `Linking.openSettings()` — override only for tests. */
  onOpenSettings?: () => void;
  /**
   * Android only (`BluetoothGateScreen.tsx` wires this from `BleManagerLike.enable()`, gated on
   * `Platform.OS === 'android'`) — triggers the OS's own "Allow <app> to turn on Bluetooth?"
   * dialog instead of sending the user to Settings. `undefined` on iOS, where no such API exists
   * (see below) — this screen then falls back to its original Open-Settings-only copy.
   */
  onEnableBluetooth?: () => void;
}

/**
 * ON-9 / F1.D5 (`SCREEN_MAP.md`) — Bluetooth is OFF, which is not the same thing as DENIED.
 * `screenSpecs.ts`'s original placeholder CTA was "Turn on Bluetooth" — the exact lie the
 * execution brief calls out: neither this app nor `Linking.openSettings()` can flip the OS
 * Bluetooth radio on iOS, since CoreBluetooth exposes no such API. `Open Settings` was this
 * screen's only honest option there, offered as a secondary "get closer" affordance, not a fix.
 *
 * 🔴 2026-08-31 — that reasoning never applied to Android: `react-native-ble-plx`'s
 * `BleManager.enable()` genuinely does show the OS's native toggle-on dialog there and resolves
 * once the radio is on, same as any other app's "Turn on Bluetooth" prompt. `onEnableBluetooth`
 * renders that as the primary action when the caller supplies it (Android, `manager.enable`
 * present); `Open Settings` stays as a fallback either way. iOS is unaffected — with no prop
 * passed, this renders exactly as it always has.
 */
export function BluetoothOffScreen({
  onOpenSettings = () => {
    Linking.openSettings();
  },
  onEnableBluetooth,
}: BluetoothOffScreenProps) {
  return (
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        Bluetooth is off
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        {onEnableBluetooth
          ? "Turn it on below and we'll keep looking."
          : "Turn it on and we'll keep looking — nothing else to fix here."}
      </Text>

      <View style={styles.actions}>
        {onEnableBluetooth && <Button label="Turn on Bluetooth" onPress={onEnableBluetooth} />}
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
