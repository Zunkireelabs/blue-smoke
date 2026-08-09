import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GradientGround, Text, tokens } from '@/shared/ui';
import { useSessionStore } from '@/app/stores/useSessionStore';
import { accountIdentifier } from '@/shared/lib/accountIdentifier';

/**
 * The landing screen once a user is signed in AND past the age gate.
 *
 * Deliberately minimal. Device pairing is P1-4.0 and the lock UI is P3-*, neither of which
 * exists yet, so this shows the account state and an honest empty state rather than
 * pretending at a device list. The empty state is the dashed-border tile the execution brief
 * calls out as "the natural treatment for Pair a device" (§3) — not yet pressable, since the
 * scan/pairing flow (P1-3.0) it would open doesn't exist yet either.
 *
 * Sign-out moved to the Profile screen in P1-8.0, which is where the TODO puts it and which is
 * reachable from this screen's header. It is still the only way back out of the gated stack.
 */
export function HomeScreen() {
  const user = useSessionStore((s) => s.user);

  return (
    <GradientGround>
      <View style={styles.header}>
        <Text variant="title" style={styles.centerText}>
          BlueSmoke
        </Text>
        {/*
          Was `{email ?? 'Signed in'}`, which rendered a blank line for every phone-only
          account: GoTrue returns `email` as an empty string rather than null, and `??` only
          falls back on null/undefined, so neither the identifier nor the fallback appeared.
        */}
        <Text variant="body" tone="secondary" style={styles.centerText}>
          {accountIdentifier(user?.email, user?.phone)}
        </Text>
      </View>

      <Text variant="label" tone="secondary" style={styles.sectionLabel}>
        Devices
      </Text>
      <View style={styles.pairTile}>
        <Text variant="label">No devices paired</Text>
        <Text variant="caption" tone="secondary" style={styles.pairTileBody}>
          Pairing arrives with the device connection work. Your account is verified and ready.
        </Text>
      </View>
    </GradientGround>
  );
}

/**
 * Shown while the age-gate query is in flight, and while an inquiry is awaiting the vendor's
 * decision. Kept in this file so the gated stack has no partial-state gaps.
 */
export function VerificationPendingScreen() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" />
      <Text variant="title" style={styles.centerText}>
        Confirming your verification…
      </Text>
      <Text variant="body" tone="secondary" style={styles.centerText}>
        We're waiting on the result. This can take a moment — you don't need to do anything else
        right now.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
    backgroundColor: tokens.color.background,
  },
  centerText: {
    textAlign: 'center',
  },
  header: {
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.xl,
  },
  sectionLabel: {
    marginBottom: tokens.spacing.sm,
  },
  pairTile: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: tokens.color.border,
    borderRadius: tokens.radii.lg,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.xs,
  },
  pairTileBody: {
    lineHeight: 20,
  },
});
