/**
 * Auto-reconnect for remembered H158/YP65-AT devices — the "earphone model".
 *
 * ── The problem this exists to solve ──────────────────────────────────────
 *
 * Reported by the manufacturer's test team on 2026-09-22 after a 10-device run
 * (`docs/audits/ble-reconnect-current-behaviour-2026-09-22.md`): carry a paired device out of
 * Bluetooth range and back, and the app never reconnects. It was not a bug in the reconnect
 * path — **there was no reconnect path.** A drop was detected correctly (`onDisconnected` →
 * `setH158Disconnected`) and then nothing ever tried again, so the only route back to a working
 * device was a user tap.
 *
 * The product model is a pair of earphones: you pair **once**, and from then on the connection
 * is ambient state the app maintains, not a task the user performs. Walk away, it drops; walk
 * back, it is simply connected again. The scan screen is for adding a *new* device only, and
 * "Forget device" is the only way out of the relationship.
 *
 * ── How it works, and why there is no polling loop ────────────────────────
 *
 * The naive fix is a `setInterval` that rescans and re-dials. That is the wrong mechanism: it
 * burns battery, it cannot run while the app is backgrounded, and it reconnects on *our*
 * schedule rather than the instant the device appears. Both platforms already expose a far
 * better primitive — a **standing connection intent** that the OS itself holds:
 *
 * - **Android** — `connectToDevice(id, { autoConnect: true })`. The GATT stack keeps watching
 *   for that MAC indefinitely, at no cost to us, and connects the moment it is seen.
 * - **iOS** — a plain CoreBluetooth `connect` with **no timeout** is already exactly this. The
 *   bug on that platform was that `h158Session.ts` raced it against a 10 s timeout and threw
 *   the pending connect away (and never cancelled it natively, so it dangled).
 *
 * So this supervisor issues **one long-lived dial per armed device** and then waits. It holds no
 * timer in the steady state. The retry backoff below is only for a dial the radio actively
 * *rejects* (adapter off, permission missing, native error) — an out-of-range device does not
 * reject, it simply stays pending, which is the behaviour we want.
 *
 * ── What it deliberately does not do ──────────────────────────────────────
 *
 * 🔴 It never restores a remembered lock state across a drop. `connectAndRememberH158Device`
 * resets `locked`/`batteryPercent` to `null` and issues a fresh `readStatus()`, and that must
 * stay true here: after a disconnect we genuinely do not know what the device did while we were
 * away, and rendering "unlocked" over a locked device is exactly the failure CLAUDE.md's
 * "notification-driven, never optimistic" rule forbids.
 *
 * 🔴 It never requests a runtime permission. It gates on `readBluetoothGateState`, which only
 * *checks*. An auto-reconnect that popped an Android permission sheet while the user was in
 * another app would be a permission dialog with no visible cause. Asking stays where a human
 * initiated it (`H158HomeConnectAgent`).
 *
 * Same "nothing across this boundary throws" convention as `connection.ts` / `scanner.ts` /
 * `h158Session.ts`: every failure is swallowed into a phase the UI can render.
 */

import type { BleManagerLike, BleScannerLike, BleSubscriptionLike } from '../BleClientContext';
import { readBluetoothGateState } from '../bluetoothPermission';
import { connectAndRememberH158Device } from './connectAndRememberH158Device';
import {
  canConnectAnotherH158Device,
  useH158ConnectionStore,
} from './useH158ConnectionStore';
import {
  clearH158ReconnectPhase,
  setH158ReconnectPhase,
} from './useH158ReconnectStore';

/** One device the supervisor should keep connected. */
export interface H158ReconnectTarget {
  id: string;
  name: string | null;
}

// App-level operational choices, not device protocol — same split as `h158Session.ts`'s own
// timeout constants, and for the same reason they live here rather than in `h158Protocol.ts`.

/**
 * How long to wait after a drop before re-dialling. Not a guess at the radio's behaviour — it
 * exists because the native stack is still tearing the old link down when `onDisconnected`
 * fires, and an immediate re-dial on Android can land on a GATT handle that is mid-teardown and
 * fail for a reason that has nothing to do with the device being out of range.
 */
const REDIAL_SETTLE_MS = 750;

