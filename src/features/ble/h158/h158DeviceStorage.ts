import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_CONNECTED_H158_KEY = 'h158.lastConnectedDevice.v1';

export interface LastConnectedH158Device {
  id: string;
  name: string | null;
}

/**
 * Local-only "remembered device" flag for the real H158 hardware — same AsyncStorage
 * pattern/rationale as `onboardingStorage.ts` (clears with app data on uninstall, which is
 * the semantics wanted here too). Deliberately NOT a Supabase `device_ownership` row: H158 has
 * no authentication (§13.3, `hqd-device-architecture.md`), so what server-side "ownership"
 * should even mean for it is an open client product decision, not something to default to
 * silently. This is UI convenience only.
 */
export async function getLastConnectedH158Device(): Promise<LastConnectedH158Device | null> {
  const raw = await AsyncStorage.getItem(LAST_CONNECTED_H158_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as LastConnectedH158Device;
  } catch {
    return null;
  }
}

export async function setLastConnectedH158Device(device: LastConnectedH158Device): Promise<void> {
  await AsyncStorage.setItem(LAST_CONNECTED_H158_KEY, JSON.stringify(device));
}

/** "Forget device" — the only path back to Home's empty state. Local-only, same as the rest of
 * this file: there is no OS bond or server-side record to also revoke (see this file's header
 * comment). */
export async function clearLastConnectedH158Device(): Promise<void> {
  await AsyncStorage.removeItem(LAST_CONNECTED_H158_KEY);
}
