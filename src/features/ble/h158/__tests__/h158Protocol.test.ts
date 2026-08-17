/**
 * H158/YP65-AT frame codec — ported vectors from the manufacturer's own
 * `BleProtocolTest.kt` (docs/hardware/manufacturer-supplied-2026-08-17/
 * H158-itronlib-sdk/itronlib/src/test/…/BleProtocolTest.kt) plus the two
 * worked examples from their written reply, so this codec is checked
 * against known-good data from both the SDK and the manufacturer directly,
 * not just against itself.
 */
import {
  ChildLockValue,
  H158Command,
  H158LockStateByte,
  H158SystemState,
  childLockCommand,
  decodeH158Frame,
  encodeH158Frame,
  h158SystemStateLabel,
  parseH158ChildLockAck,
  parseH158StatusReply,
  terminalInfoCommand,
  type H158ParsedFrame,
} from '../h158Protocol';

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

// ── encodeH158Frame ──────────────────────────────────────────────────────────

describe('encodeH158Frame', () => {
  test('head and tail — BleProtocolTest.kt "encodeFrame produces correct head and tail"', () => {
    const frame = encodeH158Frame(0xa1, bytes(0x78));
    expect(frame[0]).toBe(0x02);
    expect(frame[frame.length - 1]).toBe(0x01);
  });

  test('length for command with data — BleProtocolTest.kt "sets correct length for command with data"', () => {
    const frame = encodeH158Frame(0xa1, bytes(0x78));
    expect(frame[1]).toBe(2); // CMD(1) + DATA(1)
  });

  test('length for command without data — BleProtocolTest.kt "sets correct length for command without data"', () => {
    const frame = encodeH158Frame(0xa2);
    expect(frame[1]).toBe(1); // CMD(1) + DATA(0)
  });

  test('checksum is XOR from head through data — BleProtocolTest.kt "checksum is XOR from head through data"', () => {
    const frame = encodeH158Frame(0xa1, bytes(0x78));
    const expected = 0x02 ^ 0x02 ^ 0xa1 ^ 0x78;
    expect(frame[frame.length - 2]).toBe(expected);
  });

  test('null data produces the exact documented frame — BleProtocolTest.kt "with null data produces correct frame"', () => {
    const frame = encodeH158Frame(0xa2);
    const checksum = 0x02 ^ 0x01 ^ 0xa2;
    expect(Array.from(frame)).toEqual([0x02, 0x01, 0xa2, checksum, 0x01]);
  });

  test('terminalInfoCommand() matches the manufacturer\'s worked example: 02 01 A2 A1 01', () => {
    // manufacturer-reply-2026-08-17.md item 2 — 0x02^0x01^0xA2 = 0xA1.
    expect(Array.from(terminalInfoCommand())).toEqual([0x02, 0x01, 0xa2, 0xa1, 0x01]);
  });

  test('childLockCommand(true) matches the manufacturer\'s worked example: 02 02 A1 78 D9 01', () => {
    // manufacturer-reply-2026-08-17.md item 10 — 0x02^0x02^0xA1^0x78 = 0xD9.
    expect(Array.from(childLockCommand(true))).toEqual([0x02, 0x02, 0xa1, 0x78, 0xd9, 0x01]);
  });

  test('childLockCommand(false) uses the UNLOCK payload byte 0x87', () => {
    const frame = childLockCommand(false);
    expect(frame[2]).toBe(0xa1);
    expect(frame[3]).toBe(0x87);
  });
});

// ── decodeH158Frame ──────────────────────────────────────────────────────────

