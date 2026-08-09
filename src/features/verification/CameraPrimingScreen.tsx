import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { Button, GradientGround, Text, tokens } from '@/shared/ui';
import { SignOutButton } from '@/features/auth/SignOutButton';
import type { RootStackParamList } from '@/app/navigation';

/**
 * ON-5 (F6.2, `SCREEN_MAP.md`) — camera priming, shown at the start of verification only, never
 * at app launch (`ON-4`/`ON-6` share that same "primed at the moment of need" rule). Lives under
 * `src/features/verification/` rather than a general `onboarding` feature because this instance
 * of ON-5 is wired specifically into the verification flow, ahead of `VF-2`; the other ON
 * screens (`ON-1…4`, `ON-6…9`) are unbuilt (Phase C, `P1-2.0`).
 *
 * Copy: `VERIFICATION_COPY.md` F6.2. Shown *before* the OS permission dialog, never instead of
 * it — the OS dialog itself fires once Persona's SDK first touches the camera, inside `VF-2`.
 */
export function CameraPrimingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <GradientGround style={styles.sheet}>
      <Text variant="title" style={styles.title}>
        Camera access
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        Our verification partner needs your camera to photograph your ID and take a selfie.
      </Text>
      <Text variant="body" tone="secondary" style={styles.body}>
        The photos go straight to them. Blue Smoke never receives them.
      </Text>

      <View style={styles.actions}>
        <Button label="Continue" onPress={() => navigation.navigate('VerifyAge')} />
        <Button
          label="Why do you need this?"
          variant="secondary"
          onPress={() => navigation.goBack()}
        />
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
