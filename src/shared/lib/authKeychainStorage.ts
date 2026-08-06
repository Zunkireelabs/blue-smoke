import * as Keychain from 'react-native-keychain';
import type { SupportedStorage } from '@supabase/supabase-js';

/**
 * Supabase Auth storage adapter backed by iOS Keychain / Android Keystore.
 *
 * Spec §8 data classification: the Supabase refresh token is 🟠 "secret at
 * rest", same tier as `K_sess` and `session_id` — "iOS Keychain
 * (kSecAttrAccessibleWhenUnlockedThisDeviceOnly) / Android Keystore,
 * hardware-backed, biometric-gated where available." This adapter is what
 * makes `persistSession: true` in supabaseClient.ts satisfy that, instead of
 * falling back to supabase-js's default (AsyncStorage / localStorage, which
 * is not hardware-backed and not biometric-gated).
 *
 * react-native-keychain stores one secret per `service` string, not an
 * arbitrary multi-key store — so each Supabase storage `key` (e.g.
 * `sb-<project-ref>-auth-token`) becomes its own Keychain `service` entry.
 *
 * "Biometric-gated where available": BIOMETRY_ANY_OR_DEVICE_PASSCODE degrades
 * to device-passcode gating on a device with no enrolled biometrics, rather
 * than hard-failing session restore. A device with neither biometrics nor a
 * passcode set falls back to WHEN_UNLOCKED_THIS_DEVICE_ONLY's own protection.
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
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
    });
  },

  async removeItem(key: string): Promise<void> {
    await Keychain.resetGenericPassword({ service: key });
  },
};
