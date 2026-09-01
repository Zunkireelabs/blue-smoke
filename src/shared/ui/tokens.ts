import { Platform } from 'react-native';

/**
 * The BlueSmoke palette — OQ-7 (brand assets) resolved 2026-08-11 (spec §13). Every visual
 * value in `src/shared/ui/**` and any screen built on it must come from this file and nowhere
 * else (enforced by `__tests__/tokenOnlyGuard.test.ts`), so a reskin stays an edit to this file
 * alone.
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
  // Sits between 50 and 100 — a pure grey, unlike 50's faint warm cast. Added for the grouped
  // settings card on Profile, whose fill was specified as an exact value.
  75: '#F0F0F0',
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
 * Approved palette (Sadin, 2026-08-09 — execution brief §3, extended 2026-08-11 for the
 * P0-7.0 flame mark). Exact values, not to be substituted; do not add a colour here without
 * asking.
 */
const brandRaw = {
  base: '#1657D0',
  dark: '#0E3E9A',
  tint: '#E8F0FE',
  // P0-7.0 geometry v2 — the eighth brand colour, and decorative-only: the top stop of the
  // flame mark's gradient, nowhere else. Never a text colour — see `EXEMPT_TOKENS` in
  // contrastCompleteness.test.ts.
  glow: '#22C1F2',
} as const;

const groundRaw = {
  top: '#DCE9FB',
  bottom: '#FFFFFF',
  // Home screen only — a more saturated wash (opt-in via `GradientGround`'s `colors` prop, the
  // other 15 consumers are unaffected) so the band reads clearly behind the "BlueSmoke" title.
  // The bottom stop stays a light tint rather than fading to pure white so the sheet's curved
  // top edge still has real colour contrast to read against, not just `elevation.sheetEdge`'s
  // shadow.
  topStrong: '#9FC7F5',
  bottomTint: '#F2F7FE',
} as const;

/**
 * Home's full-height wash — replaces `groundTopStrong`/`groundBottomTint` for Home only (via
 * `CurtainGround`'s `washColors`/`washLocations` props), everywhere else keeps the pale default.
 * Seven-stop vertical gradient, exact brand blue at top fading to a near-white tint at the
 * bottom, matched hex-for-hex to an approved design reference. `stop1` reuses `brandRaw.base`
 * rather than repeating the literal so the two values can never drift apart.
 */
const homeWashRaw = {
  stop1: brandRaw.base,
  stop2: '#1D69DD',
  stop3: '#3D8BE9',
  stop4: '#79AEEE',
  stop5: '#AFCDF4',
  stop6: '#D5E4FA',
  stop7: '#E8EFFB',
} as const;

/**
 * Fractional stop positions (`react-native-linear-gradient`'s `locations` prop) for
 * `homeWashRaw`'s seven colours, in the same order — matches the approved reference 1:1.
 */
export const HOME_WASH_LOCATIONS = [0, 0.18, 0.35, 0.52, 0.7, 0.85, 1] as const;

const successRaw = {
  /**
   * Darkened from the brief's `#1E8E5A` (Sadin, 2026-08-09 — review correction).
   *
   * The approved value measured 4.14:1 on white and 3.61:1 on `successBg`: usable for a
   * decorative glyph, but **below the 4.5 AA threshold for text**, on both grounds. Registering
   * it as large-text-only would have left a trap — `<Text tone="success">Unlocked</Text>` in
   * `LK-6` would then pass the completeness guard while failing AA in the actual UI, because the
   * guard checks that a pair is *declared*, not the size it is rendered at.
   *
   * `#18774D` is 5.55:1 on white and 4.83:1 on `successBg` — passes AA at body size on both, so
   * the token is safe wherever someone reaches for it.
   */
  text: '#18774D',
  background: '#E3F3EB',
} as const;