/** First backoff step after a dial the radio actively rejected. */
const RETRY_BASE_MS = 2_000;

/**
 * Backoff ceiling. Bounded because the steady state is a pending dial holding no timer at all —
 * this path only runs when something is actually wrong, and when it is, an hourly retry would
 * feel broken while a 1-second retry would spin.
 */
const RETRY_MAX_MS = 60_000;

export interface H158ReconnectSupervisor {
  /**
   * Declare the full set of devices that should be kept connected — normally everything in
   * `h158DeviceStorage`. Idempotent and diff-based: already-armed devices are left alone (their
   * pending dial is *not* restarted), devices no longer listed are disarmed.
   */
  sync(targets: readonly H158ReconnectTarget[]): void;
  /**
   * The user explicitly disconnected this device. Cancels any pending dial and stops trying
   * until `allow()` is called. Survives `sync()` — that is the entire point, since a suppressed
   * device is still in the remembered list and would otherwise be re-armed immediately.
   */
  suppress(deviceId: string): void;
  /** The user asked for this device again (tapped Connect, or re-paired). Undoes `suppress`. */
  allow(deviceId: string): void;
  /** Stop tracking a device entirely — "Forget device". */
  forget(deviceId: string): void;
  /** Re-evaluate every armed device now: app foregrounded, or Bluetooth just came back on. */
  poke(): void;
  /** Test/debug view of what is armed right now. */
  getArmedDeviceIds(): string[];
  dispose(): void;
}

export interface CreateH158ReconnectSupervisorOptions {
  manager: BleManagerLike;
  /**
   * The adapter-state slice, so a device armed while Bluetooth is off reconnects the moment it
   * is switched back on rather than waiting for the user to open Home. Optional: the real
   * `BleManager` satisfies it structurally, narrow test doubles do not, and without it the
   * supervisor simply relies on `poke()` instead of being event-driven.
   */
  adapter?: Pick<BleScannerLike, 'onStateChange'>;
  /** Seams, for tests. Defaults are the real implementations. */
  connect?: typeof connectAndRememberH158Device;
  readGateState?: typeof readBluetoothGateState;
  setTimeoutFn?: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
}

interface ArmedDevice {
  target: H158ReconnectTarget;
  /** A dial is outstanding. Guards against two concurrent dials for one device, which on Android
   * is not merely wasteful — the second can tear down the first. */
  dialInFlight: boolean;
  /** Consecutive rejected dials, for the backoff. Reset on any success. */
  failures: number;
  retryHandle?: ReturnType<typeof setTimeout>;
}

