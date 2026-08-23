import { StyleSheet } from 'react-native';
import { GradientGround, Text, tokens } from '@/shared/ui';

/**
 * ON-10 (`SCREEN_MAP.md`) — CoreBluetooth's `Unsupported` state: this phone has no Bluetooth LE
 * radio, and never will. Unlike ON-7/8/9 there is nothing to retry and nothing a toggle or a
 * permission grant can fix, so this screen carries no CTA of its own. `BluetoothOffScreen`'s
 * header comment explains why its "Turn on Bluetooth" button was deleted — neither this app nor
 * `Linking.openSettings()` can flip the OS radio. `Unsupported` is one step further than `off`:
 * there is no radio for Settings to flip in the first place, so offering "Open Settings" here
 * would be a worse version of the exact lie that comment already removed once.
 *
 * Not a dead end: `BluetoothGate` is pushed onto the `Home` stack (`navigation.tsx`) with its
 * default header, so the back chevron is a real, working exit to the rest of the app — confirmed
 * by hand on the simulator, not assumed.
 */
export function BluetoothUnsupportedScreen() {
  return (
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        This phone can't pair with BlueSmoke
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        It doesn't have the Bluetooth hardware BlueSmoke needs to connect. There's nothing to turn
        on or grant here — the rest of the app still works.
      </Text>
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
});
