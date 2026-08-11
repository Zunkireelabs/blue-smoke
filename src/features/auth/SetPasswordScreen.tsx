import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, Screen, Text, TextField, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';
import { setPasswordSchema } from './schemas';

/**
 * PF-8 — P1-1.0 PR 2. Sets/changes the signed-in account's password.
 *
 * No current-password field: `updateUser({ password })` only needs a live
 * session — Supabase's "Secure password change" is confirmed OFF on
 * `bluesmoke-dev` (measured live, 2026-08-11), so reauthentication is not
 * required. This screen is only reachable from the Home stack, which
 * guarantees that live session.
 *
 * The label is always "Set a password", never "Change password" — there is
 * no signal anywhere (app_metadata, user_metadata, or the DB) that
 * distinguishes an account that already has one from one that doesn't, see
 * `ProfileScreen.tsx`. `setPassword` is idempotent either way.
 */

type Status = 'idle' | 'submitting' | 'success';

/**
 * Which field a validation issue belongs to. `setPasswordSchema` raises the
 * length failure at path `['password']` and the mismatch at
 * `['confirmPassword']` — rendering both under one field would put
 * "Password must be at least 8 characters." beneath *Confirm password*,
 * pointing the user at the input that is not the problem.
 */
type FieldErrors = { password?: string; confirmPassword?: string };

const NO_FIELD_ERRORS: FieldErrors = {};

export function SetPasswordScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit() {
    setFieldErrors(NO_FIELD_ERRORS);
    setFormError(null);

    const parsed = setPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        // First issue per field wins, so the earliest/most specific message is the
        // one shown rather than the last one Zod happened to emit.
        if (issue.path[0] === 'password') {
          next.password ??= issue.message;
        } else if (issue.path[0] === 'confirmPassword') {
          next.confirmPassword ??= issue.message;
        } else {
          // A schema-level issue with no field path — surface it form-level rather
          // than silently dropping it.
          setFormError(issue.message);
        }
      }
      setFieldErrors(next);
      return;
    }

    setStatus('submitting');
    try {
      const result = await authClient.setPassword(parsed.data.password);

      if (!result.ok) {
        // Rendered verbatim — authErrors.ts already maps weak_password and
        // same_password to coaching copy; nothing here re-derives them.
        setFormError(result.error);
        setStatus('idle');
        return;
      }

      setStatus('success');
    } catch {
      setFormError('Something went wrong. Please try again.');
      setStatus('idle');
    }
  }

  if (status === 'success') {
    return (
      <Screen>
        <Text variant="title" style={styles.centerText}>
          Password set
        </Text>
        <Text variant="body" tone="secondary" style={[styles.centerText, styles.subtitle]}>
          You can use it next time you sign in.
        </Text>
        <View style={styles.button}>
          <Button label="Done" onPress={() => navigation.goBack()} />
        </View>
      </Screen>
    );
  }

  const isSubmitting = status === 'submitting';

  return (
    <Screen scroll>
      <Text variant="title" style={styles.title}>
        Set a password
      </Text>
      <Text variant="body" tone="secondary" style={styles.subtitle}>
        Use it to sign in with your email, alongside your code.
      </Text>

      <TextField
        label="New password"
        value={password}
        onChangeText={(next) => {
          setPassword(next);
          setFieldErrors(NO_FIELD_ERRORS);
        }}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!isSubmitting}
        accessibilityLabel="New password"
        error={fieldErrors.password}
      />
      <TextField
        label="Confirm password"
        value={confirmPassword}
        onChangeText={(next) => {
          setConfirmPassword(next);
          setFieldErrors(NO_FIELD_ERRORS);
        }}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!isSubmitting}
        accessibilityLabel="Confirm password"
        error={fieldErrors.confirmPassword}
      />

      {formError && (
        <Text variant="caption" tone="danger" style={styles.formError}>
          {formError}
        </Text>
      )}

      <View style={styles.button}>
        <Button
          label="Set password"
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
    marginBottom: tokens.spacing.xs,
  },
  subtitle: {
    marginBottom: tokens.spacing.lg,
  },
  formError: {
    marginTop: tokens.spacing.lg,
    textAlign: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  button: {
    marginTop: tokens.spacing.xl,
  },
});
