import type { ComponentType } from 'react';
import { BluetoothPrimingScreen } from '@/features/onboarding/BluetoothPrimingScreen';
import { NotificationPrimingScreen } from '@/features/onboarding/NotificationPrimingScreen';
import { BluetoothDeniedScreen } from '@/features/onboarding/BluetoothDeniedScreen';
import { BluetoothBlockedScreen } from '@/features/onboarding/BluetoothBlockedScreen';
import { BluetoothOffScreen } from '@/features/onboarding/BluetoothOffScreen';

/**
 * ON-4/6/7/8/9 have no real trigger yet — Phase D (device pairing) is what actually decides
 * *when* each one is shown, and Phase D hasn't landed. Unlike VF-1/ON-5/etc in Phase B (each
 * reachable by walking a real, already-wired flow — sign up, start verification, cancel
 * Persona), these five would become completely unreachable in a running build if their
 * `screenSpecs.ts` placeholder entries were simply deleted per the usual "shipped screen loses
 * its placeholder" rule.
 *
 * So: entries stay in `screenSpecs.ts` (for the section rollup / status counts), but
 * `ScreenPreviewScreen` renders the REAL component from this map instead of the generic
 * data-driven placeholder, wired with dev-safe callbacks. Delete an entry here the moment its
 * real trigger exists (Phase D) and let the normal deletion rule take over from there.
 */
export const REAL_PREVIEWS: Partial<Record<string, ComponentType>> = {
  'ON-4': () => <BluetoothPrimingScreen onContinue={() => {}} onNotNow={() => {}} />,
  'ON-6': () => <NotificationPrimingScreen onEnable={() => {}} onNotNow={() => {}} />,
  'ON-7': () => <BluetoothDeniedScreen onTryAgain={() => {}} />,
  'ON-8': () => <BluetoothBlockedScreen />,
  'ON-9': () => <BluetoothOffScreen />,
};
