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
 * "Continue with Email" goes to `EmailCodeRequest`, not a Login screen —
 * P1-1.0 (email + code, keeping passwords) replaced the email/password split
 * with a single 6-digit-code front door, so there is no signup/login
 * distinction left to route on. "Continue with Phone" goes straight to
 * phone input for the same reason: OTP is unified for new and existing
 * numbers (spec §1.2.1), there's no separate signup/login split there
 * either.
 */
export function AuthMethodChoiceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        Sign up or log in
      </Text>

      <View style={styles.actions}>
        <Button
          label="Continue with Email"
          onPress={() => navigation.navigate('EmailCodeRequest')}
        />
        <Button
          label="Continue with Phone"
          variant="secondary"
          onPress={() => navigation.navigate('PhoneInput')}
        />
      </View>

      {/* Dev-only entry to the P1-7.0 harness, mirroring the one on Home. Here so the state
          machine is reachable without an account at all — the fake is in-memory and performs
          no privileged action. The route is `__DEV__`-gated in navigation.tsx, so this
          button must be too, or a release build renders a control that goes nowhere. */}
      {__DEV__ ? (
        <View style={styles.devActions}>
          <Button
            label="BLE discovery → connect (dev)"
            variant="secondary"
            onPress={() => navigation.navigate('BleDiscovery')}
          />
          <Button
            label="BLE connection lifecycle (dev)"
            variant="secondary"
            onPress={() => navigation.navigate('BleDemo')}
          />
        </View>
      ) : null}
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
  devActions: {
    marginTop: tokens.spacing.xxl,
    gap: tokens.spacing.md,
  },
});
