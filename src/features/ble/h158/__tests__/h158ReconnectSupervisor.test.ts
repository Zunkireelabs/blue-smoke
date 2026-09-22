/**
 * Auto-reconnect supervisor — the behaviour the manufacturer's 2026-09-22 report asked for.
 *
 * The timer seam is injected rather than using `jest.useFakeTimers()` on purpose: the `app`
 * project's fake-timer configuration is already load-bearing elsewhere (PR #32 — a faked
 * `setImmediate` killed Jest's worker IPC), and a supervisor whose whole job is scheduling is
 * exactly the wrong place to take a dependency on that.
 */

import type { BleManagerLike } from '../../BleClientContext';
import type { ConnectH158DeviceOutcome } from '../connectAndRememberH158Device';
import type { H158Session } from '../h158Session';
import { createH158ReconnectSupervisor } from '../h158ReconnectSupervisor';
import {
  __resetH158ConnectionStoreForTests,
  setH158Connected,
  setH158Disconnected,
} from '../useH158ConnectionStore';
import {
  __resetH158ReconnectStoreForTests,
  useH158ReconnectStore,
} from '../useH158ReconnectStore';

const DEVICE = { id: 'AA:BB:CC:DD:EE:FF', name: 'YP65-AT' };
const OTHER = { id: '11:22:33:44:55:66', name: 'YP65-AT' };

function fakeSession(): H158Session {
  return {
    readStatus: jest.fn(),
    setChildLock: jest.fn(),
    dispose: jest.fn(),
  } as unknown as H158Session;
}

/** Collects scheduled callbacks so a test can advance time explicitly. */
function createTimerSeam() {
  let nextHandle = 1;
  const pending = new Map<number, { run: () => void; ms: number }>();
  return {
    setTimeoutFn: ((run: () => void, ms: number) => {
      const handle = nextHandle++;
      pending.set(handle, { run, ms });
      return handle as unknown as ReturnType<typeof setTimeout>;
    }) as (handler: () => void, ms: number) => ReturnType<typeof setTimeout>,
    clearTimeoutFn: (handle: ReturnType<typeof setTimeout>) => {
      pending.delete(handle as unknown as number);
    },
    /** Fire every currently-scheduled callback, in schedule order. */
    flush() {
      const due = [...pending.entries()];
      pending.clear();
      for (const [, entry] of due) {
        entry.run();
      }
    },
    delays() {
      return [...pending.values()].map((entry) => entry.ms);
    },
    get size() {
      return pending.size;
    },
  };
}

function createManager() {
  return {
    connectToDevice: jest.fn(),
    cancelDeviceConnection: jest.fn().mockResolvedValue(undefined),
    isDeviceConnected: jest.fn().mockResolvedValue(false),
    state: jest.fn().mockResolvedValue('PoweredOn'),
    startDeviceScan: jest.fn(),
    stopDeviceScan: jest.fn(),
  } as unknown as BleManagerLike & { cancelDeviceConnection: jest.Mock };
}

