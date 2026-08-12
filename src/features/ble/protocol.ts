/**
 * BLE protocol constants — spec §4.
 *
 * The single home for every §4 UUID, byte offset, command ID, and result code.
 * CLAUDE.md marks this a contested shared file: append only, never rewrite an
 * existing entry. No magic bytes anywhere else in the codebase — every §4
 * constant is imported from here.
 *
 * Constants only. No CMAC/HKDF implementation, no encoding functions, no I/O —
 * that belongs to commands.ts / auth.ts (P1-4.0, P3-2.0).
 *
 * All multi-byte integers are little-endian (spec §4.2).
 */

// ── §4 — protocol version ───────────────────────────────────────────────────

// §4 — NOT yet frozen. The freeze is milestone M2 (Day 6), after the firmware team's spec
// review (OQ-6). Until then §4 may be corrected in place at 0x01. After M2, any §4 change
// requires bumping this value and notifying the firmware team in writing.
export const PROTOCOL_VERSION = 0x01;

// ── §4.2 — byte order ────────────────────────────────────────────────────────

export const BYTE_ORDER = 'little-endian'; // §4.2 — all multi-byte integers

// ── §4.2 — service and characteristics ──────────────────────────────────────

// 🔴 SUPERSEDED BY REAL HARDWARE — do not use for anything that talks to a physical device.
// This value was invented at spec-writing time (commit 0bb8e80, 2026-08-05) and never
// confirmed against silicon. The client's BLE SoC (YC1012/YC8612) runs stock YP65-AT
// passthrough firmware whose GATT table is fixed and cannot be redefined by us — see
// YP65_SERVICE_UUID below. Kept because tools/mock-peripheral and its ~600 tests model the
// §4 GATT layout and still use it; retiring that is a separate, larger change. Anything
// aimed at real hardware (or at a phone standing in for it) must use the YP65 constants.
export const BLE_SERVICE_UUID = '42530001-1E5B-4A9C-9D3F-7C6E1B2A5D80'; // §4.2

export const BLE_CHARACTERISTIC_UUIDS = {
  deviceInfo: '42530002-1E5B-4A9C-9D3F-7C6E1B2A5D80', // §4.2 C1 — Read, 20B
  authChallenge: '42530003-1E5B-4A9C-9D3F-7C6E1B2A5D80', // §4.2 C2 — Read, Notify, 16B
  authResponse: '42530004-1E5B-4A9C-9D3F-7C6E1B2A5D80', // §4.2 C3 — Write w/ response, 20B
  lockState: '42530005-1E5B-4A9C-9D3F-7C6E1B2A5D80', // §4.2 C4 — Read, Notify, 8B
  lockCommand: '42530006-1E5B-4A9C-9D3F-7C6E1B2A5D80', // §4.2 C5 — Write w/ response, 20B
  commandResult: '42530007-1E5B-4A9C-9D3F-7C6E1B2A5D80', // §4.2 C6 — Read, Notify, 4B
} as const;

export const CHARACTERISTIC_LENGTH_BYTES = {
  deviceInfo: 20, // §4.2 C1
  authChallenge: 16, // §4.2 C2
  authResponse: 20, // §4.2 C3
  lockState: 8, // §4.2 C4
  lockCommand: 20, // §4.2 C5
  commandResult: 4, // §4.2 C6
} as const;

// ── §4.1 — advertising ───────────────────────────────────────────────────────

export const ADVERTISING_SERVICE_UUID_AD_TYPE = 0x07; // §4.1 — service UUID carried in AD type 0x07
export const ADVERTISING_LOCAL_NAME_PREFIX = 'BlueSmoke-'; // §4.1 — suffixed with last 4 hex of deviceUid
export const ADVERTISING_MANUFACTURER_DATA_LENGTH_BYTES = 4; // §4.1 — [protocolVersion | stateHint | battery | flags]

export const ADVERTISING_MANUFACTURER_DATA_OFFSETS = {
  protocolVersion: 0, // §4.1
  stateHint: 1, // §4.1
  battery: 2, // §4.1
  flags: 3, // §4.1
} as const;

// ── §4.3 — deviceInfo layout ─────────────────────────────────────────────────

export const DEVICE_INFO_LAYOUT = {
  protocolVersion: { offset: 0, length: 1 }, // §4.3
  hwRevision: { offset: 1, length: 1 }, // §4.3
  fwVersion: { offset: 2, length: 2 }, // §4.3 — (major, minor)
  deviceUid: { offset: 4, length: 12 }, // §4.3
  provisioningState: { offset: 16, length: 1 }, // §4.3
  keyGeneration: { offset: 17, length: 1 }, // §4.3
  reserved: { offset: 18, length: 2 }, // §4.3
} as const;

