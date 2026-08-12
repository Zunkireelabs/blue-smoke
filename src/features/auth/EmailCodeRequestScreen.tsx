import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthScaffold, Button, Text, TextField, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';
import { emailCodeRequestSchema, passwordSignInSchema } from './schemas';
import {
  AUTH_MODE_COPY,
  CODE_LINK_LABEL,
  CODE_PROMPT,
  DEFAULT_AUTH_MODE,
  PASSWORD_LINK_LABEL,
  type CredentialMode,
} from './authMode';

/**
 * AU-12 + AU-14 — P1-1.0's single email front door (spec §1.2.2), in both of its states.
 *
 * `requestEmailCode` serves a brand-new address and a returning one identically
 * (`shouldCreateUser: true`), so there is no separate signup/login choice to make here — unlike
 * the old Method A split this replaces. `mode` changes the wording around that fact, never the
 * request.
 *
 * Restyled 2026-08-12 to the reference auth design, which also absorbed AU-14: password sign-in
 * is a *state of this screen*, not a screen of its own. `PasswordSignInScreen.tsx` is kept on
 * disk but its route is retired — see `PasswordSignIn` in RootStackParamList. Its logic moves
 * here unchanged: same `passwordSignInSchema`, same `signInWithEmail`, same non-enumerating
 * error copy rendered verbatim, and still no manual navigation on success — `useSessionStore`'s
 * `onAuthStateChange` drives the switch to the Home stack.
 *
 * The ranking that screen's header insisted on survives the move: `'code'` is the default state
 * and the password offer is a sentence, not a competing button.
 *
 * Two things the reference draws that are deliberately absent, because the flows behind them do
 * not exist. **"Forgot password?"** — P1-1.0 deleted `PasswordResetRequest` and
 * `ResetPasswordConfirm`; the 6-digit code is the recovery path, and "Get code" is on screen.
 * **"No password set yet? Set Password"** — `SetPassword` is in the authenticated stack; there is
 * no pre-auth way to create one. Neither is worth a link that goes nowhere.
 */

type Status = 'idle' | 'submitting';

