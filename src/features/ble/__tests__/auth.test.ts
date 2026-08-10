/**
 * §6.4 — app-side view of every scenario in
 * tools/mock-peripheral/__tests__/deviceCore.handshake.test.ts, driven
 * through `createAuthHandshake()` against `createMockPeripheral()`.
 */
import { createMockPeripheral } from '../../../../tools/mock-peripheral/bleAdapter';
import { FakeClock } from '../../../../tools/mock-peripheral/clock';
import { hkdfSha256 } from '../../../../tools/mock-peripheral/crypto';
import { createAuthHandshake, type AuthResponseInput } from '../auth';
import {
  AUTH_BACKOFF,
  AUTH_HKDF_INFO,
  AUTH_NONCE_TTL_MS,
  AUTH_RESPONSE_FRAME_1_LAYOUT,
  AuthResponseFrameIndex,
  BLE_CHARACTERISTIC_UUIDS,
  BLE_SERVICE_UUID,
  CHARACTERISTIC_LENGTH_BYTES,
} from '../protocol';
import type { BleDeviceLike, BleManagerLike } from '../BleClientContext';

const K_DEV = Uint8Array.from({ length: 16 }, (_, i) => 0x10 + i);
const SESSION_ID = Uint8Array.from({ length: 16 }, (_, i) => 0x20 + i);
const DEVICE_ID = 'mock-device-0001';
const KEY_GENERATION = 7;
const EXPIRES_AT_DELTA = 3600;

