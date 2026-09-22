import { create } from 'zustand';

/**
 * Why a device is not connected right now, from the auto-reconnect supervisor's point of view.
 * This is the **intent** half, deliberately separate from `useH158ConnectionStore`'s **live
 * connection** half (see that file's header for the same split applied to remembered vs.
 * connected) — a device can be "we are trying" without there being any connection object to
 * hang that fact on, which is precisely the state the old code had no way to represent.
 *
 * - `reconnecting` — a standing connect intent is outstanding with the OS. On Android that is a
 *   GATT `autoConnect` the stack is holding; on iOS a pending CoreBluetooth connect. Neither
 *   costs us a timer or a scan, so this state is free to sit in indefinitely.
 * - `blockedBluetooth` — the adapter is off, or the Android runtime permission is not granted.
 *   The user can fix this, and the UI has to say so; rendering it as "reconnecting" would be a
 *   promise the app cannot keep.
 * - `blockedLimit` — the concurrent-connection cap is taken. Also not "reconnecting", but a
 *   different recovery from `blockedBluetooth`, which is why these are two members and not one:
 *   telling someone to turn on Bluetooth that is already on is worse than saying nothing.
 * - `suppressed` — the user explicitly disconnected this device. We deliberately do **not**
 *   reconnect, because silently undoing a button the user just pressed is worse than not
 *   reconnecting at all.
 */
export type H158ReconnectPhase =
  | 'reconnecting'
  | 'blockedBluetooth'
  | 'blockedLimit'
  | 'suppressed';

interface H158ReconnectState {
  /** Keyed by device id. A device with no entry has no standing intent — either it is connected,
   * or it is not remembered at all. Absent is never "idle-but-trying"; same "confirmed or
   * absent, never a guessed default" convention `useH158ConnectionStore` follows. */
  phases: Record<string, H158ReconnectPhase>;
}

export const useH158ReconnectStore = create<H158ReconnectState>(() => ({
  phases: {},
}));

export function setH158ReconnectPhase(deviceId: string, phase: H158ReconnectPhase): void {
  useH158ReconnectStore.setState((s) =>
    s.phases[deviceId] === phase ? s : { phases: { ...s.phases, [deviceId]: phase } },
  );
}

export function clearH158ReconnectPhase(deviceId: string): void {
  useH158ReconnectStore.setState((s) => {
    if (!(deviceId in s.phases)) return s;
    const phases = { ...s.phases };
    delete phases[deviceId];
    return { phases };
  });
}

/** Test-only — module-level state, same reasoning as `__resetH158ConnectionStoreForTests`. */
export function __resetH158ReconnectStoreForTests(): void {
  useH158ReconnectStore.setState({ phases: {} });
}
