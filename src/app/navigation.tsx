import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BootSplashScreen } from '@/app/BootSplashScreen';
import type { AuthMode } from '@/features/auth/authMode';
import { EmailCodeRequestScreen } from '@/features/auth/EmailCodeRequestScreen';
import { EmailCodeEntryScreen } from '@/features/auth/EmailCodeEntryScreen';
import { PhoneInputScreen } from '@/features/auth/PhoneInputScreen';
import { OtpEntryScreen } from '@/features/auth/OtpEntryScreen';
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
import { PairDeviceScreen } from '@/features/devices/PairDeviceScreen';
import { H158BringUpScreen } from '@/features/ble/h158/H158BringUpScreen';
import { DevicePairingPrimingScreen } from '@/features/devices/DevicePairingPrimingScreen';
import { DevicePairingGateScreen } from '@/features/devices/DevicePairingGateScreen';
import { DeviceScanScreen } from '@/features/devices/DeviceScanScreen';
import { PairingBoundaryScreen } from '@/features/devices/PairingBoundaryScreen';
import { H158GateScreen } from '@/features/devices/H158GateScreen';
import { H158PairScreen } from '@/features/devices/H158PairScreen';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { ScreenGalleryScreen } from '@/features/devgallery/ScreenGalleryScreen';
import { ScreenPreviewScreen } from '@/features/devgallery/ScreenPreviewScreen';
import { useSessionStore } from '@/app/stores/useSessionStore';
import { useOnboardingStore, type OnboardingStatus } from '@/app/stores/useOnboardingStore';

/**
 * Root param list — spec §9.2 app/navigation.tsx. Contested shared file (CLAUDE.md): every
 * feature adds its own route here. Add your route and screen, touch nothing else.
 */
