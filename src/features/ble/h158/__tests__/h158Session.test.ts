/**
 * H158/YP65-AT session — connect, and the transport's defining constraint:
 * a bad command gets no reply at all (manufacturer-reply-2026-08-17.md item
 * 12), so timeout is the only failure signal. Hand-rolled `BleDeviceLike`/
 * `BleManagerLike` doubles, same convention as `auth.test.ts`'s "finding 2"
 * block — the mock peripheral (`tools/mock-peripheral`) implements §4, not
 * H158, so it can't drive this module.
 */
import type { BleDeviceLike, BleManagerLike } from '../../BleClientContext';
import { base64ToBytes, bytesToBase64 } from '../../base64';
import { connectH158Session } from '../h158Session';
import {
  ChildLockValue,
  H158Ack,
  H158Command,
  H158_MIN_COMMAND_GAP_MS,
  H158LockStateByte,
  encodeH158Frame,
} from '../h158Protocol';

const DEVICE_ID = 'h158-mock-0001';

/**
 * `encodeH158Frame` builds a COMMAND frame (CMD + DATA) — it has no ACK
 * slot, because only the device ever sends a reply frame (CMD + ACK +
 * DATA). This test-only helper builds the reply shape instead, so fixtures
 * below can't accidentally shift DATA into the ACK byte's position — the
 * exact bug this comment replaces (first draft used `encodeH158Frame`
 * directly for "replies" and silently wrote status DATA[0] as the ACK).
 */
function encodeH158ReplyFrame(cmd: number, data: Uint8Array): Uint8Array {
  return encodeH158Frame(cmd, Uint8Array.of(H158Ack.SUCCESS, ...data));
}

interface FakeDeviceOptions {
  onWrite?: (bytes: Uint8Array) => void;
  /** If set, this listener is captured so a test can push a "reply" whenever it likes. */
  captureListener?: (deliver: (bytes: Uint8Array) => void) => void;
  neverSettlesConnect?: boolean;
  neverSettlesDiscover?: boolean;
  neverSettlesSubscribe?: boolean;
  writeRejects?: boolean;
}

function buildFakeManager(options: FakeDeviceOptions): BleManagerLike {
  const neverSettles = new Promise<never>(() => {});

  const device: BleDeviceLike = {
    id: DEVICE_ID,
    discoverAllServicesAndCharacteristics: () =>
      options.neverSettlesDiscover ? neverSettles : Promise.resolve(device),
    readCharacteristicForService: async () => ({ value: null }),
    writeCharacteristicWithResponseForService: async (_svc, _char, base64Value) => {
      if (options.writeRejects) {
        throw new Error('write failed');
      }
      options.onWrite?.(base64ToBytes(base64Value));
      return { value: null };
    },
    monitorCharacteristicForService: (_svc, _char, listener) => {
      if (options.neverSettlesSubscribe) {
        // Never call back with a subscription — connectH158Session's own
        // withTimeout around the Promise wrapping this call is what times out.
      } else if (options.captureListener) {
        options.captureListener((bytes) => {
          listener(null, { value: bytesToBase64(bytes) });
        });
      }
      return options.neverSettlesSubscribe ? (undefined as unknown as { remove(): void }) : { remove: () => {} };
    },
  };

  return {
    state: async () => 'PoweredOn',
    isDeviceConnected: async () => true,
    cancelDeviceConnection: async () => device,
    connectToDevice: () => (options.neverSettlesConnect ? neverSettles : Promise.resolve(device)),
  };
}

