import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AsYouType, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
import { Button, Screen, Text, TextField, tokens } from '@/shared/ui';
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
    <Screen scroll>
      <Text variant="title" style={styles.title}>
        Enter your phone number
      </Text>

      <Text variant="label" tone="secondary" style={styles.label}>
        Country
      </Text>
      <CountryPicker value={country} onChange={handleCountryChange} />

      <View style={styles.field}>
        <TextField
          label="Phone number"
          value={phoneText}
          onChangeText={handleChangeText}
          keyboardType="phone-pad"
          autoComplete="tel"
          editable={!isSubmitting}
          accessibilityLabel="Phone number"
        />
      </View>

      {formError && (
        <Text variant="caption" tone="danger" style={styles.formError}>
          {formError}
        </Text>
      )}

      <View style={styles.button}>
        <Button label="Send code" onPress={onSubmit} disabled={isSubmitting} loading={isSubmitting} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: tokens.spacing.lg,
  },
  label: {
    marginTop: tokens.spacing.md,
    marginBottom: tokens.spacing.xs,
  },
  field: {
    marginTop: tokens.spacing.xs,
  },
  formError: {
    marginTop: tokens.spacing.lg,
    textAlign: 'center',
  },
  button: {
    marginTop: tokens.spacing.xl,
  },
});
