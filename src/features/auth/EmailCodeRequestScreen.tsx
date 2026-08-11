import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Screen, Text, TextField, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';
import { emailCodeRequestSchema } from './schemas';

/**
 * AU-12 — P1-1.0, step 1 of the single email front door (spec §1.2.2): type
 * an email, get a 6-digit code. `requestEmailCode` serves a brand-new
 * address and a returning one identically (`shouldCreateUser: true`), so
 * there is no separate signup/login choice to make here — unlike the old
 * Method A split this replaces.
 *
 * Built from `@/shared/ui` against our design system, modeled on
 * `PhoneInputScreen` (its closest sibling: single field, single submit,
 * same non-enumerating error discipline) rather than on Hardik's
 * `EmailCodeRequestScreen`, which imported raw React Native only.
 *
 * P1-1.0 PR 2 adds a subordinate "Use password instead" action below the
 * primary "Send code" button, navigating to `PasswordSignIn` (AU-14). It is
 * `variant="secondary"` (tone="link") and must never compete with the code
 * front door — password is a later credential, not a second entry point.
 */

type Status = 'idle' | 'submitting';

export function EmailCodeRequestScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit() {
    setFormError(null);

    const parsed = emailCodeRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
      return;
    }

    setStatus('submitting');
    try {
      const result = await authClient.requestEmailCode(parsed.data.email);

      if (!result.ok) {
        // No branching on the failure reason beyond rendering it verbatim —
        // matches every other P1-1.0 form's non-enumeration discipline.
        setFormError(result.error);
        return;
      }

      navigation.navigate('EmailCodeEntry', { email: parsed.data.email });
    } catch {
      // supabaseAuthClient's contract is that no method throws — this is
      // defence in depth, so the screen can never strand itself even if
      // that contract is ever violated.
      setFormError('Something went wrong. Please try again.');
    } finally {
      setStatus('idle');
    }
  }

  const isSubmitting = status === 'submitting';

  return (
    <Screen scroll>
      <Text variant="title" style={styles.title}>
        Enter your email
      </Text>
      <Text variant="body" tone="secondary" style={styles.subtitle}>
        We'll send you a 6-digit code.
      </Text>

      <View style={styles.field}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          autoCapitalize="none"
          editable={!isSubmitting}
          accessibilityLabel="Email"
        />
      </View>

      {formError && (
        <Text variant="caption" tone="danger" style={styles.formError}>
          {formError}
        </Text>
      )}

      <View style={styles.button}>
        <Button
          label="Send code"
          onPress={onSubmit}
          disabled={isSubmitting}
          loading={isSubmitting}
        />
      </View>

      <View style={styles.usePasswordButton}>
        <Button
          label="Use password instead"
          variant="secondary"
          disabled={isSubmitting}
          onPress={() => navigation.navigate('PasswordSignIn')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: tokens.spacing.xs,
  },
  subtitle: {
    marginBottom: tokens.spacing.lg,
  },
  field: {
    marginTop: tokens.spacing.xs,
  },
  formError: {
    marginTop: tokens.spacing.lg,
    textAlign: 'center',
  },
  button: {
    marginTop: tokens.spacing.xl,
  },
  usePasswordButton: {
    marginTop: tokens.spacing.md,
  },
});
