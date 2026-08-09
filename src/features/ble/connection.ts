/**
 * BLE connection lifecycle: connect, reconnect with backoff, and
 * foreground/background state handling — spec §4.9, §7.1.
 *
 * Implementation for P1-7.0 (execution brief). Same conventions as
 * `auth.ts`: dependencies are injected (never `react-native-ble-plx` or the
 * mock by name), every BLE op has an explicit timeout, and nothing throws a
 * raw transport error across the public boundary — `connect()` rejects with
 * a typed `ConnectionAttemptError` instead.
 *
 * §7.1 authority model: the firmware dead-man timer is what makes the device
 * safe. Reconnecting here only makes relock *feel* fast — it is not a safety
 * mechanism, and nothing in this module should be read as one. This manager
 * owns the link only; lock state stays notification-driven elsewhere
 * (`commands.ts`, `proximity.ts` — untouched by this task).
 */

import type { BleManagerLike } from './BleClientContext';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** A simple injected signal — no native app-state library pulled in here. */
export type AppLifecycleState = 'foreground' | 'background';

export interface ConnectionManager {
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  getState(deviceId: string): ConnectionState;
  onStateChange(deviceId: string, listener: (state: ConnectionState) => void): () => void;
  /**
   * §7.1 — while backgrounded, active reconnect attempts are suspended
   * (iOS will suspend the app anyway); resumes immediately on foreground.
   * Not in the brief's original interface sketch, but additive per §2
   * ("keep it, extend only if needed").
   */
  setAppLifecycleState(state: AppLifecycleState): void;
}

// None of the values below are spec-defined (§4.9 covers GATT-level
// connection parameters, which are a native-BLE-stack concern, not something
// this module configures) — these are app-level operational choices, so they
// stay local consts here rather than in protocol.ts, exactly as auth.ts did.
const CONNECT_TIMEOUT_MS = 10_000; // BLE connection setup, incl. Android's slower stack
const DISCONNECT_TIMEOUT_MS = 5000; // cancelDeviceConnection()
const RECONNECT_BASE_DELAY_MS = 500; // first backoff wait after an involuntary drop
const RECONNECT_MAX_DELAY_MS = 30_000; // backoff ceiling
const RECONNECT_MAX_ATTEMPTS = 6; // bounded — after this, reconnecting → disconnected
const RECONNECT_JITTER_RATIO = 0.2; // ±20%, to avoid synchronised retry storms

export type ConnectFailureReason = 'timeout' | 'transport';

/**
 * What `connect()` rejects with on failure — never a raw transport error
 * (mirrors auth.ts's `HandshakeOutcome` convention, adapted to this
 * interface's `Promise<void>` shape). `detail` only ever carries a
 * transport error message (lengths/ids), never key material — there is none
 * in this module, but keep the same discipline as auth.ts regardless.
 */
export class ConnectionAttemptError extends Error {
  readonly reason: ConnectFailureReason;
  readonly detail?: string;

  constructor(reason: ConnectFailureReason, detail?: string) {
    super(`BLE connect failed (${reason})${detail ? `: ${detail}` : ''}`);
    this.name = 'ConnectionAttemptError';
    this.reason = reason;
    this.detail = detail;
  }
}

type ConnectionStage = 'connect' | 'disconnect';

class ConnectionTimeoutError extends Error {
  readonly stage: ConnectionStage;

  constructor(stage: ConnectionStage) {
    super(`BLE ${stage} exceeded its timeout budget`);
    this.name = 'ConnectionTimeoutError';
    this.stage = stage;
  }
}

// Bounds every BLE operation (CLAUDE.md: "Every BLE operation has an
// explicit timeout. No unbounded await."), same shape as auth.ts's helper.
async function withTimeout<T>(operation: Promise<T>, ms: number, stage: ConnectionStage): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => reject(new ConnectionTimeoutError(stage)), ms);
  });
  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

interface DeviceEntry {
  state: ConnectionState;
  readonly listeners: Set<(state: ConnectionState) => void>;
  /**
   * Bumped on every connect()/disconnect() call. A reconnect loop or
   * in-flight connect attempt started under an older generation checks this
   * before acting on its result, so a voluntary disconnect() can never be
   * raced by a stale attempt reviving the link (the crux of §2's voluntary
   * vs. involuntary distinction).
   */
  generation: number;
  disconnectSubscription?: { remove(): void };
}

type OpenLinkResult = { ok: true } | { ok: false; error: ConnectionAttemptError };

/**
 * Injects `BleManagerLike` (never `react-native-ble-plx` or the mock by
 * name — brief §3) and a wait/scheduler seam for backoff delays, defaulting
 * to real `setTimeout` so production code needs no extra wiring while tests
 * can drive backoff deterministically without wall-clock sleeps.
 */
