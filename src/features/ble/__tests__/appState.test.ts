/**
 * P1-7.0 — appState.ts against the real mock peripheral, following
 * connection.test.ts's conventions (fake timers, createMockPeripheral,
 * FakeClock, validCredentials).
 */
import { createMockPeripheral } from '../../../../tools/mock-peripheral/bleAdapter';
import { FakeClock } from '../../../../tools/mock-peripheral/clock';
import { nodeDeviceCoreCrypto, nodeNonceSource } from '../../../../tools/mock-peripheral/crypto';
import { K_DEV, validCredentials } from '../../../../tools/mock-peripheral/testCredentials';
import { createConnectionManager } from '../connection';
import { createAppStateCoordinator, reconcileConnections, type AppStateLike, type AppStateSubscriptionLike } from '../appState';

const DEVICE_ID = 'mock-device-0001';

function setup() {
  return createMockPeripheral({
    kDev: K_DEV,
    clock: new FakeClock(0),
    deviceId: DEVICE_ID,
    crypto: nodeDeviceCoreCrypto,
    nonceSource: nodeNonceSource,
  });
}

/** The one new test helper the brief calls for — a fake AppStateLike. */
class FakeAppState implements AppStateLike {
  currentState: string | null;
  private readonly listeners = new Set<(state: string) => void>();
  /** The remove() of the most recently issued subscription — a jest.fn so dispose() tests can count calls. */
  removeSpy: jest.Mock = jest.fn();

  constructor(initial: string | null) {
    this.currentState = initial;
  }

  addEventListener(_type: 'change', listener: (state: string) => void): AppStateSubscriptionLike {
    this.listeners.add(listener);
    this.removeSpy = jest.fn(() => {
      this.listeners.delete(listener);
    });
    return { remove: this.removeSpy };
  }

