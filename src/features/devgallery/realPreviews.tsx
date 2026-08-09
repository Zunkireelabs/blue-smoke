import type { ComponentType } from 'react';
import { NotificationPrimingScreen } from '@/features/onboarding/NotificationPrimingScreen';

/**
 * ON-4/7/8/9 had no real trigger before P1-3.0 (device pairing) — they've now shipped their
 * real triggers (`BluetoothPriming`/`BluetoothGate` routes in `src/app/navigation.tsx`) and are
 * reachable through the genuine pairing flow from `Home`, so their entries left this map and
 * `screenSpecs.ts` entirely, per this repo's "shipped + reachable screen loses its placeholder"
 * convention (see VF-1/ON-1..3/etc's removal history in `screenSpecs.ts`).
 *
 * ON-6 stays: notification priming is F7.9, past P1-3.0's pairing boundary, so it still has no
 * real trigger and needs this shim.
 */
export const REAL_PREVIEWS: Partial<Record<string, ComponentType>> = {
  'ON-6': () => <NotificationPrimingScreen onEnable={() => {}} onNotNow={() => {}} />,
};