describe('connectH158Session', () => {
  test('a hung connectToDevice times out with stage "connect"', async () => {
    jest.useFakeTimers();
    try {
      const manager = buildFakeManager({ neverSettlesConnect: true });
      const outcomePromise = connectH158Session(manager, DEVICE_ID);
      await jest.advanceTimersByTimeAsync(10_000);
      expect(await outcomePromise).toEqual({ ok: false, reason: 'timeout', stage: 'connect' });
    } finally {
      jest.useRealTimers();
    }
  });

  test('a hung discoverAllServicesAndCharacteristics times out with stage "discover"', async () => {
    jest.useFakeTimers();
    try {
      const manager = buildFakeManager({ neverSettlesDiscover: true });
      const outcomePromise = connectH158Session(manager, DEVICE_ID);
      await jest.advanceTimersByTimeAsync(5000);
      expect(await outcomePromise).toEqual({ ok: false, reason: 'timeout', stage: 'discover' });
    } finally {
      jest.useRealTimers();
    }
  });

  test('a successful connect returns a usable session', async () => {
    const manager = buildFakeManager({ captureListener: () => {} });
    const outcome = await connectH158Session(manager, DEVICE_ID);
    expect(outcome.ok).toBe(true);
  });

  test('a rejecting write resolves to a typed transport outcome, never throws', async () => {
    const manager = buildFakeManager({ writeRejects: true, captureListener: () => {} });
    const outcome = await connectH158Session(manager, DEVICE_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const result = await outcome.session.readStatus();
    expect(result).toEqual({ ok: false, reason: 'transport', detail: 'write failed' });
  });
});

describe('H158Session — the device stays silent on a bad frame, so timeout is the only failure signal', () => {
  test('readStatus() times out when no reply ever arrives', async () => {
    jest.useFakeTimers();
    try {
      const manager = buildFakeManager({ captureListener: () => {} }); // listener captured but never invoked
      const outcome = await connectH158Session(manager, DEVICE_ID);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const resultPromise = outcome.session.readStatus();
      await jest.advanceTimersByTimeAsync(3000);
      expect(await resultPromise).toEqual({ ok: false, reason: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });

  test('readStatus() resolves with the parsed status once a reply notification arrives', async () => {
    let deliver: ((bytes: Uint8Array) => void) | undefined;
    const manager = buildFakeManager({
      captureListener: (d) => {
        deliver = d;
      },
      onWrite: () => {
        // Reply immediately, synchronously with the write — exercises the
        // "listener registered before write resolves" ordering.
        const reply = encodeH158ReplyFrame(H158Command.TERMINAL_INFO, Uint8Array.of(H158LockStateByte.LOCKED, 0x00, 0x50));
        deliver?.(reply);
      },
    });
    const outcome = await connectH158Session(manager, DEVICE_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const result = await outcome.session.readStatus();
    expect(result).toEqual({
      ok: true,
      value: { locked: true, systemState: 0x00, systemStateLabel: 'Power On', batteryPercent: 80 },
      raw: { cmd: H158Command.TERMINAL_INFO, ack: 0x00, data: Uint8Array.of(H158LockStateByte.LOCKED, 0x00, 0x50) },
    });
  });

  test('a corrupted reply resolves to malformedReply, not a throw', async () => {
    let deliver: ((bytes: Uint8Array) => void) | undefined;
    const manager = buildFakeManager({
      captureListener: (d) => {
        deliver = d;
      },
      onWrite: () => {
        deliver?.(Uint8Array.of(0xaa, 0x03, 0xa1, 0x00, 0x78, 0x00, 0x01)); // wrong head
      },
    });
    const outcome = await connectH158Session(manager, DEVICE_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const result = await outcome.session.readStatus();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('malformedReply');
    }
  });

  test('setChildLock(true) prefers the status-shaped 3-byte reply when the device sends one', async () => {
    let deliver: ((bytes: Uint8Array) => void) | undefined;
    const manager = buildFakeManager({
      captureListener: (d) => {
        deliver = d;
      },
      onWrite: () => {
        const reply = encodeH158ReplyFrame(H158Command.CHILD_LOCK, Uint8Array.of(H158LockStateByte.LOCKED, 0x02, 0x64));
        deliver?.(reply);
      },
    });
    const outcome = await connectH158Session(manager, DEVICE_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const result = await outcome.session.setChildLock(true);
    expect(result).toEqual({
      ok: true,
      value: { locked: true },
      raw: { cmd: H158Command.CHILD_LOCK, ack: 0x00, data: Uint8Array.of(H158LockStateByte.LOCKED, 0x02, 0x64) },
    });
  });

  test('setChildLock(false) falls back to the 1-byte command-echo ack when the reply is not status-shaped', async () => {
    let deliver: ((bytes: Uint8Array) => void) | undefined;
    const manager = buildFakeManager({
      captureListener: (d) => {
        deliver = d;
      },
      onWrite: () => {
        const reply = encodeH158ReplyFrame(H158Command.CHILD_LOCK, Uint8Array.of(ChildLockValue.UNLOCK));
        deliver?.(reply);
      },
    });
    const outcome = await connectH158Session(manager, DEVICE_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const result = await outcome.session.setChildLock(false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ locked: false });
    }
  });

  test('two commands are separated by at least the 20 ms minimum gap (reply item 14)', async () => {
    // Fake timers, not a real-clock measurement: a real-timer version of this
    // assertion is flaky at exactly the 20 ms boundary (timer coalescing can
    // fire 1 ms early). Faking the clock makes the gap deterministic instead
    // of measured.
    jest.useFakeTimers();
    try {
      const writeTimestamps: number[] = [];
      let deliver: ((bytes: Uint8Array) => void) | undefined;
      const manager = buildFakeManager({
        captureListener: (d) => {
          deliver = d;
        },
        onWrite: () => {
          writeTimestamps.push(Date.now());
          const reply = encodeH158ReplyFrame(H158Command.TERMINAL_INFO, Uint8Array.of(H158LockStateByte.UNLOCKED, 0x00, 0x32));
          deliver?.(reply);
        },
      });
      const outcome = await connectH158Session(manager, DEVICE_ID);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const first = outcome.session.readStatus();
      await jest.advanceTimersByTimeAsync(0);
      const second = outcome.session.readStatus();
      await jest.advanceTimersByTimeAsync(H158_MIN_COMMAND_GAP_MS);
      await Promise.all([first, second]);

      expect(writeTimestamps).toHaveLength(2);
      expect(writeTimestamps[1] - writeTimestamps[0]).toBeGreaterThanOrEqual(H158_MIN_COMMAND_GAP_MS);
    } finally {
      jest.useRealTimers();
    }
  });

  test('dispose() removes the FFF1 subscription', async () => {
    const remove = jest.fn();
    const device: BleDeviceLike = {
      id: DEVICE_ID,
      discoverAllServicesAndCharacteristics: async function (this: void) {
        return device;
      },
      readCharacteristicForService: async () => ({ value: null }),
      writeCharacteristicWithResponseForService: async () => ({ value: null }),
      monitorCharacteristicForService: () => ({ remove }),
    };
    const manager: BleManagerLike = {
      state: async () => 'PoweredOn',
      isDeviceConnected: async () => true,
      cancelDeviceConnection: async () => device,
      connectToDevice: async () => device,
    };

    const outcome = await connectH158Session(manager, DEVICE_ID);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    outcome.session.dispose();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
