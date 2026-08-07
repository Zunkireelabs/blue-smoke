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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AsYouType, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';
import { CountryPicker } from './CountryPicker';
import { phoneE164Schema } from './schemas';

/**
 * P1-1.0 Method B, step 1 (spec §1.2.1) — phone number input with a
 * country-code picker, validated via `libphonenumber-js`.
 *
 * No default country is specified anywhere in the spec — this is a UI
 * concern, not client geo-detection, which this task doesn't build. 'US'
 * is a placeholder starting point, flagged rather than silently chosen,
 * same as `schemas.ts`'s password-length floor. Change freely.
 *
 * The TextInput is fed through `AsYouType` on every keystroke (the
 * library's own documented pattern for a controlled React input) so the
 * displayed value reformats as the user types; `parsePhoneNumberFromString`
 * on submit does the real validation regardless of how it's formatted.
 * `phoneE164Schema` (schemas.ts) is a second, defense-in-depth gate on the
 * resulting E.164 string — same "Zod on every form" discipline as Method A.
 */

type Status = 'idle' | 'submitting';

export function PhoneInputScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [country, setCountry] = useState<CountryCode>('US');
  const [phoneText, setPhoneText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  function handleCountryChange(next: CountryCode) {
    setCountry(next);
    setPhoneText('');
  }

  function handleChangeText(text: string) {
    setPhoneText(new AsYouType(country).input(text));
  }

  async function onSubmit() {
    setFormError(null);

    const parsed = parsePhoneNumberFromString(phoneText, country);
    if (!parsed || !parsed.isValid()) {
      setFormError('Enter a valid phone number for the selected country.');
      return;
    }

    const e164 = phoneE164Schema.safeParse(parsed.number);
    if (!e164.success) {
      // Unreachable if libphonenumber-js's own validation just passed —
      // kept anyway as the same final Zod gate every P1-1.0 form has.
      setFormError(e164.error.issues[0]?.message ?? 'Enter a valid phone number.');
      return;
    }

    setStatus('submitting');
    const result = await authClient.requestPhoneOtp(e164.data);
    setStatus('idle');

    if (!result.ok) {
      // Mirrors Method A: no branching on the failure reason here beyond
      // rendering it verbatim.
      setFormError(result.error);
      return;
    }

    navigation.navigate('OtpVerify', { phone: e164.data });
  }

  const isSubmitting = status === 'submitting';

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Enter your phone number</Text>

        <Text style={styles.label}>Country</Text>
        <CountryPicker value={country} onChange={handleCountryChange} />

        <Text style={styles.label}>Phone number</Text>
        <TextInput
          style={styles.input}
          value={phoneText}
          onChangeText={handleChangeText}
          keyboardType="phone-pad"
          autoComplete="tel"
          editable={!isSubmitting}
          accessibilityLabel="Phone number"
        />

        {formError && <Text style={styles.formError}>{formError}</Text>}

        <Pressable
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Send code"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send code</Text>
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
