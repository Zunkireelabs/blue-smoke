import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Screen, Text, TextField, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';
import { loginSchema } from './schemas';

/**
 * P1-1.0 Method A — login screen (spec §1.2). Same hand-rolled zod
 * validation approach as SignupScreen.tsx (see its header comment for why
 * no @hookform/resolvers).
 *
 * The one rule this screen exists to enforce: whatever `signInWithEmail`
 * returns on failure is rendered verbatim, with no screen-level branching
 * on the reason. Both `AuthClient` implementations already collapse "wrong
 * password" and "unknown email" into one generic message —
 * TODO-phase-1.md P1-1.0: "error handling that does not leak account
 * existence." Don't undo that here.
 *
 * Auth calls go through `useAuthClient()` (§3.5) — never
 * `@supabase/supabase-js` directly, so this screen is testable against
 * `createMockAuthClient()` with no backend.
 */

type FormValues = {
  email: string;
  password: string;
};

type Status = 'idle' | 'submitting' | 'signedIn';

export function LoginScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormValues | undefined;
        if (field) {
          setError(field, { message: issue.message });
        }
      }
      return;
    }

    setStatus('submitting');
    try {
      const result = await authClient.signInWithEmail(parsed.data.email, parsed.data.password);
      if (!result.ok) {
        setStatus('idle');
        setFormError(result.error);
        return;
      }

      setStatus('signedIn');
    } catch {
      // supabaseAuthClient's contract is that no method throws — this is
      // defence in depth, so a screen can never strand itself even if that
      // contract is ever violated (see execution brief).
      setStatus('idle');
      setFormError('Something went wrong. Please try again.');
    }
  }

  if (status === 'signedIn') {
    return (
      <Screen>
        <Text variant="title" style={styles.centerText}>
          Signed in
        </Text>
      </Screen>
    );
  }

  const isSubmitting = status === 'submitting';

  return (
    <Screen scroll centered={false}>
      <Text variant="title" style={styles.title}>
        Log in
      </Text>

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Email"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={!isSubmitting}
            error={errors.email?.message}
            accessibilityLabel="Email"
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Password"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            secureTextEntry
            autoComplete="password"
            editable={!isSubmitting}
            error={errors.password?.message}
            accessibilityLabel="Password"
          />
        )}
      />

      <View style={styles.forgotPassword}>
        <Button
          label="Forgot password?"
          variant="secondary"
          onPress={() => navigation.navigate('PasswordReset')}
        />
      </View>

      {formError && (
        <Text variant="caption" tone="danger" style={styles.formError}>
          {formError}
        </Text>
      )}

      <View style={styles.button}>
        <Button
          label="Log in"
          loading={isSubmitting}
          disabled={isSubmitting}
          onPress={handleSubmit(onSubmit)}
        />
      </View>

      <Button
        label="New here? Create an account"
        variant="secondary"
        onPress={() => navigation.navigate('Signup')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerText: {
    textAlign: 'center',
  },
  title: {
    marginBottom: tokens.spacing.lg,
  },
  forgotPassword: {
    marginTop: tokens.spacing.sm,
    alignSelf: 'flex-end',
  },
  formError: {
    marginTop: tokens.spacing.lg,
    textAlign: 'center',
  },
  button: {
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },
});
