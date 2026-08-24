import { create } from 'zustand';
import type { H158Session } from './h158Session';

export interface ConnectedH158Device {
  id: string;
  name: string | null;
}

interface H158ConnectionState {
  device: ConnectedH158Device | null;
  /**
   * The live session, kept alongside `device` so a screen reached later (e.g. Home's
   * `ConnectedDeviceCard` → `H158Gate` → `H158Pair` again) can resume straight into
   * Read Status/Lock/Unlock/Disconnect instead of only knowing a device is connected with
   * nothing able to act on it. `H158PairScreen` no longer disposes this on unmount — only an
   * actual `disconnect()` does — precisely so it stays usable across a "Done" round-trip back
   * to Home and in again.
   */
  session: H158Session | null;
  /**
   * Last child-lock state this app actually heard back from the device — via `readStatus()`
   * or `setChildLock()`'s own reply, never guessed. `null` until one of those replies lands
   * (H158 pushes no unsolicited notification — reply item 13 — so there is no "live" value
   * until something asks). Home's connected card reads this to show a Locked/Unlocked badge
   * alongside "Connected" instead of only the bare connection flag.
   */
  locked: boolean | null;
  /**
   * Last battery reading heard back from the device — `readStatus()`'s own reply only
   * (`setChildLock()`'s ack carries no battery byte, h158Protocol.ts's `H158SendOutcome` for
   * it), same "confirmed reply or nothing" rule as `locked`. `null` until a `readStatus()`
   * lands.
   */
  batteryPercent: number | null;
}

/**
 * Live "is an H158 connected right now" flag — Zustand convention (CLAUDE.md:
 * small, explicit stores, one per concern, see `useAppReadyStore.ts`).
 *
 * `H158Session.dispose()` deliberately does not disconnect the underlying device
 * (its own doc comment: "that's the caller's concern, same split as connection.ts"),
 * so the GATT link — and therefore this store's `device` — routinely outlives
 * `H158PairScreen` itself, e.g. once the user navigates back to Home. This store
 * exists so Home can reflect that live state instead of the screen that created the
 * connection being the only thing that ever knew about it.
 */
export const useH158ConnectionStore = create<H158ConnectionState>(() => ({
  device: null,
  session: null,
  locked: null,
  batteryPercent: null,
}));

export function setH158Connected(device: ConnectedH158Device, session: H158Session): void {
  // `locked`/`batteryPercent` reset to unknown on every new connection — a reading left over
  // from whatever was last connected (possibly a different physical unit) would be a guess
  // wearing a confirmed reply's badge.
  useH158ConnectionStore.setState({ device, session, locked: null, batteryPercent: null });
}

export function setH158LockState(locked: boolean): void {
  useH158ConnectionStore.setState({ locked });
}

export function setH158BatteryPercent(batteryPercent: number): void {
  useH158ConnectionStore.setState({ batteryPercent });
}

export function setH158Disconnected(): void {
  useH158ConnectionStore.setState({ device: null, session: null, locked: null, batteryPercent: null });
}

/**
 * Test-only. Same reasoning as `useSessionStore.ts`'s `__resetSessionListenerForTests` — this is
 * module-level state, so a real `connect()` in one test (`devicePairingFlow.test.tsx`) otherwise
 * leaks a "connected" device into the next test's fresh `HomeScreen` render.
 */
export function __resetH158ConnectionStoreForTests(): void {
  useH158ConnectionStore.setState({ device: null, session: null, locked: null, batteryPercent: null });
}