const semanticColor = {
  background: neutral[0],
  backgroundMuted: neutral[50],
  surface: neutral[0],
  // A grouped card that reads as an inset panel rather than a raised one — Profile's settings
  // group, where the rows carry their own separators and the card itself has no border. Distinct
  // from `backgroundMuted`: that is a page ground, this is a surface laid on top of one.
  surfaceSubtle: neutral[75],

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
  // P0-7.0 geometry v2 — BrandMark's gradient top stop only. Decorative-only, never text.
  brandGlow: brandRaw.glow,
  groundTop: groundRaw.top,
  groundBottom: groundRaw.bottom,
  groundTopStrong: groundRaw.topStrong,
  groundBottomTint: groundRaw.bottomTint,
  homeWashStop1: homeWashRaw.stop1,
  homeWashStop2: homeWashRaw.stop2,
  homeWashStop3: homeWashRaw.stop3,
  homeWashStop4: homeWashRaw.stop4,
  homeWashStop5: homeWashRaw.stop5,
  homeWashStop6: homeWashRaw.stop6,
  homeWashStop7: homeWashRaw.stop7,
  // Home's sheet fill — a hair off pure `surface` white so the gradient's curved top edge has
  // a real colour seam to read against, distinct from `groundBottomTint` above so the seam is
  // a visible step, not a blend.
  surfaceTint: '#F7FBFF',
  success: successRaw.text,
  successBg: successRaw.background,

  /**
   * Transient press feedback on a composite row (HomeScreen's device row) — a single translucent
   * veil laid OVER the finished row, rather than fading the row's own `opacity`, which
   * double-dims every overlapping opaque shape stacked inside it.
   *
   * These are the two tokens here that are genuinely `rgba()` rather than a solid hex dimmed via
   * the `opacity` style (the trick `Sheet`'s backdrop uses). Android's `android_ripple` takes one
   * colour string and has no separate opacity to dim it with, and the iOS veil is kept in the same
   * form so the two stay visibly matched. Both are exempt in `contrastCompleteness.test.ts` — a
   * press tint never has text sitting on it, and `contrast.test.ts`'s `hexToRgb` could not parse
   * an alpha value anyway.
   */
  pressRipple: 'rgba(0, 0, 0, 0.08)',
  pressVeil: 'rgba(0, 0, 0, 0.06)',
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
  // Home redesign (reference-devices-list.md) — `GradientGround`'s sheet overlaps only the
  // last `spacing.xxl` of the gradient wash, where it's already faded almost to `groundBottom`
  // (white), the same as the sheet's own fill — so the curved top corners have no colour
  // contrast to read by. A negative offset throws the shadow up into the gradient instead of
  // down like `card`, so the curve reads regardless of what colour is behind it.
  sheetEdge: Platform.select({
    ios: {
      shadowColor: neutral[900],
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
    },
    default: {
      elevation: 4,
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
  {
    // Home's header icon chip (`IconChip` in `HomeScreen.tsx`): `textInverse` used as a
    // `backgroundColor`, dimmed via the `opacity` *style* property (same trick as the
    // `textInverse on textPrimary` pair above) rather than an rgba() color — so this is
    // `textInverse` with no bgToken entry, not a literal white-on-white render. General-purpose,
    // same reasoning as that pair: whatever this chip's actual fill ends up being, dark text/an
    // icon reads fine on a light chip.
    name: 'textPrimary on textInverse',
    fgToken: 'textPrimary',
    bgToken: 'textInverse',
    fg: semanticColor.textPrimary,
    bg: semanticColor.textInverse,
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
    name: 'textPrimary on surfaceTint',
    fgToken: 'textPrimary',
    bgToken: 'surfaceTint',
    fg: semanticColor.textPrimary,
    bg: semanticColor.surfaceTint,
    size: 'body',
  },
  {
    // Asserted at `body`, not `large`: the token was darkened specifically so this pair clears
    // 4.5:1 (it measures 4.83:1). Keeping it at `large` would have let a future body-size use of
    // `tone="success"` pass this guard while failing AA on screen — see the note on `successRaw`.
    name: 'success on successBg',
    fgToken: 'success',
    bgToken: 'successBg',
    fg: semanticColor.success,
    bg: semanticColor.successBg,
    size: 'body',
  },
  {
    name: 'textPrimary on successBg',
    fgToken: 'textPrimary',
    bgToken: 'successBg',
    fg: semanticColor.textPrimary,
    bg: semanticColor.successBg,
    size: 'body',
  },
  {
    // HomeScreen's connected-device dot (design ask, 2026-08-31) fills a small circle solid
    // `success`, not `successBg` — no text ever sits on it, but the completeness guard still
    // requires a registered bgToken pairing, same non-text role `textInverse on brand` already
    // covers for the Toggle track. `success` on white measured 5.55:1 (see `successRaw`'s header
    // comment), and contrast ratio is symmetric, so `textInverse` (white) on `success` passes the
    // same AA threshold.
    name: 'textInverse on success',
    fgToken: 'textInverse',
    bgToken: 'success',
    fg: semanticColor.textInverse,
    bg: semanticColor.success,
    size: 'body',
  },
  // `surfaceSubtle` — Profile's grouped settings card. One entry per foreground that actually
  // renders on it: row labels (`textPrimary`), row descriptions and the identity block
  // (`textSecondary`), the verification badge (`success`), and the "Log out" row's label and
  // glyph (`dangerText`).
  {
    name: 'textPrimary on surfaceSubtle',
    fgToken: 'textPrimary',
    bgToken: 'surfaceSubtle',
    fg: semanticColor.textPrimary,
    bg: semanticColor.surfaceSubtle,
    size: 'body',
  },
  {
    name: 'textSecondary on surfaceSubtle',
    fgToken: 'textSecondary',
    bgToken: 'surfaceSubtle',
    fg: semanticColor.textSecondary,
    bg: semanticColor.surfaceSubtle,
    size: 'body',
  },
  {
    name: 'dangerText on surfaceSubtle',
    fgToken: 'dangerText',
    bgToken: 'surfaceSubtle',
    fg: semanticColor.dangerText,
    bg: semanticColor.surfaceSubtle,
    size: 'body',
  },
  {
    name: 'success on surfaceSubtle',
    fgToken: 'success',
    bgToken: 'surfaceSubtle',
    fg: semanticColor.success,
    bg: semanticColor.surfaceSubtle,
    size: 'body',
  },
];