describe('decodeH158Frame', () => {
  test('parses a valid response frame — BleProtocolTest.kt "decodeFrame parses valid response frame correctly"', () => {
    // HEAD LEN(CMD+ACK+DATA) CMD ACK DATA CHECKSUM TAIL — CMD=0xA1 ACK=0x00 DATA=[0x78], LEN=3
    const checksum = 0x02 ^ 0x03 ^ 0xa1 ^ 0x00 ^ 0x78;
    const result = decodeH158Frame(bytes(0x02, 0x03, 0xa1, 0x00, 0x78, checksum, 0x01));
    expect(result).toEqual({
      ok: true,
      frame: { cmd: 0xa1, ack: 0x00, data: bytes(0x78) },
    });
  });

  test('parses a response with multiple data bytes — BleProtocolTest.kt "parses response with multiple data bytes"', () => {
    // CMD=0xA2 ACK=0x00 DATA=[0x31,0x00,0x50], LEN=5
    const checksum = 0x02 ^ 0x05 ^ 0xa2 ^ 0x00 ^ 0x31 ^ 0x00 ^ 0x50;
    const result = decodeH158Frame(bytes(0x02, 0x05, 0xa2, 0x00, 0x31, 0x00, 0x50, checksum, 0x01));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.frame.cmd).toBe(0xa2);
      expect(result.frame.ack).toBe(0x00);
      expect(Array.from(result.frame.data)).toEqual([0x31, 0x00, 0x50]);
    }
  });

  test('the manufacturer\'s own status worked example decodes: 02 01 A2 A1 01', () => {
    const result = decodeH158Frame(bytes(0x02, 0x01, 0xa2, 0xa1, 0x01));
    // LEN=1 → CMD only, no ACK/DATA bytes present at all (a request frame,
    // not a reply — included because it's the manufacturer's literal
    // written example, and decodeH158Frame must not crash on it).
    expect(result.ok).toBe(false);
  });

  test('rejects a frame with the wrong head — BleProtocolTest.kt "rejects frame with wrong head"', () => {
    const result = decodeH158Frame(bytes(0xaa, 0x03, 0xa1, 0x00, 0x78, 0x00, 0x01));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('invalid frame head') });
  });

  test('rejects a frame with the wrong tail — BleProtocolTest.kt "rejects frame with wrong tail"', () => {
    const result = decodeH158Frame(bytes(0x02, 0x03, 0xa1, 0x00, 0x78, 0x00, 0xaa));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('invalid frame tail') });
  });

  test('rejects a frame with the wrong checksum — BleProtocolTest.kt "rejects frame with wrong checksum"', () => {
    const result = decodeH158Frame(bytes(0x02, 0x03, 0xa1, 0x00, 0x78, 0xff, 0x01));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('checksum mismatch') });
  });

  test('rejects a frame that is too short — BleProtocolTest.kt "rejects frame that is too short"', () => {
    const result = decodeH158Frame(bytes(0x02, 0x01));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('frame too short') });
  });

  test('rejects a frame with a length mismatch — BleProtocolTest.kt "rejects frame with length mismatch"', () => {
    const result = decodeH158Frame(bytes(0x02, 0x04, 0xa1, 0x00, 0x78, 0x00, 0x01));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('frame length mismatch') });
  });
});

// ── parseH158ChildLockAck ────────────────────────────────────────────────────

describe('parseH158ChildLockAck', () => {
  test('parses the LOCK echo (0x78) — BleProtocolTest.kt "parseChildLockResponse parses locked state"', () => {
    const frame: H158ParsedFrame = { cmd: H158Command.CHILD_LOCK, ack: 0x00, data: bytes(0x78) };
    expect(parseH158ChildLockAck(frame)).toEqual({ ok: true, ack: { locked: true } });
  });

  test('parses the UNLOCK echo (0x87) — BleProtocolTest.kt "parseChildLockResponse parses unlocked state"', () => {
    const frame: H158ParsedFrame = { cmd: H158Command.CHILD_LOCK, ack: 0x00, data: bytes(0x87) };
    expect(parseH158ChildLockAck(frame)).toEqual({ ok: true, ack: { locked: false } });
  });

  test('does NOT use the status byte encoding (0x31/0x30) — only 0x78/0x87 count as locked/unlocked here', () => {
    // Regression guard: an earlier draft of this file mixed up the two
    // encodings — see h158Protocol.ts's doc on parseH158ChildLockAck.
    const frame: H158ParsedFrame = { cmd: H158Command.CHILD_LOCK, ack: 0x00, data: bytes(H158LockStateByte.LOCKED) };
    expect(parseH158ChildLockAck(frame)).toEqual({ ok: true, ack: { locked: false } });
  });

  test('rejects the wrong command — BleProtocolTest.kt "parseChildLockResponse rejects wrong command"', () => {
    const frame: H158ParsedFrame = { cmd: H158Command.TERMINAL_INFO, ack: 0x00, data: bytes(0x78) };
    expect(parseH158ChildLockAck(frame).ok).toBe(false);
  });

  test('rejects a non-zero ACK — BleProtocolTest.kt "parseChildLockResponse rejects non-zero ACK"', () => {
    const frame: H158ParsedFrame = { cmd: H158Command.CHILD_LOCK, ack: 0x01, data: bytes(0x78) };
    expect(parseH158ChildLockAck(frame).ok).toBe(false);
  });
});

