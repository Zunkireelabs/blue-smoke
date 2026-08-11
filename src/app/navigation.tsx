import { NavigationContainer, useNavigation } from '@react-navigation/native';
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from '@react-navigation/native-stack';
import { Pressable, StyleSheet, View } from 'react-native';

import { BootSplashScreen } from '@/app/BootSplashScreen';
import { AuthMethodChoiceScreen } from '@/features/auth/AuthMethodChoiceScreen';
import { EmailCodeRequestScreen } from '@/features/auth/EmailCodeRequestScreen';
import { EmailCodeEntryScreen } from '@/features/auth/EmailCodeEntryScreen';
import { PhoneInputScreen } from '@/features/auth/PhoneInputScreen';
import { OtpEntryScreen } from '@/features/auth/OtpEntryScreen';
import { PasswordSignInScreen } from '@/features/auth/PasswordSignInScreen';
import { SetPasswordScreen } from '@/features/auth/SetPasswordScreen';
import { OnboardingCarouselScreen } from '@/features/onboarding/OnboardingCarouselScreen';
import { VerifyIntroScreen } from '@/features/verification/VerifyIntroScreen';
import { CameraPrimingScreen } from '@/features/verification/CameraPrimingScreen';
import { PersonaVerificationScreen } from '@/features/verification/PersonaVerificationScreen';
import { TransportErrorScreen } from '@/features/verification/TransportErrorScreen';
import {
  useVerificationStatus,
  type VerificationState,
} from '@/features/verification/useVerificationStatus';
import { HomeScreen, VerificationPendingScreen } from '@/features/devices/HomeScreen';
import { DevicePairingPrimingScreen } from '@/features/devices/DevicePairingPrimingScreen';
import { DevicePairingGateScreen } from '@/features/devices/DevicePairingGateScreen';
import { DeviceScanScreen } from '@/features/devices/DeviceScanScreen';
import { PairingBoundaryScreen } from '@/features/devices/PairingBoundaryScreen';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { ScreenGalleryScreen } from '@/features/devgallery/ScreenGalleryScreen';
import { ScreenPreviewScreen } from '@/features/devgallery/ScreenPreviewScreen';
import { useSessionStore } from '@/app/stores/useSessionStore';
import { useOnboardingStore, type OnboardingStatus } from '@/app/stores/useOnboardingStore';
import { Text, tokens } from '@/shared/ui';

/**
 * Root param list — spec §9.2 app/navigation.tsx. Contested shared file (CLAUDE.md): every
 * feature adds its own route here. Add your route and screen, touch nothing else.
 */
export type RootStackParamList = {
  // Pre-auth, first launch only (P1-2.0)
  Onboarding: undefined;
  // Unauthenticated
  AuthChoice: undefined;
  EmailCodeRequest: undefined;
  EmailCodeEntry: { email: string };
  PhoneInput: undefined;
  OtpVerify: { phone: string };
  PasswordSignIn: undefined;
  // Authenticated, pre-verification
  VerifyIntro: undefined;
  CameraPriming: undefined;
  VerifyAge: undefined;
  TransportError: undefined;
  VerificationPending: undefined;
  // Authenticated and verified
  Home: undefined;
  Profile: undefined;
  SetPassword: undefined;
  // P1-3.0 — device pairing, F7.2-F7.5. Stops at device selection; see PairingBoundaryScreen.
  BluetoothPriming: undefined;
  BluetoothGate: undefined;
  DeviceScan: undefined;
  DevicePairingBoundary: { deviceId: string; deviceName: string | null };
  // Dev-only screen gallery (see src/features/devgallery). Registered only when __DEV__.
  ScreenGallery: undefined;
  ScreenPreview: { id: string };
};

/**
 * P1-1.0 — no `linking` config. The reset-password deep link this used to register
 * (`bluesmoke://reset-password` → the confirm screen) is gone with the reset subsystem it
 * served: the 6-digit code is the recovery path now, and there is nothing left to deep-link
 * into. That leaves the app with **no URL-reachable route at all** — every screen is
 * unreachable by URL, which matters more now the stack is gated: a deep link that could reach
 * Home would be a way around the age gate's UI.
 */
const Stack = createNativeStackNavigator<RootStackParamList>();

/** Which of the mutually exclusive stacks should be mounted. */
export type GatedStack =
  | 'boot'
  | 'onboarding'
  | 'auth'
  | 'pending'
  | 'transportError'
  | 'verify'
  | 'home';