export type RootStackParamList = {
  // Pre-auth, first launch only (P1-2.0)
  Onboarding: undefined;
  // Unauthenticated
  /**
   * ⚠️ Registered nowhere. AU-1 was retired when the reference auth design landed: the channel
   * choice now lives *on* the phone screen, as its "or continue with → Email" button, so a
   * separate chooser has nothing left to do. `AuthMethodChoiceScreen.tsx` is kept on disk
   * (Sadin, 2026-08-12) but is unreachable — this entry exists only so that orphaned file and
   * its test still typecheck. A `navigate('AuthChoice')` compiles and then fails at runtime;
   * there is no screen to land on.
   */
  AuthChoice: undefined;
  /**
   * `mode` selects copy only — headline and legal line. Both modes run the identical 6-digit
   * code path, because there is no separate signup vs login in this backend (P1-1.0 retired
   * AU-2/3/4). Defaults to signup: that is where a user arrives from onboarding.
   */
  EmailCodeRequest: { mode?: AuthMode } | undefined;
  /** See `OtpVerify` — `mode` rides along so the channel-switch escape keeps the arriving copy. */
  EmailCodeEntry: { email: string; mode?: AuthMode };
  /** See `EmailCodeRequest` — `mode` is copy-only here too. */
  PhoneInput: { mode?: AuthMode } | undefined;
  /** `mode` is carried through so the "or continue with → Email" escape keeps the copy the user
   *  arrived in; see `EmailCodeRequest`. Copy only, same as everywhere else it appears. */
  OtpVerify: { phone: string; mode?: AuthMode };
  /**
   * ⚠️ Registered nowhere, as of the reference auth restyle (Sadin, 2026-08-12). Password
   * sign-in is a *state* of `EmailCodeRequest` now, on the same sheet under the same chrome —
   * the reference puts both credentials on one screen. `PasswordSignInScreen.tsx` is kept on
   * disk, same treatment as `AuthChoice`, and this entry exists only so it and its test still
   * typecheck. A `navigate('PasswordSignIn')` compiles and then fails at runtime.
   */
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
  // feature/ble-connectivity's own pairing screen (scanner.ts/BleScannerLike-based) — registered
  // but currently unreferenced; see the merge-finding comment where it's registered below.
  PairDevice: undefined;
  // Real-hardware H158 pairing, reached from Home's live "Pair a device" button — see
  // H158GateScreen.tsx/H158PairScreen.tsx. Parallel to the §4 BluetoothGate/DeviceScan chain
  // above, not a replacement for it; that one still stops at DevicePairingBoundary (OQ-12).
  H158Gate: undefined;
  H158Pair: undefined;
  // Dev-only screen gallery (see src/features/devgallery). Registered only when __DEV__.
  ScreenGallery: undefined;
  ScreenPreview: { id: string };
  // Dev-only bring-up spike for the real H158/YP65-AT hardware — see
  // src/features/ble/h158/H158BringUpScreen.tsx. Not §4, not PairDevice.
  H158BringUp: undefined;
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

/**
 * Navigation ref for code outside the React tree — notifee press events
 * (`notificationNavigation.ts`) fire from notifee's own listener, not a hook, so they need a
 * ref rather than `useNavigation()`. Always guard on `navigationRef.isReady()` before calling
 * `navigate` — a press can land before `<NavigationContainer>` has mounted (cold start from a
 * killed state).
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

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
    <NavigationContainer ref={navigationRef}>
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
        // Phone entry is the front door now — AU-1's chooser was retired with the reference
        // design (see `AuthChoice` in RootStackParamList). Only the restyled screens set
        // `headerShown: false`; the rest still rely on the native header for their back button
        // until they are restyled in turn.
        <Stack.Navigator initialRouteName="PhoneInput">
          {/* Listed first as well as named in `initialRouteName`. React Navigation falls back to
              the first registered screen whenever the named initial route doesn't take, and this
              screen being the front door is not something to leave resting on one mechanism —
              getting it wrong drops the user onto the email form with no back button and no way
              to reach the phone path at all. */}
          <Stack.Screen
            name="PhoneInput"
            component={PhoneInputScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EmailCodeRequest"
            component={EmailCodeRequestScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="EmailCodeEntry"
            component={EmailCodeEntryScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="OtpVerify"
            component={OtpEntryScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      ) : stack === 'home' ? (
        <Stack.Navigator>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{
              // Home now builds its own header (avatar + dev "Screens" link, centered) so the
              // gradient can run edge-to-edge behind the status bar — see HomeScreen.tsx.
              headerShown: false,
            }}
          />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
          <Stack.Screen name="SetPassword" component={SetPasswordScreen} options={{ title: 'Set a password' }} />
          {/* P1-3.0 — F7.2-F7.5, device pairing entry through the hard boundary at selection.
              No native header — `BluetoothPrimingScreen` renders its own gradient + "BlueSmoke"
              + curtain shell, matching Home's. `slide_from_bottom` makes entering it read as
              Home's own curtain continuing to rise, landing at the same resting height. */}
          <Stack.Screen
            name="BluetoothPriming"
            component={DevicePairingPrimingScreen}
            options={{ headerShown: false, animation: 'slide_from_bottom' }}
          />
          <Stack.Screen
            name="BluetoothGate"
            component={DevicePairingGateScreen}
            options={{ title: 'Pair a device' }}
          />
          {/* No native header — DeviceScanScreen renders its own full-bleed gradient (matching
              Home's) with its own back control, same reasoning as Home itself above. */}
          <Stack.Screen name="DeviceScan" component={DeviceScanScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="DevicePairingBoundary"
            component={PairingBoundaryScreen}
            options={{ title: 'Pair a device' }}
          />
          {/*
            🔴 Merge finding, 2026-08-23: two independent pairing-flow implementations exist —
            this four-screen BluetoothPriming→...→DevicePairingBoundary flow (stage) and the
            single-screen PairDeviceScreen below (feature/ble-connectivity, built against
            scanner.ts/BleScannerLike). Home's CTA now points at this one; PairDevice stays
            registered so the file isn't silently orphaned, but nothing navigates to it any
            more. Needs a team decision on which one is canonical — see the session log.
          */}
          <Stack.Screen
            name="PairDevice"
            component={PairDeviceScreen}
            options={{ title: 'Pair device' }}
          />
          {/* Real H158 hardware chain — Home's live "Pair a device" button lands here (see
              HomeScreen.tsx's PairingModal onContinue). No native header, matching the gate's
              own leaf screens (GradientGround-based, no nav bar). */}
          <Stack.Screen name="H158Gate" component={H158GateScreen} options={{ headerShown: false }} />
          <Stack.Screen name="H158Pair" component={H158PairScreen} options={{ headerShown: false }} />
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
              <Stack.Screen
                name="H158BringUp"
                component={H158BringUpScreen}
                options={{ title: 'H158 bring-up' }}
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
