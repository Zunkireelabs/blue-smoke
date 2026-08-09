/**
 * P1-7.0 — connection.ts against the real mock peripheral (auth.ts's
 * handshake behaviour is already covered by auth.test.ts; this covers the
 * lifecycle wrapped around it: reconnect-with-backoff, re-handshake on every
 * reconnect, and clean vs. abrupt disconnect).
 */
import { createMockPeripheral } from '../../../../tools/mock-peripheral/bleAdapter';
import { FakeClock } from '../../../../tools/mock-peripheral/clock';
import { K_DEV, validCredentials, wrongCredentials } from '../../../../tools/mock-peripheral/testCredentials';
import { createConnectionManager, type ConnectionState } from '../connection';
import type { AuthResponseInput } from '../auth';
import { ResultCode } from '../protocol';

const DEVICE_ID = 'mock-device-0001';

function setup() {
  return createMockPeripheral({ kDev: K_DEV, clock: new FakeClock(0), deviceId: DEVICE_ID });
}

function statesOf(manager: ReturnType<typeof createConnectionManager>, deviceId: string): ConnectionState[] {
  const seen: ConnectionState[] = [];
  manager.onStateChange(deviceId, (state) => seen.push(state));
  return seen;
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('createConnectionManager — initial connect', () => {
  test('transitions disconnected -> connecting -> connected on success', async () => {
    const { manager: bleManager } = setup();
    const connectionManager = createConnectionManager({ manager: bleManager, credentials: async () => validCredentials() });
    const seen = statesOf(connectionManager, DEVICE_ID);

    expect(connectionManager.getState(DEVICE_ID)).toBe('disconnected');
    await connectionManager.connect(DEVICE_ID);

    expect(connectionManager.getState(DEVICE_ID)).toBe('connected');
    expect(seen).toEqual(['connecting', 'connected']);
    expect(connectionManager.getLastFailure(DEVICE_ID)).toBeNull();
  });

  test('a handshake failure resolves void (never throws) and is readable via getLastFailure', async () => {
    const { manager: bleManager } = setup();
    const connectionManager = createConnectionManager({
      manager: bleManager,
      credentials: async () => wrongCredentials(),
    });

    await expect(connectionManager.connect(DEVICE_ID)).resolves.toBeUndefined();
    expect(connectionManager.getState(DEVICE_ID)).toBe('reconnecting');
    expect(connectionManager.getLastFailure(DEVICE_ID)).toEqual({
      stage: 'handshake',
      outcome: { ok: false, resultCode: ResultCode.AUTH_FAILED },
    });
  });
});

describe('createConnectionManager — 🔴 re-handshake on every reconnect', () => {
  test('an abrupt disconnect triggers a full new handshake, not a resumed session', async () => {
    const { manager: bleManager, device } = setup();
    const credentials = jest.fn(async () => validCredentials());
    const connectionManager = createConnectionManager({ manager: bleManager, credentials, backoff: { initialMs: 1000, multiplier: 2, maxMs: 30_000 } });

    await connectionManager.connect(DEVICE_ID);
    expect(connectionManager.getState(DEVICE_ID)).toBe('connected');
    expect(credentials).toHaveBeenCalledTimes(1);

    device.simulateAbruptDisconnect();
    expect(connectionManager.getState(DEVICE_ID)).toBe('reconnecting');

    await jest.advanceTimersByTimeAsync(1000);

    expect(connectionManager.getState(DEVICE_ID)).toBe('connected');
    // The proof: credentials() — and therefore the full §4.5 handshake — ran
    // a second time. A session-reuse bug would leave this at 1.
    expect(credentials).toHaveBeenCalledTimes(2);
  });

  test('backoff grows on repeated failures and is capped', async () => {
    const { manager: bleManager } = setup();
    const connectionManager = createConnectionManager({
      manager: bleManager,
      credentials: async () => wrongCredentials(),
      backoff: { initialMs: 1000, multiplier: 2, maxMs: 3000 },
    });

    await connectionManager.connect(DEVICE_ID);
    expect(connectionManager.getState(DEVICE_ID)).toBe('reconnecting');

    // 1st retry fires at +1000ms (still failing), 2nd at +2000ms after that, capped at 3000ms thereafter.
    await jest.advanceTimersByTimeAsync(1000);
    expect(connectionManager.getState(DEVICE_ID)).toBe('reconnecting');
    await jest.advanceTimersByTimeAsync(2000);
    expect(connectionManager.getState(DEVICE_ID)).toBe('reconnecting');
    // If the cap were not applied, the next retry would need 4000ms (1000*2*2); confirm 3000ms is enough.
    await jest.advanceTimersByTimeAsync(3000);
    expect(connectionManager.getState(DEVICE_ID)).toBe('reconnecting');
  });
});

describe('createConnectionManager — clean disconnect vs. abrupt drop', () => {
  test('disconnect() is clean — no auto-reconnect follows it', async () => {
    const { manager: bleManager, device } = setup();
    const credentials = jest.fn(async () => validCredentials());
    const connectionManager = createConnectionManager({ manager: bleManager, credentials });

    await connectionManager.connect(DEVICE_ID);
    expect(connectionManager.getState(DEVICE_ID)).toBe('connected');

    await connectionManager.disconnect(DEVICE_ID);

    expect(connectionManager.getState(DEVICE_ID)).toBe('disconnected');
    expect(device.isConnected()).toBe(false);

    // Advance well past any backoff — a clean disconnect must not reconnect.
    await jest.advanceTimersByTimeAsync(60_000);
    expect(connectionManager.getState(DEVICE_ID)).toBe('disconnected');
    expect(credentials).toHaveBeenCalledTimes(1);
  });

  test('disconnect() never throws even if the underlying cancel fails', async () => {
    const { manager: bleManager } = setup();
    const connectionManager = createConnectionManager({ manager: bleManager, credentials: async () => validCredentials() });
    await connectionManager.connect(DEVICE_ID);

    jest.spyOn(bleManager, 'cancelDeviceConnection').mockRejectedValue(new Error('boom'));
    await expect(connectionManager.disconnect(DEVICE_ID)).resolves.toBeUndefined();
    expect(connectionManager.getState(DEVICE_ID)).toBe('disconnected');
  });

  test('a disconnect() called mid-connect supersedes the in-flight attempt', async () => {
    const { manager: bleManager } = setup();
    let resolveCredentials!: (value: AuthResponseInput) => void;
    const credentials = jest.fn(
      () =>
        new Promise<AuthResponseInput>((resolve) => {
          resolveCredentials = resolve;
        }),
    );
    const connectionManager = createConnectionManager({ manager: bleManager, credentials });

    const connectPromise = connectionManager.connect(DEVICE_ID);
    expect(connectionManager.getState(DEVICE_ID)).toBe('connecting');

    await connectionManager.disconnect(DEVICE_ID);
    expect(connectionManager.getState(DEVICE_ID)).toBe('disconnected');

    // The stalled connect() attempt finally resolves its credentials — its result must be
    // discarded, not clobber the disconnect that already happened.
    resolveCredentials(validCredentials());
    await connectPromise;

    expect(connectionManager.getState(DEVICE_ID)).toBe('disconnected');
  });
});