export const ProvisioningState = {
  UNPROVISIONED: 0, // §4.3
  PROVISIONED: 1, // §4.3
  ACTIVATED: 2, // §4.3
} as const;
export type ProvisioningState =
  (typeof ProvisioningState)[keyof typeof ProvisioningState];

// ── §4.4 — lockState layout ──────────────────────────────────────────────────

export const LOCK_STATE_LAYOUT = {
  state: { offset: 0, length: 1 }, // §4.4
  flags: { offset: 1, length: 1 }, // §4.4
  batteryPercent: { offset: 2, length: 1 }, // §4.4
  lastLockReason: { offset: 3, length: 1 }, // §4.4
  secondsSinceStateChange: { offset: 4, length: 2 }, // §4.4 — uint16, saturates at 0xFFFF
  protocolVersion: { offset: 6, length: 1 }, // §4.4
  reserved: { offset: 7, length: 1 }, // §4.4
} as const;

export const LockState = {
  LOCKED: 0, // §4.4
  UNLOCKED: 1, // §4.4
  LOCKED_PENDING_ACTIVATION: 2, // §4.4
  FAULT: 3, // §4.4
} as const;
export type LockState = (typeof LockState)[keyof typeof LockState];

/** §4.4 — bit indices into the `lockState.flags` byte. */
export const LockStateFlagBit = {
  AUTHENTICATED_SESSION_ACTIVE: 0, // §4.4
  CHARGING: 1, // §4.4
  LOW_BATTERY: 2, // §4.4 — <15%
  DEAD_MAN_TIMER_ARMED: 3, // §4.4
  SESSION_EXPIRED: 4, // §4.4
} as const;
export type LockStateFlagBit =
  (typeof LockStateFlagBit)[keyof typeof LockStateFlagBit];

export const BATTERY_PERCENT_UNKNOWN = 0xff; // §4.4 — batteryPercent is 0–100, 0xFF = unknown

export const LockReason = {
  USER_COMMAND: 0, // §4.4
  RANGE_LOSS_DEAD_MAN: 1, // §4.4
  SESSION_EXPIRY: 2, // §4.4
  POWER_ON_DEFAULT: 3, // §4.4
  FAULT_WATCHDOG: 4, // §4.4
  REVOKED: 5, // §4.4
} as const;
export type LockReason = (typeof LockReason)[keyof typeof LockReason];

export const SECONDS_SINCE_STATE_CHANGE_SATURATION = 0xffff; // §4.4 — uint16 saturation value

// ── §4.5 — auth handshake constants ─────────────────────────────────────────

export const AUTH_NONCE_LENGTH_BYTES = 16; // §4.5 — single-use
export const AUTH_NONCE_TTL_MS = 30_000; // §4.5 — invalidated after one use or 30s

export const AUTH_PROOF_LENGTH_BYTES = 16; // §4.5 — AES-128-CMAC(K_sess, ...) truncated to 16B
// §4.5 — proof = CMAC(K_sess, 0x01 ‖ protocolVersion ‖ N ‖ session_id[0..3] ‖ expiresAtDelta).
// expiresAtDelta is inside the CMAC input: it sets sessionExpiry device-side, so an
// unauthenticated copy would let a compromised app self-extend to SESSION_EXPIRY_MAX_DAYS.
export const AUTH_PROOF_FIXED_PREFIX = 0x01;

// §4.5 (v1.4) — byte 0 of both authResponse frames is frameIndex, making each frame
// self-describing on the wire (F12). Deliberately NOT part of the proof CMAC: it is
// framing, not a security parameter — forging it without K_sess achieves nothing beyond
// a handshake reset.
export const AuthResponseFrameIndex = {
  FRAME_1: 0x01, // §4.5 (v1.4)
  FRAME_2: 0x02, // §4.5 (v1.4)
} as const;
export type AuthResponseFrameIndex =
  (typeof AuthResponseFrameIndex)[keyof typeof AuthResponseFrameIndex];

/** §4.5 (v1.4) — written to C3 (authResponse) first. Identified by frameIndex, not position (F12). */
export const AUTH_RESPONSE_FRAME_1_LAYOUT = {
  frameIndex: { offset: 0, length: 1 }, // §4.5 (v1.4) — must be AuthResponseFrameIndex.FRAME_1
  sessionId: { offset: 1, length: 16 }, // §4.5
  keyGeneration: { offset: 17, length: 1 }, // §4.5
  reserved: { offset: 18, length: 2 }, // §4.5 (v1.4) — narrowed from 3B to free byte 0 for frameIndex
} as const;