export function createConnectionManager(
  manager: BleManagerLike,
  options: { wait?: (ms: number) => Promise<void> } = {},
): ConnectionManager {
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const entries = new Map<string, DeviceEntry>();
  let appState: AppLifecycleState = 'foreground';
  let foregroundDeferred: { promise: Promise<void>; resolve: () => void } | null = null;

  function getEntry(deviceId: string): DeviceEntry {
    let entry = entries.get(deviceId);
    if (!entry) {
      entry = { state: 'disconnected', listeners: new Set(), generation: 0 };
      entries.set(deviceId, entry);
    }
    return entry;
  }

  function setState(deviceId: string, state: ConnectionState): void {
    const entry = getEntry(deviceId);
    if (entry.state === state) {
      return;
    }
    entry.state = state;
    for (const listener of entry.listeners) {
      listener(state);
    }
  }

  function waitForForeground(): Promise<void> {
    if (appState === 'foreground') {
      return Promise.resolve();
    }
    if (!foregroundDeferred) {
      let resolve!: () => void;
      const promise = new Promise<void>((res) => {
        resolve = res;
      });
      foregroundDeferred = { promise, resolve };
    }
    return foregroundDeferred.promise;
  }

  function handleInvoluntaryDisconnect(deviceId: string, generation: number): void {
    const entry = getEntry(deviceId);
    if (entry.generation !== generation || entry.state !== 'connected') {
      // Stale event from a superseded link (a voluntary disconnect() or a
      // fresh connect() already moved past this generation) — it doesn't
      // describe the current link, ignore it.
      return;
    }
    entry.disconnectSubscription?.remove();
    entry.disconnectSubscription = undefined;
    setState(deviceId, 'reconnecting');
    // Fire-and-forget: openLink() and the backoff wait() already catch their
    // own failures internally, so this can't reject in practice — the catch
    // here is only a guard against an unanticipated exception surfacing as
    // an unhandled rejection now that nothing awaits this call.
    runReconnectLoop(deviceId, generation).catch(() => {});
  }

  // Establishes the GATT link and arms involuntary-disconnect detection for
  // it. Callers (connect() and the reconnect loop) own the ConnectionState
  // transitions around this — it only reports success/failure for the given
  // generation, never touches `entry.state` itself.
  async function openLink(deviceId: string, entry: DeviceEntry, generation: number): Promise<OpenLinkResult> {
    try {
      await withTimeout(manager.connectToDevice(deviceId), CONNECT_TIMEOUT_MS, 'connect');
      if (entry.generation !== generation) {
        // Superseded mid-connect by a disconnect()/fresh connect() racing
        // ahead — don't arm a subscription for an attempt nobody wants.
        return { ok: false, error: new ConnectionAttemptError('transport', 'superseded') };
      }
      entry.disconnectSubscription?.remove();
      entry.disconnectSubscription = manager.onDeviceDisconnected(deviceId, (_error, disconnectedId) => {
        handleInvoluntaryDisconnect(disconnectedId, generation);
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof ConnectionTimeoutError) {
        return { ok: false, error: new ConnectionAttemptError('timeout') };
      }
      const detail = error instanceof Error ? error.message : 'unknown error';
      return { ok: false, error: new ConnectionAttemptError('transport', detail) };
    }
  }

  function computeBackoffDelayMs(attempt: number): number {
    const exponential = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS);
    const jitter = exponential * RECONNECT_JITTER_RATIO * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(exponential + jitter));
  }

  async function runReconnectLoop(deviceId: string, generation: number): Promise<void> {
    for (let attempt = 1; attempt <= RECONNECT_MAX_ATTEMPTS; attempt += 1) {
      const entry = getEntry(deviceId);
      if (entry.generation !== generation) {
        return; // superseded by a voluntary disconnect() or a fresh connect()
      }

      // §7.1 — suspend while backgrounded; a long suspend can span an
      // arbitrary number of foreground/background flips, so re-check for
      // supersession immediately after resuming, not just at the loop top.
      await waitForForeground();
      if (entry.generation !== generation) {
        return;
      }

      const result = await openLink(deviceId, entry, generation);
      if (entry.generation !== generation) {
        return;
      }
      if (result.ok) {
        setState(deviceId, 'connected');
        return;
      }
      if (attempt === RECONNECT_MAX_ATTEMPTS) {
        setState(deviceId, 'disconnected');
        return;
      }
      await wait(computeBackoffDelayMs(attempt));
    }
  }

  return {
    async connect(deviceId: string): Promise<void> {
      const entry = getEntry(deviceId);
      entry.generation += 1;
      entry.disconnectSubscription?.remove();
      entry.disconnectSubscription = undefined;
      const generation = entry.generation;

      setState(deviceId, 'connecting');
      const result = await openLink(deviceId, entry, generation);
      if (!result.ok) {
        setState(deviceId, 'disconnected');
        throw result.error;
      }
      setState(deviceId, 'connected');
    },

    async disconnect(deviceId: string): Promise<void> {
      const entry = getEntry(deviceId);
      entry.generation += 1; // cancels any in-flight connect() or reconnect loop
      entry.disconnectSubscription?.remove();
      entry.disconnectSubscription = undefined;

      if (entry.state === 'disconnected') {
        return;
      }
      try {
        await withTimeout(manager.cancelDeviceConnection(deviceId), DISCONNECT_TIMEOUT_MS, 'disconnect');
      } catch {
        // A voluntary disconnect always lands on 'disconnected' regardless
        // of whether the radio ack'd cleanly — the app is done with this
        // link either way, and per §2 it must NOT auto-reconnect. Mirrors
        // auth.ts's "never let a raw transport error escape" discipline.
      } finally {
        setState(deviceId, 'disconnected');
      }
    },

    getState(deviceId: string): ConnectionState {
      return getEntry(deviceId).state;
    },

    onStateChange(deviceId: string, listener: (state: ConnectionState) => void): () => void {
      const entry = getEntry(deviceId);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },

    setAppLifecycleState(state: AppLifecycleState): void {
      appState = state;
      if (state === 'foreground' && foregroundDeferred) {
        foregroundDeferred.resolve();
        foregroundDeferred = null;
      }
    },
  };
}
