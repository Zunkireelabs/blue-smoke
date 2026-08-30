import * as Keychain from 'react-native-keychain';
import type { SupportedStorage } from '@supabase/supabase-js';

/**
 * Supabase Auth storage adapter backed by iOS Keychain / Android Keystore.
 *
 * Spec §8 data classification: the Supabase refresh token is 🟠 "secret at
 * rest", same tier as `K_sess` and `session_id` — "iOS Keychain
 * (kSecAttrAccessibleWhenUnlockedThisDeviceOnly) / Android Keystore,
 * hardware-backed." This adapter is what makes `persistSession: true` in
 * supabaseClient.ts satisfy that, instead of falling back to supabase-js's
 * default (AsyncStorage / localStorage, which is not hardware-backed).
 *
 * react-native-keychain stores one secret per `service` string, not an
 * arbitrary multi-key store — so each Supabase storage `key` (e.g.
 * `sb-<project-ref>-auth-token`) becomes its own Keychain `service` entry.
 *
 * 🔴 Deliberately NOT `accessControl: BIOMETRY_ANY_OR_DEVICE_PASSCODE`. That
 * was tried and reverted — measured live on a physical Android device
 * 2026-08-25: it makes react-native-keychain require a *live* biometric
 * challenge on every single read, not just the initial write, because
 * Android's Keystore key it generates for that access control only stays
 * authorized for 5 seconds (hardcoded in the library's
 * CipherStorageKeystoreAesGcm.kt, not configurable from JS). Supabase's
 * `autoRefreshToken` reads this storage on a background timer with no UI to
 * host a biometric prompt, and even a plain foreground read (e.g. opening
 * the Profile screen) fails the same way outside that 5s window — surfaced
 * as `CryptoFailedException: code 1, msg: Fingerprint hardware not
 * available` (Android's `BIOMETRIC_ERROR_HW_UNAVAILABLE`, thrown when
 * `BiometricPrompt.authenticate()` can't resolve, not "no biometrics
 * enrolled" — reproduced with a fingerprint enrolled and USE_BIOMETRIC
 * granted). `ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY` alone is what the
 * spec's own iOS citation above uses — hardware-backed and device-unlock
 * gated, without requiring a fresh biometric scan per access.
 */
export const authKeychainStorage: SupportedStorage = {
  async getItem(key: string): Promise<string | null> {
    const result = await Keychain.getGenericPassword({ service: key });
    return result ? result.password : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    await Keychain.setGenericPassword(key, value, {
      service: key,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async removeItem(key: string): Promise<void> {
    await Keychain.resetGenericPassword({ service: key });
  },
};
