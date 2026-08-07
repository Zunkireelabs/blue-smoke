import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SignupScreen } from '@/features/auth/SignupScreen';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { AuthMethodChoiceScreen } from '@/features/auth/AuthMethodChoiceScreen';
import { PhoneInputScreen } from '@/features/auth/PhoneInputScreen';
import { OtpEntryScreen } from '@/features/auth/OtpEntryScreen';

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
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Placeholder screen (P0-4.0 scaffold) — not P1-1.0's to redesign. The one
 * addition here is the entry point into the auth method choice screen,
 * explicitly deferred to this task by the earlier signup/login commits
 * ("wiring a real entry point belongs with the auth-method choice screen").
 * P1-2.0's onboarding flow will likely replace this as the app's actual
 * initial route; not decided here.
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
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="AuthChoice" component={AuthMethodChoiceScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="PhoneInput" component={PhoneInputScreen} />
        <Stack.Screen name="OtpVerify" component={OtpEntryScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
