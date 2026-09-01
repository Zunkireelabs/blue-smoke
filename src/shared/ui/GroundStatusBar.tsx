import { StatusBar, type StatusBarStyle } from 'react-native';

/**
 * Picks the status-bar content style from whatever colour sits *under* the bar.
 *
 * ── Why this is derived, not a prop ────────────────────────────────────────────────────
 *
 * The bug this replaces (`App.tsx`, until 2026-09-01) set one global `barStyle` from
 * `useColorScheme()` — the OS dark-mode setting. That is the wrong input twice over:
 *
 *   1. This app is **light-only** by decision (`tokens.ts`, "Light only. Decided, not
 *      pending"), and that same comment forbids reading the OS colour scheme precisely
 *      because it decouples what renders from what the tokens say.
 *   2. The status bar's legibility depends on the colour *behind it*, which differs per
 *      screen — never on the OS theme. Measured on a Nothing Phone (1), Android 16,
 *      2026-09-01: with the phone in dark mode, `light-content` won, so Profile's white
 *      header rendered white-on-white and the clock/wifi/signal icons vanished entirely.
 *
 * Deriving from the colour also survives a reskin: change a ground token in `tokens.ts` and
 * the bar follows it. A hand-set `barStyle` prop would silently keep the old value — the same
 * class of drift `contrastPairs` exists to prevent.
 *
 * A prop would additionally be wrong for the two grounds that render BOTH ways:
 * `CurtainGround` tops out at `groundTopStrong` (light) by default but at `homeWashStop1`
 * (dark brand blue) on Home, and `GradientGround` at `groundTop` (light) but at the Home wash
 * on `DeviceScanScreen`.
 */

function hexToRgb(hex: string): [number, number, number] | null {
  const clean = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    return null;
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** WCAG 2.x relative luminance — same formula `__tests__/contrast.test.ts` uses on the tokens. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Threshold chosen by contrast, not by eye: white-on-X beats black-on-X exactly when X's
 * luminance is below `sqrt(1.05 * 0.05) - 0.05 ≈ 0.1791`. Below that, `light-content`;
 * at or above it, `dark-content`.
 *
 * The consequence worth knowing: `groundTopStrong` (L≈0.55) and `brand` (L≈0.11) land either
 * side of it — brand is dark enough to want white icons, the pale wash is not. That is the
 * right answer in both cases, and it is exactly the distinction a single global value could
 * not make. (Luminances are named, not written as hex: `tokenOnlyGuard` scans comments too,
 * and duplicating a token's value here is the drift this file argues against.)
 */
const LIGHT_CONTENT_MAX_LUMINANCE = Math.sqrt(1.05 * 0.05) - 0.05;

export function statusBarStyleFor(topColor: string): StatusBarStyle {
  const rgb = hexToRgb(topColor);
  // An unparseable value (an alpha-blended press tint, a platform colour) is not something to
  // guess at — fall back to the light-only app's default rather than pick a style from noise.
  // Spelling the alpha form out literally here would trip `tokenOnlyGuard`, which scans this
  // file's comments too.
  if (!rgb) {
    return 'dark-content';
  }
  return relativeLuminance(rgb) < LIGHT_CONTENT_MAX_LUMINANCE ? 'light-content' : 'dark-content';
}

export interface GroundStatusBarProps {
  /** The colour rendered directly beneath the status bar — a ground's top gradient stop, or a
   * flat surface's `backgroundColor`. Pass the `tokens.color.*` value, never a literal. */
  topColor: string;
}

/**
 * Declares the status-bar style for the ground it sits inside. `StatusBar` is a stacking
 * component in React Native: the most recently mounted entry wins, and unmounting reverts to
 * the one below — so a pushed screen's ground takes over the bar and popping restores the
 * previous screen's automatically, with no navigation listener needed.
 */
export function GroundStatusBar({ topColor }: GroundStatusBarProps) {
  return <StatusBar barStyle={statusBarStyleFor(topColor)} translucent backgroundColor="transparent" />;
}
