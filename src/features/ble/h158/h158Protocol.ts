/**
 * H158 / YP65-AT protocol constants and frame codec — the real device.
 *
 * This is deliberately **not** protocol.ts. Spec §4 describes six custom
 * characteristics, an AES-128-CMAC challenge/response handshake, and
 * notification-driven lock state; the shipping H158 hardware has one
 * write-without-response+notify pipe (FFF1, sub-characteristic of service
 * FFF0), no authentication of any kind, and never pushes a state change
 * unprompted. Nothing here is a §4 constant, so nothing here belongs in
 * protocol.ts (a contested, append-only file for §4 alone) — see
 * docs/hardware/hqd-device-architecture.md and
 * docs/hardware/manufacturer-supplied-2026-08-17/MANIFEST.md for how this was
 * derived and what it means for the build.
 *
 * Every constant below cites either a manufacturer written-reply question
 * number (`reply Q<n>`, docs/hardware/manufacturer-supplied-2026-08-17/
 * manufacturer-reply-2026-08-17.md) or a file+line in the itronlib SDK they
 * shipped alongside it (docs/hardware/manufacturer-supplied-2026-08-17/
 * H158-itronlib-sdk/itronlib/…), in place of the §4.x citations protocol.ts
 * constants carry.
 *
 * Constants and a pure frame codec only — no I/O, no timers. That belongs to
 * h158Session.ts, same split as protocol.ts vs commands.ts/auth.ts.
 */

import { readUint8 } from '../byteLayout';

// ── service / characteristic ────────────────────────────────────────────────

// BleSdkConfig.kt:19 — "YP65-AT real UUID (LightBlue-verified)".
export const H158_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';

// BleSdkConfig.kt:20-21 — write and notify are the SAME characteristic. The
// module exposes FFF1-FFF5 as five generic pipes (module spec v1.3); the
// H158 firmware only ever uses FFF1 for both directions (reply Q1).
export const H158_PIPE_CHARACTERISTIC_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';

// reply Q4 — identical on every unit; there is no per-device name to filter
// on beyond this prefix. reply Q5 / module spec — the device advertises its
// name in the scan response, NOT the FFF0 service UUID, so scanning must
// filter by name, not by service (unlike scanner.ts's §4.1 radio-level UUID
// filter for the spec device).
export const H158_DEVICE_NAME_PREFIX = 'YP65-AT';

// ── frame constants ──────────────────────────────────────────────────────────

// BleProtocol.kt:27-28.
export const H158_FRAME_HEAD = 0x02;
export const H158_FRAME_TAIL = 0x01;

/**
 * Command frame: `HEAD | LEN | CMD | DATA… | XOR | TAIL`.
 * Reply frame:   `HEAD | LEN | CMD | ACK | DATA… | XOR | TAIL`.
 *
 * `LEN` counts every byte between itself and the checksum inclusive of CMD
 * (and ACK, on a reply) — BleProtocol.kt:45,71-73.
 *
 * The checksum is XOR **from the header**, not just over the payload:
 * `HEAD ^ LEN ^ CMD ^ DATA…` — BleProtocol.kt:57, confirmed against the
 * manufacturer's own worked examples (manufacturer-reply-2026-08-17.md):
 *   Read Status `02 01 A2 A1 01`     → 0x02^0x01^0xA2 = 0xA1 ✓
 *   Lock        `02 02 A1 78 D9 01`  → 0x02^0x02^0xA1^0x78 = 0xD9 ✓
 * Their written answer to item 10 confirmed a payload-only reading, which
 * these two examples disprove — the SDK source is authoritative here, not
 * the written reply. See MANIFEST.md §4.
 */
export const H158Command = {
  CHILD_LOCK: 0xa1, // BleProtocol.kt:30 — lock/unlock command AND status echo (see parseStatusReply)
  TERMINAL_INFO: 0xa2, // BleProtocol.kt:31 — read status
} as const;
export type H158Command = (typeof H158Command)[keyof typeof H158Command];

export const H158Ack = {
  SUCCESS: 0x00, // BleProtocol.kt:33
} as const;

// BleProtocol.kt:35-36 — CHILD_LOCK command payload.
export const ChildLockValue = {
  LOCK: 0x78,
  UNLOCK: 0x87,
} as const;

