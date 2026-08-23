import { useEffect, useState } from 'react';

export interface Countdown {
  remaining: number;
  isDone: boolean;
  restart: (seconds?: number) => void;
}

/**
 * The one cooldown timer implementation for the kit — `AU-7`'s 30s resend, `VF-10`'s 30-minute
 * lockout, and `F3.E4` all need "count down to zero, then re-enable an action" and previously
 * each screen re-implemented the `setTimeout`/`setState` dance by hand (see `OtpEntryScreen`,
 * pre-restyle). A hook rather than a component — there's no fixed rendering, callers format
 * `remaining` however their copy needs it (`Resend code in {n}s` vs `mm:ss`).
 */
export function useCountdown(initialSeconds: number): Countdown {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (remaining <= 0) {
      return undefined;
    }
    const id = setTimeout(() => setRemaining((prev) => prev - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  return {
    remaining,
    isDone: remaining <= 0,
    restart: (seconds = initialSeconds) => setRemaining(seconds),
  };
}
