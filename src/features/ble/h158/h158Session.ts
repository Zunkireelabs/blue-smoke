/**
 * H158/YP65-AT session: connect → discover → subscribe FFF1 → send commands.
 *
 * Bring-up spike (docs/hardware/manufacturer-supplied-2026-08-17/) — sits
 * beside `auth.ts`/`connection.ts`, not inside them. Same "nothing across
 * this boundary throws" convention: every failure is a typed outcome.
 *
 * The defining constraint here, unlike §4: a malformed command gets **no
 * reply at all** (manufacturer-reply-2026-08-17.md item 12), and FFF1 is
 * Write-Without-Response, so there is no GATT-level write acknowledgement
 * either. A timeout is therefore the ONLY failure signal this transport has
 * — every send takes an explicit deadline (CLAUDE.md: "Every BLE operation
 * has an explicit timeout. No unbounded await.").
 *
 * Only one phone can be connected at a time (reply item 9), so this module
 * assumes it has the FFF1 pipe to itself for the lifetime of a session —
 * an incoming notification is always this session's own reply, never
 * another client's traffic to correlate against.
 */

import { base64ToBytes, bytesToBase64 } from '../base64';
import type { BleDeviceLike, BleManagerLike } from '../BleClientContext';
import {
  decodeH158Frame,
  H158_MIN_COMMAND_GAP_MS,
  H158_PIPE_CHARACTERISTIC_UUID,
  H158_SERVICE_UUID,
  H158Command,
  type H158ParsedFrame,
  childLockCommand,
  parseH158ChildLockAck,
  parseH158StatusReply,
  terminalInfoCommand,
  type H158Status,
} from './h158Protocol';

// App-level operational choices, not device protocol — same split as
// auth.ts:30-42.
const CONNECT_TIMEOUT_MS = 10_000;
const DISCOVER_TIMEOUT_MS = 5000;
const SUBSCRIBE_TIMEOUT_MS = 3000;
// The device gives no ack for a bad frame (item 12) and no unsolicited
// notification (item 13) — a real reply should arrive well inside a second,
// so this is generous margin, not a measured device budget.
const REPLY_TIMEOUT_MS = 3000;

export type H158Stage = 'connect' | 'discover' | 'subscribe';

export type H158ConnectOutcome =
  | { ok: true; session: H158Session; device: BleDeviceLike }
  | { ok: false; reason: 'timeout'; stage: H158Stage }
  | { ok: false; reason: 'transport'; stage: H158Stage; detail: string };

export type H158SendOutcome<T> =
  | { ok: true; value: T; raw: H158ParsedFrame }
  | { ok: false; reason: 'timeout' }
  | { ok: false; reason: 'malformedReply'; detail: string }
  | { ok: false; reason: 'unparseable'; detail: string }
  | { ok: false; reason: 'transport'; detail: string };

export interface H158Session {
  readStatus(): Promise<H158SendOutcome<H158Status>>;
  setChildLock(locked: boolean): Promise<H158SendOutcome<{ locked: boolean }>>;
  /** Unsubscribes from FFF1. Does not disconnect the underlying device — that's the caller's concern, same split as connection.ts. */
  dispose(): void;
}

class H158TimeoutError extends Error {
  readonly stage: H158Stage;
  constructor(stage: H158Stage) {
    super(`H158 session stage "${stage}" exceeded its timeout budget`);
    this.name = 'H158TimeoutError';
    this.stage = stage;
  }
}

async function withTimeout<T>(operation: Promise<T>, ms: number, stage: H158Stage): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    handle = setTimeout(() => reject(new H158TimeoutError(stage)), ms);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(handle);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serialises command sends: enforces the 20 ms minimum gap (reply item 14)
 * and ensures only one command is ever awaiting a reply at a time, since a
 * second in-flight write would have no way to tell whose reply just arrived.
 */
function createCommandQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  let lastSentAt = 0;

  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(async () => {
      const wait = lastSentAt + H158_MIN_COMMAND_GAP_MS - Date.now();
      if (wait > 0) {
        await sleep(wait);
      }
      lastSentAt = Date.now();
      return task();
    });
    // Keep the chain alive even if this task's caller inspects a rejection —
    // sendCommand never actually throws (typed outcome instead), but this
    // guards the queue itself against a future caller that does.
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

