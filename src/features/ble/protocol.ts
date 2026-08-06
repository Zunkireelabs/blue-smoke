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

/** §4.5 — written to C3 (authResponse) first. Frame order is mandatory. */
export const AUTH_RESPONSE_FRAME_1_LAYOUT = {
  sessionId: { offset: 0, length: 16 }, // §4.5
  keyGeneration: { offset: 16, length: 1 }, // §4.5
  reserved: { offset: 17, length: 3 }, // §4.5
} as const;

/** §4.5 — written to C3 (authResponse) second. An out-of-order frame resets the handshake. */
export const AUTH_RESPONSE_FRAME_2_LAYOUT = {
  proof: { offset: 0, length: 16 }, // §4.5
  expiresAtDelta: { offset: 16, length: 4 }, // §4.5 — uint32
} as const;

// §4.5 — K_sess = HKDF(ikm = K_dev, salt = session_id, info = AUTH_HKDF_INFO ‖ keyGeneration).
// Every input is either burned into the device (K_dev) or sent in authResponse frame 1.
// Do NOT add user_id or an absolute expires_at to `info`: the device is offline, has no wall
// clock, and is never told either — binding them makes K_sess underivable device-side.
export const AUTH_HKDF_INFO = 'bluesmoke-session-v1';
export const SESSION_EXPIRY_MAX_DAYS = 90; // §4.5 — hard cap on session expiry

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
