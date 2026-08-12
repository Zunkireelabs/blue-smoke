/**
 * HQD application-layer framing, carried as payload bytes over the YP65
 * passthrough pipe (`protocol.ts`, YP65 section).
 *
 * ── Provenance, and why this file is careful ────────────────────────────────
 *
 * The manufacturer was asked for "the lock/unlock command — byte layout and
 * response format" (question 6, 2026-08-12). They answered with three example
 * frames and their checksums, and said nothing about field names, nothing about
 * responses, and nothing about error cases:
 *
 *     Lock         02 02 A1 78 D9 01     0x02^0x02^0xA1^0x78 = 0xD9
 *     Unlock       02 02 A1 87 26 01     0x02^0x02^0xA1^0x87 = 0x26
 *     Read status  02 01 A2    A1 01     0x02^0x01^0xA2      = 0xA1
 *
 * So the three frames themselves are FACTS — they are quoted verbatim from the
 * vendor and their checksums verify. The *structure* below is an INFERENCE
 * drawn from three samples. That distinction is the whole design of this file:
 *
 *   - `HQD_FRAMES` holds the three known-good frames as literal bytes. Anything
 *     that must go on a wire to a real device uses these. They cannot be wrong.
 *   - `encodeHqdFrame` implements the inferred general structure, and exists so
 *     we can (a) prove the inference reproduces all three vendor frames exactly,
 *     and (b) build further commands the moment the vendor documents them.
 *
 * If bring-up shows the structure is wrong, `HQD_FRAMES` still works and only
 * the encoder changes. Getting that the wrong way round — deriving the three
 * real frames from a guessed encoder — is how a silent protocol bug ships.
 *
 * ── The inferred structure ──────────────────────────────────────────────────
 *
 *     02   | LEN  | CMD [ARG...] | XOR                 | 01
 *     STX  | n    | payload      | over STX..payload   | ETX
 *
 * `LEN` counts payload bytes only (lock: A1 78 → 2; read status: A2 → 1).
 * `XOR` covers STX, LEN and every payload byte — verified against all three.
 *
 * Corroborating detail, not proof: the lock and unlock arguments 0x78 and 0x87
 * are one's complements of each other (0x78 ^ 0xFF === 0x87), i.e. eight bits
 * apart. That is a deliberate choice — no single bit flip can turn a lock into
 * an unlock — and it is what you would expect of a real field rather than an
 * arbitrary opcode.
 *
 * 🔴 NOT IMPLEMENTED: response decoding. The vendor documented no response
 * format, so we do not know what a lock acknowledgement or a status reply looks
 * like. Guessing a decoder would produce confident nonsense. `decodeHqdFrame`
 * deliberately only validates framing and hands back the raw payload; deciding
 * what the payload MEANS waits on hardware or on the vendor.
 */

/** Start-of-frame byte. Inferred — constant across all three vendor samples. */
export const HQD_STX = 0x02;

/** End-of-frame byte. Inferred — constant across all three vendor samples. */
export const HQD_ETX = 0x01;

/**
 * The command byte, as far as three samples reveal. `0xA1` takes a one-byte
 * argument selecting lock vs unlock; `0xA2` takes none.
 *
 * Note these do NOT reconcile with HQD's earlier SDK document, which described
 * commands `0x01` (readDeviceInfo) and `0x02` (setRecordState). Two documents
 * from the same vendor, two command spaces, unreconciled — recorded here rather
 * than quietly resolved in favour of whichever we saw last.
 */
export const HqdCommand = {
  SET_LOCK: 0xa1,
  READ_STATUS: 0xa2,
} as const;
export type HqdCommand = (typeof HqdCommand)[keyof typeof HqdCommand];

/** Argument to `HqdCommand.SET_LOCK`. The two values are one's complements. */
export const HqdLockArg = {
  LOCK: 0x78,
  UNLOCK: 0x87,
} as const;
export type HqdLockArg = (typeof HqdLockArg)[keyof typeof HqdLockArg];

/**
 * XOR checksum over every byte from STX up to and including the payload.
 *
 * Exported for tests: the vendor published the expected checksum for each of
 * the three frames, so this is directly verifiable against their arithmetic
 * rather than only against our own encoder.
 */
export function hqdChecksum(bytes: readonly number[]): number {
  return bytes.reduce((acc, byte) => acc ^ byte, 0);
}

/**
 * Build a frame from a command and its arguments, per the inferred structure.
 *
 * Throws on a byte outside 0x00-0xFF rather than silently truncating: a payload
 * that has been masked down to fit is a frame that will be rejected by the
 * device for reasons no log will explain.
 */
export function encodeHqdFrame(command: HqdCommand, args: readonly number[] = []): Uint8Array {
  for (const byte of args) {
    if (!Number.isInteger(byte) || byte < 0x00 || byte > 0xff) {
      throw new RangeError(`encodeHqdFrame: argument ${byte} is not a byte`);
    }
  }

  const payload = [command, ...args];
  const header = [HQD_STX, payload.length];
  return Uint8Array.from([...header, ...payload, hqdChecksum([...header, ...payload]), HQD_ETX]);
}

/**
 * The three frames the manufacturer supplied verbatim, as literal bytes.
 *
 * These are the ONLY frames known to be real. Prefer them over calling the
 * encoder anywhere the bytes actually reach a device — the encoder's job is to
 * be checked against these, not to replace them.
 */
export const HQD_FRAMES = {
  lock: Uint8Array.from([0x02, 0x02, 0xa1, 0x78, 0xd9, 0x01]),
  unlock: Uint8Array.from([0x02, 0x02, 0xa1, 0x87, 0x26, 0x01]),
  readStatus: Uint8Array.from([0x02, 0x01, 0xa2, 0xa1, 0x01]),
} as const;

/** Why a received buffer was not a well-formed frame. */
export type HqdDecodeError =
  | 'too-short'
  | 'bad-stx'
  | 'bad-etx'
  | 'length-mismatch'
  | 'bad-checksum';

export type HqdDecodeResult =
  | { ok: true; payload: Uint8Array }
  | { ok: false; error: HqdDecodeError };

/**
 * Validate framing on a received buffer and return its payload.
 *
 * A typed result rather than a throw, matching this module's convention that
 * nothing crosses a public boundary as a raw error — a malformed frame from a
 * device is an expected condition, not an exception.
 *
 * This does NOT interpret the payload. See the header note: the vendor has not
 * documented any response, so there is nothing here that could honestly claim
 * to know what the bytes mean.
 */
export function decodeHqdFrame(frame: Uint8Array): HqdDecodeResult {
  // STX + LEN + at least one payload byte + XOR + ETX
  if (frame.length < 5) {
    return { ok: false, error: 'too-short' };
  }
  if (frame[0] !== HQD_STX) {
    return { ok: false, error: 'bad-stx' };
  }
  if (frame[frame.length - 1] !== HQD_ETX) {
    return { ok: false, error: 'bad-etx' };
  }

  const declaredLength = frame[1];
  // Total = STX + LEN + payload + XOR + ETX
  if (frame.length !== declaredLength + 4) {
    return { ok: false, error: 'length-mismatch' };
  }

  const checksummed = Array.from(frame.subarray(0, 2 + declaredLength));
  if (hqdChecksum(checksummed) !== frame[frame.length - 2]) {
    return { ok: false, error: 'bad-checksum' };
  }

  return { ok: true, payload: frame.subarray(2, 2 + declaredLength) };
}