/**
 * The gate itself, extracted from the component so it can be tested as what it is: a pure
 * decision over three inputs. Rendering assertions were the wrong tool — React Navigation
 * mounts only the focused screen, so "is Home reachable" is not observable from the tree,
 * and a test that appears to check it can quietly assert nothing.
 *
 * The ordering is deliberate and load-bearing:
 *   1. hydrating wins over everything — this now means EITHER "we don't yet know if anyone is
 *      signed in" OR "we haven't read the onboarding flag from AsyncStorage yet" (P1-2.0).
 *      Both are "we don't know", and showing anything else first risks a flash: the auth stack
 *      flashing at an already-signed-in user, or the carousel flashing at a returning one.
 *   2. signed out wins over verification — verification state is meaningless without a user
 *   3. onboarding wins over auth for a signed-out user who hasn't seen it — F1: the carousel
 *      runs BEFORE signup/login on a genuine first launch. Once `onboardingSeen === 'seen'`,
 *      this branch never fires again for that install (P1-2.0's AsyncStorage flag, chosen over
 *      Keychain specifically so a reinstall sees onboarding again rather than never).
 *   4. ONLY an explicit 'verified' reaches home; every other value, including 'loading',
 *      does not. Unknown is never treated as verified.
 *   5. 'error' (F6.X / VF-7) is checked ahead of 'verify' so a transport failure never renders
 *      as a decline — though `useVerificationStatus` only ever reports 'error' when there is no
 *      cached data at all, so in practice it can never preempt an already-known verified,
 *      pending, or declined state; this ordering is for clarity, not correctness.
 *
 * Onboarding only ever gates the pre-auth path — it cannot create a route into any gated stack,
 * so this still upholds CLAUDE.md rule 3's "no dev bypass, no skip-verification flag."
 */
export function selectStack(
  sessionStatus: 'hydrating' | 'signedOut' | 'signedIn',
  verification: VerificationState,
  onboardingStatus: OnboardingStatus,
): GatedStack {
  if (sessionStatus === 'hydrating' || onboardingStatus === 'hydrating') {
    return 'boot';
  }
  if (sessionStatus !== 'signedIn') {
    return onboardingStatus === 'seen' ? 'auth' : 'onboarding';
  }
  if (verification === 'verified') {
    return 'home';
  }
  if (verification === 'loading' || verification === 'pending') {
    return 'pending';
  }
  if (verification === 'error') {
    return 'transportError';
  }
  // 'none' and 'declined'. Both land on the Persona flow: a declined user may try again, and
  // distinguishing the two in the UI would mean telling someone why they failed, which the
  // verification-error rule prohibits.
  return 'verify';
}

/**
 * A header action rendered as text rather than an icon — OQ-7 (brand assets) is unanswered, so
 * there is no icon set to draw from and inventing one would be a brand decision. Sized to the
 * kit's minimum hit area like every other pressable.
 */
function HeaderTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.headerButton}
    >
      <Text variant="label" tone="link">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Hoisted to module scope and passed to `headerRight` by reference rather than wrapped in an
 * inline arrow. Defining it during render would give React a new component type on every pass
 * and remount the header subtree — `react/no-unstable-nested-components`. It reads navigation
 * from the hook instead of a prop precisely so the `options` object can stay static.
 */
function HomeHeaderRight() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View style={styles.headerGroup}>
      {__DEV__ && (
        <HeaderTextButton label="Screens" onPress={() => navigation.navigate('ScreenGallery')} />
      )}
      <HeaderTextButton label="Profile" onPress={() => navigation.navigate('Profile')} />
    </View>
  );
}

/**
 * Three mutually exclusive stacks, chosen by session and verification state.
 *
 * The stacks are SEPARATE rather than one stack with conditional navigation, and that is the
 * point: a screen that isn't registered cannot be navigated to, by a bug, a stale
 * `navigate()` call, or a deep link. Gating by `if` inside a single stack leaves every route
 * mounted and reachable.
 *
 * ── 🔴 What this gate is and is not (CLAUDE.md rule 3) ────────────────────────────────
 *
 * This is UX, not security. It decides which screen a user sees. It does NOT decide whether
 * a privileged action is permitted — that is `issue-device-session` re-reading the database
 * server-side (§5.4 step 2), which is unaffected by anything the client believes. Someone
 * running a patched build can render Home; they still cannot obtain a session key.
 *
 * So: never move an authorisation decision into this component because "the navigator
 * already checks it".
 */
