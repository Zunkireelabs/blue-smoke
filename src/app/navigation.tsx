import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { SignupScreen } from '@/features/auth/SignupScreen';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { AuthMethodChoiceScreen } from '@/features/auth/AuthMethodChoiceScreen';
import { PhoneInputScreen } from '@/features/auth/PhoneInputScreen';
import { OtpEntryScreen } from '@/features/auth/OtpEntryScreen';
import { PasswordResetRequestScreen } from '@/features/auth/PasswordResetRequestScreen';
import { ResetPasswordConfirmScreen } from '@/features/auth/ResetPasswordConfirmScreen';
import { RESET_PASSWORD_URL_HOST, RESET_PASSWORD_URL_SCHEME } from '@/features/auth/deepLink';
import { PersonaVerificationScreen } from '@/features/verification/PersonaVerificationScreen';
import {
  useVerificationStatus,
  type VerificationState,
} from '@/features/verification/useVerificationStatus';
import { HomeScreen, VerificationPendingScreen } from '@/features/devices/HomeScreen';
import { BleDemoScreen } from '@/features/ble/BleDemoScreen';
import { BleDiscoveryScreen } from '@/features/ble/BleDiscoveryScreen';
import { useSessionStore } from '@/app/stores/useSessionStore';

/**
 * Root param list — spec §9.2 app/navigation.tsx. Contested shared file (CLAUDE.md): every
 * feature adds its own route here. Add your route and screen, touch nothing else.
 */
export type RootStackParamList = {
  // Unauthenticated
  AuthChoice: undefined;
  Signup: undefined;
  Login: undefined;
  PhoneInput: undefined;
  OtpVerify: { phone: string };
  PasswordReset: undefined;
  ResetPasswordConfirm: undefined;
  // Authenticated, pre-verification
  VerifyAge: undefined;
  VerificationPending: undefined;
  // Authenticated and verified
  Home: undefined;
  /** Dev-only P1-7.0 harness — registered under `__DEV__` only, see the home stack below. */
  BleDemo: undefined;
  /** Dev-only §4.1 discovery → connection flow. Same `__DEV__` gating as BleDemo. */
  BleDiscovery: undefined;
};

/**
 * P1-1.0 §3.2 — deep-link config for the reset-password link (`deepLink.ts`). Maps
 * `bluesmoke://reset-password` to the confirm screen. Native registration (URL scheme in
 * Info.plist / intent-filter in AndroidManifest.xml) is separate — see those files — this is
 * the RN side that turns an opened URL into a navigation action.
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [`${RESET_PASSWORD_URL_SCHEME}://`],
  config: {
    screens: {
      // Every other screen is unreachable by URL — only the one path the reset flow needs is
      // registered. That matters more now the stack is gated: a deep link that could reach
      // Home would be a way around the age gate's UI.
      ResetPasswordConfirm: RESET_PASSWORD_URL_HOST,
    },
  },
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Which of the mutually exclusive stacks should be mounted. */
export type GatedStack = 'boot' | 'auth' | 'pending' | 'verify' | 'home';

/**
 * The gate itself, extracted from the component so it can be tested as what it is: a pure
 * decision over two inputs. Rendering assertions were the wrong tool — React Navigation
 * mounts only the focused screen, so "is Home reachable" is not observable from the tree,
 * and a test that appears to check it can quietly assert nothing.
 *
 * The ordering is deliberate and load-bearing:
 *   1. hydrating wins over everything — we do not yet know if anyone is signed in
 *   2. signed out wins over verification — verification state is meaningless without a user
 *   3. ONLY an explicit 'verified' reaches home; every other value, including 'loading',
 *      does not. Unknown is never treated as verified.
 */
export function selectStack(
  sessionStatus: 'hydrating' | 'signedOut' | 'signedIn',
  verification: VerificationState,
): GatedStack {
  if (sessionStatus === 'hydrating') {
    return 'boot';
  }
  if (sessionStatus !== 'signedIn') {
    return 'auth';
  }
  if (verification === 'verified') {
    return 'home';
  }
  if (verification === 'loading' || verification === 'pending') {
    return 'pending';
  }
  // 'none' and 'declined'. Both land on the Persona flow: a declined user may try again, and
  // distinguishing the two in the UI would mean telling someone why they failed, which the
  // verification-error rule prohibits.
  return 'verify';
}

function BootSplash() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" />
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
  const { state: verification } = useVerificationStatus();
  const stack = selectStack(sessionStatus, verification);

  return (
    <NavigationContainer linking={linking}>
      {stack === 'boot' ? (
        // Restoring a Keychain-backed session. Render nothing decisive: showing the auth
        // stack here would flash a login screen at an already-signed-in user on every launch.
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="VerificationPending" component={BootSplash} />
        </Stack.Navigator>
      ) : stack === 'auth' ? (
        <Stack.Navigator initialRouteName="AuthChoice">
          <Stack.Screen
            name="AuthChoice"
            component={AuthMethodChoiceScreen}
            options={{ title: 'Welcome' }}
          />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="PhoneInput" component={PhoneInputScreen} />
          <Stack.Screen name="OtpVerify" component={OtpEntryScreen} />
          <Stack.Screen name="PasswordReset" component={PasswordResetRequestScreen} />
          <Stack.Screen name="ResetPasswordConfirm" component={ResetPasswordConfirmScreen} />
          {/* Also registered here, not only in the home stack, because the P1-7.0 harness
              drives an in-memory fake and performs no privileged action — requiring a
              verified account to reach a BLE state-machine demo is friction with no
              benefit. This does not weaken the gate: per this file's own note the gate is
              UX, not security (the authority is `issue-device-session` server-side), and
              `linking` above registers no URL for this route, so it stays undeep-linkable. */}
          {__DEV__ ? (
            <>
              <Stack.Screen
                name="BleDemo"
                component={BleDemoScreen}
                options={{ title: 'BLE connection (dev)' }}
              />
              <Stack.Screen
                name="BleDiscovery"
                component={BleDiscoveryScreen}
                options={{ title: 'BLE discovery (dev)' }}
              />
            </>
          ) : null}
        </Stack.Navigator>
      ) : stack === 'home' ? (
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'BlueSmoke' }} />
          {/* Dev-only: a screen that isn't registered cannot be navigated to, so the
              production build has no route to the P1-7.0 harness at all — same reasoning
              as the separate-stacks gate above, applied to a developer tool. */}
          {__DEV__ ? (
            <>
              <Stack.Screen
                name="BleDemo"
                component={BleDemoScreen}
                options={{ title: 'BLE connection (dev)' }}
              />
              <Stack.Screen
                name="BleDiscovery"
                component={BleDiscoveryScreen}
                options={{ title: 'BLE discovery (dev)' }}
              />
            </>
          ) : null}
        </Stack.Navigator>
      ) : stack === 'pending' ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="VerificationPending" component={VerificationPendingScreen} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
