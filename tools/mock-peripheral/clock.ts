/**
 * Injectable monotonic uptime clock.
 *
 * Spec §4.5 moved `sessionExpiry` to a monotonic uptime counter — the device
 * has no wall clock. Every time-dependent behaviour in deviceCore (nonce
 * TTL, dead-man countdown, auth backoff, session expiry, battery drain)
 * reads time through this interface, never `Date.now()` or a real timer, so
 * tests can advance time instantly and deterministically.
 */

export interface Clock {
  /** Current monotonic uptime in milliseconds. */
  nowMs(): number;
}

/** Deterministic clock for tests: starts at a fixed point, advances only when told to. */
export class FakeClock implements Clock {
  private currentMs: number;

  constructor(startMs = 0) {
    this.currentMs = startMs;
  }

  nowMs(): number {
    return this.currentMs;
  }

  /** Advances time by `deltaMs` and returns the new current time. */
  advanceMs(deltaMs: number): number {
    if (deltaMs < 0) {
      throw new Error('FakeClock: time does not go backwards');
    }
    this.currentMs += deltaMs;
    return this.currentMs;
  }

  /** Jumps to an absolute uptime. Must not be earlier than the current time. */
  setMs(absoluteMs: number): void {
    if (absoluteMs < this.currentMs) {
      throw new Error('FakeClock: time does not go backwards');
    }
    this.currentMs = absoluteMs;
  }
}