function deriveKSess(kDev: Uint8Array, sessionId: Uint8Array, keyGeneration: number): Uint8Array {
  return hkdfSha256(
    kDev,
    sessionId,
    Buffer.concat([Buffer.from(AUTH_HKDF_INFO, 'utf8'), Buffer.from([keyGeneration])]),
    16,
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function buildInput(overrides: Partial<AuthResponseInput> = {}): AuthResponseInput {
  return {
    sessionId: SESSION_ID,
    kSess: deriveKSess(K_DEV, SESSION_ID, KEY_GENERATION),
    keyGeneration: KEY_GENERATION,
    expiresAtDelta: EXPIRES_AT_DELTA,
    ...overrides,
  };
}

describe('createAuthHandshake — §4.5, against the mock peripheral', () => {
  test('a valid handshake opens an authenticated session', async () => {
    const clock = new FakeClock(0);
    const { manager, core } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });
    const handshake = createAuthHandshake(manager);

    const outcome = await handshake.authenticate(DEVICE_ID, buildInput());

    expect(outcome.ok).toBe(true);
    expect(core.isAuthenticated()).toBe(true);
    if (outcome.ok) {
      expect(outcome.session.keyGeneration).toBe(KEY_GENERATION);
    }
  });

  test('wrong K_sess produces a typed AUTH_FAILED outcome, not a thrown error', async () => {
    const clock = new FakeClock(0);
    const { manager, core } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });
    const handshake = createAuthHandshake(manager);

    const wrongKSess = Uint8Array.from({ length: 16 }, (_, i) => 0x90 + i); // does not match kDev-derived K_sess
    const outcome = await handshake.authenticate(DEVICE_ID, buildInput({ kSess: wrongKSess }));

    expect(outcome).toEqual({ ok: false, resultCode: 0x02 /* AUTH_FAILED */ });
    expect(core.isAuthenticated()).toBe(false);
  });

  test('5th consecutive failure triggers RATE_LIMITED on the next attempt', async () => {
    const clock = new FakeClock(0);
    const { manager, core } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });
    const handshake = createAuthHandshake(manager);
    const wrongKSess = Uint8Array.from({ length: 16 }, (_, i) => 0x90 + i);

    for (let i = 0; i < AUTH_BACKOFF.shortThresholdFailures; i += 1) {
      const failure = await handshake.authenticate(DEVICE_ID, buildInput({ kSess: wrongKSess }));
      expect(failure).toEqual({ ok: false, resultCode: 0x02 /* AUTH_FAILED */ });
    }

    const nextAttempt = await handshake.authenticate(DEVICE_ID, buildInput());
    expect(nextAttempt).toEqual({ ok: false, resultCode: 0x09 /* RATE_LIMITED */ });
    expect(core.isAuthenticated()).toBe(false);
  });

  test('a frame-1 retransmit (F12a) does not dead-end a subsequent real attempt', async () => {
    const clock = new FakeClock(0);
    const { manager } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });
    const handshake = createAuthHandshake(manager);

    // Connect once, outside authenticate(), and write a stray retransmit-style
    // frame 1 the way the app's own auth.ts encodes it (base64, same layout)
    // — modelling an ordinary duplicated GATT write landing before the real
    // handshake attempt starts. Per F12a this must not dead-end anything.
    const connected: BleDeviceLike = await manager.connectToDevice(DEVICE_ID);
    await connected.discoverAllServicesAndCharacteristics();
    const strayFrame1 = new Uint8Array(CHARACTERISTIC_LENGTH_BYTES.authResponse);
    strayFrame1[AUTH_RESPONSE_FRAME_1_LAYOUT.frameIndex.offset] = AuthResponseFrameIndex.FRAME_1;
    strayFrame1.set(SESSION_ID, AUTH_RESPONSE_FRAME_1_LAYOUT.sessionId.offset);
    strayFrame1[AUTH_RESPONSE_FRAME_1_LAYOUT.keyGeneration.offset] = KEY_GENERATION;
    await connected.writeCharacteristicWithResponseForService(
      BLE_SERVICE_UUID,
      BLE_CHARACTERISTIC_UUIDS.authResponse,
      bytesToBase64(strayFrame1),
    );

    // A fresh, complete handshake through the app's own code must still
    // succeed — connectToDevice() re-issues a nonce and resets framing state
    // (deviceCore.ts connect()), so this also covers "a new connection
    // recovers cleanly", the app-observable half of FW-19(b)/(c).
    const outcome = await handshake.authenticate(DEVICE_ID, buildInput());
    expect(outcome.ok).toBe(true);
  });

  test('a stale nonce (past the 30s TTL) fails the handshake cleanly', async () => {
    const clock = new FakeClock(0);
    const { manager, core } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });

    // Connect first (issues the nonce the handshake will use), then let it
    // go stale before the handshake writes land.
    const device: BleDeviceLike = await manager.connectToDevice(DEVICE_ID);
    await device.discoverAllServicesAndCharacteristics();
    clock.advanceMs(AUTH_NONCE_TTL_MS);
    core.tick();

    // Route authenticate() at this same connection by handing it a manager
    // whose connectToDevice() returns the already-open device unchanged
    // (the real connectToDevice would otherwise re-issue a fresh nonce).
    const staleManager: BleManagerLike = {
      state: () => manager.state(),
      startDeviceScan: (u, o, l) => manager.startDeviceScan(u, o, l),
      stopDeviceScan: () => manager.stopDeviceScan(),
      connectToDevice: async () => device,
      isDeviceConnected: (id) => manager.isDeviceConnected(id),
      cancelDeviceConnection: (id) => manager.cancelDeviceConnection(id),
    };
    const staleHandshake = createAuthHandshake(staleManager);

    const outcome = await staleHandshake.authenticate(DEVICE_ID, buildInput());
    expect(outcome).toEqual({ ok: false, resultCode: 0x02 /* AUTH_FAILED */ });
    expect(core.isAuthenticated()).toBe(false);
  });

  test('commandResult notification never arriving times out instead of hanging', async () => {
    jest.useFakeTimers();
    try {
      const clock = new FakeClock(0);
      const { manager: realManager } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });

      // A manager double whose device behaves normally except it never
      // notifies on commandResult — models a lost/undelivered notification.
      const silentManager: BleManagerLike = {
        state: () => realManager.state(),
        startDeviceScan: (u, o, l) => realManager.startDeviceScan(u, o, l),
        stopDeviceScan: () => realManager.stopDeviceScan(),
        isDeviceConnected: (id) => realManager.isDeviceConnected(id),
        cancelDeviceConnection: (id) => realManager.cancelDeviceConnection(id),
        connectToDevice: async (id) => {
          const realDevice = await realManager.connectToDevice(id);
          return {
            id: realDevice.id,
            discoverAllServicesAndCharacteristics: async () => realDevice.discoverAllServicesAndCharacteristics(),
            readCharacteristicForService: (s, c) => realDevice.readCharacteristicForService(s, c),
            writeCharacteristicWithResponseForService: (s, c, v) =>
              realDevice.writeCharacteristicWithResponseForService(s, c, v),
            monitorCharacteristicForService: () => ({ remove: () => {} }), // never calls the listener
          } satisfies BleDeviceLike;
        },
      };

      const handshake = createAuthHandshake(silentManager);
      const outcomePromise = handshake.authenticate(DEVICE_ID, buildInput());

      await jest.advanceTimersByTimeAsync(5000);
      const outcome = await outcomePromise;

      expect(outcome).toEqual({ ok: false, reason: 'timeout', stage: 'result' });
    } finally {
      jest.useRealTimers();
    }
  });

  describe('finding 2 — every BLE stage is bounded, not just the commandResult wait', () => {
    // A manager/device double whose operation for the given stage never
    // settles, so the only way authenticate() can resolve is via
    // withTimeout()'s own per-stage budget — not the (real, working)
    // commandResult path.
    function hungAtStage(stage: 'connect' | 'discover' | 'read' | 'write'): BleManagerLike {
      const neverSettles = new Promise<never>(() => {});
      const device: BleDeviceLike = {
        id: DEVICE_ID,
        discoverAllServicesAndCharacteristics: () =>
          stage === 'discover' ? neverSettles : Promise.resolve(device),
        readCharacteristicForService: () =>
          stage === 'read' ? neverSettles : Promise.resolve({ value: bytesToBase64(new Uint8Array(16)) }),
        writeCharacteristicWithResponseForService: () =>
          stage === 'write' ? neverSettles : Promise.resolve({ value: null }),
        monitorCharacteristicForService: () => ({ remove: () => {} }),
      };
      return {
        state: async () => 'PoweredOn',
        startDeviceScan: () => {
          throw new Error('not used by this test');
        },
        stopDeviceScan: () => {},
        isDeviceConnected: async () => false,
        cancelDeviceConnection: async (id) => device.id === id ? device : device,
        connectToDevice: () => (stage === 'connect' ? neverSettles : Promise.resolve(device)),
      };
    }

    test('a hung connect times out with stage "connect"', async () => {
      jest.useFakeTimers();
      try {
        const handshake = createAuthHandshake(hungAtStage('connect'));
        const outcomePromise = handshake.authenticate(DEVICE_ID, buildInput());
        await jest.advanceTimersByTimeAsync(10_000);
        expect(await outcomePromise).toEqual({ ok: false, reason: 'timeout', stage: 'connect' });
      } finally {
        jest.useRealTimers();
      }
    });

    test('a hung discover times out with stage "discover"', async () => {
      jest.useFakeTimers();
      try {
        const handshake = createAuthHandshake(hungAtStage('discover'));
        const outcomePromise = handshake.authenticate(DEVICE_ID, buildInput());
        await jest.advanceTimersByTimeAsync(5000);
        expect(await outcomePromise).toEqual({ ok: false, reason: 'timeout', stage: 'discover' });
      } finally {
        jest.useRealTimers();
      }
    });

    test('a hung authChallenge read times out with stage "read"', async () => {
      jest.useFakeTimers();
      try {
        const handshake = createAuthHandshake(hungAtStage('read'));
        const outcomePromise = handshake.authenticate(DEVICE_ID, buildInput());
        await jest.advanceTimersByTimeAsync(3000);
        expect(await outcomePromise).toEqual({ ok: false, reason: 'timeout', stage: 'read' });
      } finally {
        jest.useRealTimers();
      }
    });

    test('a hung authResponse write times out with stage "write"', async () => {
      jest.useFakeTimers();
      try {
        const handshake = createAuthHandshake(hungAtStage('write'));
        const outcomePromise = handshake.authenticate(DEVICE_ID, buildInput());
        await jest.advanceTimersByTimeAsync(3000);
        expect(await outcomePromise).toEqual({ ok: false, reason: 'timeout', stage: 'write' });
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('finding 3 — authenticate() never throws, every failure is a typed outcome', () => {
    test('a rejecting connectToDevice resolves to a typed transport outcome', async () => {
      const rejectingManager: BleManagerLike = {
        state: async () => 'PoweredOn',
        startDeviceScan: () => {
          throw new Error('not used by this test');
        },
        stopDeviceScan: () => {},
        isDeviceConnected: async () => false,
        cancelDeviceConnection: async (id) => {
          throw new Error(`not connected: ${id}`);
        },
        connectToDevice: async () => {
          throw new Error('connection failed');
        },
      };
      const handshake = createAuthHandshake(rejectingManager);

      await expect(handshake.authenticate(DEVICE_ID, buildInput())).resolves.toEqual({
        ok: false,
        reason: 'transport',
        stage: 'connect',
        detail: 'connection failed',
      });
    });

    test('authChallenge returning no value resolves to a typed transport outcome', async () => {
      const clock = new FakeClock(0);
      const { manager: realManager } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });
      const manager: BleManagerLike = {
        state: () => realManager.state(),
        startDeviceScan: (u, o, l) => realManager.startDeviceScan(u, o, l),
        stopDeviceScan: () => realManager.stopDeviceScan(),
        isDeviceConnected: (id) => realManager.isDeviceConnected(id),
        cancelDeviceConnection: (id) => realManager.cancelDeviceConnection(id),
        connectToDevice: async (id) => {
          const device = await realManager.connectToDevice(id);
          return {
            id: device.id,
            discoverAllServicesAndCharacteristics: () => device.discoverAllServicesAndCharacteristics(),
            readCharacteristicForService: async () => ({ value: null }),
            writeCharacteristicWithResponseForService: (s, c, v) =>
              device.writeCharacteristicWithResponseForService(s, c, v),
            monitorCharacteristicForService: (s, c, l) => device.monitorCharacteristicForService(s, c, l),
          } satisfies BleDeviceLike;
        },
      };
      const handshake = createAuthHandshake(manager);

      const outcome = await handshake.authenticate(DEVICE_ID, buildInput());
      expect(outcome).toEqual({
        ok: false,
        reason: 'transport',
        stage: 'read',
        detail: 'authChallenge read returned no value',
      });
    });

    test('a wrong-length authChallenge resolves to a typed transport outcome', async () => {
      const clock = new FakeClock(0);
      const { manager: realManager } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });
      const manager: BleManagerLike = {
        state: () => realManager.state(),
        startDeviceScan: (u, o, l) => realManager.startDeviceScan(u, o, l),
        stopDeviceScan: () => realManager.stopDeviceScan(),
        isDeviceConnected: (id) => realManager.isDeviceConnected(id),
        cancelDeviceConnection: (id) => realManager.cancelDeviceConnection(id),
        connectToDevice: async (id) => {
          const device = await realManager.connectToDevice(id);
          return {
            id: device.id,
            discoverAllServicesAndCharacteristics: () => device.discoverAllServicesAndCharacteristics(),
            readCharacteristicForService: async () => ({ value: bytesToBase64(new Uint8Array(3)) }),
            writeCharacteristicWithResponseForService: (s, c, v) =>
              device.writeCharacteristicWithResponseForService(s, c, v),
            monitorCharacteristicForService: (s, c, l) => device.monitorCharacteristicForService(s, c, l),
          } satisfies BleDeviceLike;
        },
      };
      const handshake = createAuthHandshake(manager);

      const outcome = await handshake.authenticate(DEVICE_ID, buildInput());
      expect(outcome).toEqual({
        ok: false,
        reason: 'transport',
        stage: 'read',
        detail: 'authChallenge: expected 16 bytes, got 3',
      });
    });
  });

  describe('finding 5 — a non-OK, non-AUTH_FAILED/RATE_LIMITED result code is a typed outcome, not a timeout', () => {
    test('an unexpected result code (FAULT) does not present as a timeout', async () => {
      const clock = new FakeClock(0);
      const { manager: realManager } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });

      // A manager double whose device behaves normally except its
      // commandResult notification carries a code the handshake never
      // produces itself (FAULT, 0x08) — models firmware reporting a fault
      // mid-handshake. There is no way to reach this through the real mock's
      // evaluateHandshake(), which only ever writes OK/AUTH_FAILED/
      // RATE_LIMITED for a handshake result (core.forceNextCommandResult
      // only intercepts the lockCommand path, and a lockCommand result is
      // written under a different commandId that this handshake's listener
      // correctly ignores) — see this execution report's deviations.
      const faultManager: BleManagerLike = {
        state: () => realManager.state(),
        startDeviceScan: (u, o, l) => realManager.startDeviceScan(u, o, l),
        stopDeviceScan: () => realManager.stopDeviceScan(),
        isDeviceConnected: (id) => realManager.isDeviceConnected(id),
        cancelDeviceConnection: (id) => realManager.cancelDeviceConnection(id),
        connectToDevice: async (id) => {
          const realDevice = await realManager.connectToDevice(id);
          return {
            id: realDevice.id,
            discoverAllServicesAndCharacteristics: () => realDevice.discoverAllServicesAndCharacteristics(),
            readCharacteristicForService: (s, c) => realDevice.readCharacteristicForService(s, c),
            writeCharacteristicWithResponseForService: async (s, c, v) => {
              const result = await realDevice.writeCharacteristicWithResponseForService(s, c, v);
              const bytes = new Uint8Array(4);
              bytes[0] = 0x00; // HANDSHAKE_RESULT_COMMAND_ID
              bytes[1] = 0x08; // ResultCode.FAULT
              lastListener?.(null, { value: bytesToBase64(bytes) });
              return result;
            },
            monitorCharacteristicForService: (_s, _c, listener) => {
              lastListener = listener;
              return { remove: () => {} };
            },
          } satisfies BleDeviceLike;
        },
      };
      let lastListener:
        | ((error: Error | null, characteristic: { value: string | null } | null) => void)
        | undefined;

      const handshake = createAuthHandshake(faultManager);
      const outcome = await handshake.authenticate(DEVICE_ID, buildInput());

      expect(outcome).toEqual({ ok: false, reason: 'unexpected-result-code', resultCode: 0x08 });
    });
  });

  describe('finding 6 — a stray commandResult for a different commandId is ignored', () => {
    test('a stray notification carrying a foreign commandId does not pre-empt the real result', async () => {
      const clock = new FakeClock(0);
      const { manager: realManager, core } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });

      // The real listener is subscribed via realDevice.monitorCharacteristicForService
      // (so the genuine commandResult notification arrives normally, in order),
      // but before that happens we fire one synthetic notification straight at
      // the same listener — a stray commandId (not HANDSHAKE_RESULT_COMMAND_ID,
      // 0x00) carrying FAULT (0x08), the code most likely to be mistaken for a
      // real answer if the guard were gone. §4.5 subscribes before writing, so
      // this fires before the handshake has written anything.
      const strayManager: BleManagerLike = {
        state: () => realManager.state(),
        startDeviceScan: (u, o, l) => realManager.startDeviceScan(u, o, l),
        stopDeviceScan: () => realManager.stopDeviceScan(),
        isDeviceConnected: (id) => realManager.isDeviceConnected(id),
        cancelDeviceConnection: (id) => realManager.cancelDeviceConnection(id),
        connectToDevice: async (id) => {
          const realDevice = await realManager.connectToDevice(id);
          return {
            id: realDevice.id,
            discoverAllServicesAndCharacteristics: () => realDevice.discoverAllServicesAndCharacteristics(),
            readCharacteristicForService: (s, c) => realDevice.readCharacteristicForService(s, c),
            writeCharacteristicWithResponseForService: (s, c, v) =>
              realDevice.writeCharacteristicWithResponseForService(s, c, v),
            monitorCharacteristicForService: (s, c, listener) => {
              const subscription = realDevice.monitorCharacteristicForService(s, c, listener);
              const strayBytes = new Uint8Array(4);
              strayBytes[0] = 0x01; // not HANDSHAKE_RESULT_COMMAND_ID (e.g. an in-flight lockCommand result)
              strayBytes[1] = 0x08; // ResultCode.FAULT — would change the outcome if accepted
              listener(null, { value: bytesToBase64(strayBytes) });
              return subscription;
            },
          } satisfies BleDeviceLike;
        },
      };

      const handshake = createAuthHandshake(strayManager);
      const outcome = await handshake.authenticate(DEVICE_ID, buildInput());

      // The genuine result (2) must win, with no trace of the stray FAULT (1).
      expect(outcome.ok).toBe(true);
      expect(core.isAuthenticated()).toBe(true);
      if (outcome.ok) {
        expect(outcome.session.keyGeneration).toBe(KEY_GENERATION);
      }
    });
  });

  describe('finding 7 — the first commandResult notification wins, a second is ignored', () => {
    test('two notifications with different result codes resolve to the first', async () => {
      const clock = new FakeClock(0);
      const { manager: realManager } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });
      let lastListener:
        | ((error: Error | null, characteristic: { value: string | null } | null) => void)
        | undefined;

      const duplicateManager: BleManagerLike = {
        state: () => realManager.state(),
        startDeviceScan: (u, o, l) => realManager.startDeviceScan(u, o, l),
        stopDeviceScan: () => realManager.stopDeviceScan(),
        isDeviceConnected: (id) => realManager.isDeviceConnected(id),
        cancelDeviceConnection: (id) => realManager.cancelDeviceConnection(id),
        connectToDevice: async (id) => {
          const realDevice = await realManager.connectToDevice(id);
          return {
            id: realDevice.id,
            discoverAllServicesAndCharacteristics: () => realDevice.discoverAllServicesAndCharacteristics(),
            readCharacteristicForService: (s, c) => realDevice.readCharacteristicForService(s, c),
            writeCharacteristicWithResponseForService: async (s, c, v) => {
              const result = await realDevice.writeCharacteristicWithResponseForService(s, c, v);
              const okBytes = new Uint8Array(4);
              okBytes[0] = 0x00; // HANDSHAKE_RESULT_COMMAND_ID
              okBytes[1] = 0x00; // ResultCode.OK
              lastListener?.(null, { value: bytesToBase64(okBytes) });
              const faultBytes = new Uint8Array(4);
              faultBytes[0] = 0x00; // HANDSHAKE_RESULT_COMMAND_ID
              faultBytes[1] = 0x08; // ResultCode.FAULT — unambiguously distinguishable from OK
              lastListener?.(null, { value: bytesToBase64(faultBytes) });
              return result;
            },
            monitorCharacteristicForService: (_s, _c, listener) => {
              lastListener = listener;
              return { remove: () => {} };
            },
          } satisfies BleDeviceLike;
        },
      };

      const handshake = createAuthHandshake(duplicateManager);
      const outcome = await handshake.authenticate(DEVICE_ID, buildInput());

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.session.keyGeneration).toBe(KEY_GENERATION);
      }
    });
  });

  describe('finding 8 — the commandResult subscription is always released', () => {
    function spyManager(): { manager: BleManagerLike; remove: jest.Mock } {
      const clock = new FakeClock(0);
      const { manager: realManager } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });
      const remove = jest.fn();
      const manager: BleManagerLike = {
        state: () => realManager.state(),
        startDeviceScan: (u, o, l) => realManager.startDeviceScan(u, o, l),
        stopDeviceScan: () => realManager.stopDeviceScan(),
        isDeviceConnected: (id) => realManager.isDeviceConnected(id),
        cancelDeviceConnection: (id) => realManager.cancelDeviceConnection(id),
        connectToDevice: async (id) => {
          const realDevice = await realManager.connectToDevice(id);
          return {
            id: realDevice.id,
            discoverAllServicesAndCharacteristics: () => realDevice.discoverAllServicesAndCharacteristics(),
            readCharacteristicForService: (s, c) => realDevice.readCharacteristicForService(s, c),
            writeCharacteristicWithResponseForService: (s, c, v) =>
              realDevice.writeCharacteristicWithResponseForService(s, c, v),
            monitorCharacteristicForService: (s, c, listener) => {
              const subscription = realDevice.monitorCharacteristicForService(s, c, listener);
              return {
                remove: () => {
                  remove();
                  subscription.remove();
                },
              };
            },
          } satisfies BleDeviceLike;
        },
      };
      return { manager, remove };
    }

    test('a successful handshake removes its subscription exactly once', async () => {
      const { manager, remove } = spyManager();
      const handshake = createAuthHandshake(manager);

      const outcome = await handshake.authenticate(DEVICE_ID, buildInput());

      expect(outcome.ok).toBe(true);
      expect(remove).toHaveBeenCalledTimes(1);
    });

    test('a failed handshake (wrong K_sess, AUTH_FAILED) removes its subscription exactly once', async () => {
      const { manager, remove } = spyManager();
      const handshake = createAuthHandshake(manager);
      const wrongKSess = Uint8Array.from({ length: 16 }, (_, i) => 0x90 + i);

      const outcome = await handshake.authenticate(DEVICE_ID, buildInput({ kSess: wrongKSess }));

      expect(outcome).toEqual({ ok: false, resultCode: 0x02 /* AUTH_FAILED */ });
      expect(remove).toHaveBeenCalledTimes(1);
    });

    test('a connect rejection never creates a subscription, so nothing is removed and nothing throws', async () => {
      // Same connect-rejection manager as finding 3's test at auth.test.ts:266
      // — subscription stays undefined because discover/monitor are never
      // reached, so the finally must not call remove() on it.
      const rejectingManager: BleManagerLike = {
        state: async () => 'PoweredOn',
        startDeviceScan: () => {
          throw new Error('not used by this test');
        },
        stopDeviceScan: () => {},
        isDeviceConnected: async () => false,
        cancelDeviceConnection: async (id) => {
          throw new Error(`not connected: ${id}`);
        },
        connectToDevice: async () => {
          throw new Error('connection failed');
        },
      };
      const handshake = createAuthHandshake(rejectingManager);

      await expect(handshake.authenticate(DEVICE_ID, buildInput())).resolves.toEqual({
        ok: false,
        reason: 'transport',
        stage: 'connect',
        detail: 'connection failed',
      });
    });
  });
});