/** §4.5 (v1.4) — written to C3 (authResponse) second. Identified by frameIndex, not position (F12). */
export const AUTH_RESPONSE_FRAME_2_LAYOUT = {
  frameIndex: { offset: 0, length: 1 }, // §4.5 (v1.4) — must be AuthResponseFrameIndex.FRAME_2
  proof: { offset: 1, length: 16 }, // §4.5
  expiresAtDelta: { offset: 17, length: 3 }, // §4.5 (v1.4) — uint24 LE, narrowed from uint32
} as const;

// §4.5 — K_sess = HKDF(ikm = K_dev, salt = session_id, info = AUTH_HKDF_INFO ‖ keyGeneration).
// Every input is either burned into the device (K_dev) or sent in authResponse frame 1.
// Do NOT add user_id or an absolute expires_at to `info`: the device is offline, has no wall
// clock, and is never told either — binding them makes K_sess underivable device-side.
export const AUTH_HKDF_INFO = 'bluesmoke-session-v1';
export const SESSION_EXPIRY_MAX_DAYS = 90; // §4.5 — hard cap on session expiry

// §4.5 — sentinel commandId a handshake result is written under (tools/mock-peripheral's
// deviceCore.ts HANDSHAKE_COMMAND_ID_SENTINEL). Unused by any real command (§4.6); §4.5's prose
// only documents this for the failure case, but the mock writes it symmetrically on success too
// (ResultCode.OK) — see deviceCore.ts evaluateHandshake() — and that symmetry is what the app
// relies on to know a handshake actually succeeded, so it's normative for this app, not a guess.
export const HANDSHAKE_RESULT_COMMAND_ID = 0x00;

// ── §4.6 — lockCommand layout ────────────────────────────────────────────────

export const LOCK_COMMAND_LAYOUT = {
  commandId: { offset: 0, length: 1 }, // §4.6
  counter: { offset: 1, length: 4 }, // §4.6 — uint32, strictly increasing
  payload: { offset: 5, length: 7 }, // §4.6 — zero-padded
  // §4.6 — first 8B of AES-128-CMAC(K_sess, N ‖ bytes[0..11]), where N is THIS connection's
  // authChallenge nonce. N is not carried in the frame (both sides hold it), so the frame
  // stays 20B. Binding N scopes the tag to one connection, which is what stops a command
  // captured in an earlier session from replaying — the counter alone cannot (it resets).
  tag: { offset: 12, length: 8 },
} as const;

export const CommandId = {
  LOCK: 0x01, // §4.6
  UNLOCK: 0x02, // §4.6
  ACTIVATE: 0x03, // §4.6 — payload: activationNonce (4B)
  SET_AUTOLOCK_GRACE: 0x04, // §4.6 — payload: graceMs (uint16)
  END_SESSION: 0x05, // §4.6
  FACTORY_UNPAIR: 0x06, // §4.6 — payload: confirm (4B) = 0xDEADBEEF
  PING: 0x07, // §4.6
} as const;
export type CommandId = (typeof CommandId)[keyof typeof CommandId];

export const ACTIVATE_PAYLOAD_LENGTH_BYTES = 4; // §4.6 — ACTIVATE.activationNonce

export const AUTOLOCK_GRACE_MS_MIN = 1000; // §4.6 — firmware clamp floor for SET_AUTOLOCK_GRACE
export const AUTOLOCK_GRACE_MS_MAX = 30_000; // §4.6 — firmware clamp ceiling for SET_AUTOLOCK_GRACE

export const FACTORY_UNPAIR_CONFIRM = 0xdeadbeef; // §4.6 — required confirm payload for FACTORY_UNPAIR

// ── §4.7 — commandResult layout ──────────────────────────────────────────────

export const COMMAND_RESULT_LAYOUT = {
  commandId: { offset: 0, length: 1 }, // §4.7 — echoed
  resultCode: { offset: 1, length: 1 }, // §4.7
  counterLow16: { offset: 2, length: 2 }, // §4.7
} as const;

/**
 * §4.7 — all ten must be handled distinctly. CLAUDE.md forbids a generic
 * catch-all handler for command results.
 */
export const ResultCode = {
  OK: 0x00, // §4.7
  UNAUTHENTICATED: 0x01, // §4.7
  AUTH_FAILED: 0x02, // §4.7
  REPLAY: 0x03, // §4.7
  NOT_ACTIVATED: 0x04, // §4.7
  SESSION_EXPIRED: 0x05, // §4.7
  INVALID_PARAM: 0x06, // §4.7
  BUSY: 0x07, // §4.7
  FAULT: 0x08, // §4.7
  RATE_LIMITED: 0x09, // §4.7
} as const;
export type ResultCode = (typeof ResultCode)[keyof typeof ResultCode];

