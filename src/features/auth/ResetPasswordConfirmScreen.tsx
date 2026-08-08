import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuthClient } from './AuthClientContext';
import { passwordSchema } from './schemas';

/**
 * P1-1.0 §3.2 — lands here from the `bluesmoke://reset-password` deep link
 * (deepLink.ts), after Supabase has already established a recovery session
 * from the link's token (config only from this app's side — can't be
 * verified without a device, brief §2). Calls `authClient.confirmPasswordReset`,
 * the addition to the §3.5 interface documented in client.ts.
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
      <View style={styles.container}>
        <Text style={styles.title}>Password updated</Text>
        <Text style={styles.body}>You can now log in with your new password.</Text>
      </View>
    );
  }

  const isSubmitting = status === 'submitting';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Choose a new password</Text>

        <Text style={styles.label}>New password</Text>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              secureTextEntry
              autoComplete="new-password"
              editable={!isSubmitting}
              accessibilityLabel="New password"
            />
          )}
        />
        {errors.password && <Text style={styles.fieldError}>{errors.password.message}</Text>}

        <Text style={styles.label}>Confirm new password</Text>
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              secureTextEntry
              autoComplete="new-password"
              editable={!isSubmitting}
              accessibilityLabel="Confirm new password"
            />
          )}
        />
        {errors.confirmPassword && (
          <Text style={styles.fieldError}>{errors.confirmPassword.message}</Text>
        )}

        {formError && <Text style={styles.formError}>{formError}</Text>}

        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Update password"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Update password</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    color: '#444',
  },
  label: {
    fontSize: 14,
    marginTop: 12,
    marginBottom: 4,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  fieldError: {
    color: '#c0392b',
    fontSize: 13,
    marginTop: 4,
  },
  formError: {
    color: '#c0392b',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