export function EmailCodeRequestScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'EmailCodeRequest'>>();
  const mode = route.params?.mode ?? DEFAULT_AUTH_MODE;
  const copy = AUTH_MODE_COPY[mode];
  const [credential, setCredential] = useState<CredentialMode>('code');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  function switchCredential(next: CredentialMode) {
    // Deliberately keeps `email`: the two states are one form asking for a different second
    // factor, and retyping an address because you changed your mind about the credential is
    // exactly the friction the reference's single-screen design removes.
    setCredential(next);
    setFormError(null);
    setPassword('');
    setPasswordVisible(false);
  }

  async function requestCode() {
    const parsed = emailCodeRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
      return;
    }

    setStatus('submitting');
    try {
      const result = await authClient.requestEmailCode(parsed.data.email);

      if (!result.ok) {
        // No branching on the failure reason beyond rendering it verbatim —
        // matches every other P1-1.0 form's non-enumeration discipline.
        setFormError(result.error);
        return;
      }

      navigation.navigate('EmailCodeEntry', { email: parsed.data.email, mode });
    } catch {
      // supabaseAuthClient's contract is that no method throws — this is
      // defence in depth, so the screen can never strand itself even if
      // that contract is ever violated.
      setFormError('Something went wrong. Please try again.');
    } finally {
      setStatus('idle');
    }
  }

  async function signInWithPassword() {
    const parsed = passwordSignInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Check the details above.');
      return;
    }

    setStatus('submitting');
    try {
      const result = await authClient.signInWithEmail(parsed.data.email, parsed.data.password);

      if (!result.ok) {
        // `signInWithEmail` already returns one generic message for "no such account", "wrong
        // password" and "no password set" alike (`supabaseAuthClient.ts`) — rendered verbatim.
        setFormError(result.error);
        setStatus('idle');
        return;
      }
      // Session established — onAuthStateChange takes it from here, so no navigation and no
      // status reset: this screen is about to be unmounted with the whole auth stack.
    } catch {
      setFormError('Something went wrong. Please try again.');
      setStatus('idle');
    }
  }

  function onSubmit() {
    setFormError(null);
    return credential === 'code' ? requestCode() : signInWithPassword();
  }

  const isSubmitting = status === 'submitting';
  const isPassword = credential === 'password';

  return (
    <AuthScaffold
      topLink={
        <Button
          variant="textLink"
          label={copy.switchLabel}
          onPress={() => navigation.setParams({ mode: copy.switchTo })}
        />
      }
    >
      <Text variant="title" style={styles.heading}>
        {copy.heading}
      </Text>

      <TextField
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoComplete="email"
        autoCapitalize="none"
        editable={!isSubmitting}
        accessibilityLabel="Email"
        style={styles.input}
      />

      {isPassword && (
        <View style={styles.passwordField}>
          <TextField
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!passwordVisible}
            autoCapitalize="none"
            autoComplete="current-password"
            editable={!isSubmitting}
            accessibilityLabel="Password"
            style={[styles.input, styles.passwordInput]}
          />
          <Pressable
            onPress={() => setPasswordVisible((visible) => !visible)}
            accessibilityRole="button"
            // The visible label is the *action*; the accessible name says what it acts on, since
            // a lone "Show" tells a screen-reader user nothing about what is being shown.
            accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
            style={styles.reveal}
          >
            <Text variant="label" tone="link">
              {passwordVisible ? 'Hide' : 'Show'}
            </Text>
          </Pressable>
        </View>
      )}

      {formError && (
        <Text variant="caption" tone="danger" style={styles.formError}>
          {formError}
        </Text>
      )}

      <View style={styles.primaryAction}>
        <Button
          label={isPassword ? 'Continue' : 'Get verification code'}
          shape="block"
          onPress={onSubmit}
          disabled={isSubmitting}
          loading={isSubmitting}
        />
      </View>

      <Pressable
        onPress={() => switchCredential(isPassword ? 'code' : 'password')}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel={isPassword ? CODE_LINK_LABEL : PASSWORD_LINK_LABEL}
        style={styles.credentialRow}
      >
        <Text variant="body" tone="secondary">
          {isPassword ? CODE_PROMPT : copy.passwordPrompt}{' '}
        </Text>
        <Text variant="body" tone="link" style={styles.credentialLink}>
          {isPassword ? CODE_LINK_LABEL : PASSWORD_LINK_LABEL}
        </Text>
      </Pressable>

      <Text variant="body" tone="secondary" style={styles.divider}>
        or continue with
      </Text>

      <Button
        variant="onBrand"
        shape="block"
        label="Phone number"
        onPress={() => navigation.navigate('PhoneInput', { mode })}
      />

      <Text variant="caption" tone="secondary" style={styles.legal}>
        {copy.legal}
      </Text>
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  heading: {
    textAlign: 'center',
    marginBottom: tokens.spacing.xl,
  },
  input: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radii.lg,
    // See `PhoneInputScreen`: `TextField`'s outline reads as a stray box on the tinted sheet,
    // and is left in place for every screen not yet restyled.
    borderWidth: 0,
  },
  passwordField: {
    marginTop: tokens.spacing.md,
    justifyContent: 'center',
  },
  passwordInput: {
    // Room for the reveal control, so a long password never runs underneath it.
    paddingRight: tokens.spacing.xxl * 2,
  },
  reveal: {
    position: 'absolute',
    right: 0,
    paddingHorizontal: tokens.spacing.md,
    minHeight: tokens.touchTarget.minHeight,
    justifyContent: 'center',
  },
  formError: {
    marginTop: tokens.spacing.sm,
  },
  primaryAction: {
    marginTop: tokens.spacing.lg,
  },
  credentialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: tokens.spacing.lg,
    minHeight: tokens.touchTarget.minHeight,
  },
  credentialLink: {
    fontWeight: tokens.typography.fontWeight.bold,
    textDecorationLine: 'underline',
  },
  divider: {
    textAlign: 'center',
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },
  legal: {
    textAlign: 'center',
    marginTop: tokens.spacing.lg,
  },
});
