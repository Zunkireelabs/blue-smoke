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
 * P1-1.0 Method B, step 2 (spec §1.2.1) — segmented 6-digit OTP entry with
 * a resend cooldown. `verifyPhoneOtp`'s "Incorrect or expired code." is
 * rendered verbatim, no branching on cause — the same non-enumeration
 * discipline every P1-1.0 auth form follows (see `EmailCodeEntryScreen`).
 *
 * Restyled 2026-08-12 to the reference auth design. One behaviour changed with it, on purpose
 * (Sadin's call, having been told it was a behaviour change and not paint): the screen no longer
 * submits by itself the instant a sixth digit lands. The reference has an explicit Verify
 * button, and two submit paths for one action would mean the button either fires a second
 * request or is dead by the time it becomes tappable. Verify is now the only way to submit.
 *
 * `RESEND_COOLDOWN_SECONDS` is not specified anywhere in the spec (Twilio
 * Verify's own resend policy isn't configured yet — that's P0-3.0). 30s is
 * a placeholder, flagged rather than silently chosen, same pattern as
 * `schemas.ts`'s password-length floor and `PhoneInputScreen`'s default
 * country. The reference's "Waiting for Code - 0:18 Min" is a restyle of this
 * countdown, not a change to its duration.
 *
 * The 6 visible boxes are a display layer only; a single off-screen
 * `TextInput` captures real input (the standard RN pattern for segmented
 * OTP entry without a dedicated library — another package.json addition
 * this task doesn't need).
 */

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

type Status = 'idle' | 'submitting' | 'signedIn';

export function OtpEntryScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<RouteProp<RootStackParamList, 'OtpVerify'>>();
  const { phone } = params;
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
    setCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH));
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
            {phone}
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
          // Disabled below six digits rather than hidden: a button that appears only when the
          // form is already complete gives no hint that it is what submits.
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
        label="Email"
        onPress={() => navigation.navigate('EmailCodeRequest', { mode })}
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
    // Absolute so the heading centres on the screen, not on the space left over beside the back
    // button — the reference's two heading lines sit dead centre with the arrow floating at the
    // left margin.
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
