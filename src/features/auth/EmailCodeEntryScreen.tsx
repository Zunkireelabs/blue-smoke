import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Screen, Text, tokens, useCountdown } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';

/**
 * AU-13 — P1-1.0, step 2 of the single email front door (spec §1.2.2):
 * 6-digit code entry with auto-submit, verified with `type: 'email'`
 * (proven end to end on dev, including a brand-new account, and through the
 * app on Android). One route serves both signup and sign-in, so there is no
 * `purpose` param the way Hardik's version had one.
 *
 * Deliberately mirrors `OtpEntryScreen`'s already-solved 6-digit
 * auto-submit behaviour (segmented display over one hidden `TextInput`)
 * rather than re-implementing Hardik's `CodeEntryForm` or extracting a
 * shared component out of `OtpEntryScreen` — the brief asks to reuse the
 * behaviour, not to force a refactor of a screen that already ships and is
 * tested. `OtpEntryScreen` itself is untouched by this task.
 *
 * `RESEND_COOLDOWN_SECONDS` is 60, not Method B's 30 — Supabase's dashboard
 * documents a 60s minimum interval per user on auth emails. Measured on dev
 * 2026-08-09 that limit is **not enforced** (two sends seconds apart both
 * delivered) — flagged in the PR body, not fixed here; the cooldown is UI
 * pacing regardless of whether the server currently backs it up.
 */

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

type Status = 'idle' | 'submitting' | 'signedIn';

export function EmailCodeEntryScreen() {
  const authClient = useAuthClient();
  const { params } = useRoute<RouteProp<RootStackParamList, 'EmailCodeEntry'>>();
  const { email } = params;

  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);
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
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) {
      verify(digits);
    }
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

  return (
    <Screen>
      <Text variant="title" style={styles.centerText}>
        Enter the code
      </Text>
      <Text variant="body" tone="secondary" style={[styles.centerText, styles.subtitle]}>
        We sent a 6-digit code to {email}.
      </Text>

      <Pressable
        style={styles.segmentsRow}
        onPress={() => inputRef.current?.focus()}
        accessibilityRole="button"
        accessibilityLabel="Enter verification code"
      >
        {Array.from({ length: CODE_LENGTH }).map((_, i) => (
          <View key={i} style={styles.segment}>
            <Text variant="title" style={styles.centerText}>
              {code[i] ?? ''}
            </Text>
          </View>
        ))}
      </Pressable>

      <TextInput
        ref={inputRef}
        style={styles.hiddenInput}
        value={code}
        onChangeText={handleChangeCode}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        editable={!isSubmitting}
        autoFocus
        accessibilityLabel="Verification code"
      />

      {formError && (
        <Text variant="caption" tone="danger" style={[styles.centerText, styles.formError]}>
          {formError}
        </Text>
      )}
      {isSubmitting && <ActivityIndicator style={styles.spinner} color={tokens.color.textPrimary} />}

      <Pressable
        onPress={handleResend}
        disabled={cooldown > 0 || isSubmitting}
        accessibilityRole="button"
        accessibilityLabel={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        style={styles.linkButton}
      >
        <Text variant="label" tone={cooldown > 0 ? 'secondary' : 'link'} style={styles.centerText}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centerText: {
    textAlign: 'center',
  },
  subtitle: {
    marginTop: tokens.spacing.xs,
    marginBottom: tokens.spacing.xl,
  },
  segmentsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  segment: {
    width: tokens.touchTarget.minWidth,
    height: 52,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
  formError: {
    marginTop: tokens.spacing.lg,
  },
  spinner: {
    marginTop: tokens.spacing.lg,
  },
  linkButton: {
    marginTop: tokens.spacing.xl,
    alignItems: 'center',
    minHeight: tokens.touchTarget.minHeight,
    justifyContent: 'center',
  },
});
