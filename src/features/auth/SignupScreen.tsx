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
import { signUpWithEmail } from './api';
import { signupSchema } from './schemas';

/**
 * P1-1.0 Method A — signup screen (spec §1.2). Validation is zod
 * (`signupSchema`), applied by hand on submit rather than via
 * `@hookform/resolvers` — that package isn't installed, and adding it means
 * a package.json change, which is a contested file (CLAUDE.md) needing an
 * announcement first. This gets the same result with what's already a
 * dependency; swap in the resolver later if the team wants it, it's a
 * mechanical change.
 */

type FormValues = {
  email: string;
  password: string;
  confirmPassword: string;
};

type Status = 'idle' | 'submitting' | 'checkEmail' | 'signedIn';

export function SignupScreen() {
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);

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
    const result = await signUpWithEmail(parsed.data.email, parsed.data.password);
    if (!result.ok) {
      setStatus('idle');
      setFormError(result.error);
      return;
    }

    // supabase-js returns session: null when email confirmation is
    // required, and a live session when it isn't — this project hasn't
    // decided/configured that yet (P0-3.0's auth-config box is still open),
    // so both outcomes are handled rather than assuming one.
    setStatus(result.data.session ? 'signedIn' : 'checkEmail');
  }

  if (status === 'checkEmail') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.body}>
          We sent a confirmation link to finish creating your account.
        </Text>
      </View>
    );
  }

  if (status === 'signedIn') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Account created</Text>
        <Text style={styles.body}>You're signed in.</Text>
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
        <Text style={styles.title}>Create account</Text>

        <Text style={styles.label}>Email</Text>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              editable={!isSubmitting}
              accessibilityLabel="Email"
            />
          )}
        />
        {errors.email && <Text style={styles.fieldError}>{errors.email.message}</Text>}

        <Text style={styles.label}>Password</Text>
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
              accessibilityLabel="Password"
            />
          )}
        />
        {errors.password && <Text style={styles.fieldError}>{errors.password.message}</Text>}

        <Text style={styles.label}>Confirm password</Text>
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
              accessibilityLabel="Confirm password"
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
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign up</Text>
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