function setup(
  overrides: {
    connect?: jest.Mock;
    gate?: jest.Mock;
  } = {},
) {
  const manager = createManager();
  const timers = createTimerSeam();
  const connect =
    overrides.connect ??
    jest.fn(
      async (): Promise<ConnectH158DeviceOutcome> => ({
        ok: true,
        device: DEVICE,
        session: fakeSession(),
      }),
    );
  const readGateState = overrides.gate ?? jest.fn().mockResolvedValue('poweredOn');
  const supervisor = createH158ReconnectSupervisor({
    manager,
    connect: connect as never,
    readGateState: readGateState as never,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  return { manager, timers, connect, readGateState, supervisor };
}

/**
 * Lets the supervisor's async chain settle. A single `setImmediate` is not enough: one dial
 * awaits the gate read and then the connect, so the continuation after the last `await` lands a
 * macrotask later and a test would otherwise observe torn intermediate state.
 */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
};

beforeEach(() => {
  __resetH158ConnectionStoreForTests();
  __resetH158ReconnectStoreForTests();
});

describe('createH158ReconnectSupervisor', () => {
  it('dials each remembered device as a STANDING intent, not a bounded attempt', async () => {
    const { connect, supervisor } = setup();

    supervisor.sync([DEVICE]);
    await settle();

    expect(connect).toHaveBeenCalledTimes(1);
    // The two options that are the entire fix — without both, an out-of-range device is a
    // failed 10-second dial rather than a connection that completes whenever it reappears.
    expect(connect).toHaveBeenCalledWith(expect.anything(), DEVICE.id, DEVICE.name, {
      autoConnect: true,
      connectTimeoutMs: null,
    });
    supervisor.dispose();
  });

  it('reconnects automatically after an out-of-range drop — the reported defect', async () => {
    const { connect, timers, supervisor } = setup();
    supervisor.sync([DEVICE]);
    await settle();
    connect.mockClear();

    // The device connects, then the user walks out of range: `onDisconnected` evicts it from
    // the connection store, which is what the supervisor watches.
    setH158Connected(DEVICE, fakeSession());
    setH158Disconnected(DEVICE.id);

    // A re-dial is scheduled behind the settle delay rather than fired synchronously — an
    // immediate Android re-dial can land on a GATT handle still being torn down.
    expect(connect).not.toHaveBeenCalled();
    expect(timers.size).toBe(1);

    timers.flush();
    await settle();

    expect(connect).toHaveBeenCalledTimes(1);
    // The reconnect succeeded, so no standing intent is outstanding any more — the row goes back
    // to plain "Connected" rather than keeping a stale "will reconnect" caption.
    expect(useH158ReconnectStore.getState().phases[DEVICE.id]).toBeUndefined();
    supervisor.dispose();
  });

  it('shows "reconnecting" for as long as the dial stays pending — the out-of-range case', async () => {
    // A dial that never settles is exactly what an out-of-range device produces on both
    // platforms: the OS holds the intent and resolves it whenever the device reappears.
    const connect = jest.fn(() => new Promise<ConnectH158DeviceOutcome>(() => {}));
    const { supervisor } = setup({ connect: connect as unknown as jest.Mock });

    supervisor.sync([DEVICE]);
    await settle();

    expect(useH158ReconnectStore.getState().phases[DEVICE.id]).toBe('reconnecting');
    supervisor.dispose();
  });

  it('honours a Disconnect pressed WHILE a dial is still in flight', async () => {
    let resolveDial: ((outcome: ConnectH158DeviceOutcome) => void) | undefined;
    const connect = jest.fn(
      () =>
        new Promise<ConnectH158DeviceOutcome>((resolve) => {
          resolveDial = resolve;
        }),
    );
    const { manager, supervisor } = setup({ connect: connect as unknown as jest.Mock });
    supervisor.sync([DEVICE]);
    await settle();

    // The tap lands before the radio answers. A dial cannot be recalled once issued, so the
    // supervisor has to drop the result rather than adopt it.
    supervisor.suppress(DEVICE.id);
    resolveDial?.({ ok: true, device: DEVICE, session: fakeSession() });
    await settle();

    expect(useH158ReconnectStore.getState().phases[DEVICE.id]).toBe('suppressed');
    expect(manager.cancelDeviceConnection).toHaveBeenCalledWith(DEVICE.id);
    supervisor.dispose();
  });

  it('does NOT reconnect a device the user explicitly disconnected', async () => {
    const { connect, manager, timers, supervisor } = setup();
    supervisor.sync([DEVICE]);
    await settle();
    setH158Connected(DEVICE, fakeSession());
    connect.mockClear();

    supervisor.suppress(DEVICE.id);
    setH158Disconnected(DEVICE.id);
    timers.flush();
    await settle();

    expect(connect).not.toHaveBeenCalled();
    // The OS-held standing intent is cancelled too, or Android's autoConnect would quietly
    // reconnect a device the user just disconnected.
    expect(manager.cancelDeviceConnection).toHaveBeenCalledWith(DEVICE.id);
    expect(useH158ReconnectStore.getState().phases[DEVICE.id]).toBe('suppressed');
    supervisor.dispose();
  });

  it('keeps suppression across a sync, then honours allow()', async () => {
    const { connect, supervisor } = setup();
    supervisor.sync([DEVICE]);
    await settle();
    supervisor.suppress(DEVICE.id);
    connect.mockClear();

    // Home regaining focus re-syncs the remembered list; a suppressed device is still IN that
    // list, so without the suppression surviving sync it would be re-armed immediately.
    supervisor.sync([DEVICE]);
    await settle();
    expect(connect).not.toHaveBeenCalled();

    supervisor.allow(DEVICE.id);
    await settle();
    expect(connect).toHaveBeenCalledTimes(1);
    supervisor.dispose();
  });

  it('reports blockedBluetooth and dials nothing when the adapter gate is not open', async () => {
    const gate = jest.fn().mockResolvedValue('poweredOff');
    const { connect, supervisor } = setup({ gate });

    supervisor.sync([DEVICE]);
    await settle();

    expect(connect).not.toHaveBeenCalled();
    expect(useH158ReconnectStore.getState().phases[DEVICE.id]).toBe('blockedBluetooth');

    // Bluetooth comes back on; `poke()` is what the adapter subscription and app-foreground
    // both call.
    gate.mockResolvedValue('poweredOn');
    supervisor.poke();
    await settle();
    expect(connect).toHaveBeenCalledTimes(1);
    supervisor.dispose();
  });

  it('never requests a permission — it only ever reads the gate', async () => {
    const gate = jest.fn().mockResolvedValue('deniedOnce');
    const { connect, supervisor } = setup({ gate });

    supervisor.sync([DEVICE]);
    await settle();

    expect(connect).not.toHaveBeenCalled();
    expect(useH158ReconnectStore.getState().phases[DEVICE.id]).toBe('blockedBluetooth');
    supervisor.dispose();
  });

  it('backs off exponentially when a dial is actively rejected', async () => {
    const connect = jest.fn(
      async (): Promise<ConnectH158DeviceOutcome> => ({ ok: false, detail: "Couldn't connect" }),
    );
    const { timers, supervisor } = setup({ connect });

    supervisor.sync([DEVICE]);
    await settle();
    expect(connect).toHaveBeenCalledTimes(1);
    expect(timers.delays()).toEqual([2000]);

    timers.flush();
    await settle();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(timers.delays()).toEqual([4000]);

    timers.flush();
    await settle();
    expect(timers.delays()).toEqual([8000]);
    supervisor.dispose();
  });

  it('does not restart an in-flight dial when sync() runs again', async () => {
    // A dial that never settles — the ordinary out-of-range case on both platforms.
    const connect = jest.fn(() => new Promise<ConnectH158DeviceOutcome>(() => {}));
    const { supervisor } = setup({ connect: connect as unknown as jest.Mock });

    supervisor.sync([DEVICE]);
    await settle();
    supervisor.sync([DEVICE]);
    supervisor.sync([DEVICE]);
    await settle();

    expect(connect).toHaveBeenCalledTimes(1);
    supervisor.dispose();
  });

  it('disarms and cancels a device dropped from the remembered list', async () => {
    const { manager, supervisor } = setup();
    supervisor.sync([DEVICE, OTHER]);
    await settle();

    supervisor.sync([OTHER]);

    expect(manager.cancelDeviceConnection).toHaveBeenCalledWith(DEVICE.id);
    expect(supervisor.getArmedDeviceIds()).toEqual([OTHER.id]);
    expect(useH158ReconnectStore.getState().phases[DEVICE.id]).toBeUndefined();
    supervisor.dispose();
  });

  it('forget() clears the intent and its phase', async () => {
    const { manager, supervisor } = setup();
    supervisor.sync([DEVICE]);
    await settle();

    supervisor.forget(DEVICE.id);

    expect(supervisor.getArmedDeviceIds()).toEqual([]);
    expect(manager.cancelDeviceConnection).toHaveBeenCalledWith(DEVICE.id);
    expect(useH158ReconnectStore.getState().phases[DEVICE.id]).toBeUndefined();
    supervisor.dispose();
  });

  it('reports blockedLimit rather than dialling past the concurrent-connection cap', async () => {
    const { connect, supervisor } = setup();
    // Three live connections is `H158_MAX_CONCURRENT_CONNECTIONS`.
    setH158Connected({ id: 'a', name: null }, fakeSession());
    setH158Connected({ id: 'b', name: null }, fakeSession());
    setH158Connected({ id: 'c', name: null }, fakeSession());

    supervisor.sync([DEVICE]);
    await settle();

    expect(connect).not.toHaveBeenCalled();
    expect(useH158ReconnectStore.getState().phases[DEVICE.id]).toBe('blockedLimit');
    supervisor.dispose();
  });

  it('dispose() stops reacting to drops', async () => {
    const { connect, timers, supervisor } = setup();
    supervisor.sync([DEVICE]);
    await settle();
    setH158Connected(DEVICE, fakeSession());
    connect.mockClear();

    supervisor.dispose();
    setH158Disconnected(DEVICE.id);
    timers.flush();
    await settle();

    expect(connect).not.toHaveBeenCalled();
  });
});
