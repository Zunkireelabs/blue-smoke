import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_SEEN_KEY = 'onboarding.seen.v1';

/**
 * P1-2.0 — where the "has this user seen onboarding" flag lives, and why it is AsyncStorage
 * rather than `react-native-keychain` (already used for the Supabase session).
 *
 * ON-1..3 show on first launch, before any account exists, so the flag cannot live in the
 * database. Keychain was the other candidate and was rejected: Keychain entries SURVIVE an app
 * uninstall on iOS, confirmed the hard way in this project (2026-08-09) when a Keychain-backed
 * Supabase session outlived `simctl uninstall`. A reinstalling user would then never see
 * onboarding again. AsyncStorage clears with app data on uninstall, which is the semantics this
 * flag actually wants: "has this install seen onboarding," not "has this person, ever."
 */
export async function hasSeenOnboarding(): Promise<boolean> {
  const value = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
  return value === 'true';
}

export async function markOnboardingSeen(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
}
