/**
 * §7.1 / execution brief §6 — connection lifecycle scenarios, driven through
 * `createMockPeripheral()`. Backoff is driven by an injected `wait` seam
 * (jest.fn) rather than jest fake timers, so tests read the exact delay
 * sequence passed to it; the `connect()` timeout tests use jest fake timers
 * the same way `auth.test.ts` does for its `withTimeout`-bound stages.
 */
import { createMockPeripheral } from '../../../../tools/mock-peripheral/bleAdapter';
import { FakeClock } from '../../../../tools/mock-peripheral/clock';
import { createConnectionManager, ConnectionAttemptError, type ConnectionState } from '../connection';
import type { BleManagerLike } from '../BleClientContext';

const K_DEV = Uint8Array.from({ length: 16 }, (_, i) => 0x10 + i);
const DEVICE_ID = 'mock-device-0001';

function makePeripheral() {
  const clock = new FakeClock(0);
  return createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });
}

/** A no-delay stand-in for the backoff scheduler seam, recording every call. */
function fakeWait(): { wait: (ms: number) => Promise<void>; calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    wait: async (ms: number) => {
      calls.push(ms);
    },
  };
}

/**
 * Flushes the whole pending microtask queue, however many `await` hops deep
 * (Node fully drains microtasks — including ones newly queued by earlier
 * reactions — before running the next macrotask), so it's a reliable way to
 * let a fire-and-forget reconnect loop run to whatever state it settles at,
 * without hand-counting `await Promise.resolve()` hops.
 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('createConnectionManager — P1-7.0, against the mock peripheral', () => {
  test('connect() happy path: connecting → connected, getState reflects it, listener fires in order', async () => {
    const { manager } = makePeripheral();
    const connection = createConnectionManager(manager);
    const seen: ConnectionState[] = [];
    connection.onStateChange(DEVICE_ID, (state) => seen.push(state));

    expect(connection.getState(DEVICE_ID)).toBe('disconnected');
    await connection.connect(DEVICE_ID);

    expect(connection.getState(DEVICE_ID)).toBe('connected');
    expect(seen).toEqual(['connecting', 'connected']);
  });

  test('connect() timeout resolves to disconnected and rejects with a typed ConnectionAttemptError', async () => {
    jest.useFakeTimers();
    try {
      const hungManager: BleManagerLike = {
        state: async () => 'PoweredOn',
        isDeviceConnected: async () => false,
        cancelDeviceConnection: async () => {
          throw new Error('not used by this test');
        },
        connectToDevice: () => new Promise<never>(() => {}),
        onDeviceDisconnected: () => ({ remove: () => {} }),
      };
      const connection = createConnectionManager(hungManager);
      const seen: ConnectionState[] = [];
      connection.onStateChange(DEVICE_ID, (state) => seen.push(state));

      const connectPromise = connection.connect(DEVICE_ID);
      // Attach a handler before advancing the fake timer, not after —
      // otherwise connectPromise rejects with nothing yet observing it and
      // Node reports an unhandled rejection before the `.rejects`
      // assertions below get a chance to observe it.
      connectPromise.catch(() => {});
      await jest.advanceTimersByTimeAsync(10_000);

      await expect(connectPromise).rejects.toBeInstanceOf(ConnectionAttemptError);
      await expect(connectPromise).rejects.toMatchObject({ reason: 'timeout' });
      expect(connection.getState(DEVICE_ID)).toBe('disconnected');
      expect(seen).toEqual(['connecting', 'disconnected']);
    } finally {
      jest.useRealTimers();
    }
  });

  test('connect() rejection (transport failure) resolves to disconnected, not a raw thrown error', async () => {
    const rejectingManager: BleManagerLike = {
      state: async () => 'PoweredOn',
      isDeviceConnected: async () => false,
      cancelDeviceConnection: async () => {
        throw new Error('not used by this test');
      },
      connectToDevice: async () => {
        throw new Error('connection failed');
      },
      onDeviceDisconnected: () => ({ remove: () => {} }),
    };
    const connection = createConnectionManager(rejectingManager);

    await expect(connection.connect(DEVICE_ID)).rejects.toMatchObject({
      reason: 'transport',
      detail: 'connection failed',
    });
    expect(connection.getState(DEVICE_ID)).toBe('disconnected');
  });

  test('voluntary disconnect() lands on disconnected and does not trigger a reconnect', async () => {
    const { manager } = makePeripheral();
    const connectSpy = jest.spyOn(manager, 'connectToDevice');
    const connection = createConnectionManager(manager);

    await connection.connect(DEVICE_ID);
    expect(connectSpy).toHaveBeenCalledTimes(1);

    await connection.disconnect(DEVICE_ID);
    expect(connection.getState(DEVICE_ID)).toBe('disconnected');

    // No reconnect attempt should follow a voluntary disconnect — give any
    // stray async work a turn, then assert connectToDevice was never called
    // again.
    await Promise.resolve();
    await Promise.resolve();
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  test('involuntary drop reconnects: connected → reconnecting → connected once the next attempt succeeds', async () => {
    const { manager, device } = makePeripheral();
    const { wait } = fakeWait();
    const connection = createConnectionManager(manager, { wait });
    const seen: ConnectionState[] = [];
    connection.onStateChange(DEVICE_ID, (state) => seen.push(state));

    await connection.connect(DEVICE_ID);
    seen.length = 0;

    device.simulateAbruptDisconnect();
    // handleInvoluntaryDisconnect → runReconnectLoop is fire-and-forget;
    // flush microtasks so the (successful, first-attempt) reconnect settles.
    await flushMicrotasks();

    expect(seen).toEqual(['reconnecting', 'connected']);
    expect(connection.getState(DEVICE_ID)).toBe('connected');
  });

  test('backoff exhaustion: repeated reconnect failures land on disconnected after the bounded max attempts', async () => {
    const { manager, device } = makePeripheral();
    const connectSpy = jest.spyOn(manager, 'connectToDevice');
    const { wait, calls } = fakeWait();
    const connection = createConnectionManager(manager, { wait });
    const seen: ConnectionState[] = [];
    connection.onStateChange(DEVICE_ID, (state) => seen.push(state));

    await connection.connect(DEVICE_ID);
    connectSpy.mockClear();
    seen.length = 0;

    // Every reconnect attempt after the first fails (models the radio
    // rejecting reconnection outright).
    connectSpy.mockRejectedValue(new Error('still unreachable'));
    device.simulateAbruptDisconnect();

    // All 6 bounded attempts run purely on microtasks (connectToDevice's
    // rejection and the injected wait() are both un-timered promises), so
    // one full drain is enough to reach exhaustion.
    await flushMicrotasks();

    expect(connection.getState(DEVICE_ID)).toBe('disconnected');
    expect(seen[0]).toBe('reconnecting');
    expect(seen[seen.length - 1]).toBe('disconnected');
    expect(connectSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Delays grow per the exponential-backoff policy (base 500ms, doubling,
    // ±20% jitter) — assert bounds rather than exact values.
    expect(calls.length).toBe(connectSpy.mock.calls.length - 1);
    let previousExpected = 250; // 500 * 0.8 (attempt 1's lower jitter bound)
    for (let i = 0; i < calls.length; i += 1) {
      const attempt = i + 1;
      const expected = Math.min(500 * 2 ** (attempt - 1), 30_000);
      expect(calls[i]).toBeGreaterThanOrEqual(Math.round(expected * 0.8));
      expect(calls[i]).toBeLessThanOrEqual(Math.round(expected * 1.2));
      expect(calls[i]).toBeGreaterThanOrEqual(previousExpected);
      previousExpected = Math.round(expected * 0.8);
    }
  });

  test('onStateChange: unsubscribe stops further callbacks; multiple listeners each get events', async () => {
    const { manager } = makePeripheral();
    const connection = createConnectionManager(manager);

    const listenerA: ConnectionState[] = [];
    const listenerB: ConnectionState[] = [];
    connection.onStateChange(DEVICE_ID, (state) => listenerA.push(state));
    const unsubscribeB = connection.onStateChange(DEVICE_ID, (state) => listenerB.push(state));

    await connection.connect(DEVICE_ID);
    expect(listenerA).toEqual(['connecting', 'connected']);
    expect(listenerB).toEqual(['connecting', 'connected']);

    unsubscribeB();
    await connection.disconnect(DEVICE_ID);

    expect(listenerA).toEqual(['connecting', 'connected', 'disconnected']);
    expect(listenerB).toEqual(['connecting', 'connected']); // no further events after unsubscribe
  });

  test('background signal suspends reconnect attempts; foreground resumes them', async () => {
    const { manager, device } = makePeripheral();
    const connectSpy = jest.spyOn(manager, 'connectToDevice');
    const { wait } = fakeWait();
    const connection = createConnectionManager(manager, { wait });
    const seen: ConnectionState[] = [];
    connection.onStateChange(DEVICE_ID, (state) => seen.push(state));

    await connection.connect(DEVICE_ID);
    connectSpy.mockClear();
    seen.length = 0;

    connection.setAppLifecycleState('background');
    device.simulateAbruptDisconnect();

    // The reconnect loop blocks on the unresolved foreground deferred, so
    // flushing to completion still leaves it suspended — it must never have
    // called connectToDevice() while backgrounded.
    await flushMicrotasks();
    expect(seen).toEqual(['reconnecting']);
    expect(connectSpy).not.toHaveBeenCalled();

    connection.setAppLifecycleState('foreground');
    await flushMicrotasks();

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['reconnecting', 'connected']);
    expect(connection.getState(DEVICE_ID)).toBe('connected');
  });
});