export function RootNavigator() {
  const sessionStatus = useSessionStore((s) => s.status);
  const onboardingStatus = useOnboardingStore((s) => s.status);
  const { state: verification, refetch } = useVerificationStatus();
  const stack = selectStack(sessionStatus, verification, onboardingStatus);

  return (
    <NavigationContainer>
      {stack === 'boot' ? (
        // Restoring a Keychain-backed session. Render nothing decisive: showing the auth
        // stack here would flash a login screen at an already-signed-in user on every launch.
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="VerificationPending" component={BootSplashScreen} />
        </Stack.Navigator>
      ) : stack === 'onboarding' ? (
        // F1 — first launch, no session yet, onboarding flag unset. Its own single-screen
        // stack, exactly like 'pending'/'transportError' above: an unregistered route cannot
        // be reached by a stale navigate() call, and onboarding has no gated content behind it
        // for that property to protect, but the pattern stays consistent regardless.
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Onboarding" component={OnboardingCarouselScreen} />
        </Stack.Navigator>
      ) : stack === 'auth' ? (
        <Stack.Navigator initialRouteName="AuthChoice">
          <Stack.Screen
            name="AuthChoice"
            component={AuthMethodChoiceScreen}
            options={{ title: 'Welcome' }}
          />
          <Stack.Screen name="EmailCodeRequest" component={EmailCodeRequestScreen} options={{ title: 'Continue with email' }} />
          <Stack.Screen name="EmailCodeEntry" component={EmailCodeEntryScreen} options={{ title: 'Enter code' }} />
          <Stack.Screen name="PhoneInput" component={PhoneInputScreen} options={{ title: 'Your number' }} />
          <Stack.Screen name="OtpVerify" component={OtpEntryScreen} options={{ title: 'Enter code' }} />
          <Stack.Screen name="PasswordSignIn" component={PasswordSignInScreen} options={{ title: 'Sign in with password' }} />
        </Stack.Navigator>
      ) : stack === 'home' ? (
        <Stack.Navigator>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{
              title: 'BlueSmoke',
              // P1-8.0 — the only affordance into Profile. Home is the whole signed-in stack,
              // so without this the screen is registered but unreachable.
              headerRight: HomeHeaderRight,
            }}
          />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
          <Stack.Screen name="SetPassword" component={SetPasswordScreen} options={{ title: 'Set a password' }} />
          {/* P1-3.0 — F7.2-F7.5, device pairing entry through the hard boundary at selection. */}
          <Stack.Screen
            name="BluetoothPriming"
            component={DevicePairingPrimingScreen}
            options={{ title: 'Pair a device' }}
          />
          <Stack.Screen
            name="BluetoothGate"
            component={DevicePairingGateScreen}
            options={{ title: 'Pair a device' }}
          />
          <Stack.Screen
            name="DeviceScan"
            component={DeviceScanScreen}
            options={{ title: 'Pair a device' }}
          />
          <Stack.Screen
            name="DevicePairingBoundary"
            component={PairingBoundaryScreen}
            options={{ title: 'Pair a device' }}
          />
          {/*
            Dev-only. `__DEV__` is statically false in a release build, so these routes are not
            merely hidden — they are absent from the navigator, which is the same guarantee the
            gated stacks rely on: an unregistered screen cannot be reached at all.
          */}
          {__DEV__ && (
            <Stack.Group>
              <Stack.Screen
                name="ScreenGallery"
                component={ScreenGalleryScreen}
                options={{ title: 'Screens (dev)' }}
              />
              <Stack.Screen
                name="ScreenPreview"
                component={ScreenPreviewScreen}
                options={({ route }) => ({ title: route.params.id })}
              />
            </Stack.Group>
          )}
        </Stack.Navigator>
      ) : stack === 'pending' ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="VerificationPending" component={VerificationPendingScreen} />
        </Stack.Navigator>
      ) : stack === 'transportError' ? (
        // F6.X / VF-7 — its own single-screen stack, exactly like 'pending' above, so a
        // transport failure can never even mount PersonaVerificationScreen's ID-scan UI.
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="TransportError">
            {() => <TransportErrorScreen onRetry={() => refetch()} />}
          </Stack.Screen>
        </Stack.Navigator>
      ) : (
        <Stack.Navigator initialRouteName="VerifyIntro">
          <Stack.Screen
            name="VerifyIntro"
            component={VerifyIntroScreen}
            options={{ title: 'Age Verification' }}
          />
          <Stack.Screen
            name="CameraPriming"
            component={CameraPrimingScreen}
            options={{ title: 'Camera access' }}
          />
          <Stack.Screen
            name="VerifyAge"
            component={PersonaVerificationScreen}
            options={{ title: 'Age Verification' }}
          />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    minHeight: tokens.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  headerGroup: { flexDirection: 'row', alignItems: 'center' },
});
