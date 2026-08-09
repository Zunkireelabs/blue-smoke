import { Platform } from 'react-native';

/**
 * PROVISIONAL neutral palette — OQ-7 (brand assets) is unanswered (spec §13). Every visual
 * value in `src/shared/ui/**` and any screen built on it must come from this file and nowhere
 * else (enforced by `__tests__/tokenOnlyGuard.test.ts`), so that when brand assets land, the
 * reskin is an edit to this file alone. Nothing below is a brand decision — it's a grayscale
 * placeholder chosen only to be legible and AA-compliant.
 *
 * Structure: a raw `neutral` scale (never imported directly outside this file) feeds a
 * `lightTheme` of semantic tokens. A second theme (e.g. `darkTheme`) would be another object
 * built off the same or a parallel raw scale and swapped into `tokens` below — the semantic
 * names components consume do not change when that happens.
 *
 * ── Light only. Decided, not pending (Sadin, 2026-08-09) ──────────────────────────────
 *
 * No dark theme this round. This is a product decision, not an unfinished task — do not "fix"
 * it by adding one, and do not add `useColorScheme()` branches in screens. The structure above
 * is what keeps the decision cheap to reverse later: because every component consumes semantic
 * names and never a raw scale value or a hex literal (enforced by `__tests__/tokenOnlyGuard`),
 * adding `darkTheme` stays an edit to this file rather than a rewrite of every screen. A screen
 * that reads the OS colour scheme is precisely what would destroy that property.
 */

const neutral = {
  0: '#FFFFFF',
  50: '#F4F4F5',
  100: '#E4E4E7',
  200: '#D4D4D8',
  300: '#A1A1AA',
  400: '#71717A',
  500: '#52525B',
  700: '#3F3F46',
  900: '#18181B',
} as const;

const red = {
  text: '#8C1D18',
  background: '#FDECEA',
  border: '#B3261E',
} as const;

/**
 * Approved palette (Sadin, 2026-08-09 — execution brief §3). Exact values, not to be
 * substituted; do not add a colour here that is not one of these seven without asking (OQ-7,
 * brand assets, is still open — this is direction, not the final brand).
 */
const brandRaw = {
  base: '#1657D0',
  dark: '#0E3E9A',
  tint: '#E8F0FE',
} as const;

const groundRaw = {
  top: '#DCE9FB',
  bottom: '#FFFFFF',
} as const;

const successRaw = {
  text: '#1E8E5A',
  background: '#E3F3EB',
} as const;

const semanticColor = {
  background: neutral[0],
  backgroundMuted: neutral[50],
  surface: neutral[0],

  border: neutral[200],
  borderStrong: neutral[300],

  textPrimary: neutral[900],
  textSecondary: neutral[500],
  textInverse: neutral[0],

  // Was neutral[900] (near-black) — P0-7.0 moves primary actions onto the approved brand blue.
  interactivePrimaryBackground: brandRaw.base,
  interactivePrimaryText: neutral[0],

  // Was neutral[900] — links read as brand-blue now rather than plain text-colored.
  link: brandRaw.base,

  dangerText: red.text,
  dangerBackground: red.background,
  dangerBorder: red.border,

  focusRing: '#2563EB',

  // P0-7.0 additions — see the header comment on `brandRaw`/`groundRaw`/`successRaw` above.
  brand: brandRaw.base,
  brandDark: brandRaw.dark,
  brandTint: brandRaw.tint,
  groundTop: groundRaw.top,
  groundBottom: groundRaw.bottom,
  success: successRaw.text,
  successBg: successRaw.background,
} as const;

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

const radii = {
  sm: 4,
  md: 8,
  lg: 12,
  // The large sheet/card motif (execution brief §3: "~20-24 corner radius") — distinct from
  // `lg`, which stays the size for in-page `Card`s so existing screens don't shift.
  xl: 24,
  full: 999,
} as const;