export function createH158ReconnectSupervisor(
  options: CreateH158ReconnectSupervisorOptions,
): H158ReconnectSupervisor {
  const {
    manager,
    adapter,
    connect = connectAndRememberH158Device,
    readGateState = readBluetoothGateState,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  } = options;

  const armed = new Map<string, ArmedDevice>();
  /** Explicitly disconnected by the user. In memory only, and that is deliberate — see
   * `suppress` on the interface above. A relaunch is a fresh intent to use the app, so the
   * earphone behaviour resuming then is the right default; persisting "don't reconnect" across
   * launches would strand a user who has forgotten they ever pressed Disconnect. */
  const suppressed = new Set<string>();
  let disposed = false;

  function clearRetry(entry: ArmedDevice): void {
    if (entry.retryHandle !== undefined) {
      clearTimeoutFn(entry.retryHandle);
      entry.retryHandle = undefined;
    }
  }

  function scheduleRetry(deviceId: string, delayMs: number): void {
    const entry = armed.get(deviceId);
    if (!entry || disposed) {
      return;
    }
    clearRetry(entry);
    entry.retryHandle = setTimeoutFn(() => {
      const current = armed.get(deviceId);
      if (current) {
        current.retryHandle = undefined;
      }
      void dial(deviceId);
    }, delayMs);
  }

  async function dial(deviceId: string): Promise<void> {
    const entry = armed.get(deviceId);
    if (!entry || disposed || entry.dialInFlight || suppressed.has(deviceId)) {
      return;
    }
    // Already connected — nothing to do. This is the ordinary outcome of a `poke()` on
    // foreground, so it must be cheap and silent rather than a re-dial.
    if (useH158ConnectionStore.getState().connections[deviceId]) {
      clearH158ReconnectPhase(deviceId);
      return;
    }

    // Gate, never ask. `readBluetoothGateState` returns 'poweredOn' only when the adapter is on
    // AND (on Android 12+) BLUETOOTH_SCAN/BLUETOOTH_CONNECT are actually granted — which is the
    // exact condition under which a silent dial can succeed. Anything else is a state the user
    // has to resolve, so it is surfaced as `blocked` rather than retried into a wall.
    let gate: Awaited<ReturnType<typeof readBluetoothGateState>>;
    try {
      gate = await readGateState(manager);
    } catch {
      // A gate read that fails tells us nothing about the device; treat it as a transient
      // rejection and back off, rather than declaring the device blocked on no evidence.
      gate = 'unknown';
    }
    if (gate !== 'poweredOn') {
      setH158ReconnectPhase(deviceId, 'blockedBluetooth');
      // No retry scheduled for a hard block: `poke()` on foreground and the adapter-state
      // subscription are both better signals than a timer, and neither costs anything while
      // the user is fixing it in Settings.
      return;
    }

    if (!canConnectAnotherH158Device()) {
      // At the 3-connection cap (`H158_MAX_CONCURRENT_CONNECTIONS`). Not an error and not the
      // user's problem to fix — a slot frees up when something disconnects, and the store
      // subscription below re-dials then.
      setH158ReconnectPhase(deviceId, 'blockedLimit');
      return;
    }

    entry.dialInFlight = true;
    setH158ReconnectPhase(deviceId, 'reconnecting');
    try {
      // 🔴 The two options that make this a *standing* intent rather than a 10-second attempt.
      // See `H158ConnectOptions` in `h158Session.ts` for what each platform does with them.
      const outcome = await connect(manager, deviceId, entry.target.name, {
        autoConnect: true,
        connectTimeoutMs: null,
      });
      const current = armed.get(deviceId);
      if (!current) {
        // Forgotten while the dial was pending. If it nonetheless succeeded we must not leave a
        // link the user did not ask for.
        if (outcome.ok) {
          void manager.cancelDeviceConnection(deviceId).catch(() => undefined);
        }
        return;
      }
      current.dialInFlight = false;
      // 🔴 The user pressed Disconnect *while this dial was in flight*. A dial is not
      // cancellable once issued, so the decision has to be re-checked here rather than only at
      // the top: without this, a connect that started a moment before the tap lands a moment
      // after it, and the device reconnects itself seconds after the user disconnected it —
      // the precise behaviour `suppress()` exists to prevent. `suppress()` already fired its
      // own `cancelDeviceConnection`, but that raced this connect rather than cancelling it.
      if (suppressed.has(deviceId)) {
        if (outcome.ok) {
          void manager.cancelDeviceConnection(deviceId).catch(() => undefined);
        }
        setH158ReconnectPhase(deviceId, 'suppressed');
        return;
      }
      if (outcome.ok) {
        current.failures = 0;
        clearH158ReconnectPhase(deviceId);
        return;
      }
      // A rejected dial, not an out-of-range one — out-of-range stays pending and never lands
      // here. Back off, but keep the phase as `reconnecting`: from the user's point of view we
      // are still trying, and the distinction between "pending" and "retrying in 8 seconds" is
      // not one the UI should make them think about.
      current.failures += 1;
      setH158ReconnectPhase(deviceId, 'reconnecting');
      scheduleRetry(deviceId, Math.min(RETRY_BASE_MS * 2 ** (current.failures - 1), RETRY_MAX_MS));
    } catch {
      // `connectAndRememberH158Device` is typed never to throw; this is belt-and-braces so a
      // future change there cannot silently kill the supervisor for every other device too.
      const current = armed.get(deviceId);
      if (current) {
        current.dialInFlight = false;
        current.failures += 1;
        scheduleRetry(deviceId, Math.min(RETRY_BASE_MS * 2 ** (current.failures - 1), RETRY_MAX_MS));
      }
    }
  }

  function disarm(deviceId: string, cancelPendingDial: boolean): void {
    const entry = armed.get(deviceId);
    if (entry) {
      clearRetry(entry);
      armed.delete(deviceId);
    }
    if (cancelPendingDial) {
      // Cancels the OS-held standing intent. Without this an Android `autoConnect` outlives the
      // supervisor's interest in it and can connect a device the user just disconnected.
      void manager.cancelDeviceConnection(deviceId).catch(() => undefined);
    }
  }

  /**
   * Drop detection. Subscribing to the connection store rather than registering another
   * `onDisconnected` listener is deliberate: `connectAndRememberH158Device` already owns that
   * listener, this sees the same event through its effect, and — usefully — it also fires for a
   * device connected by a *manual* tap, so a manually-connected device gets the same automatic
   * reconnection as one the supervisor dialled itself.
   */
  const unsubscribeConnections = useH158ConnectionStore.subscribe((state, previous) => {
    if (disposed) {
      return;
    }
    for (const deviceId of Object.keys(previous.connections)) {
      if (state.connections[deviceId]) {
        continue;
      }
      // This device just went from connected to not-connected.
      if (!armed.has(deviceId) || suppressed.has(deviceId)) {
        continue;
      }
      setH158ReconnectPhase(deviceId, 'reconnecting');
      scheduleRetry(deviceId, REDIAL_SETTLE_MS);
    }
    // A freed slot may unblock a device that was sitting at the concurrency cap.
    if (Object.keys(state.connections).length < Object.keys(previous.connections).length) {
      for (const [deviceId] of armed) {
        if (!state.connections[deviceId] && !suppressed.has(deviceId)) {
          const entry = armed.get(deviceId);
          if (entry && !entry.dialInFlight && entry.retryHandle === undefined) {
            scheduleRetry(deviceId, REDIAL_SETTLE_MS);
          }
        }
      }
    }
  });

  // Bluetooth coming back on is the other edge worth reacting to. `emitCurrentState: false` —
  // the initial state is already handled by the `dial()` each device runs when it is armed.
  let adapterSubscription: BleSubscriptionLike | undefined;
  if (adapter) {
    adapterSubscription = adapter.onStateChange((state) => {
      if (disposed || state !== 'PoweredOn') {
        return;
      }
      poke();
    }, false);
  }

  function poke(): void {
    if (disposed) {
      return;
    }
    for (const [deviceId, entry] of armed) {
      if (suppressed.has(deviceId) || entry.dialInFlight) {
        continue;
      }
      clearRetry(entry);
      void dial(deviceId);
    }
  }

  return {
    sync(targets) {
      if (disposed) {
        return;
      }
      const wanted = new Set(targets.map((target) => target.id));
      for (const deviceId of [...armed.keys()]) {
        if (!wanted.has(deviceId)) {
          disarm(deviceId, true);
          clearH158ReconnectPhase(deviceId);
        }
      }
      for (const target of targets) {
        const existing = armed.get(target.id);
        if (existing) {
          // Keep the pending dial; only refresh the name, which is all `sync` can legitimately
          // have newer information about. Re-dialling here would restart a perfectly good
          // standing intent every time Home regains focus.
          existing.target = target;
          continue;
        }
        armed.set(target.id, { target, dialInFlight: false, failures: 0 });
        if (suppressed.has(target.id)) {
          setH158ReconnectPhase(target.id, 'suppressed');
          continue;
        }
        void dial(target.id);
      }
    },

    suppress(deviceId) {
      suppressed.add(deviceId);
      const entry = armed.get(deviceId);
      if (entry) {
        clearRetry(entry);
        entry.dialInFlight = false;
      }
      // Cancel whatever standing intent the OS is holding, or the device reconnects seconds
      // after the user pressed Disconnect.
      void manager.cancelDeviceConnection(deviceId).catch(() => undefined);
      setH158ReconnectPhase(deviceId, 'suppressed');
    },

    allow(deviceId) {
      if (!suppressed.delete(deviceId)) {
        return;
      }
      if (armed.has(deviceId)) {
        void dial(deviceId);
      }
    },

    forget(deviceId) {
      suppressed.delete(deviceId);
      disarm(deviceId, true);
      clearH158ReconnectPhase(deviceId);
    },

    poke,

    getArmedDeviceIds() {
      return [...armed.keys()];
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribeConnections();
      adapterSubscription?.remove();
      for (const entry of armed.values()) {
        clearRetry(entry);
      }
      armed.clear();
      suppressed.clear();
    },
  };
}
