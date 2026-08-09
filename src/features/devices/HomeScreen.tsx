import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSessionStore } from '@/app/stores/useSessionStore';
import { accountIdentifier } from '@/shared/lib/accountIdentifier';

/**
 * The landing screen once a user is signed in AND past the age gate.
 *
 * Deliberately minimal. Device pairing is P1-4.0 and the lock UI is P3-*, neither of which
 * exists yet, so this shows the account state and an honest empty state rather than
 * pretending at a device list.
 *
 * Sign-out moved to the Profile screen in P1-8.0, which is where the TODO puts it and which is
 * reachable from this screen's header. It is still the only way back out of the gated stack.
 */
export function HomeScreen() {
  const user = useSessionStore((s) => s.user);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>BlueSmoke</Text>
        {/*
          Was `{email ?? 'Signed in'}`, which rendered a blank line for every phone-only
          account: GoTrue returns `email` as an empty string rather than null, and `??` only
          falls back on null/undefined, so neither the identifier nor the fallback appeared.
        */}
        <Text style={styles.subtitle}>{accountIdentifier(user?.email, user?.phone)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>No devices paired</Text>
        <Text style={styles.cardBody}>
          Pairing arrives with the device connection work. Your account is verified and ready.
        </Text>
      </View>
    </View>
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
      <Text style={styles.title}>Confirming your verification…</Text>
      <Text style={styles.cardBody}>
        We're waiting on the result. This can take a moment — you don't need to do anything
        else right now.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 24 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  header: { gap: 4, marginTop: 24 },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#666' },
  card: { backgroundColor: '#f4f4f5', borderRadius: 12, padding: 20, gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardBody: { fontSize: 14, color: '#555', textAlign: 'center', lineHeight: 20 },
});