const typography = {
  fontSize: {
    body: 16,
    label: 14,
    caption: 12,
    // Was 24 — the reference screenshots run larger and heavier than our previous scale.
    title: 28,
  },
  fontWeight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const;

const elevation = {
  card: Platform.select({
    ios: {
      shadowColor: neutral[900],
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
    },
    default: {
      elevation: 2,
    },
  }),
} as const;

/**
 * Minimum interactive hit area — iOS HIG is 44x44pt, Android Material is 48x48dp. Every
 * pressable primitive in this kit resolves to at least this size.
 */
const touchTarget = {
  minHeight: Platform.OS === 'android' ? 48 : 44,
  minWidth: Platform.OS === 'android' ? 48 : 44,
} as const;

const lightTheme = {
  color: semanticColor,
  spacing,
  radii,
  typography,
  elevation,
  touchTarget,
} as const;

export type Theme = typeof lightTheme;

/** The single theme currently in use. Swap this binding (or add a second theme object above
 * and select between them) to reskin — no other file in this module needs to change. */
export const tokens: Theme = lightTheme;

/**
 * Every foreground/background token pair a component in this kit actually renders text or an
 * icon against. `__tests__/contrast.test.ts` computes the WCAG contrast ratio for each of these
 * from the token values above and asserts the AA threshold for its `size` — it does not assert
 * a precomputed ratio number.
 *
 * This list used to be hand-maintained, which is exactly how `surface` and `textInverse` went
 * missing (P0-7.0 follow-up brief) while both happened to equal an already-covered token's
 * value — passing by coincidence, not by construction. `__tests__/contrastCompleteness.test.ts`
 * now scans `src/shared/ui/**` and the restyled screens for every `tokens.color.<name>`
 * reference and asserts each one's *token name* — `fgToken`/`bgToken` below, not the resolved
 * hex in `fg`/`bg` — appears in some entry here. Matching by name rather than value is
 * deliberate: two different tokens can share a hex value today (e.g. `textPrimary` and `link`
 * are both `neutral[900]`), and matching by value would let one silently stand in for the
 * other's coverage the same way `surface`/`textInverse` did. Add a pair (with both the token
 * names and their resolved values) whenever a component introduces a new one — the completeness
 * guard fails the build if you forget.
 */
export const contrastPairs: ReadonlyArray<{
  name: string;
  fgToken: keyof typeof semanticColor;
  bgToken: keyof typeof semanticColor;
  fg: string;
  bg: string;
  size: 'body' | 'large';
}> = [
  {
    name: 'textPrimary on background',
    fgToken: 'textPrimary',
    bgToken: 'background',
    fg: semanticColor.textPrimary,
    bg: semanticColor.background,
    size: 'body',
  },
  {
    name: 'textSecondary on background',
    fgToken: 'textSecondary',
    bgToken: 'background',
    fg: semanticColor.textSecondary,
    bg: semanticColor.background,
    size: 'body',
  },
  {
    name: 'textPrimary on backgroundMuted',
    fgToken: 'textPrimary',
    bgToken: 'backgroundMuted',
    fg: semanticColor.textPrimary,
    bg: semanticColor.backgroundMuted,
    size: 'body',
  },
  {
    name: 'interactivePrimaryText on interactivePrimaryBackground',
    fgToken: 'interactivePrimaryText',
    bgToken: 'interactivePrimaryBackground',
    fg: semanticColor.interactivePrimaryText,
    bg: semanticColor.interactivePrimaryBackground,
    size: 'body',
  },
  {
    name: 'link on background',
    fgToken: 'link',
    bgToken: 'background',
    fg: semanticColor.link,
    bg: semanticColor.background,
    size: 'body',
  },
  {
    name: 'dangerText on background',
    fgToken: 'dangerText',
    bgToken: 'background',
    fg: semanticColor.dangerText,
    bg: semanticColor.background,
    size: 'body',
  },
  {
    name: 'dangerText on dangerBackground',
    fgToken: 'dangerText',
    bgToken: 'dangerBackground',
    fg: semanticColor.dangerText,
    bg: semanticColor.dangerBackground,
    size: 'body',
  },
  {
    name: 'textPrimary on surface',
    fgToken: 'textPrimary',
    bgToken: 'surface',
    fg: semanticColor.textPrimary,
    bg: semanticColor.surface,
    size: 'body',
  },
  {
    name: 'textInverse on interactivePrimaryBackground',
    fgToken: 'textInverse',
    bgToken: 'interactivePrimaryBackground',
    fg: semanticColor.textInverse,
    bg: semanticColor.interactivePrimaryBackground,
    size: 'body',
  },
  {
    // `Sheet`'s backdrop: a solid token dimmed via the `opacity` *style* property rather than
    // an rgba() color, deliberately — every other pair here assumes a solid hex, and the
    // contrast math (`hexToRgb`) cannot parse an alpha-blended value. `textPrimary` had no
    // bgToken entry before this; general-purpose, not backdrop-specific (e.g. a future dark
    // toast/tooltip).
    name: 'textInverse on textPrimary',
    fgToken: 'textInverse',
    bgToken: 'textPrimary',
    fg: semanticColor.textInverse,
    bg: semanticColor.textPrimary,
    size: 'body',
  },
  // P0-7.0 additions — one entry per new fg/bg token this round's primitives introduce.
  {
    name: 'textInverse on brand',
    fgToken: 'textInverse',
    bgToken: 'brand',
    fg: semanticColor.textInverse,
    bg: semanticColor.brand,
    size: 'body',
  },
  {
    name: 'textInverse on brandDark',
    fgToken: 'textInverse',
    bgToken: 'brandDark',
    fg: semanticColor.textInverse,
    bg: semanticColor.brandDark,
    size: 'body',
  },
  {
    name: 'link on brandTint',
    fgToken: 'link',
    bgToken: 'brandTint',
    fg: semanticColor.link,
    bg: semanticColor.brandTint,
    size: 'body',
  },
  {
    // `success` (#1E8E5A) tops out around 4.1:1 against any light surface in this palette —
    // short of the 4.5 body threshold no matter which side of the pair it's on, a structural
    // property of that exact hex, not something a different pairing fixes. It clears the 3:1
    // large-text threshold comfortably, so `Badge` renders its success glyph at large size —
    // this entry's `size: 'large'` is true of the actual UI, not a way around the guard.
    name: 'success on successBg (large text/icon only)',
    fgToken: 'success',
    bgToken: 'successBg',
    fg: semanticColor.success,
    bg: semanticColor.successBg,
    size: 'large',
  },
  {
    name: 'textPrimary on successBg',
    fgToken: 'textPrimary',
    bgToken: 'successBg',
    fg: semanticColor.textPrimary,
    bg: semanticColor.successBg,
    size: 'body',
  },
];
