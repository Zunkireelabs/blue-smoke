import { StyleSheet, View } from 'react-native';
import { Button, GradientGround, Text, tokens } from '@/shared/ui';
import { SignOutButton } from '@/features/auth/SignOutButton';

export interface TransportErrorScreenProps {
  onRetry: () => void;
}

/**
 * VF-7 / F6.X (`USER_FLOWS.md`, `SCREEN_MAP.md`) — "we couldn't check", not "you were
 * declined". Exists because `useVerificationStatus` used to fall back to `'none'` on any query
 * error, which routed a user with no cached result (most often the very first check of a flaky
 * session) straight into `VF-2`'s ID scan — indistinguishable, from the user's side, from having
 * failed an age check. `RootNavigator`'s new `transportError` stack renders this instead,
 * whenever `useVerificationStatus()` reports `'error'`.
 *
 * 🔴 Must not share a component with a decline screen (VF-8/9/10, out of scope this phase) —
 * copy here says "we don't know", never anything that could read as "you didn't pass". No
 * score, no vendor status string — same coaching-not-diagnostic rule as everywhere else in `VF`.
 */
export function TransportErrorScreen({ onRetry }: TransportErrorScreenProps) {
  return (
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        We couldn't check your verification
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        This looks like a connection problem on our side, not a problem with your ID.
      </Text>

      <View style={styles.actions}>
        <Button label="Retry" onPress={onRetry} />
        <SignOutButton />
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