// BleProtocol.kt:38-39 — first byte of a TERMINAL_INFO (and CHILD_LOCK-as-status,
// see parseStatusReply) reply's DATA. The written reply (item 2) gave both
// values without saying which is which; the SDK settles it.
export const H158LockStateByte = {
  LOCKED: 0x31,
  UNLOCKED: 0x30,
} as const;

// BleModels.kt:31-43 — second byte of a status reply's DATA.
export const H158SystemState = {
  POWER_ON: 0x00,
  POWER_OFF: 0x01,
  PREHEAT: 0x02,
  HEATING: 0x03,
} as const;
export type H158SystemState = (typeof H158SystemState)[keyof typeof H158SystemState];

const SYSTEM_STATE_LABELS: Record<number, string> = {
  [H158SystemState.POWER_ON]: 'Power On',
  [H158SystemState.POWER_OFF]: 'Power Off',
  [H158SystemState.PREHEAT]: 'Preheating',
  [H158SystemState.HEATING]: 'Heating',
};

export function h158SystemStateLabel(value: number): string {
  return SYSTEM_STATE_LABELS[value] ?? 'Unknown';
}

// ── frame encoding ───────────────────────────────────────────────────────────

function xorFromHeader(bytes: Uint8Array, endExclusive: number): number {
  let checksum = 0;
  for (let i = 0; i < endExclusive; i += 1) {
    checksum ^= bytes[i];
  }
  return checksum & 0xff;
}

/** BleProtocol.kt:43-62 — encode a command frame. `data` defaults to empty. */
export function encodeH158Frame(cmd: number, data?: Uint8Array): Uint8Array {
  const payload = data ?? new Uint8Array(0);
  const length = 1 + payload.length; // CMD + DATA
  const total = 2 + length + 1 + 1; // HEAD + LEN + (CMD + DATA) + CHECKSUM + TAIL
  const frame = new Uint8Array(total);

  let offset = 0;
  frame[offset] = H158_FRAME_HEAD;
  offset += 1;
  frame[offset] = length & 0xff;
  offset += 1;
  frame[offset] = cmd & 0xff;
  offset += 1;
  frame.set(payload, offset);
  offset += payload.length;

  frame[offset] = xorFromHeader(frame, offset);
  offset += 1;
  frame[offset] = H158_FRAME_TAIL;

  return frame;
}

export interface H158ParsedFrame {
  cmd: number;
  ack: number;
  data: Uint8Array;
}

export type H158DecodeResult =
  | { ok: true; frame: H158ParsedFrame }
  | { ok: false; reason: string };

/**
 * BleProtocol.kt:66-89 — decode a reply frame. Never throws (module
 * convention shared with protocol.ts's callers): every rejection reason is a
 * typed string, because the manufacturer confirmed (reply Q12) that a
 * malformed frame from the DEVICE never happens — the device stays silent
 * instead — so a decode failure here only ever means our own framing
 * assumption was wrong, not something to recover from mid-parse.
 */
export function decodeH158Frame(bytes: Uint8Array): H158DecodeResult {
  if (bytes.length < 5) {
    return { ok: false, reason: `frame too short: need at least 5 bytes, got ${bytes.length}` };
  }
  if (readUint8(bytes, 0) !== H158_FRAME_HEAD) {
    return { ok: false, reason: `invalid frame head: 0x${bytes[0].toString(16)}` };
  }
  if (bytes[bytes.length - 1] !== H158_FRAME_TAIL) {
    return { ok: false, reason: `invalid frame tail: 0x${bytes[bytes.length - 1].toString(16)}` };
  }

  const length = readUint8(bytes, 1);
  if (length < 2) {
    return { ok: false, reason: `frame length too short: need CMD and ACK, got ${length}` };
  }
  if (bytes.length !== 2 + length + 1 + 1) {
    return {
      ok: false,
      reason: `frame length mismatch: header says ${length} payload bytes, actual size ${bytes.length}`,
    };
  }

  const checksumOffset = 2 + length;
  const expectedChecksum = xorFromHeader(bytes, checksumOffset);
  const actualChecksum = readUint8(bytes, checksumOffset);
  if (expectedChecksum !== actualChecksum) {
    return {
      ok: false,
      reason: `checksum mismatch: expected 0x${expectedChecksum.toString(16)}, got 0x${actualChecksum.toString(16)}`,
    };
  }

  const cmd = readUint8(bytes, 2);
  const ack = readUint8(bytes, 3);
  const data = length > 2 ? bytes.slice(4, 2 + length) : new Uint8Array(0);

  return { ok: true, frame: { cmd, ack, data } };
}

