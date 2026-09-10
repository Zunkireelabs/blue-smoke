import { create } from 'zustand';

export interface BannerMessage {
  id: string;
  text: string;
  onPress?: () => void;
}

interface BannerState {
  message: BannerMessage | null;
}

/**
 * One in-app banner at a time — a second `showBanner` replaces whatever is showing, matching
 * how `notifee.displayNotification` with a fixed `id` already replaces-in-place for the two
 * notification types that drive this (`batteryNotifications.ts`, `connectionNotification.ts`),
 * so the OS and in-app surfaces stay consistent with each other.
 */
export const useBannerStore = create<BannerState>(() => ({
  message: null,
}));

export function showBanner(message: BannerMessage): void {
  useBannerStore.setState({ message });
}

/**
 * With an `id`, only clears if that id is the one currently showing — so e.g. a battery-clear
 * can't dismiss a connection banner that has since taken its place. Without one (the `Banner`
 * component's own auto-dismiss/tap-dismiss), always clears whatever is showing.
 */
export function clearBanner(id?: string): void {
  if (id && useBannerStore.getState().message?.id !== id) {
    return;
  }
  useBannerStore.setState({ message: null });
}

/** Test-only — same reasoning as `useH158ConnectionStore.ts`'s `__resetH158ConnectionStoreForTests`. */
export function __resetBannerStoreForTests(): void {
  useBannerStore.setState({ message: null });
}
