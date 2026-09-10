import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AsYouType, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
import { AuthScaffold, Button, Text, TextField, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useAuthClient } from './AuthClientContext';
import { CountryPicker } from './CountryPicker';
import { phoneE164Schema } from './schemas';
import { AUTH_MODE_COPY, DEFAULT_AUTH_MODE } from './authMode';

/**
 * P1-1.0 Method B, step 1 (spec §1.2.1) — phone number input with a
 * country-code picker, validated via `libphonenumber-js`.
 *
 * Restyled 2026-08-12 to the reference auth design, and promoted to the auth stack's front
 * door: AU-1's separate "Email or Phone?" chooser is gone, and the choice is now the "or
 * continue with → Email" button below. Nothing about the submit path changed — same
 * `AsYouType` formatting, same two-stage validation, same `requestPhoneOtp` call.
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

/**
 * ITU-T E.164 caps a full international number at 15 digits including the country calling
 * code. The country code is supplied by the picker rather than typed here, so 15 is a
 * deliberately generous ceiling for the part the user does type — it bounds the field
 * without second-guessing any specific country's numbering plan. `parsePhoneNumberFromString`
 * on submit remains the real validity check; this only stops unbounded input.
 */
const MAX_SUBSCRIBER_DIGITS = 15;

export function PhoneInputScreen() {
  const authClient = useAuthClient();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PhoneInput'>>();
  const mode = route.params?.mode ?? DEFAULT_AUTH_MODE;
  const copy = AUTH_MODE_COPY[mode];
  const [country, setCountry] = useState<CountryCode>('US');
  const [phoneText, setPhoneText] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);

  function handleCountryChange(next: CountryCode) {
    setCountry(next);
    setPhoneText('');
  }

  function handleChangeText(text: string) {
    // Cap the DIGITS, not the rendered string: the formatting `AsYouType` adds (spaces,
    // parens, dashes) varies by country, so a character cap would bite at a different real
    // length for every one. Without this the field accepted arbitrarily long input —
    // observed on the simulator taking 30+ digits, at which point `AsYouType` silently stops
    // formatting and the user just sees a wall of numbers with no indication anything is
    // wrong.
    const digits = text.replace(/\D/g, '').slice(0, MAX_SUBSCRIBER_DIGITS);
    setPhoneText(new AsYouType(country).input(digits));
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
    try {
      const result = await authClient.requestPhoneOtp(e164.data);

      if (!result.ok) {
        // Mirrors Method A: no branching on the failure reason here beyond
        // rendering it verbatim.
        setFormError(result.error);
        return;
      }

      navigation.navigate('OtpVerify', { phone: e164.data, mode });
    } catch {
      // supabaseAuthClient's contract is that no method throws — this is
      // defence in depth, so the screen can never strand itself even if
      // that contract is ever violated (see execution brief).
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
          // `setParams`, not `navigate`: the two modes are the same screen wearing different
          // copy, so pushing a second copy of it onto the stack would give the user a back
          // button that appears to undo a sign-in choice that was never made.
          onPress={() => navigation.setParams({ mode: copy.switchTo })}
        />
      }
    >
      <Text variant="title" style={styles.heading}>
        {copy.heading}
      </Text>

      <View style={styles.row}>
        <CountryPicker value={country} onChange={handleCountryChange} variant="compact" />
        <View style={styles.field}>
          <TextField
            placeholder="Enter your phone number"
            value={phoneText}
            onChangeText={handleChangeText}
            keyboardType="phone-pad"
            autoComplete="tel"
            editable={!isSubmitting}
            accessibilityLabel="Phone number"
            style={styles.input}
          />
        </View>
      </View>

      {formError && (
        <Text variant="caption" tone="danger" style={styles.formError}>
          {formError}
        </Text>
      )}

      <View style={styles.primaryAction}>
        <Button
          label="Send verification code"
          shape="block"
          onPress={onSubmit}
          disabled={isSubmitting}
          loading={isSubmitting}
        />
      </View>

      <Text variant="body" tone="secondary" style={styles.divider}>
        or continue with
      </Text>

      <Button
        variant="onBrand"
        shape="block"
        label="Email"
        onPress={() => navigation.navigate('EmailCodeRequest', { mode })}
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
    // A touch more compact than the shared `title` size (28) — closer to the reference's
    // proportions on this specific screen. Overridden here rather than in the shared token,
    // which every other screen still relies on at full size.
    fontSize: 20,
  },
  row: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  field: {
    // The country chip sizes to its content; the number field takes everything left over.
    flex: 1,
  },
  input: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radii.lg,
    // `TextField`'s default outline reads as a stray box on the reference's tinted sheet, where
    // the white fill is what separates a field from its ground. Overridden here rather than
    // changed in `TextField` itself — every screen not yet restyled still sits on a white
    // background and needs the border to be visible at all.
    borderWidth: 0,
  },
  formError: {
    marginTop: tokens.spacing.sm,
  },
  primaryAction: {
    marginTop: tokens.spacing.lg,
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
