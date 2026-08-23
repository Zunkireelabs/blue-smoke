import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { Button, GradientGround, Text, tokens } from '@/shared/ui';
import { SignOutButton } from '@/features/auth/SignOutButton';
import type { RootStackParamList } from '@/app/navigation';

/**
 * VF-1 (F6.1, `USER_FLOWS.md`, `SCREEN_MAP.md`) — the entry point to the verification flow.
 * Copy is `VERIFICATION_COPY.md`'s F6.1 deck; this is the screen that makes the ID request
 * reasonable rather than invasive — the consent actually happens here.
 *
 * Carries a sign-out (F6.Z — every screen on the `verify` stack needs one) rather than the copy
 * deck's "Not now": there is nowhere else on this stack to return to, so the only honest "not
 * now" is leaving the flow entirely.
 *
 * 🔴 Does not say the check confirms the user IS 18+ — only that it's required and that a
 * partner performs it. `min_age` (CLAUDE.md, TECHNICAL_SPEC.md:1031): Persona's `approved`
 * means "passed the checks the template was configured with," not "is over 18," and no code
 * here can verify which. See the equivalent note on `VerifiedOutcome` copy once that exists.
 */
export function VerifyIntroScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        Let's check you're 18 or over
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        It's a legal requirement before you can use a Blue Smoke device.
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        Our verification partner handles this — you'll take a photo of your ID and a selfie
        inside their secure flow.
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        We never see either one. They check your documents and tell us one thing: yes or no.
      </Text>

      <View style={styles.actions}>
        <Button label="Continue" onPress={() => navigation.navigate('CameraPriming')} />
        <SignOutButton />
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
    marginBottom: tokens.spacing.lg,
  },
  body: {
    textAlign: 'center',
    marginBottom: tokens.spacing.sm,
  },
  actions: {
    marginTop: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
});
