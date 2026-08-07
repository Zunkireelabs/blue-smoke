import { NavigationContainer, useNavigation, type LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SignupScreen } from '@/features/auth/SignupScreen';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { AuthMethodChoiceScreen } from '@/features/auth/AuthMethodChoiceScreen';
import { PhoneInputScreen } from '@/features/auth/PhoneInputScreen';
import { OtpEntryScreen } from '@/features/auth/OtpEntryScreen';
import { PasswordResetRequestScreen } from '@/features/auth/PasswordResetRequestScreen';
import { ResetPasswordConfirmScreen } from '@/features/auth/ResetPasswordConfirmScreen';
import { RESET_PASSWORD_URL_HOST, RESET_PASSWORD_URL_SCHEME } from '@/features/auth/deepLink';
import { PersonaVerificationScreen } from '@/features/verification/PersonaVerificationScreen';

/**
 * Root param list — spec §9.2 app/navigation.tsx. Contested shared file
 * (CLAUDE.md): every feature adds its own route here. Add your route and
 * screen, touch nothing else.
 */
export type RootStackParamList = {
  Home: undefined;
  AuthChoice: undefined;
  Signup: undefined;
  Login: undefined;
  PhoneInput: undefined;
  OtpVerify: { phone: string };
  PasswordReset: undefined;
  ResetPasswordConfirm: undefined;
  VerifyAge: undefined;
};

/**
 * P1-1.0 §3.2 — deep-link config for the reset-password link
 * (`deepLink.ts`). Maps `bluesmoke://reset-password` to the confirm screen.
 * Native registration (URL scheme in Info.plist / intent-filter in
 * AndroidManifest.xml) is separate — see those files — this is the RN side
 * that turns an opened URL into a navigation action.
 */
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [`${RESET_PASSWORD_URL_SCHEME}://`],
  config: {
    screens: {
      // Every other screen is unreachable by URL — only the one path this
      // task's deep link needs is registered.
      ResetPasswordConfirm: RESET_PASSWORD_URL_HOST,
    },
  },
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Placeholder screen (P0-4.0 scaffold), carrying two temporary entry points:
 * "Get started" into the auth flow (P1-1.0) and "Verify your age" into the
 * Persona flow (P2-1.0). Neither is the real shape — the age gate belongs
 * AFTER authentication, not beside it, and this screen has no session
 * awareness at all. Both are kept only so the merge regresses nothing that
 * already worked on either branch; the session-gated navigator replaces this
 * whole screen.
 */
function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>BlueSmoke</Text>
      <Pressable
        style={styles.button}
        onPress={() => navigation.navigate('AuthChoice')}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Get started</Text>
      </Pressable>
      <Pressable
        style={styles.button}
        onPress={() => navigation.navigate('VerifyAge')}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Verify your age</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export function RootNavigator() {
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="AuthChoice" component={AuthMethodChoiceScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="PhoneInput" component={PhoneInputScreen} />
        <Stack.Screen name="OtpVerify" component={OtpEntryScreen} />
        <Stack.Screen name="PasswordReset" component={PasswordResetRequestScreen} />
        <Stack.Screen name="ResetPasswordConfirm" component={ResetPasswordConfirmScreen} />
        <Stack.Screen
          name="VerifyAge"
          component={PersonaVerificationScreen}
          options={{ title: 'Age Verification' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
