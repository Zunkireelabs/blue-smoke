/**
 * BLE connection lifecycle: connect and reconnect with backoff — spec §4.9.
 * Foreground/background state handling (spec §7.1) lives in `appState.ts`,
 * not here — `createAppStateCoordinator()` and `reconcileConnections()`.
 *
 * P1-7.0. 🔴 A session never survives a disconnect, clean or abrupt: every
 * reconnect re-runs the full §4.5 handshake from `auth.ts` rather than
 * resuming the old one. The app has no standing authority of its own — only
 * whatever the most recent successful handshake granted — matching the
 * dead-man-timer model in CLAUDE.md ("the firmware dead-man timer is what
 * makes the device safe; the app's proximity monitor only makes it feel
 * fast"). A design that let a stale session survive a drop would be the app
 * quietly extending its own authority, which is exactly backwards.
 *
 * Same "nothing across this boundary throws" convention as auth.ts/
 * deviceInfo.ts/scanner.ts: `connect()`/`disconnect()` never reject. Failures
 * are observable as state (`getState()` stays/returns to 'reconnecting' or
 * 'disconnected') and, for detail, via `getLastFailure()`/`onFailure`.
 */

import type { BleDeviceLike, BleManagerLike } from './BleClientContext';
import { createAuthHandshake, type AuthHandshake, type AuthResponseInput, type HandshakeOutcome } from './auth';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Every non-'ok: true' shape HandshakeOutcome can take — reused rather than duplicated. */
type HandshakeFailure = Exclude<HandshakeOutcome, { ok: true }>;

/**
 * Why the manager stopped trying, most recently. Not thrown — read via
 * `getLastFailure()` or the `onFailure` callback.
 */
export type ConnectionFailure =
  | { stage: 'connect'; reason: 'timeout' }
  | { stage: 'connect'; reason: 'transport'; detail: string }
  | { stage: 'handshake'; outcome: HandshakeFailure };

export interface ConnectionManager {
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  getState(deviceId: string): ConnectionState;
  onStateChange(deviceId: string, listener: (state: ConnectionState) => void): () => void;
  /** The most recent failure for this device, or `null` if it is connected or was never attempted. */
  getLastFailure(deviceId: string): ConnectionFailure | null;
}

export interface BackoffConfig {
  initialMs: number;
  multiplier: number;
  maxMs: number;
}

export interface CreateConnectionManagerOptions {
  manager: BleManagerLike;
  /**
   * Supplies fresh §4.5 handshake credentials for a device. Called before
   * every attempt — initial connect AND every reconnect, per this module's
   * "a session never survives a disconnect" rule. Session issuance
   * (OQ-12/issue-device-session) is the caller's concern, not this module's.
   */
  credentials: (deviceId: string) => AuthResponseInput | Promise<AuthResponseInput>;
  onFailure?: (deviceId: string, failure: ConnectionFailure) => void;
  backoff?: Partial<BackoffConfig>;
  /** Injectable for tests; defaults to the global timer. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  /** How often to poll BleManagerLike.isDeviceConnected() when a device's BleDeviceLike has no onDisconnected. */
  connectionPollMs?: number;
  credentialsTimeoutMs?: number;
  disconnectTimeoutMs?: number;
}

const DEFAULT_BACKOFF: BackoffConfig = {
  initialMs: 1000,
  multiplier: 2,
  maxMs: 30_000,
};
const DEFAULT_CONNECTION_POLL_MS = 2000;
const DEFAULT_CREDENTIALS_TIMEOUT_MS = 5000;
const DEFAULT_DISCONNECT_TIMEOUT_MS = 5000;

class OperationTimeoutError extends Error {}

async function withTimeout<T>(
  operation: Promise<T>,
  ms: number,
  setTimeoutFn: typeof setTimeout,
  clearTimeoutFn: typeof clearTimeout,
): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    handle = setTimeoutFn(() => reject(new OperationTimeoutError()), ms);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeoutFn(handle);
  }
}

