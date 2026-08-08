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
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
      <View style={styles.container}>
        <Text style={styles.title}>Signed in</Text>
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
        <Text style={styles.title}>Log in</Text>

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
              autoComplete="password"
              editable={!isSubmitting}
              accessibilityLabel="Password"
            />
          )}
        />
        {errors.password && <Text style={styles.fieldError}>{errors.password.message}</Text>}

        <Pressable
          onPress={() => navigation.navigate('PasswordReset')}
          accessibilityRole="button"
          accessibilityLabel="Forgot password?"
          style={styles.forgotPassword}
        >
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>

        {formError && <Text style={styles.formError}>{formError}</Text>}

        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Log in"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Log in</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate('Signup')}
          accessibilityRole="button"
          accessibilityLabel="New here? Create an account"
          style={styles.linkButton}
        >
          <Text style={styles.link}>New here? Create an account</Text>
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
  forgotPassword: {
    marginTop: 8,
    alignItems: 'flex-end',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  link: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
