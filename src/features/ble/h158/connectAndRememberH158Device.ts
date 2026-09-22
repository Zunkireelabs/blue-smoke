/**
 * The "dial a known/discovered H158 and remember it" sequence — extracted from
 * `H158PairScreen.tsx`'s own former `connect` callback (design ask, 2026-08-31: Home's device
 * rows now drive this directly instead of only `H158PairScreen`, so it needed one shared home
 * rather than living inline on that screen alone). Both call sites want the exact same
 * store/storage side effects on success, and the same human-readable failure copy — duplicating
 * this would risk the two drifting apart on what "connected" actually means.
 */

import type { BleManagerLike } from '../BleClientContext';
import { connectH158Session, type H158ConnectOptions, type H158Session } from './h158Session';
import { addPairedH158Device } from './h158DeviceStorage';
import {
  setH158Connected,
  setH158Disconnected,
  setH158LockState,
  setH158BatteryPercent,
  type ConnectedH158Device,
} from './useH158ConnectionStore';

export type ConnectH158DeviceOutcome =
  | { ok: true; device: ConnectedH158Device; session: H158Session }
  | { ok: false; detail: string };

/**
 * Connects `deviceId`, and on success registers it with `useH158ConnectionStore` (so every
 * screen reading that store, Home included, sees it immediately) and `h158DeviceStorage` (so it
 * survives a disconnect). Mirrors CLAUDE.md's "Lock state UI is notification-driven, never
 * optimistic": the returned `device` only exists once the hardware has actually replied.
 *
 * `detail` on failure is already the coaching copy a `Text` can render as-is (CLAUDE.md: "never
 * diagnostic") — a timeout says which step stalled, a transport failure carries the underlying
 * message, neither exposes anything about the H158 protocol itself.
 *
 * `options` (2026-09-22) is forwarded untouched to `connectH158Session`. The auto-reconnect
 * supervisor passes `{ autoConnect: true, connectTimeoutMs: null }` to make the dial a standing
 * intent rather than a 10-second attempt; a user-initiated tap passes nothing and keeps the
 * bounded behaviour, because a person waiting on a button needs an answer either way.
 */
export async function connectAndRememberH158Device(
  manager: BleManagerLike,
  deviceId: string,
  name: string | null,
  options?: H158ConnectOptions,
): Promise<ConnectH158DeviceOutcome> {
  const outcome = await connectH158Session(manager, deviceId, undefined, options);

  if (!outcome.ok) {
    const detail =
      outcome.reason === 'timeout'
        ? `Couldn't connect — timed out at the "${outcome.stage}" step.`
        : `Couldn't connect: ${outcome.detail}`;
    return { ok: false, detail };
  }

  const connected: ConnectedH158Device = { id: deviceId, name };
  setH158Connected(connected, outcome.session);
  // Deliberately not torn down when the caller unmounts — same split
  // `H158Session.dispose()` itself documents (see `useH158ConnectionStore.ts`): the GATT link
  // outlives whichever screen dialled it, so the listener needs to too, or Home would keep
  // showing "connected" after a real drop it never heard about.
  outcome.device.onDisconnected?.(() => setH158Disconnected(deviceId));
  await addPairedH158Device(connected);

  // Fire-and-forget: populates Home's Locked/Unlocked badge and battery reading as soon as the
  // device is reachable, rather than leaving them blank until someone opens the detail screen
  // and taps "Read Status". A failed/timed-out read just leaves both at their unknown `null`
  // default — never a guessed value standing in for a confirmed reply.
  void outcome.session.readStatus().then((statusOutcome) => {
    if (statusOutcome.ok) {
      setH158LockState(deviceId, statusOutcome.value.locked);
      setH158BatteryPercent(deviceId, statusOutcome.value.batteryPercent);
    }
  });

  return { ok: true, device: connected, session: outcome.session };
}