interface DeviceEntry {
  state: ConnectionState;
  listeners: Set<(state: ConnectionState) => void>;
  device: BleDeviceLike | null;
  lastFailure: ConnectionFailure | null;
  intentionalDisconnect: boolean;
  backoffMs: number;
  reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  pollTimer: ReturnType<typeof setTimeout> | undefined;
  dropSubscription: { remove(): void } | undefined;
  /**
   * Bumped on every connect()/disconnect() call. An in-flight attempt whose
   * generation no longer matches the entry's has been superseded — its
   * result is discarded rather than allowed to clobber newer state. This is
   * what makes disconnect() during a pending connect() attempt, or a second
   * connect() call, behave like a cancel instead of a race.
   */
  generation: number;
}

function newEntry(): DeviceEntry {
  return {
    state: 'disconnected',
    listeners: new Set(),
    device: null,
    lastFailure: null,
    intentionalDisconnect: false,
    backoffMs: 0,
    reconnectTimer: undefined,
    pollTimer: undefined,
    dropSubscription: undefined,
    generation: 0,
  };
}

export function createConnectionManager(options: CreateConnectionManagerOptions): ConnectionManager {
  const { manager, credentials, onFailure } = options;
  const backoff: BackoffConfig = { ...DEFAULT_BACKOFF, ...options.backoff };
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
  const connectionPollMs = options.connectionPollMs ?? DEFAULT_CONNECTION_POLL_MS;
  const credentialsTimeoutMs = options.credentialsTimeoutMs ?? DEFAULT_CREDENTIALS_TIMEOUT_MS;
  const disconnectTimeoutMs = options.disconnectTimeoutMs ?? DEFAULT_DISCONNECT_TIMEOUT_MS;
  const handshake: AuthHandshake = createAuthHandshake(manager);

  const entries = new Map<string, DeviceEntry>();

  function entryFor(deviceId: string): DeviceEntry {
    let entry = entries.get(deviceId);
    if (!entry) {
      entry = newEntry();
      entries.set(deviceId, entry);
    }
    return entry;
  }

  function setState(deviceId: string, entry: DeviceEntry, state: ConnectionState): void {
    if (entry.state === state) {
      return;
    }
    entry.state = state;
    for (const listener of entry.listeners) {
      listener(state);
    }
  }

  function stopWatchingForDrop(entry: DeviceEntry): void {
    entry.dropSubscription?.remove();
    entry.dropSubscription = undefined;
    if (entry.pollTimer !== undefined) {
      clearTimeoutFn(entry.pollTimer);
      entry.pollTimer = undefined;
    }
  }

  /**
   * Detects the device going away — clean or abrupt, deliberately treated the
   * same way here. `onDisconnected` (when the device exposes it) fires for
   * both `cancelConnection()` and an unsupervised link loss identically
   * (bleAdapter.ts's `MockDevice.performDisconnect()` is the single path
   * behind both); the poll fallback below can't distinguish the two at all.
   * What DOES differ is handled one level up, in `handleDrop()`: whether
   * *this* module initiated the disconnect (`intentionalDisconnect`), which
   * decides reconnect vs. not — not anything about the drop's detection.
   */
  function watchForDrop(deviceId: string, entry: DeviceEntry, device: BleDeviceLike, generation: number): void {
    if (device.onDisconnected) {
      entry.dropSubscription = device.onDisconnected(() => {
        handleDrop(deviceId, entry, generation);
      });
      return;
    }

    const poll = (): void => {
      entry.pollTimer = setTimeoutFn(() => {
        manager
          .isDeviceConnected(deviceId)
          .then((connected) => {
            if (entry.generation !== generation) {
              return;
            }
            if (!connected) {
              handleDrop(deviceId, entry, generation);
              return;
            }
            poll();
          })
          .catch(() => {
            if (entry.generation === generation) {
              handleDrop(deviceId, entry, generation);
            }
          });
      }, connectionPollMs);
    };
    poll();
  }

  function handleDrop(deviceId: string, entry: DeviceEntry, generation: number): void {
    if (entry.generation !== generation) {
      return; // Superseded by a newer connect()/disconnect() — not our concern anymore.
    }
    stopWatchingForDrop(entry);
    entry.device = null;
    if (entry.intentionalDisconnect) {
      // disconnect() already set state and is not looking for a reconnect.
      return;
    }
    scheduleReconnect(deviceId, entry, generation);
  }

  function scheduleReconnect(deviceId: string, entry: DeviceEntry, generation: number): void {
    setState(deviceId, entry, 'reconnecting');
    const delayMs = entry.backoffMs === 0 ? backoff.initialMs : entry.backoffMs;
    entry.backoffMs = Math.min(delayMs * backoff.multiplier, backoff.maxMs);
    entry.reconnectTimer = setTimeoutFn(() => {
      entry.reconnectTimer = undefined;
      void attemptConnect(deviceId, entry, generation);
    }, delayMs);
  }

  async function attemptConnect(deviceId: string, entry: DeviceEntry, generation: number): Promise<void> {
    if (entry.generation !== generation) {
      return;
    }
    setState(deviceId, entry, entry.backoffMs === 0 ? 'connecting' : 'reconnecting');

    let creds: AuthResponseInput;
    try {
      creds = await withTimeout(
        Promise.resolve(credentials(deviceId)),
        credentialsTimeoutMs,
        setTimeoutFn,
        clearTimeoutFn,
      );
    } catch (error) {
      if (entry.generation !== generation) {
        return;
      }
      const failure: ConnectionFailure =
        error instanceof OperationTimeoutError
          ? { stage: 'connect', reason: 'timeout' }
          : { stage: 'connect', reason: 'transport', detail: error instanceof Error ? error.message : 'unknown error' };
      entry.lastFailure = failure;
      onFailure?.(deviceId, failure);
      scheduleReconnect(deviceId, entry, generation);
      return;
    }

    if (entry.generation !== generation) {
      return;
    }
    const outcome = await handshake.authenticate(deviceId, creds);
    if (entry.generation !== generation) {
      return; // disconnect() ran while the handshake was in flight — discard.
    }

    if (outcome.ok) {
      entry.device = outcome.device;
      entry.lastFailure = null;
      entry.backoffMs = 0;
      watchForDrop(deviceId, entry, outcome.device, generation);
      setState(deviceId, entry, 'connected');
      return;
    }

    const failure: ConnectionFailure = { stage: 'handshake', outcome };
    entry.lastFailure = failure;
    onFailure?.(deviceId, failure);
    scheduleReconnect(deviceId, entry, generation);
  }

  async function connect(deviceId: string): Promise<void> {
    const entry = entryFor(deviceId);
    if (entry.reconnectTimer !== undefined) {
      clearTimeoutFn(entry.reconnectTimer);
      entry.reconnectTimer = undefined;
    }
    entry.intentionalDisconnect = false;
    entry.backoffMs = 0;
    entry.generation += 1;
    await attemptConnect(deviceId, entry, entry.generation);
  }

  async function disconnect(deviceId: string): Promise<void> {
    const entry = entryFor(deviceId);
    entry.intentionalDisconnect = true;
    entry.generation += 1; // Supersedes any in-flight connect/reconnect attempt.
    if (entry.reconnectTimer !== undefined) {
      clearTimeoutFn(entry.reconnectTimer);
      entry.reconnectTimer = undefined;
    }
    stopWatchingForDrop(entry);

    const device = entry.device;
    entry.device = null;
    entry.backoffMs = 0;

    if (device) {
      try {
        if (device.cancelConnection) {
          await withTimeout(device.cancelConnection(), disconnectTimeoutMs, setTimeoutFn, clearTimeoutFn);
        } else {
          await withTimeout(
            manager.cancelDeviceConnection(deviceId),
            disconnectTimeoutMs,
            setTimeoutFn,
            clearTimeoutFn,
          );
        }
      } catch {
        // Nothing across this boundary throws (module doc above) — a cancel that fails
        // still leaves the connection logically ours to consider closed; there's no
        // action a caller could usefully take beyond what setting 'disconnected' offers.
      }
    }

    setState(deviceId, entry, 'disconnected');
  }

  return {
    connect,
    disconnect,
    getState: (deviceId) => entries.get(deviceId)?.state ?? 'disconnected',
    getLastFailure: (deviceId) => entries.get(deviceId)?.lastFailure ?? null,
    onStateChange(deviceId, listener) {
      const entry = entryFor(deviceId);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
  };
}
