import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Screen, Text, TextField, tokens } from '@/shared/ui';
import { useAuthClient } from './AuthClientContext';
import { passwordSignInSchema } from './schemas';

/**
 * AU-14 — P1-1.0 PR 2. Email + password sign-in, reached only via
 * `EmailCodeRequestScreen`'s subordinate "Use password instead" action.
 * Never a competing front door — see `client.ts` and `schemas.ts`.
 *
 * No manual navigation on success: `useSessionStore`'s `onAuthStateChange`
 * listener drives the switch to the Home stack, same as every other auth
 * screen (`EmailCodeEntryScreen`, `OtpEntryScreen`).
 *
 * Non-enumerating error copy only — `signInWithEmail` already returns one
 * generic message for "no such account", "wrong password" and "no password
 * set" alike (`supabaseAuthClient.ts`), rendered verbatim here.
 */

type Status = 'idle' | 'submitting';

export function PasswordSignInScreen() {
  const authClient = useAuthClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit() {
    setFormError(null);

    const parsed = passwordSignInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Check the details above.');
      return;
    }

    setStatus('submitting');
    try {
      const result = await authClient.signInWithEmail(parsed.data.email, parsed.data.password);

      if (!result.ok) {
        setFormError(result.error);
        setStatus('idle');
        return;
      }
      // Session established — onAuthStateChange takes it from here.
    } catch {
      setFormError('Something went wrong. Please try again.');
      setStatus('idle');
    }
  }

  const isSubmitting = status === 'submitting';

  return (
    <Screen scroll>
      <Text variant="title" style={styles.title}>
        Sign in with password
      </Text>

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
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        editable={!isSubmitting}
        accessibilityLabel="Password"
      />

      {formError && (
        <Text variant="caption" tone="danger" style={styles.formError}>
          {formError}
        </Text>
      )}

      <View style={styles.button}>
        <Button
          label="Sign in"
          onPress={onSubmit}
          disabled={isSubmitting}
          loading={isSubmitting}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: tokens.spacing.lg,
  },
  formError: {
    marginTop: tokens.spacing.lg,
    textAlign: 'center',
  },
  button: {
    marginTop: tokens.spacing.xl,
  },
});
