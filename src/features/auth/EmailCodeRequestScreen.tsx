import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthScaffold, Button, Text, TextField, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';
import { emailCodeRequestSchema } from './schemas';
import { AUTH_MODE_COPY, DEFAULT_AUTH_MODE, PASSWORD_LINK_LABEL } from './authMode';

/**
 * AU-12 — P1-1.0, step 1 of the single email front door (spec §1.2.2): type
 * an email, get a 6-digit code. `requestEmailCode` serves a brand-new
 * address and a returning one identically (`shouldCreateUser: true`), so
 * there is no separate signup/login choice to make here — unlike the old
 * Method A split this replaces. `mode` changes the wording around that fact,
 * never the request.
 *
 * Restyled 2026-08-12 to the reference auth design. The password action moves from a
 * `variant="secondary"` button to the reference's inline "prompt + link" sentence — which also
 * settles the ranking the old comment was worried about: a sentence cannot compete with the
 * primary button the way a second full-width control did. Destination is unchanged
 * (`PasswordSignIn`, AU-14).
 */

type Status = 'idle' | 'submitting';

export function EmailCodeRequestScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'EmailCodeRequest'>>();
  const mode = route.params?.mode ?? DEFAULT_AUTH_MODE;
  const copy = AUTH_MODE_COPY[mode];
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit() {
    setFormError(null);

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

      navigation.navigate('EmailCodeEntry', { email: parsed.data.email });
    } catch {
      // supabaseAuthClient's contract is that no method throws — this is
      // defence in depth, so the screen can never strand itself even if
      // that contract is ever violated.
      setFormError('Something went wrong. Please try again.');
    } finally {
      setStatus('idle');
    }
  }

  const isSubmitting = status === 'submitting';

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

      {formError && (
        <Text variant="caption" tone="danger" style={styles.formError}>
          {formError}
        </Text>
      )}

      <View style={styles.primaryAction}>
        <Button
          label="Get verification code"
          shape="block"
          onPress={onSubmit}
          disabled={isSubmitting}
          loading={isSubmitting}
        />
      </View>

      <Pressable
        onPress={() => navigation.navigate('PasswordSignIn')}
        disabled={isSubmitting}
        accessibilityRole="button"
        accessibilityLabel={PASSWORD_LINK_LABEL}
        style={styles.passwordRow}
      >
        <Text variant="body" tone="secondary">
          {copy.passwordPrompt}{' '}
        </Text>
        <Text variant="body" tone="link" style={styles.passwordLink}>
          {PASSWORD_LINK_LABEL}
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
  formError: {
    marginTop: tokens.spacing.sm,
  },
  primaryAction: {
    marginTop: tokens.spacing.lg,
  },
  passwordRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: tokens.spacing.lg,
    minHeight: tokens.touchTarget.minHeight,
  },
  passwordLink: {
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
