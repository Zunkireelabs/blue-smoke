/**
 * App foreground/background handling for the BLE connection lifecycle — P1-7.0,
 * spec §7.1.
 *
 * Two pieces, deliberately separate so each is testable on its own:
 *
 * - `createAppStateCoordinator()` — the transition machine. Collapses RN's
 *   three-value `AppStateStatus` into the two *phases* this app actually has a
 *   policy for, and calls the caller's hooks on real transitions only.
 * - `reconcileConnections()` — the foreground policy that matters: find
 *   connections that died while we were suspended and restart them.
 *
 * ── 🔴 What backgrounding must NOT do ─────────────────────────────────────
 *
 * It must not disconnect. It is tempting (tidy, saves a little radio) and it
 * is exactly backwards: the device is kept safe by the **firmware dead-man
 * timer**, not by this app. An app that tears down its connection on
 * background is an app making its own liveness load-bearing, which CLAUDE.md
 * says to reject on sight. We stop *scanning* — a battery cost with no safety
 * role — and leave connections alone.
 *
 * Same "nothing across this boundary throws" convention as auth.ts /
 * connection.ts / scanner.ts.
 */

import type { BleManagerLike } from './BleClientContext';
import type { ConnectionManager } from './connection';

/**
 * The two states we have distinct behaviour for. Note this is *not* RN's
 * `AppStateStatus` — see `phaseFor()` for why that distinction is the whole
 * point of this module.
 */
export type AppPhase = 'foreground' | 'background';

export interface AppStateSubscriptionLike {
  remove(): void;
}

/**
 * The seam over React Native's `AppState`. Injected rather than imported so
 * tests drive transitions directly, in the same spirit as `connection.ts`'s
 * `setTimeoutFn` — a real `AppState` cannot be made to emit `background` on
 * demand from Jest.
 */
export interface AppStateLike {
  readonly currentState: string | null;
  addEventListener(type: 'change', listener: (state: string) => void): AppStateSubscriptionLike;
}

export interface AppStateCoordinator {
  getPhase(): AppPhase;
  /** Idempotent. Releases the underlying subscription; not restartable. */
  dispose(): void;
}

export interface CreateAppStateCoordinatorOptions {
  appState: AppStateLike;
  /** Fired on background → foreground. Never fired for a transient `inactive`. */
  onEnterForeground?: () => void;
  /** Fired on foreground → background. */
  onEnterBackground?: () => void;
}

/**
 * 🔴 The one subtlety in this file. iOS emits `inactive` constantly and for
 * reasons that are not backgrounding: the app switcher, an incoming call, a
 * notification banner being pulled down, Control Centre, the screen locking
 * for a moment. Treating `inactive` as "we went to the background" produces a
 * scan that stops and restarts every time a notification arrives, and a
 * foreground handler that re-runs permission checks several times a minute.
 *
 * So `inactive` returns `null` — meaning "no phase change" — and the phase is
 * carried through unchanged. Only an explicit `background` backgrounds us, and
 * only an explicit `active` foregrounds us.
 *
 * Anything unrecognised (`extension`, `unknown`, or a future RN addition) is
 * treated the same way: unknown is not a reason to act.
 */
function phaseFor(state: string | null): AppPhase | null {
  switch (state) {
    case 'active':
      return 'foreground';
    case 'background':
      return 'background';
    default:
      return null;
  }
}

export function createAppStateCoordinator(
  options: CreateAppStateCoordinatorOptions,
): AppStateCoordinator {
  const { appState, onEnterForeground, onEnterBackground } = options;

  // A launch can legitimately observe `inactive` before anything else. That is
  // not the background, so the only state that starts us backgrounded is an
  // explicit `background`.
  let phase: AppPhase = phaseFor(appState.currentState) === 'background' ? 'background' : 'foreground';
  let disposed = false;

  const subscription = appState.addEventListener('change', (next) => {
    if (disposed) {
      return;
    }
    const nextPhase = phaseFor(next);
    // Both guards matter: `null` is a transient state to be ignored, and an
    // equal phase is a repeat (`active` twice running) that must not re-fire
    // the hook. Only genuine edges get through.
    if (nextPhase === null || nextPhase === phase) {
      return;
    }
    phase = nextPhase;
    if (nextPhase === 'foreground') {
      onEnterForeground?.();
    } else {
      onEnterBackground?.();
    }
  });

  return {
    getPhase: () => phase,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      subscription.remove();
    },
  };
}

export interface ReconcileConnectionsOptions {
  manager: Pick<BleManagerLike, 'isDeviceConnected'>;
  connection: Pick<ConnectionManager, 'getState' | 'connect'>;
  /** The devices worth reconciling — normally the ones the user has bonded. */
  deviceIds: readonly string[];
}

/**
 * Foreground repair: for every device the `ConnectionManager` still believes is
 * `connected`, ask the radio whether that is true, and reconnect the ones where
 * it is not.
 *
 * Why this is needed when `connection.ts` already watches for drops: while the
 * app is suspended its JS timers do not run and a native disconnect callback
 * may never be delivered. So the manager can wake up holding a `connected`
 * state for a link that died minutes ago. Polling would find it eventually;
 * this finds it immediately, and finds it in the case where the drop event was
 * lost entirely rather than merely late.
 *
 * Reconnecting re-runs the full §4.5 handshake — `connection.ts` allows no
 * other path — so a repaired link has fresh authority, never resumed authority.
 *
 * Returns the device IDs it reconnected. Never throws: a device that cannot be
 * probed or reconnected is skipped, and the manager's own state/`onFailure`
 * channel reports it, exactly as on any other attempt.
 */
export async function reconcileConnections(
  options: ReconcileConnectionsOptions,
): Promise<string[]> {
  const { manager, connection, deviceIds } = options;
  const reconnected: string[] = [];

  for (const deviceId of deviceIds) {
    // Only devices we believe are up can be found to be secretly down. A
    // device that is legitimately 'disconnected' or already 'reconnecting' has
    // its own path and must not be kicked into a competing attempt.
    if (connection.getState(deviceId) !== 'connected') {
      continue;
    }

    try {
      if (await manager.isDeviceConnected(deviceId)) {
        continue;
      }
      await connection.connect(deviceId);
      reconnected.push(deviceId);
    } catch {
      // Deliberately swallowed, per this module's no-throw contract. A failed
      // probe or reconnect is visible through the ConnectionManager's state
      // and getLastFailure(); re-throwing here would take down the whole
      // foreground handler and every device after this one in the loop.
      continue;
    }
  }

  return reconnected;
}
