import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Screen, Text, TextField, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';
import { passwordResetRequestSchema } from './schemas';

/**
 * P1-1.0 Method A — password reset request (spec §1.2). Same hand-rolled
 * zod validation approach as Signup/LoginScreen (see SignupScreen's header
 * for why no @hookform/resolvers).
 *
 * Always shows the same "check your email" confirmation regardless of
 * whether the address has an account — `requestPasswordReset` only ever
 * returns `ok: false` for a real failure (rate limit, network, SMTP), never
 * for an unknown email (see supabaseAuthClient.ts / mockAuthClient.ts).
 * Branching the UI on "email not found" would reopen the enumeration hole
 * both clients close.
 *
 * `AU-9` (P0-7.0): the `checkEmail` state used to render with no button and
 * no navigation import — the native back arrow was the only exit.
 */

type FormValues = {
  email: string;
};

type Status = 'idle' | 'submitting' | 'checkEmail';

export function PasswordResetRequestScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { email: '' } });

  async function onSubmit(values: FormValues) {
    setFormError(null);

    const parsed = passwordResetRequestSchema.safeParse(values);
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
      const result = await authClient.requestPasswordReset(parsed.data.email);
      if (!result.ok) {
        setStatus('idle');
        setFormError(result.error);
        return;
      }

      setStatus('checkEmail');
    } catch {
      // supabaseAuthClient's contract is that no method throws — this is
      // defence in depth, so a screen can never strand itself even if that
      // contract is ever violated (see execution brief).
      setStatus('idle');
      setFormError('Something went wrong. Please try again.');
    }
  }

  if (status === 'checkEmail') {
    return (
      <Screen>
        <Text variant="title" style={styles.centerText}>
          Check your email
        </Text>
        <Text variant="body" tone="secondary" style={[styles.centerText, styles.subtitle]}>
          If an account exists for that address, we sent a link to reset your password.
        </Text>

        <View style={styles.button}>
          <Button label="Back to log in" onPress={() => navigation.navigate('Login')} />
        </View>
      </Screen>
    );
  }

  const isSubmitting = status === 'submitting';

  return (
    <Screen scroll centered={false}>
      <Text variant="title" style={styles.title}>
        Reset your password
      </Text>
      <Text variant="body" tone="secondary" style={styles.subtitle}>
        Enter the email on your account and we'll send you a link to reset your password.
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

      {formError && (
        <Text variant="caption" tone="danger" style={styles.formError}>
          {formError}
        </Text>
      )}

      <View style={styles.button}>
        <Button
          label="Send reset link"
          loading={isSubmitting}
          disabled={isSubmitting}
          onPress={handleSubmit(onSubmit)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerText: {
    textAlign: 'center',
  },
  title: {
    marginBottom: tokens.spacing.xs,
  },
  subtitle: {
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
