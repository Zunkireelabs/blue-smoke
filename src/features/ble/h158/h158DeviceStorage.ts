import AsyncStorage from '@react-native-async-storage/async-storage';

const PAIRED_H158_DEVICES_KEY = 'h158.pairedDevices.v1';

export interface RememberedH158Device {
  id: string;
  name: string | null;
  /** Epoch ms of the last successful connect — stamped by `addPairedH158Device` itself (see its
   * own comment), not passed in by callers, since every call site means "this device just
   * connected right now." Powers Home's "Last connected 2h ago" line on a disconnected row
   * (design ask, 2026-08-31); a live connection has no use for it (it just says "Connected"). */
  lastConnectedAt: number;
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
    if (!Array.isArray(parsed)) {
      return [];
    }
    // Back-fills `lastConnectedAt` on read for rows written before that field existed (added
    // 2026-08-31) — without this, `Date.now() - undefined` is `NaN`, which fell through every
    // bucket in `HomeScreen.tsx`'s `formatLastConnected` to a literal "Last connected NaNd ago".
    // "Now" is the best available guess for a row with no real timestamp, and it self-corrects
    // the moment the device actually reconnects (`addPairedH158Device` overwrites it for real).
    return (parsed as RememberedH158Device[]).map((device) => ({
      ...device,
      lastConnectedAt: typeof device.lastConnectedAt === 'number' ? device.lastConnectedAt : Date.now(),
    }));
  } catch {
    return [];
  }
}

/** Upserts by `id` — pairing the same physical unit twice (e.g. reconnecting after a drop)
 * updates its entry in place rather than duplicating the row. Every call site (`H158PairScreen`'s
 * `connect`) fires right after a successful connect, so `lastConnectedAt` is stamped here rather
 * than accepted as a caller-supplied field — there is never a moment where the caller means
 * anything other than "now". */
export async function addPairedH158Device(device: Pick<RememberedH158Device, 'id' | 'name'>): Promise<void> {
  const devices = await getPairedH158Devices();
  const next = devices.filter((existing) => existing.id !== device.id);
  next.push({ ...device, lastConnectedAt: Date.now() });
  await AsyncStorage.setItem(PAIRED_H158_DEVICES_KEY, JSON.stringify(next));
}

/** "Forget device" — the only path back to Home's empty state for a given device. Local-only,
 * same as the rest of this file: there is no OS bond or server-side record to also revoke. */
export async function removePairedH158Device(id: string): Promise<void> {
  const devices = await getPairedH158Devices();
  const next = devices.filter((existing) => existing.id !== id);
  await AsyncStorage.setItem(PAIRED_H158_DEVICES_KEY, JSON.stringify(next));
}