// ── §4.9 — connection parameters ─────────────────────────────────────────────

export const CONNECTION_PARAMS = {
  intervalMsUnlocked: { min: 30, max: 50 }, // §4.9
  intervalMsLockedIdle: { min: 200, max: 400 }, // §4.9
  slaveLatencyUnlocked: 0, // §4.9
  slaveLatencyIdle: 4, // §4.9
  supervisionTimeoutMs: 4000, // §4.9
  attMtuDefault: 23, // §4.9 — no MTU exchange
  phyPrimary: '1M', // §4.9 — 1 Mbps
  phySecondaryOptional: '2M', // §4.9 — LE 2M optional
} as const;

/**
 * §4.9 — Long Range / S8 coding is deliberately excluded. Greater range means
 * the device stays unlocked further from its owner. Range is a safety
 * parameter on this product, not a feature. Do not "optimise" LE Coded PHY /
 * Long Range support back in.
 */
export const LONG_RANGE_PHY_SUPPORTED = false; // §4.9

// ── §4.8 F2 — dead-man auto-lock default ────────────────────────────────────

export const AUTOLOCK_GRACE_MS_DEFAULT = 5000; // §4.8 F2 — within AUTOLOCK_GRACE_MS_MIN/MAX

// ── §4.8 F6 — auth backoff ───────────────────────────────────────────────────

/**
 * §4.8 F6 — after AUTH_BACKOFF.shortThresholdFailures consecutive auth
 * failures, reject all auth attempts for shortBackoffMs; after
 * longThresholdFailures, for longBackoffMs. Counter resets on success or
 * power cycle.
 */
export const AUTH_BACKOFF = {
  shortThresholdFailures: 5, // §4.8 F6
  shortBackoffMs: 30_000, // §4.8 F6
  longThresholdFailures: 10, // §4.8 F6
  longBackoffMs: 300_000, // §4.8 F6
} as const;

// ── §4.4 — low-battery hysteresis ───────────────────────────────────────────

export const LOW_BATTERY_LATCH_PERCENT = 15; // §4.4 — flags bit2 sets below this
export const LOW_BATTERY_CLEAR_PERCENT = 20; // §4.4 — flags bit2 clears at/above this

// ═══════════════════════════════════════════════════════════════════════════
// REAL HARDWARE — YP65-AT module (Yichip YC1012 / YC8612)
// ═══════════════════════════════════════════════════════════════════════════
//
// Everything above this line describes TECHNICAL_SPEC.md §4: a GATT layout we
// specified and expected the device to implement. The client's hardware does
// not work that way and cannot be made to without a firmware change on a chip
// nobody on this project programs.
//
// The device's BLE stack runs on a second chip — a Yichip YC1012 (re-marked
// YC8612; the manufacturer confirmed 2026-08-12 they are the same die) joined
// to the PY32 application MCU by a 2-wire UART. That chip runs stock YP65-AT
// transparent-passthrough firmware, so its GATT table is FIXED: one service
// with five identical pipes. Our §4 characteristics C1-C6 cannot exist on it.
// §4's byte layouts survive as PAYLOADS inside those pipes; §4's addressing
// does not.
//
// Sources, both first-party vendor documents:
//   [YP65]  YP65-AT-BLE-module-spec-v1.3-release.pdf  (Hangzhou Yiyuanli)
//   [MFR]   Manufacturer's written answers, 2026-08-12
//
// ── What is DOCUMENTED (safe to rely on) ────────────────────────────────────

/**
 * [YP65 §11.1] The private passthrough service. A 16-bit UUID on the Bluetooth
 * SIG base, expanded here because react-native-ble-plx compares 128-bit forms.
 *
 * 🔴 Do NOT use this as a scan filter — see YP65_ADVERTISED_SERVICE_UUID.
 */
export const YP65_SERVICE_UUID = '0000FFF0-0000-1000-8000-00805F9B34FB'; // [YP65 §11.1]

/**
 * [YP65 §11.1] Five characteristics, every one of them Notify + Write Without
 * Response. Notify is uplink (device → phone), Write Without Response is
 * downlink (phone → device). They are indistinguishable at the GATT layer;
 * which one carries HQD's traffic is firmware policy, not protocol — see
 * YP65_PROVISIONAL.dataPipe.
 *
 * The handle numbers in [YP65 §11.1] (0x002A, 0x002D, …) are deliberately not
 * recorded here: handles are how the PY32 addresses a pipe over the UART. A
 * phone addresses characteristics by UUID and never sees them.
 */
