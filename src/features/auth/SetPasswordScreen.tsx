import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
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
 * The in-body heading is always "Set a password", never "Change password" —
 * there is no signal anywhere (app_metadata, user_metadata, or the DB) that
 * distinguishes an account that already has one from one that doesn't, see
 * `ProfileScreen.tsx`. `setPassword` is idempotent either way. The native
 * nav header above it reads "Change password" instead, so the two don't
 * repeat the same phrase back to back.
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
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
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
    <Screen scroll centered={false}>
      <Text variant="title" style={styles.title}>
        Set a password
      </Text>
      <Text variant="body" tone="secondary" style={styles.subtitle}>
        Use it to sign in with your email, alongside your code.
      </Text>

      <Text variant="label" tone="secondary" style={styles.fieldLabel}>
        New password
      </Text>
      <View style={styles.passwordField}>
        <TextField
          value={password}
          onChangeText={(next) => {
            setPassword(next);
            setFieldErrors(NO_FIELD_ERRORS);
          }}
          secureTextEntry={!passwordVisible}
          autoCapitalize="none"
          autoComplete="new-password"
          editable={!isSubmitting}
          accessibilityLabel="New password"
          error={fieldErrors.password}
          style={styles.passwordInput}
        />
        <Pressable
          onPress={() => setPasswordVisible((visible) => !visible)}
          accessibilityRole="button"
          accessibilityLabel={passwordVisible ? 'Hide new password' : 'Show new password'}
          style={styles.reveal}
        >
          <EyeIcon crossed={passwordVisible} />
        </Pressable>
      </View>

      <Text variant="label" tone="secondary" style={styles.fieldLabel}>
        Confirm password
      </Text>
      <View style={styles.passwordField}>
        <TextField
          value={confirmPassword}
          onChangeText={(next) => {
            setConfirmPassword(next);
            setFieldErrors(NO_FIELD_ERRORS);
          }}
          secureTextEntry={!confirmVisible}
          autoCapitalize="none"
          autoComplete="new-password"
          editable={!isSubmitting}
          accessibilityLabel="Confirm password"
          error={fieldErrors.confirmPassword}
          style={styles.passwordInput}
        />
        <Pressable
          onPress={() => setConfirmVisible((visible) => !visible)}
          accessibilityRole="button"
          accessibilityLabel={confirmVisible ? 'Hide confirm password' : 'Show confirm password'}
          style={styles.reveal}
        >
          <EyeIcon crossed={confirmVisible} />
        </Pressable>
      </View>

      {formError && (
        <Text variant="caption" tone="danger" style={styles.formError}>
          {formError}
        </Text>
      )}

      <View style={styles.submitButton}>
        <Button
          label="Set password"
          shape="block"
          onPress={onSubmit}
          disabled={isSubmitting}
          loading={isSubmitting}
        />
      </View>
    </Screen>
  );
}

const EYE_ICON_SIZE = 20;
const EYE_ICON_COLOR = tokens.color.textSecondary;
const EYE_ICON_STROKE = 1.75;

// Hand-drawn inline, same convention as `ProfileScreen.tsx`'s row glyphs — no icon set exists
// yet in this codebase. `crossed` draws a slash through the open eye, matching the reference's
// two-state reveal control: a plain eye means "hidden, tap to show", a slashed eye means
// "visible, tap to hide". No badge behind it — just the glyph, in the same muted grey as
// `TextField`'s placeholder text.
function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <Svg width={EYE_ICON_SIZE} height={EYE_ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
        stroke={EYE_ICON_COLOR}
        strokeWidth={EYE_ICON_STROKE}
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3} stroke={EYE_ICON_COLOR} strokeWidth={EYE_ICON_STROKE} />
      {crossed && (
        <Line
          x1={4}
          y1={4}
          x2={20}
          y2={20}
          stroke={EYE_ICON_COLOR}
          strokeWidth={EYE_ICON_STROKE}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: tokens.spacing.xs,
  },
  subtitle: {
    marginBottom: tokens.spacing.lg,
  },
  fieldLabel: {
    marginTop: tokens.spacing.md,
    marginBottom: tokens.spacing.xs,
  },
  // No `label` prop on the wrapped `TextField` here — the label above is rendered separately
  // (`fieldLabel`) so this row is exactly the input's own height, which is what lets `reveal`
  // center on it with plain `top: 0, bottom: 0` rather than guessing a label's rendered height.
  passwordField: {
    justifyContent: 'center',
  },
  passwordInput: {
    // Room for the reveal badge, so a long password never runs underneath it.
    paddingRight: tokens.spacing.xxl + tokens.spacing.md,
  },
  // No `top`/`bottom` inset — same convention as `EmailCodeRequestScreen`'s `reveal`: with
  // `passwordField`'s `justifyContent: 'center'`, an absolutely-positioned child with no edge
  // offsets centers on the parent's full height (input + `TextField`'s own `marginTop`), which
  // reads as centered on the input itself since that margin is small relative to the input.
  reveal: {
    position: 'absolute',
    right: tokens.spacing.xs,
    minHeight: tokens.touchTarget.minHeight,
    justifyContent: 'center',
    alignItems: 'center',
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
  // `marginTop: 'auto'` (rather than a fixed value like `button` above) claims the rest of
  // `Screen`'s `flexGrow: 1` column, pinning "Set password" to the bottom of the screen —
  // matching the reference's Save button — instead of sitting right under the fields.
  submitButton: {
    marginTop: 'auto',
    paddingTop: tokens.spacing.xl,
  },
});
