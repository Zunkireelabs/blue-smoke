import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, EmptyState, GradientGround, Text, tokens } from '@/shared/ui';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { useSessionStore } from '@/app/stores/useSessionStore';
import { accountIdentifier } from '@/shared/lib/accountIdentifier';
import type { RootStackParamList } from '@/app/navigation';

// F6.P (USER_FLOWS.md) — after roughly this long pending, stop implying imminence and offer an
// exit rather than a bare spinner with no timeout (DE-8).
const TAKING_LONGER_MS = 2 * 60 * 1000;

/**
 * The landing screen once a user is signed in AND past the age gate.
 *
 * DV-1/DV-2 (F7.1, `SCREEN_MAP.md`) — P1-3.0 replaces the old hardcoded "No devices paired"
 * card with the real empty state. DV-1 (list) and DV-2 (zero state) collapse into one render
 * here because no paired-device store exists yet — pairing dead-ends at `PairingBoundaryScreen`
 * (OQ-12), so a paired device can never actually reach this screen in the current build. When a
 * device store lands (P1-5.0), that's the point to branch this into an actual list.
 *
 * Sign-out moved to the Profile screen in P1-8.0, which is where the TODO puts it and which is
 * reachable from this screen's header. It is still the only way back out of the gated stack.
 */
export function HomeScreen() {
  const user = useSessionStore((s) => s.user);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

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
      <EmptyState
        title="No devices paired"
        body="Pair your BlueSmoke to lock and unlock it from your phone."
      />
      <View style={styles.pairAction}>
        <Button
          label="Pair a device"
          onPress={() => navigation.navigate('BluetoothPriming')}
        />
      </View>

      {__DEV__ && (
        // The only way to reach H158BringUpScreen on a real build. That route is registered
        // behind `__DEV__` on this same stack (navigation.tsx), but nothing navigated to it,
        // so bench sessions were reaching it by hand-editing navigation.tsx — an uncommitted
        // auth bypass, re-created under time pressure. A button here needs no bypass at all:
        // you are already signed in and past the age gate by the time this screen mounts.
        // Stripped from release bundles with the rest of the `__DEV__` branches.
        <View style={styles.pairAction}>
          <Button
            label="H158 bring-up (dev)"
            variant="secondary"
            onPress={() => navigation.navigate('H158BringUp')}
          />
        </View>
      )}
    </GradientGround>
  );
}

/**
 * VF-3 / VF-4 (F6.5, F6.P — `SCREEN_MAP.md`'s navigation-structure table assigns VF-3 to this
 * exact `pending` stack). Shown while the age-gate query is in flight, and while an inquiry is
 * awaiting the vendor's decision. Kept in this file so the gated stack has no partial-state
 * gaps.
 *
 * F6.Z — this was a second instance of the same stranding trap `PersonaVerificationScreen` had:
 * zero controls, on a stack `sessionStatus === 'signedIn'` keeps mounted indefinitely. Now
 * carries a persistent sign-out. After `TAKING_LONGER_MS`, the copy stops implying the check is
 * seconds away (VF-4) — "We'll notify you" is reassurance copy, not a button: there is no push
 * wiring to opt into (SY-2/3 are blocked on a backend that doesn't exist), and a button with no
 * destination is exactly the dead-CTA bug this project's tests exist to catch.
 */
export function VerificationPendingScreen() {
  const [takingLonger, setTakingLonger] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTakingLonger(true), TAKING_LONGER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" />
      {takingLonger ? (
        <>
          <Text variant="title" style={styles.centerText}>
            This is taking longer than usual
          </Text>
          <Text variant="body" tone="secondary" style={styles.centerText}>
            Nothing's wrong, and you don't need to do anything. We'll let you know as soon as
            it's done.
          </Text>
        </>
      ) : (
        <>
          <Text variant="title" style={styles.centerText}>
            Confirming your verification…
          </Text>
          <Text variant="body" tone="secondary" style={styles.centerText}>
            We're waiting on the result. This can take a moment — you don't need to do anything
            else right now.
          </Text>
        </>
      )}
      <View style={styles.signOut}>
        <SignOutButton />
      </View>
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
  signOut: {
    marginTop: tokens.spacing.xl,
    alignSelf: 'stretch',
  },
  header: {
    gap: tokens.spacing.xs,
    marginBottom: tokens.spacing.xl,
  },
  sectionLabel: {
    marginBottom: tokens.spacing.sm,
  },
  pairAction: {
    marginTop: tokens.spacing.lg,
  },
});
