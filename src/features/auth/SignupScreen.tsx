import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Screen, Text, TextField, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';
import { signupSchema } from './schemas';

/**
 * P1-1.0 Method A — signup screen (spec §1.2). Validation is zod
 * (`signupSchema`), applied by hand on submit rather than via
 * `@hookform/resolvers` — that package isn't installed, and adding it means
 * a package.json change, which is a contested file (CLAUDE.md) needing an
 * announcement first. This gets the same result with what's already a
 * dependency; swap in the resolver later if the team wants it, it's a
 * mechanical change.
 *
 * Auth calls go through `useAuthClient()` (§3.5) — never `@supabase/supabase-js`
 * or `api.ts` directly, so this screen is testable against
 * `createMockAuthClient()` with no backend.
 *
 * `AU-3` (P0-7.0): the `checkEmail` state used to render with no button and
 * no navigation import — the native back arrow was the only exit. Resend
 * calls the new `resendSignupConfirmation` (client.ts); Change email address
 * just drops back to `idle` — react-hook-form keeps the field values across
 * that state change since the component itself never unmounts, so the user
 * finds what they typed still there to edit, not a blank form.
 */

type FormValues = {
  email: string;
  password: string;
  confirmPassword: string;
};

type Status = 'idle' | 'submitting' | 'checkEmail' | 'signedIn';
type ResendStatus = 'idle' | 'sending' | 'sent' | 'error';

export function SignupScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [resendStatus, setResendStatus] = useState<ResendStatus>('idle');

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);

    const parsed = signupSchema.safeParse(values);
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
      const result = await authClient.signUpWithEmail(parsed.data.email, parsed.data.password);
      if (!result.ok) {
        setStatus('idle');
        setFormError(result.error);
        return;
      }

      // sessionEstablished is false when email confirmation is required, true
      // when it isn't — this project hasn't decided/configured that yet
      // (P0-3.0's auth-config box is still open), so both outcomes are
      // handled rather than assuming one.
      setSubmittedEmail(parsed.data.email);
      setResendStatus('idle');
      setStatus(result.data.sessionEstablished ? 'signedIn' : 'checkEmail');
    } catch {
      // supabaseAuthClient's contract is that no method throws — this is
      // defence in depth, so a screen can never strand itself even if that
      // contract is ever violated (see execution brief).
      setStatus('idle');
      setFormError('Something went wrong. Please try again.');
    }
  }

  async function handleResend() {
    setResendStatus('sending');
    try {
      const result = await authClient.resendSignupConfirmation(submittedEmail);
      setResendStatus(result.ok ? 'sent' : 'error');
    } catch {
      setResendStatus('error');
    }
  }

  if (status === 'checkEmail') {
    return (
      <Screen>
        <Text variant="title" style={styles.centerText}>
          Check your email
        </Text>
        <Text variant="body" tone="secondary" style={[styles.centerText, styles.subtitle]}>
          We sent a confirmation link to finish creating your account.
        </Text>

        {resendStatus === 'sent' && (
          <Text variant="caption" tone="secondary" style={[styles.centerText, styles.resendStatus]}>
            Sent — check your inbox.
          </Text>
        )}
        {resendStatus === 'error' && (
          <Text variant="caption" tone="danger" style={[styles.centerText, styles.resendStatus]}>
            Couldn't resend. Try again.
          </Text>
        )}

        <View style={styles.checkEmailActions}>
          <Button
            label="Resend"
            variant="secondary"
            loading={resendStatus === 'sending'}
            onPress={handleResend}
          />
          <Button
            label="Change email address"
            variant="secondary"
            onPress={() => setStatus('idle')}
          />
          <Button
            label="Use phone instead"
            variant="secondary"
            onPress={() => navigation.navigate('PhoneInput')}
          />
        </View>
      </Screen>
    );
  }

  if (status === 'signedIn') {
    return (
      <Screen>
        <Text variant="title" style={styles.centerText}>
          Account created
        </Text>
        <Text variant="body" tone="secondary" style={styles.centerText}>
          You're signed in.
        </Text>
      </Screen>
    );
  }

  const isSubmitting = status === 'submitting';

  return (
    <Screen scroll centered={false}>
      <Text variant="title" style={styles.title}>
        Create account
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
            autoComplete="new-password"
            editable={!isSubmitting}
            error={errors.password?.message}
            accessibilityLabel="Password"
          />
        )}
      />

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextField
            label="Confirm password"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            secureTextEntry
            autoComplete="new-password"
            editable={!isSubmitting}
            error={errors.confirmPassword?.message}
            accessibilityLabel="Confirm password"
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
          label="Sign up"
          loading={isSubmitting}
          disabled={isSubmitting}
          onPress={handleSubmit(onSubmit)}
        />
      </View>

      <Button
        label="Already have an account? Log in"
        variant="secondary"
        onPress={() => navigation.navigate('Login')}
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
  subtitle: {
    marginTop: tokens.spacing.xs,
    marginBottom: tokens.spacing.xl,
  },
  resendStatus: {
    marginTop: tokens.spacing.md,
  },
  checkEmailActions: {
    marginTop: tokens.spacing.xl,
    gap: tokens.spacing.md,
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
