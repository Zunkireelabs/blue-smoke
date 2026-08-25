import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AuthScaffold,
  BackButton,
  Button,
  CodeSegments,
  Screen,
  Text,
  tokens,
  useCountdown,
} from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';
import { DEFAULT_AUTH_MODE } from './authMode';
import { formatCountdown } from './formatCountdown';

/**
 * AU-13 — P1-1.0, step 2 of the single email front door (spec §1.2.2):
 * 6-digit code entry, verified with `type: 'email'` (proven end to end on dev,
 * including a brand-new account, and through the app on Android). One route
 * serves both signup and sign-in, so there is no `purpose` param the way
 * Hardik's version had one.
 *
 * Restyled 2026-08-12 to the reference auth design, in step with `OtpEntryScreen` — including
 * the removal of auto-submit in favour of an explicit Verify button (see that screen's header
 * for why keeping both would be wrong). The two screens still hold their own logic: this one
 * calls `verifyEmailCode`, waits 60s rather than 30, and offers the phone channel rather than
 * the email one. Only `CodeSegments`, the box row, is now shared.
 *
 * `RESEND_COOLDOWN_SECONDS` is 60, not Method B's 30 — Supabase's dashboard
 * documents a 60s minimum interval per user on auth emails. Measured on dev
 * 2026-08-09 that limit is **not enforced** (two sends seconds apart both
 * delivered) — flagged in the PR body, not fixed here; the cooldown is UI
 * pacing regardless of whether the server currently backs it up. The restyle
 * changed how it is rendered, not how long it runs.
 */

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

type Status = 'idle' | 'submitting' | 'signedIn';

export function EmailCodeEntryScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'EmailCodeEntry'>>();
  const { email } = params;
  const mode = params.mode ?? DEFAULT_AUTH_MODE;

  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const { remaining: cooldown, restart: restartCooldown } = useCountdown(RESEND_COOLDOWN_SECONDS);
  const inputRef = useRef<TextInput>(null);

  async function verify(digits: string) {
    setFormError(null);
    setStatus('submitting');
    try {
      const result = await authClient.verifyEmailCode(email, digits);

      if (!result.ok) {
        setStatus('idle');
        setFormError(result.error);
        setCode('');
        return;
      }

      setStatus('signedIn');
    } catch {
      // supabaseAuthClient's contract is that no method throws — this is
      // defence in depth, so a screen can never strand itself even if that
      // contract is ever violated.
      setStatus('idle');
      setFormError('Something went wrong. Please try again.');
      setCode('');
    }
  }

  function handleChangeCode(text: string) {
    setCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH));
  }

  async function handleResend() {
    setFormError(null);
    try {
      const result = await authClient.requestEmailCode(email);
      if (!result.ok) {
        // A failed resend deliberately does not restart the cooldown —
        // restarting it would lock the user out for another 60s over a
        // request that never went.
        setFormError(result.error);
        return;
      }
      setCode('');
      restartCooldown();
    } catch {
      setFormError('Something went wrong. Please try again.');
    }
  }

  if (status === 'signedIn') {
    return (
      <Screen>
        <Text variant="title" style={styles.centerText}>
          Signed in
        </Text>
      </Screen>
    );
  }

  const isSubmitting = status === 'submitting';
  const isComplete = code.length === CODE_LENGTH;

  return (
    <AuthScaffold>
      <View style={styles.headingRow}>
        <View style={styles.backSlot}>
          <BackButton tone="plain" onPress={() => navigation.goBack()} disabled={isSubmitting} />
        </View>
        <View style={styles.headingText}>
          <Text variant="body">Enter the {CODE_LENGTH}-digit code sent to</Text>
          <Text variant="body" style={styles.destination}>
            {email}
          </Text>
        </View>
      </View>

      <CodeSegments
        length={CODE_LENGTH}
        code={code}
        focused={focused}
        onPress={() => inputRef.current?.focus()}
      />

      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={code}
        onChangeText={handleChangeCode}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        editable={!isSubmitting}
        autoFocus
        accessibilityLabel="Verification code"
      />

      {formError && (
        <Text variant="caption" tone="danger" style={styles.formError}>
          {formError}
        </Text>
      )}

      <View style={styles.verify}>
        <Button
          label="Verify"
          shape="block"
          onPress={() => verify(code)}
          disabled={!isComplete || isSubmitting}
          loading={isSubmitting}
        />
      </View>

      <Pressable
        onPress={handleResend}
        disabled={cooldown > 0 || isSubmitting}
        accessibilityRole="button"
        accessibilityLabel={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        style={styles.resend}
      >
        <Text variant="body" tone={cooldown > 0 ? 'secondary' : 'link'} style={styles.centerText}>
          {cooldown > 0 ? `Waiting for code — ${formatCountdown(cooldown)}` : 'Resend code'}
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
    </AuthScaffold>
  );
}

const styles = StyleSheet.create({
  centerText: {
    textAlign: 'center',
  },
  headingRow: {
    justifyContent: 'center',
    marginBottom: tokens.spacing.xl,
  },
  backSlot: {
    // Absolute so the heading centres on the screen rather than on the space left beside the
    // back button — same reasoning as `OtpEntryScreen`.
    position: 'absolute',
    left: 0,
    zIndex: 1,
  },
  headingText: {
    alignItems: 'center',
    paddingHorizontal: tokens.touchTarget.minWidth,
  },
  destination: {
    fontWeight: tokens.typography.fontWeight.bold,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
  formError: {
    marginTop: tokens.spacing.sm,
  },
  verify: {
    marginTop: tokens.spacing.lg,
  },
  resend: {
    marginTop: tokens.spacing.lg,
    alignItems: 'center',
    minHeight: tokens.touchTarget.minHeight,
    justifyContent: 'center',
  },
  divider: {
    textAlign: 'center',
    marginTop: tokens.spacing.xl,
    marginBottom: tokens.spacing.md,
  },
});
