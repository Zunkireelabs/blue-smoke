import { StyleSheet, View } from 'react-native';
import { Button, Text, tokens } from '@/shared/ui';

export interface BluetoothPrimingBodyProps {
  /** Triggers the real permission flow — Phase D wires this to the actual request. */
  onContinue: () => void;
  onNotNow: () => void;
}

/**
 * ON-4 (F7.2, `SCREEN_MAP.md`) — the headline/body/actions content of Bluetooth priming, split
 * out of `BluetoothPrimingScreen` so it can render two ways: as that screen's own `CurtainGround`
 * curtain, and as the floating card `HomeScreen` stacks over its "Devices" card when "+" is
 * tapped (no navigation — see `HomeScreen`'s own header comment). Keeping one copy of this copy
 * is the point; the two hosts differ, the words and buttons must not drift apart.
 *
 * CTA is "Continue", not "Turn on Bluetooth" (the copy this screen originally shipped with in
 * `screenSpecs.ts`'s placeholder). "Turn on Bluetooth" describes the PRIOR screen's problem
 * (power state, ON-9) — this one is about the PERMISSION dialog, and iOS cannot flip a power
 * state from an app button regardless. Reusing that label here would tell the user the button
 * does something it cannot on either axis.
 */
export function BluetoothPrimingBody({ onContinue, onNotNow }: BluetoothPrimingBodyProps) {
  return (
    <>
      <Text variant="title" style={styles.title}>
        We need Bluetooth to pair
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        BlueSmoke talks to your device over Bluetooth — that's how it locks and unlocks as you
        come and go.
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        It only ever connects to devices you own.
      </Text>

      <View style={styles.actions}>
        <Button label="Continue" onPress={onContinue} />
        <Button label="Not now" variant="secondary" onPress={onNotNow} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
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