export const YP65_CHARACTERISTIC_UUIDS = {
  fff1: '0000FFF1-0000-1000-8000-00805F9B34FB', // [YP65 §11.1]
  fff2: '0000FFF2-0000-1000-8000-00805F9B34FB', // [YP65 §11.1]
  fff3: '0000FFF3-0000-1000-8000-00805F9B34FB', // [YP65 §11.1]
  fff4: '0000FFF4-0000-1000-8000-00805F9B34FB', // [YP65 §11.1]
  fff5: '0000FFF5-0000-1000-8000-00805F9B34FB', // [YP65 §11.1]
} as const;

/**
 * 🔴 THE SCAN TRAP. [YP65 §13.14] the module's default advertising payload is
 *
 *     02 01 06        Flags — LE General Discoverable, BR/EDR not supported
 *     03 03 12 18     Complete 16-bit service UUIDs = 0x1812  ← HID, NOT FFF0
 *     03 19 C1 03     Appearance = 0x03C1 (keyboard)
 *
 * The passthrough service is NOT advertised. A central filtering on
 * YP65_SERVICE_UUID therefore finds nothing, and "no devices found" is
 * indistinguishable from off, out of range, or asleep — the same silent
 * failure class as OQ-12's guessed salt. This constant is what the device
 * actually puts on air; scan.ts must not filter on the service it serves.
 */
export const YP65_ADVERTISED_SERVICE_UUID = '00001812-0000-1000-8000-00805F9B34FB'; // [YP65 §13.14]

/**
 * [YP65 §13.7 / MFR answer 1] Default local name, carried in the SCAN RESPONSE
 * rather than the advertisement, so discovery must use an active scan (both
 * CoreBluetooth and Android default to active — no configuration needed).
 * The manufacturer says the MAC is appended to distinguish units, so this is a
 * PREFIX to match on, never an equality test.
 */
export const YP65_LOCAL_NAME_PREFIX = 'YP65-AT'; // [YP65 §13.7], [MFR answer 1]

/** [YP65 §12.1.3 note 1] Module-side default; renegotiated upward on connect. */
export const YP65_DEFAULT_MTU_BYTES = 185; // [YP65 §12.1.3]

/**
 * [YP65 §12.1.3 note 2] The module requests these itself on connect. Recorded
 * because the supervision timeout is the floor on how fast we can detect an
 * involuntary drop — connection.ts cannot react sooner than the radio reports.
 */
export const YP65_CONNECTION_PARAMS = {
  minIntervalMs: 10, // [YP65 §12.1.3] — 8 × 1.25 ms
  maxIntervalMs: 40, // [YP65 §12.1.3] — 32 × 1.25 ms
  slaveLatency: 5, // [YP65 §12.1.3]
  supervisionTimeoutMs: 5000, // [YP65 §12.1.3] — 500 × 10 ms
} as const;

/**
 * [MFR answer 1] Advertising is not continuous. It starts on power-up or a
 * single button press and stops after this long without a connection, at which
 * point the module sleeps and is invisible until woken physically. Any "device
 * not found" report must state whether the scan began inside this window —
 * 40 minutes of scanning a slept module is what it looks like when it doesn't.
 */
export const YP65_ADVERTISING_WINDOW_MS = 600_000; // [MFR answer 1] — 10 minutes

// ── What is INFERRED or UNCONFIRMED (flip these when hardware confirms) ──────

/**
 * 🔴 Provisional. Each entry is a hypothesis with a named way to settle it.
 * Grouped in one object so hardware bring-up changes values here and nothing
 * else in the codebase.
 */
export const YP65_PROVISIONAL = {
  /**
   * Which characteristic carries HQD's application traffic. All five are
   * identical at the GATT layer and the manufacturer has not said which is
   * used. `fff1` is the first and the vendor's own examples lead with it, but
   * that is a guess.
   *
   * Settle by: connecting to a powered board, subscribing to all five, and
   * writing the read-status frame to each in turn — the one that answers wins.
   */
  dataPipe: 'fff1' as keyof typeof YP65_CHARACTERISTIC_UUIDS,

  /**
   * Whether the device demands the 6-digit PIN pairing that HQD's SDK document
   * mentions. [YP65] documents no pairing at all, and the PIN most likely
   * belongs to the HID service (0x1812 + keyboard appearance), which is
   * disabled by default ([YP65 §13.30], HIDEN default 0). If HID is off, the
   * passthrough service should need no bonding.
   *
   * Settle by: connecting from a phone and observing whether the OS prompts.
   */
  requiresPinPairing: false,
} as const;
