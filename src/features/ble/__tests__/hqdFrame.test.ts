/**
 * The load-bearing test here is the first one: it checks our inferred frame
 * structure against the three frames and three checksums the manufacturer
 * published (2026-08-12, answer 6). If the inference is wrong, that test fails
 * — which is the point of encoding a guess as code rather than as a comment.
 */
import {
  HQD_ETX,
  HQD_FRAMES,
  HQD_STX,
  HqdCommand,
  HqdLockArg,
  decodeHqdFrame,
  encodeHqdFrame,
  hqdChecksum,
} from '../hqdFrame';

const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');

describe('HQD framing — against the manufacturer’s published frames', () => {
  test('the encoder reproduces all three vendor frames byte for byte', () => {
    expect(hex(encodeHqdFrame(HqdCommand.SET_LOCK, [HqdLockArg.LOCK]))).toBe(
      hex(HQD_FRAMES.lock),
    );
    expect(hex(encodeHqdFrame(HqdCommand.SET_LOCK, [HqdLockArg.UNLOCK]))).toBe(
      hex(HQD_FRAMES.unlock),
    );
    expect(hex(encodeHqdFrame(HqdCommand.READ_STATUS))).toBe(hex(HQD_FRAMES.readStatus));
  });

  test('the checksums match the arithmetic the manufacturer showed their working for', () => {
    // 0x02 ^ 0x02 ^ 0xA1 ^ 0x78 = 0xD9
    expect(hqdChecksum([0x02, 0x02, 0xa1, 0x78])).toBe(0xd9);
    // 0x02 ^ 0x02 ^ 0xA1 ^ 0x87 = 0x26
    expect(hqdChecksum([0x02, 0x02, 0xa1, 0x87])).toBe(0x26);
    // 0x02 ^ 0x01 ^ 0xA2 = 0xA1
    expect(hqdChecksum([0x02, 0x01, 0xa2])).toBe(0xa1);
  });

  test('lock and unlock arguments are one’s complements — no single bit flip crosses them', () => {
    expect(HqdLockArg.LOCK ^ 0xff).toBe(HqdLockArg.UNLOCK);
  });

  test('the literal frames are not silently derived from the encoder', () => {
    // Guards the design note in hqdFrame.ts: HQD_FRAMES must stay hand-written
    // vendor bytes, so a wrong encoder cannot quietly rewrite what we transmit.
    expect(HQD_FRAMES.unlock).toEqual(Uint8Array.from([0x02, 0x02, 0xa1, 0x87, 0x26, 0x01]));
    expect(HQD_FRAMES.lock[0]).toBe(HQD_STX);
    expect(HQD_FRAMES.lock[HQD_FRAMES.lock.length - 1]).toBe(HQD_ETX);
  });
});

describe('encodeHqdFrame — argument validation', () => {
  test('rejects a non-byte argument rather than truncating it', () => {
    expect(() => encodeHqdFrame(HqdCommand.SET_LOCK, [0x100])).toThrow(RangeError);
    expect(() => encodeHqdFrame(HqdCommand.SET_LOCK, [-1])).toThrow(RangeError);
    expect(() => encodeHqdFrame(HqdCommand.SET_LOCK, [1.5])).toThrow(RangeError);
  });

  test('LEN counts payload bytes only, so it tracks argument count', () => {
    expect(encodeHqdFrame(HqdCommand.READ_STATUS)[1]).toBe(1);
    expect(encodeHqdFrame(HqdCommand.SET_LOCK, [HqdLockArg.LOCK])[1]).toBe(2);
    expect(encodeHqdFrame(HqdCommand.SET_LOCK, [0x01, 0x02, 0x03])[1]).toBe(4);
  });
});

describe('decodeHqdFrame', () => {
  test('round-trips every frame the encoder produces', () => {
    const frame = encodeHqdFrame(HqdCommand.SET_LOCK, [HqdLockArg.UNLOCK]);
    const result = decodeHqdFrame(frame);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect([...result.payload]).toEqual([HqdCommand.SET_LOCK, HqdLockArg.UNLOCK]);
    }
  });

  test('accepts the vendor’s literal frames', () => {
    for (const frame of Object.values(HQD_FRAMES)) {
      expect(decodeHqdFrame(frame).ok).toBe(true);
    }
  });

  test.each([
    ['too-short', Uint8Array.from([0x02, 0x01, 0xa2, 0x01])],
    ['bad-stx', Uint8Array.from([0x03, 0x01, 0xa2, 0xa0, 0x01])],
    ['bad-etx', Uint8Array.from([0x02, 0x01, 0xa2, 0xa1, 0x02])],
    ['length-mismatch', Uint8Array.from([0x02, 0x05, 0xa2, 0xa1, 0x01])],
    ['bad-checksum', Uint8Array.from([0x02, 0x01, 0xa2, 0x00, 0x01])],
  ])('reports %s as a typed result rather than throwing', (expected, frame) => {
    const result = decodeHqdFrame(frame);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(expected);
    }
  });

  test('a corrupted checksum is caught rather than passed upstream', () => {
    const frame = Uint8Array.from(HQD_FRAMES.unlock);
    frame[4] ^= 0xff;

    expect(decodeHqdFrame(frame)).toEqual({ ok: false, error: 'bad-checksum' });
  });
});
