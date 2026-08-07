import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RootStackParamList } from '@/app/navigation';

/**
 * P1-1.0 §3.1 — the single decision point before either auth method (spec
 * §1.2.1: "users choose either at signup/login; both resolve to the same
 * auth.users.id"). No default pre-selected, equal visual weight — this
 * screen does not decide which method is "primary."
 *
 * "Continue with Email" goes to Login, not Signup: email/password already
 * distinguishes new vs. returning users, and login is the more common case
 * at this entry point. Signup is one tap away via the link that screen
 * adds. "Continue with Phone" goes straight to phone input — OTP is
 * unified for new and existing numbers (spec §1.2.1), there's no separate
 * signup/login split to choose between.
 */
export function AuthMethodChoiceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign up or log in</Text>

      <Pressable
        style={styles.button}
        onPress={() => navigation.navigate('Login')}
        accessibilityRole="button"
        accessibilityLabel="Continue with Email"
      >
        <Text style={styles.buttonText}>Continue with Email</Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => navigation.navigate('PhoneInput')}
        accessibilityRole="button"
        accessibilityLabel="Continue with Phone"
      >
        <Text style={styles.buttonText}>Continue with Phone</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
