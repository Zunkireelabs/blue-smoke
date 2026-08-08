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

const K_DEV = new Uint8Array(16).fill(0x11);
const SESSION_ID = new Uint8Array(16).fill(0x22);
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

    const wrongKSess = new Uint8Array(16).fill(0x99); // does not match kDev-derived K_sess
    const outcome = await handshake.authenticate(DEVICE_ID, buildInput({ kSess: wrongKSess }));

    expect(outcome).toEqual({ ok: false, resultCode: 0x02 /* AUTH_FAILED */ });
    expect(core.isAuthenticated()).toBe(false);
  });

  test('5th consecutive failure triggers RATE_LIMITED on the next attempt', async () => {
    const clock = new FakeClock(0);
    const { manager, core } = createMockPeripheral({ kDev: K_DEV, clock, deviceId: DEVICE_ID });
    const handshake = createAuthHandshake(manager);
    const wrongKSess = new Uint8Array(16).fill(0x99);

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

      expect(outcome).toEqual({ ok: false, reason: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });
});