export async function connectH158Session(
  manager: BleManagerLike,
  deviceId: string,
  onFrame?: (direction: 'tx' | 'rx', hex: string) => void,
): Promise<H158ConnectOutcome> {
  let stage: H158Stage = 'connect';
  try {
    const device: BleDeviceLike = await withTimeout(
      manager.connectToDevice(deviceId),
      CONNECT_TIMEOUT_MS,
      'connect',
    );

    stage = 'discover';
    await withTimeout(device.discoverAllServicesAndCharacteristics(), DISCOVER_TIMEOUT_MS, 'discover');

    stage = 'subscribe';
    // The listener below is shared by every command sent through this
    // session — sendCommand swaps in a fresh one-shot resolver per call via
    // `pendingResolvers`, so `subscription` itself is created exactly once.
    let deliver: ((frame: Uint8Array) => void) | undefined;
    const subscription = await withTimeout(
      new Promise<{ remove(): void }>((resolve, reject) => {
        const sub = device.monitorCharacteristicForService(
          H158_SERVICE_UUID,
          H158_PIPE_CHARACTERISTIC_UUID,
          (error, characteristic) => {
            if (error) {
              return;
            }
            if (!characteristic?.value) {
              return;
            }
            const bytes = base64ToBytes(characteristic.value);
            onFrame?.('rx', Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' '));
            deliver?.(bytes);
          },
        );
        if (!sub) {
          reject(new Error('monitorCharacteristicForService returned no subscription'));
          return;
        }
        resolve(sub);
      }),
      SUBSCRIBE_TIMEOUT_MS,
      'subscribe',
    );

    const enqueue = createCommandQueue();

    async function sendRaw(frameBytes: Uint8Array): Promise<H158SendOutcome<H158ParsedFrame>> {
      return enqueue(async () => {
        const write =
          device.writeCharacteristicWithoutResponseForService ??
          device.writeCharacteristicWithResponseForService;

        let resolveReply: ((frame: Uint8Array) => void) | undefined;
        const replyPromise = new Promise<Uint8Array>((resolve) => {
          resolveReply = resolve;
        });
        deliver = resolveReply;

        try {
          onFrame?.('tx', Array.from(frameBytes, (b) => b.toString(16).padStart(2, '0')).join(' '));
          await write.call(
            device,
            H158_SERVICE_UUID,
            H158_PIPE_CHARACTERISTIC_UUID,
            bytesToBase64(frameBytes),
          );

          let raceHandle: ReturnType<typeof setTimeout> | undefined;
          const timeout = new Promise<'timeout'>((resolve) => {
            raceHandle = setTimeout(() => resolve('timeout'), REPLY_TIMEOUT_MS);
          });
          const result = await Promise.race([replyPromise.then((bytes) => ({ bytes }) as const), timeout]);
          clearTimeout(raceHandle);

          if (result === 'timeout') {
            return { ok: false, reason: 'timeout' };
          }

          const decoded = decodeH158Frame(result.bytes);
          if (!decoded.ok) {
            return { ok: false, reason: 'malformedReply', detail: decoded.reason };
          }
          return { ok: true, value: decoded.frame, raw: decoded.frame };
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'unknown error';
          return { ok: false, reason: 'transport', detail };
        } finally {
          deliver = undefined;
        }
      });
    }

    const session: H158Session = {
      async readStatus() {
        const outcome = await sendRaw(terminalInfoCommand());
        if (!outcome.ok) {
          return outcome;
        }
        const parsed = parseH158StatusReply(outcome.value);
        if (!parsed.ok) {
          return { ok: false, reason: 'unparseable', detail: parsed.reason };
        }
        return { ok: true, value: parsed.status, raw: outcome.raw };
      },

      async setChildLock(locked: boolean) {
        const outcome = await sendRaw(childLockCommand(locked));
        if (!outcome.ok) {
          return outcome;
        }
        // The device replies to CHILD_LOCK with either a 1-byte command-echo
        // ack or a 3-byte status-shaped frame — see h158Protocol.ts's
        // parseH158StatusReply doc for why status is tried first.
        if (outcome.value.cmd === H158Command.CHILD_LOCK && outcome.value.data.length >= 3) {
          const status = parseH158StatusReply(outcome.value);
          if (status.ok) {
            return { ok: true, value: { locked: status.status.locked }, raw: outcome.raw };
          }
        }
        const ack = parseH158ChildLockAck(outcome.value);
        if (!ack.ok) {
          return { ok: false, reason: 'unparseable', detail: ack.reason };
        }
        return { ok: true, value: { locked: ack.ack.locked }, raw: outcome.raw };
      },

      dispose() {
        subscription.remove();
      },
    };

    return { ok: true, session, device };
  } catch (error) {
    if (error instanceof H158TimeoutError) {
      return { ok: false, reason: 'timeout', stage: error.stage };
    }
    const detail = error instanceof Error ? error.message : 'unknown error';
    return { ok: false, reason: 'transport', stage, detail };
  }
}
