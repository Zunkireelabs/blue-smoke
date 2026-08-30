import AsyncStorage from '@react-native-async-storage/async-storage';

const PAIRED_H158_DEVICES_KEY = 'h158.pairedDevices.v1';

export interface RememberedH158Device {
  id: string;
  name: string | null;
}

/**
 * P1-5.0 — local-only "remembered devices" list for the real H158 hardware, superseding the
 * single-slot `h158.lastConnectedDevice.v1` key (dropped, not migrated: this app has never
 * shipped, so there is no installed base whose single remembered device would otherwise be
 * silently lost). Same AsyncStorage pattern/rationale as `onboardingStorage.ts` (clears with app
 * data on uninstall, which is the semantics wanted here too) and deliberately NOT a Supabase
 * `device_ownership` row: H158 has no authentication (§13.3, `hqd-device-architecture.md`), so
 * what server-side "ownership" should even mean for it is an open client product decision, not
 * something to default to silently. This is UI convenience only, and it's a LIST because a phone
 * can remember more than one H158 unit even though (reply item 9) it can only ever hold a live
 * GATT connection to a subset of them at once — remembering and connecting are different things,
 * tracked separately (`useH158ConnectionStore.ts` is the live-connection half).
 */
export async function getPairedH158Devices(): Promise<RememberedH158Device[]> {
  const raw = await AsyncStorage.getItem(PAIRED_H158_DEVICES_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RememberedH158Device[]) : [];
  } catch {
    return [];
  }
}

/** Upserts by `id` — pairing the same physical unit twice (e.g. reconnecting after a drop)
 * updates its entry in place rather than duplicating the row. */
export async function addPairedH158Device(device: RememberedH158Device): Promise<void> {
  const devices = await getPairedH158Devices();
  const next = devices.filter((existing) => existing.id !== device.id);
  next.push(device);
  await AsyncStorage.setItem(PAIRED_H158_DEVICES_KEY, JSON.stringify(next));
}

/** "Forget device" — the only path back to Home's empty state for a given device. Local-only,
 * same as the rest of this file: there is no OS bond or server-side record to also revoke. */
export async function removePairedH158Device(id: string): Promise<void> {
  const devices = await getPairedH158Devices();
  const next = devices.filter((existing) => existing.id !== id);
  await AsyncStorage.setItem(PAIRED_H158_DEVICES_KEY, JSON.stringify(next));
}