// ── command builders ─────────────────────────────────────────────────────────

export function childLockCommand(lock: boolean): Uint8Array {
  return encodeH158Frame(
    H158Command.CHILD_LOCK,
    Uint8Array.of(lock ? ChildLockValue.LOCK : ChildLockValue.UNLOCK),
  );
}

export function terminalInfoCommand(): Uint8Array {
  return encodeH158Frame(H158Command.TERMINAL_INFO);
}

// ── response parsing ─────────────────────────────────────────────────────────

export interface H158Status {
  locked: boolean;
  systemState: number;
  systemStateLabel: string;
  batteryPercent: number;
}

export type H158StatusParseResult =
  | { ok: true; status: H158Status }
  | { ok: false; reason: string };

/**
 * BleConnectionManager.kt:346-361 — a status reply arrives under CMD
 * TERMINAL_INFO (0xA2) as documented, but ALSO under CMD CHILD_LOCK (0xA1)
 * whenever that reply's DATA carries 3+ bytes rather than the expected
 * single lock-value byte. This is undocumented in the written reply and
 * only visible in the SDK; replicated here rather than treated as
 * malformed, matching the manufacturer's own demo.
 */
export function parseH158StatusReply(frame: H158ParsedFrame): H158StatusParseResult {
  const isStatusShaped =
    frame.cmd === H158Command.TERMINAL_INFO ||
    (frame.cmd === H158Command.CHILD_LOCK && frame.data.length >= 3);
  if (!isStatusShaped) {
    return { ok: false, reason: `not a status-shaped reply: cmd=0x${frame.cmd.toString(16)}` };
  }
  if (frame.ack !== H158Ack.SUCCESS) {
    return { ok: false, reason: `status reply ACK=0x${frame.ack.toString(16)}, expected 0x00` };
  }
  if (frame.data.length < 3) {
    return { ok: false, reason: `status data too short: ${frame.data.length} bytes, need at least 3` };
  }

  const lockByte = readUint8(frame.data, 0);
  const systemState = readUint8(frame.data, 1);
  const batteryPercent = readUint8(frame.data, 2);

  return {
    ok: true,
    status: {
      locked: lockByte === H158LockStateByte.LOCKED,
      systemState,
      systemStateLabel: h158SystemStateLabel(systemState),
      batteryPercent,
    },
  };
}

export interface H158ChildLockAck {
  locked: boolean;
}

export type H158ChildLockAckParseResult =
  | { ok: true; ack: H158ChildLockAck }
  | { ok: false; reason: string };

/**
 * The ordinary CHILD_LOCK reply shape: a single byte echoing the COMMAND
 * encoding (`ChildLockValue.LOCK`/`UNLOCK`, i.e. 0x78/0x87) — NOT the status
 * encoding (`H158LockStateByte`, 0x31/0x30) used by parseH158StatusReply.
 * BleProtocol.kt:101-107 confirms it checks against `CHILD_LOCK_LOCKED`
 * (0x78), the command constant, not `TERM_INFO_LOCKED`. Distinct from the
 * 3-byte status-shaped case above — callers should try parseH158StatusReply
 * first when cmd is CHILD_LOCK, and fall back to this for the 1-byte ack
 * shape.
 */
export function parseH158ChildLockAck(frame: H158ParsedFrame): H158ChildLockAckParseResult {
  if (frame.cmd !== H158Command.CHILD_LOCK) {
    return { ok: false, reason: `expected CMD 0xA1, got 0x${frame.cmd.toString(16)}` };
  }
  if (frame.ack !== H158Ack.SUCCESS) {
    return { ok: false, reason: `child lock reply ACK=0x${frame.ack.toString(16)}, expected 0x00` };
  }
  if (frame.data.length === 0) {
    return { ok: false, reason: 'child lock reply has no data' };
  }

  return { ok: true, ack: { locked: readUint8(frame.data, 0) === ChildLockValue.LOCK } };
}

// ── operational constants — not device protocol, app-level timing ──────────

// reply Q14 — minimum gap between two consecutive AT commands.
export const H158_MIN_COMMAND_GAP_MS = 20;
