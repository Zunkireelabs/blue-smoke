import { create } from 'zustand';
import type { H158Session } from './h158Session';

export interface ConnectedH158Device {
  id: string;
  name: string | null;
}

// UI-only hysteresis thresholds for the low-battery indicator — not device/protocol values.
// H158's `H158Status` carries only a raw `batteryPercent`, no `flags`-bit low-battery signal
// (that's a §4 concept, `protocol.ts`'s `LockState.lowBattery`, which this hardware has no
// equivalent of), so this app derives its own "low" flag from the percent, the same 15%/20%
// split spec §9.3 uses for the §4 world. A single fixed threshold would flap the badge on/off
// across every reading that lands right at the line; hysteresis (`applyLowBatteryHysteresis`
// below) needs the previous reading's OWN low/not-low state as input, which is exactly why this
// lives in the store rather than being computed fresh at render time the way
// `HomeScreen.tsx`'s `BatteryGlyph` tint threshold is.
const LOW_BATTERY_SET_PERCENT = 15;
const LOW_BATTERY_CLEAR_PERCENT = 20;

function applyLowBatteryHysteresis(previousLow: boolean, batteryPercent: number): boolean {
  if (batteryPercent <= LOW_BATTERY_SET_PERCENT) {
    return true;
  }
  if (batteryPercent >= LOW_BATTERY_CLEAR_PERCENT) {
    return false;
  }
  // Between the two thresholds: hold whatever the last reading decided, rather than flapping.
  return previousLow;
}

/**
 * One device's live connection state — everything Home's list needs to render a row without
 * going back to `h158DeviceStorage.ts` (that's the REMEMBERED half; this is the CONNECTED half,
 * see that file's own header comment for the split).
 */
export interface H158DeviceConnection {
  device: ConnectedH158Device;
  /**
   * The live session — kept per-connection so a screen reached later (Home's row → `H158Gate` →
   * `H158Pair` again, for this specific device) can resume straight into Read Status/Lock/
   * Unlock/Disconnect instead of only knowing a device is connected with nothing able to act on
   * it. `H158PairScreen` never disposes this on unmount — only an actual `disconnect()` does —
   * precisely so it stays usable across a "Done" round-trip back to Home and in again.
   */
  session: H158Session;
  /**
   * Last child-lock state this app actually heard back from THIS device — via `readStatus()`
   * or `setChildLock()`'s own reply, never guessed. `null` until one of those replies lands
   * (H158 pushes no unsolicited notification — reply item 13 — so there is no "live" value
   * until something asks this specific connection).
   */
  locked: boolean | null;
  /** Last battery reading heard back from THIS device — `readStatus()`'s own reply only
   * (`setChildLock()`'s ack carries no battery byte). `null` until a `readStatus()` lands. */
  batteryPercent: number | null;
  /** Hysteresis output of `batteryPercent`, `null` until a first reading exists to derive it from. */
  lowBattery: boolean | null;
}

interface H158ConnectionState {
  /** Keyed by device id — every device this phone currently holds a live GATT connection to.
   * A device that's merely REMEMBERED (in `h158DeviceStorage.ts`) but not connected right now
   * has no entry here at all, not an entry with a "disconnected" status; Home derives that
   * distinction itself by checking membership, same as the rest of this store's "confirmed or
   * absent, never a guessed default" convention. */
  connections: Record<string, H158DeviceConnection>;
}

// Not a §4/§5 spec value — P1-5.0's TODO asks for "multi-device connection policy defined: how
// many concurrent connections, and what happens beyond it," and neither the spec nor
// `h158Protocol.ts` sets one (the real hardware's own per-unit limit is one phone at a time,
// reply item 9 — a DIFFERENT ceiling, on how many phones one device accepts, not how many
// devices one phone may hold open at once). 3 concurrent GATT connections is comfortably inside
// what both iOS CoreBluetooth and Android's stack support without contention — a deliberately
// conservative product default, not a platform ceiling. "What happens beyond it": `H158PairScreen`
// refuses a new connect attempt with a user-visible message rather than queueing silently.
export const H158_MAX_CONCURRENT_CONNECTIONS = 3;

/**
 * Live "which H158 devices are connected right now, and what do we know about each" store —
 * Zustand convention (CLAUDE.md: small, explicit stores, one per concern, see
 * `useAppReadyStore.ts`). Generalises the old single-`device` shape to a map, so pairing a
 * second unit no longer silently evicts the first — the bug the single-slot version had no way
 * to avoid.
 *
 * `H158Session.dispose()` deliberately does not disconnect the underlying device (its own doc
 * comment: "that's the caller's concern, same split as connection.ts"), so a GATT link — and
 * therefore its entry here — routinely outlives `H158PairScreen` itself, e.g. once the user
 * navigates back to Home. This store exists so Home can reflect that live state instead of the
 * screen that created the connection being the only thing that ever knew about it.
 */
export const useH158ConnectionStore = create<H158ConnectionState>(() => ({
  connections: {},
}));

export function canConnectAnotherH158Device(): boolean {
  return Object.keys(useH158ConnectionStore.getState().connections).length < H158_MAX_CONCURRENT_CONNECTIONS;
}

export function setH158Connected(device: ConnectedH158Device, session: H158Session): void {
  useH158ConnectionStore.setState((s) => ({
    connections: {
      ...s.connections,
      // `locked`/`batteryPercent`/`lowBattery` reset to unknown on every new connection — a
      // reading left over from a PREVIOUS connection to this same id (e.g. reconnecting after a
      // drop) would be a guess wearing a confirmed reply's badge.
      [device.id]: { device, session, locked: null, batteryPercent: null, lowBattery: null },
    },
  }));
}

export function setH158LockState(deviceId: string, locked: boolean): void {
  useH158ConnectionStore.setState((s) => {
    const connection = s.connections[deviceId];
    if (!connection) return s;
    return { connections: { ...s.connections, [deviceId]: { ...connection, locked } } };
  });
}

export function setH158BatteryPercent(deviceId: string, batteryPercent: number): void {
  useH158ConnectionStore.setState((s) => {
    const connection = s.connections[deviceId];
    if (!connection) return s;
    const lowBattery = applyLowBatteryHysteresis(connection.lowBattery ?? false, batteryPercent);
    return { connections: { ...s.connections, [deviceId]: { ...connection, batteryPercent, lowBattery } } };
  });
}

export function setH158Disconnected(deviceId: string): void {
  useH158ConnectionStore.setState((s) => {
    if (!(deviceId in s.connections)) return s;
    const connections = { ...s.connections };
    delete connections[deviceId];
    return { connections };
  });
}

/**
 * Test-only. Same reasoning as `useSessionStore.ts`'s `__resetSessionListenerForTests` — this is
 * module-level state, so a real `connect()` in one test (`devicePairingFlow.test.tsx`) otherwise
 * leaks a connected device into the next test's fresh `HomeScreen` render.
 */
export function __resetH158ConnectionStoreForTests(): void {
  useH158ConnectionStore.setState({ connections: {} });
}
