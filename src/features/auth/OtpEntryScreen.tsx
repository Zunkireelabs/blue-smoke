import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
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
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) {
      return undefined;
    }
    const id = setTimeout(() => setCooldown(prev => prev - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function verify(digits: string) {
    setFormError(null);
    setStatus('submitting');
    const result = await authClient.verifyPhoneOtp(phone, digits);

    if (!result.ok) {
      setStatus('idle');
      setFormError(result.error);
      setCode('');
      return;
    }

    setStatus('signedIn');
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
    const result = await authClient.requestPhoneOtp(phone);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setCode('');
    setCooldown(RESEND_COOLDOWN_SECONDS);
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
    <View style={styles.container}>
      <Text style={styles.title}>Enter the code</Text>
      <Text style={styles.body}>We sent a 6-digit code to {phone}.</Text>

      <Pressable
        style={styles.segmentsRow}
        onPress={() => inputRef.current?.focus()}
        accessibilityRole="button"
        accessibilityLabel="Enter verification code"
      >
        {Array.from({ length: CODE_LENGTH }).map((_, i) => (
          <View key={i} style={styles.segment}>
            <Text style={styles.segmentText}>{code[i] ?? ''}</Text>
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

      {formError && <Text style={styles.formError}>{formError}</Text>}
      {isSubmitting && <ActivityIndicator style={styles.spinner} />}

      <Pressable
        onPress={handleResend}
        disabled={cooldown > 0 || isSubmitting}
        accessibilityRole="button"
        accessibilityLabel={cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        style={styles.linkButton}
      >
        <Text style={[styles.link, cooldown > 0 && styles.linkDisabled]}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: '#444',
    textAlign: 'center',
    marginBottom: 24,
  },
  segmentsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  segment: {
    width: 44,
    height: 52,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 22,
    fontWeight: '600',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
  formError: {
    color: '#c0392b',
    fontSize: 14,
    marginTop: 16,
    textAlign: 'center',
  },
  spinner: {
    marginTop: 16,
  },
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  link: {
    color: '#1a1a1a',
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  linkDisabled: {
    color: '#999',
    textDecorationLine: 'none',
  },
});
