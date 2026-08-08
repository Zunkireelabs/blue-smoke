import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuthClient } from '@/features/auth/AuthClientContext';
import { useSessionStore } from '@/app/stores/useSessionStore';

/**
 * The landing screen once a user is signed in AND past the age gate.
 *
 * Deliberately minimal. Device pairing is P1-4.0 and the lock UI is P3-*, neither of which
 * exists yet, so this shows the account state and an honest empty state rather than
 * pretending at a device list. The one thing it must get right today is sign-out, because
 * that is the only way back out of the gated stack while testing.
 */
export function HomeScreen() {
  const authClient = useAuthClient();
  const email = useSessionStore((s) => s.user?.email ?? null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>BlueSmoke</Text>
        <Text style={styles.subtitle}>{email ?? 'Signed in'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>No devices paired</Text>
        <Text style={styles.cardBody}>
          Pairing arrives with the device connection work. Your account is verified and ready.
        </Text>
      </View>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => {
          // Fire-and-forget: the session store's onAuthStateChange listener drives the UI
          // back to the auth stack, so there is nothing to await here.
          authClient.signOut().catch(() => {});
        }}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>Sign out</Text>
      </Pressable>
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
  secondaryButton: { paddingVertical: 12, alignItems: 'center' },
  secondaryButtonText: { fontSize: 15, color: '#1a1a1a', fontWeight: '600' },
});
