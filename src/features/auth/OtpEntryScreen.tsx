import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { Screen, Text, tokens, useCountdown } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';

/**
 * P1-1.0 Method B, step 2 (spec §1.2.1) — segmented 6-digit OTP entry with
 * a resend cooldown. Error handling mirrors Method A: `verifyPhoneOtp`'s
 * "Incorrect or expired code." is rendered verbatim, no branching on cause
 * (matches LoginScreen's non-enumeration discipline — see its header).
 *
 * `RESEND_COOLDOWN_SECONDS` is not specified anywhere in the spec (Twilio
 * Verify's own resend policy isn't configured yet — that's P0-3.0). 30s is
 * a placeholder, flagged rather than silently chosen, same pattern as
 * `schemas.ts`'s password-length floor and `PhoneInputScreen`'s default
 * country.
 *
 * The 6 visible boxes are a display layer only; a single off-screen
 * `TextInput` captures real input (the standard RN pattern for segmented
 * OTP entry without a dedicated library — another package.json addition
 * this task doesn't need). Can't be verified on a device from this machine
 * (brief §2); the boxes are a straightforward text render, so the risk is
 * low, but it's an honest gap, not a tested one.
 */

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

type Status = 'idle' | 'submitting' | 'signedIn';

export function OtpEntryScreen() {
  const authClient = useAuthClient();
  const { params } = useRoute<RouteProp<RootStackParamList, 'OtpVerify'>>();
  const { phone } = params;

  const [code, setCode] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const { remaining: cooldown, restart: restartCooldown } = useCountdown(RESEND_COOLDOWN_SECONDS);
  const inputRef = useRef<TextInput>(null);

  async function verify(digits: string) {
    setFormError(null);
    setStatus('submitting');
    try {
      const result = await authClient.verifyPhoneOtp(phone, digits);

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
      // contract is ever violated (see execution brief).
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
      const result = await authClient.requestPhoneOtp(phone);
      if (!result.ok) {
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
        We sent a 6-digit code to {phone}.
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
