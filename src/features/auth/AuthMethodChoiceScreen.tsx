import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { Button, GradientGround, Text, tokens } from '@/shared/ui';
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
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        Sign up or log in
      </Text>

      <View style={styles.actions}>
        <Button label="Continue with Email" onPress={() => navigation.navigate('Login')} />
        <Button
          label="Continue with Phone"
          variant="secondary"
          onPress={() => navigation.navigate('PhoneInput')}
        />
      </View>
    </GradientGround>
  );
}

const styles = StyleSheet.create({
  sheet: {
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    marginBottom: tokens.spacing.xxl,
  },
  actions: {
    gap: tokens.spacing.md,
  },
});