  emit(state: string): void {
    this.currentState = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('createAppStateCoordinator — initial phase', () => {
  test('1: initial phase is foreground when currentState is active', () => {
    const coordinator = createAppStateCoordinator({ appState: new FakeAppState('active') });
    expect(coordinator.getPhase()).toBe('foreground');
  });

  test('2: initial phase is foreground when currentState is inactive', () => {
    const coordinator = createAppStateCoordinator({ appState: new FakeAppState('inactive') });
    expect(coordinator.getPhase()).toBe('foreground');
  });

  test('3: initial phase is background only when currentState is background', () => {
    const coordinator = createAppStateCoordinator({ appState: new FakeAppState('background') });
    expect(coordinator.getPhase()).toBe('background');
  });
});

describe('createAppStateCoordinator — transitions', () => {
  test('4: active -> background fires onEnterBackground exactly once and flips getPhase()', () => {
    const appState = new FakeAppState('active');
    const onEnterBackground = jest.fn();
    const onEnterForeground = jest.fn();
    const coordinator = createAppStateCoordinator({ appState, onEnterBackground, onEnterForeground });

    appState.emit('background');

    expect(coordinator.getPhase()).toBe('background');
    expect(onEnterBackground).toHaveBeenCalledTimes(1);
    expect(onEnterForeground).not.toHaveBeenCalled();
  });

  test('5: background -> active fires onEnterForeground exactly once', () => {
    const appState = new FakeAppState('background');
    const onEnterForeground = jest.fn();
    const coordinator = createAppStateCoordinator({ appState, onEnterForeground });

    appState.emit('active');

    expect(coordinator.getPhase()).toBe('foreground');
    expect(onEnterForeground).toHaveBeenCalledTimes(1);
  });

  test('6: active -> inactive -> active fires NEITHER hook and never leaves foreground', () => {
    const appState = new FakeAppState('active');
    const onEnterForeground = jest.fn();
    const onEnterBackground = jest.fn();
    const coordinator = createAppStateCoordinator({ appState, onEnterForeground, onEnterBackground });

    appState.emit('inactive');
    expect(coordinator.getPhase()).toBe('foreground');
    appState.emit('active');

    expect(coordinator.getPhase()).toBe('foreground');
    expect(onEnterForeground).not.toHaveBeenCalled();
    expect(onEnterBackground).not.toHaveBeenCalled();
  });

  test('7: a repeated active while already foregrounded does not re-fire the hook', () => {
    const appState = new FakeAppState('active');
    const onEnterForeground = jest.fn();
    const coordinator = createAppStateCoordinator({ appState, onEnterForeground });

    appState.emit('active');

    expect(coordinator.getPhase()).toBe('foreground');
    expect(onEnterForeground).not.toHaveBeenCalled();
  });

  test('8: an unrecognised state (extension) is ignored, exactly like inactive', () => {
    const appState = new FakeAppState('active');
    const onEnterForeground = jest.fn();
    const onEnterBackground = jest.fn();
    const coordinator = createAppStateCoordinator({ appState, onEnterForeground, onEnterBackground });

    appState.emit('extension');

    expect(coordinator.getPhase()).toBe('foreground');
    expect(onEnterForeground).not.toHaveBeenCalled();
    expect(onEnterBackground).not.toHaveBeenCalled();
  });
});

describe('createAppStateCoordinator — dispose', () => {
  test('9: dispose() removes the subscription; a later emit fires no hook', () => {
    const appState = new FakeAppState('active');
    const onEnterBackground = jest.fn();
    const coordinator = createAppStateCoordinator({ appState, onEnterBackground });

    coordinator.dispose();
    appState.emit('background');

    expect(onEnterBackground).not.toHaveBeenCalled();
    expect(coordinator.getPhase()).toBe('foreground');
  });

  test('10: dispose() twice is a no-op, not a double-remove()', () => {
    const appState = new FakeAppState('active');
    const coordinator = createAppStateCoordinator({ appState });

    coordinator.dispose();
    expect(appState.removeSpy).toHaveBeenCalledTimes(1);

    coordinator.dispose();
    expect(appState.removeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('reconcileConnections — against the real mock', () => {
  test('11: a device the manager believes is connected but which the radio reports down is reconnected, and its ID is returned', async () => {
    const { manager: bleManager } = setup();
    const credentials = jest.fn(async () => validCredentials());
    const connection = createConnectionManager({ manager: bleManager, credentials });

    await connection.connect(DEVICE_ID);
    expect(connection.getState(DEVICE_ID)).toBe('connected');

    // Simulate the app having been suspended: the radio dropped the link, but
    // no JS timer ran to observe it, so connection.ts still believes 'connected'.
    jest.spyOn(bleManager, 'isDeviceConnected').mockResolvedValueOnce(false);

    const reconnected = await reconcileConnections({
      manager: bleManager,
      connection,
      deviceIds: [DEVICE_ID],
    });

    expect(reconnected).toEqual([DEVICE_ID]);
  });

  test('12: that reconnect re-runs the full §4.5 handshake — credentials() was called a second time', async () => {
    const { manager: bleManager } = setup();
    const credentials = jest.fn(async () => validCredentials());
    const connection = createConnectionManager({ manager: bleManager, credentials });

    await connection.connect(DEVICE_ID);
    expect(credentials).toHaveBeenCalledTimes(1);

    jest.spyOn(bleManager, 'isDeviceConnected').mockResolvedValueOnce(false);

    await reconcileConnections({ manager: bleManager, connection, deviceIds: [DEVICE_ID] });

    // A resumed session would leave this at 1.
    expect(credentials).toHaveBeenCalledTimes(2);
  });

  test('13: a genuinely-connected device is left alone — no connect() call, not in the returned list', async () => {
    const { manager: bleManager } = setup();
    const credentials = jest.fn(async () => validCredentials());
    const connection = createConnectionManager({ manager: bleManager, credentials });

    await connection.connect(DEVICE_ID);
    expect(credentials).toHaveBeenCalledTimes(1);

    const reconnected = await reconcileConnections({ manager: bleManager, connection, deviceIds: [DEVICE_ID] });

    expect(reconnected).toEqual([]);
    expect(credentials).toHaveBeenCalledTimes(1);
    expect(connection.getState(DEVICE_ID)).toBe('connected');
  });

  test('14: a device in state disconnected or reconnecting is skipped — it has its own path', async () => {
    const { manager: bleManager } = setup();
    const isDeviceConnectedSpy = jest.spyOn(bleManager, 'isDeviceConnected');

    // Case 1: never connected -> stays 'disconnected'.
    const neverConnected = createConnectionManager({
      manager: bleManager,
      credentials: async () => validCredentials(),
    });
    expect(neverConnected.getState(DEVICE_ID)).toBe('disconnected');

    // Case 2: a failed handshake leaves the device 'reconnecting', with its
    // own backoff/retry loop already scheduled — a competing attempt from
    // reconcileConnections here would race it.
    const reconnecting = createConnectionManager({
      manager: bleManager,
      credentials: async () => ({ ...validCredentials(), kSess: new Uint8Array(16) }),
    });
    await reconnecting.connect(DEVICE_ID);
    expect(reconnecting.getState(DEVICE_ID)).toBe('reconnecting');

    isDeviceConnectedSpy.mockClear();

    const reconnectedFromDisconnected = await reconcileConnections({
      manager: bleManager,
      connection: neverConnected,
      deviceIds: [DEVICE_ID],
    });
    const reconnectedFromReconnecting = await reconcileConnections({
      manager: bleManager,
      connection: reconnecting,
      deviceIds: [DEVICE_ID],
    });

    expect(reconnectedFromDisconnected).toEqual([]);
    expect(reconnectedFromReconnecting).toEqual([]);
    expect(isDeviceConnectedSpy).not.toHaveBeenCalled();
  });

  test('15: an isDeviceConnected that rejects does not throw out of reconcileConnections, and the next device in the list is still processed', async () => {
    const OTHER_DEVICE_ID = 'mock-device-0002';
    // Both devices believed 'connected' by connection.ts. Minimal hand-rolled
    // fakes (the Pick<> types reconcileConnections declares) rather than a
    // second real handshake, so device 1's rejection and device 2's outcome
    // are both directly controllable.
    const isDeviceConnected = jest
      .fn<Promise<boolean>, [string]>()
      .mockRejectedValueOnce(new Error('radio error'))
      .mockResolvedValueOnce(false);
    const connect = jest.fn(async () => undefined);
    const manager = { isDeviceConnected };
    const connection = { getState: () => 'connected' as const, connect };

    const reconnected = await reconcileConnections({
      manager,
      connection,
      deviceIds: [DEVICE_ID, OTHER_DEVICE_ID],
    });

    expect(isDeviceConnected).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenCalledWith(OTHER_DEVICE_ID);
    expect(reconnected).toEqual([OTHER_DEVICE_ID]);
  });
});