// ── parseH158StatusReply ─────────────────────────────────────────────────────

describe('parseH158StatusReply', () => {
  test('locked, power on, 80% battery — BleProtocolTest.kt "parses locked, power on, 80% battery"', () => {
    const frame: H158ParsedFrame = { cmd: H158Command.TERMINAL_INFO, ack: 0x00, data: bytes(0x31, 0x00, 0x50) };
    const result = parseH158StatusReply(frame);
    expect(result).toEqual({
      ok: true,
      status: { locked: true, systemState: 0x00, systemStateLabel: 'Power On', batteryPercent: 80 },
    });
  });

  test('unlocked, heating, 50% battery — BleProtocolTest.kt "parses unlocked, heating, 50% battery"', () => {
    const frame: H158ParsedFrame = { cmd: H158Command.TERMINAL_INFO, ack: 0x00, data: bytes(0x30, 0x03, 0x32) };
    const result = parseH158StatusReply(frame);
    expect(result).toEqual({
      ok: true,
      status: { locked: false, systemState: 0x03, systemStateLabel: 'Heating', batteryPercent: 50 },
    });
  });

  test('accepts a status-shaped CMD 0xA1 reply (3+ data bytes) — BleConnectionManager.kt\'s undocumented quirk', () => {
    // BleProtocolTest.kt "accepts documented A1 response with three data bytes"
    const frame: H158ParsedFrame = { cmd: H158Command.CHILD_LOCK, ack: 0x00, data: bytes(0x31, 0x02, 0x64) };
    const result = parseH158StatusReply(frame);
    expect(result).toEqual({
      ok: true,
      status: { locked: true, systemState: 0x02, systemStateLabel: 'Preheating', batteryPercent: 100 },
    });
  });

  test('rejects a non-zero ACK — BleProtocolTest.kt "parseTerminalInfoResponse rejects non-zero ACK"', () => {
    const frame: H158ParsedFrame = { cmd: H158Command.TERMINAL_INFO, ack: 0x01, data: bytes(0x31, 0x00, 0x50) };
    expect(parseH158StatusReply(frame).ok).toBe(false);
  });

  test('rejects data too short — BleProtocolTest.kt "parseTerminalInfoResponse rejects data too short"', () => {
    const frame: H158ParsedFrame = { cmd: H158Command.TERMINAL_INFO, ack: 0x00, data: bytes(0x31) };
    expect(parseH158StatusReply(frame).ok).toBe(false);
  });

  test('rejects an unrelated command — BleProtocolTest.kt "parseTerminalInfoResponse rejects wrong command"', () => {
    const frame: H158ParsedFrame = { cmd: 0xa3, ack: 0x00, data: bytes(0x31, 0x00, 0x50) };
    expect(parseH158StatusReply(frame).ok).toBe(false);
  });

  test('a CHILD_LOCK reply with only 1 data byte is NOT status-shaped (falls to the ack parser instead)', () => {
    const frame: H158ParsedFrame = { cmd: H158Command.CHILD_LOCK, ack: 0x00, data: bytes(ChildLockValue.LOCK) };
    expect(parseH158StatusReply(frame).ok).toBe(false);
  });
});

// ── h158SystemStateLabel ─────────────────────────────────────────────────────

describe('h158SystemStateLabel', () => {
  test.each([
    [H158SystemState.POWER_ON, 'Power On'],
    [H158SystemState.POWER_OFF, 'Power Off'],
    [H158SystemState.PREHEAT, 'Preheating'],
    [H158SystemState.HEATING, 'Heating'],
  ])('0x%s → %s', (value, label) => {
    expect(h158SystemStateLabel(value)).toBe(label);
  });

  test('an undocumented value reports Unknown rather than throwing', () => {
    expect(h158SystemStateLabel(0xff)).toBe('Unknown');
  });
});
