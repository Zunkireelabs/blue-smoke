import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { z } from 'zod';
import { Button, Screen, Text, TextField, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';
import { passwordSchema } from './schemas';

/**
 * P1-1.0 §3.2 — lands here from the `bluesmoke://reset-password` deep link
 * (deepLink.ts), after Supabase has already established a recovery session
 * from the link's token (config only from this app's side — can't be
 * verified without a device, brief §2). Calls `authClient.confirmPasswordReset`,
 * the addition to the §3.5 interface documented in client.ts.
 *
 * `AU-11` (P0-7.0): the `done` state used to render with no button and no
 * navigation import — a user who just reset their password was told
 * "Password updated" and left there with no way forward but the native back
 * arrow. Continue goes to Login (`AU-4`), the flow's stated fix.
 */

const resetConfirmSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(data => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

type FormValues = {
  password: string;
  confirmPassword: string;
};

type Status = 'idle' | 'submitting' | 'done';

export function ResetPasswordConfirmScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ defaultValues: { password: '', confirmPassword: '' } });

  async function onSubmit(values: FormValues) {
    setFormError(null);

    const parsed = resetConfirmSchema.safeParse(values);
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
      const result = await authClient.confirmPasswordReset(parsed.data.password);
      if (!result.ok) {
        setStatus('idle');
        setFormError(result.error);
        return;
      }

      setStatus('done');
    } catch {
      // supabaseAuthClient's contract is that no method throws — this is
      // defence in depth, so a screen can never strand itself even if that
      // contract is ever violated (see execution brief).
      setStatus('idle');
      setFormError('Something went wrong. Please try again.');
    }
  }

  if (status === 'done') {
    return (
      <Screen>
        <Text variant="title" style={styles.centerText}>
          Password updated
        </Text>
        <Text variant="body" tone="secondary" style={[styles.centerText, styles.subtitle]}>
          You can now log in with your new password.
        </Text>

        <View style={styles.button}>
          <Button label="Continue" onPress={() => navigation.navigate('Login')} />
        </View>
      </Screen>
    );
  }

  const isSubmitting = status === 'submitting';

  return (
    <Screen scroll centered={false}>
      <Text variant="title" style={styles.title}>
        Choose a new password
      </Text>

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="New password"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            secureTextEntry
            autoComplete="new-password"
            editable={!isSubmitting}
            error={errors.password?.message}
            accessibilityLabel="New password"
          />
        )}
      />

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Confirm new password"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            secureTextEntry
            autoComplete="new-password"
            editable={!isSubmitting}
            error={errors.confirmPassword?.message}
            accessibilityLabel="Confirm new password"
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
          label="Update password"
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
    marginBottom: tokens.spacing.lg,
  },
  subtitle: {
    marginTop: tokens.spacing.xs,
  },
  formError: {
    marginTop: tokens.spacing.lg,
    textAlign: 'center',
  },
  button: {
    marginTop: tokens.spacing.xl,
  },
});
