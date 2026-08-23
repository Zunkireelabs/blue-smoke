/**
 * `95` → `1:35`. The reference auth design renders its resend countdown as minutes and seconds
 * ("Waiting for Code - 0:18 Min"), not the raw seconds both OTP screens used to show.
 *
 * Shared by `OtpEntryScreen` and `EmailCodeEntryScreen`, whose cooldowns are 30s and 60s — the
 * one at which a naive `0:${seconds}` would render `1:0` instead of `1:00`.
 */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
