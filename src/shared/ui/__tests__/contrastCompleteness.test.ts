import * as path from 'path';
import { listSourceFiles, readSourceFile, type SourceFile } from '../sourceFiles';
import { tokens, contrastPairs } from '../tokens';

/**
 * P0-7.0 follow-up (execution brief, "The defect"): `contrastPairs` was hand-maintained and
 * silently omitted `surface` and `textInverse` — both currently pass `contrast.test.ts` by
 * coincidence (equal in value to an already-covered token), a coincidence that ends at the OQ-7
 * reskin. This guard makes that impossible to reintroduce: it scans for every `tokens.color.*`
 * reference this kit and the restyled screens actually make, and fails if any of them isn't
 * named in `contrastPairs` on the matching side.
 *
 * Reuses `sourceFiles.ts` — the same walk `tokenOnlyGuard.test.ts` and
 * `dynamicTypeGuard.test.ts` already use.
 */

const RESTYLED_SCREENS = [
  'src/features/auth/AuthMethodChoiceScreen.tsx',
  'src/features/auth/EmailCodeRequestScreen.tsx',
  'src/features/auth/EmailCodeEntryScreen.tsx',
  'src/features/auth/PhoneInputScreen.tsx',
  'src/features/auth/CountryPicker.tsx',
  'src/features/auth/OtpEntryScreen.tsx',
  'src/features/profile/ProfileScreen.tsx',
  'src/features/devices/HomeScreen.tsx',
  'src/features/auth/SignOutButton.tsx',
  'src/features/verification/VerifyIntroScreen.tsx',
  'src/features/verification/CameraPrimingScreen.tsx',
  'src/features/verification/PersonaVerificationScreen.tsx',
  'src/features/verification/TransportErrorScreen.tsx',
  'src/features/onboarding/OnboardingCarouselScreen.tsx',
  'src/features/onboarding/BluetoothPrimingScreen.tsx',
  'src/features/onboarding/NotificationPrimingScreen.tsx',
  'src/features/onboarding/BluetoothDeniedScreen.tsx',
  'src/features/onboarding/BluetoothBlockedScreen.tsx',
  'src/features/onboarding/BluetoothOffScreen.tsx',
  'src/features/onboarding/BluetoothGateScreen.tsx',
  'src/features/devices/DeviceScanScreen.tsx',
  'src/features/devices/PairingBoundaryScreen.tsx',
];

function scannedFiles(): SourceFile[] {
  const kitFiles = listSourceFiles('src/shared/ui').filter((f) => path.basename(f.relativePath) !== 'tokens.ts');
  const screenFiles = RESTYLED_SCREENS.map(readSourceFile);
  return [...kitFiles, ...screenFiles];
}

/**
 * Matches both the style-object form (`color: tokens.color.textPrimary`) and the JSX-attribute
 * form (`color={tokens.color.textPrimary}`) — deliberately case-sensitive so `color:` doesn't
 * also match inside `backgroundColor:`/`borderColor:`/`shadowColor:` (those end in `Color:`,
 * capital C).
 */
const COLOR_REFERENCE = /(\w+)\s*(?::|=)\s*\{?\s*tokens\.color\.(\w+)\b/g;

/** Keys whose value renders as visible text or an icon fill — subject to WCAG contrast. */
const FG_KEYS = new Set(['color', 'placeholderTextColor']);
/**
 * `fill`/`stroke` on a file that is NOT a decorative-shape file (see `isDecorativeShapeFile`
 * below) — i.e. a real icon, not a logo or an illustration. This is the case the
 * `DECORATIVE_SHAPE_KEYS` comment below anticipated: Profile's hand-drawn `react-native-svg`
 * row glyphs are standalone icons conveying meaning, so they carry the same WCAG contrast
 * obligation as text and are classified as foreground rather than exempted.
 *
 * Checked *after* `borderKeysForFile` in `scan` so BrandMark/illustrations keep their exemption.
 */
const ICON_SHAPE_KEYS = new Set(['fill', 'stroke']);
/** Keys whose value is the surface text/an icon sits on. `tintColor` is
 * `react-native-glass-effect-view`'s `GlassEffectView` prop — the color tinting the glass
 * material text/icons render on top of, same background role as `backgroundColor`. */
const BG_KEYS = new Set(['backgroundColor', 'tintColor']);
/** Keys whose value never renders text or an icon — outlines only. Applies to every scanned
 * file. Tokens found under these keys must be named in `EXEMPT_TOKENS` below, not silently
 * skipped. */
const BORDER_KEYS = new Set(['borderColor', 'shadowColor']);

/**
 * `fill`/`stroke`/`stopColor`/`groundColor` cover BrandMark's SVG flame (P0-7.0) and, as of
 * UI-BUILD-E part 3, the onboarding illustrations under `src/shared/ui/illustrations/`: logo/
 * illustration shapes, not text or a standalone icon, so they carry no WCAG text-contrast
 * obligation *there*.
 *
 * Deliberately scoped to `BrandMark.tsx` and `illustrations/`, not treated as globally
 * decorative (review finding, P0-7.0 geometry v3 rework, extended for part 3): `react-native-svg`
 * is now a project dependency, and a future real icon (header actions are text-only today for
 * want of one) could reach for `fill: tokens.color.X` too. Exempting these keys everywhere would
 * let that icon silently escape its own contrast obligation instead of forcing a conscious
 * classification the way this guard is meant to.
 */
const BRANDMARK_PATH = 'src/shared/ui/BrandMark.tsx';
const ILLUSTRATIONS_DIR = 'src/shared/ui/illustrations/';
const DECORATIVE_SHAPE_KEYS = new Set(['fill', 'stroke', 'stopColor']);

function isDecorativeShapeFile(relativePath: string): boolean {
  return relativePath === BRANDMARK_PATH || relativePath.startsWith(ILLUSTRATIONS_DIR);
}

/**
 * `groundColor` is `BrandMarkProps`' own prop name (P0-7.0 geometry v3) — unlike `fill`/
 * `stroke`/`stopColor`, no other component defines a prop with this name, so a caller passing
 * one to `<BrandMark>` (e.g. Home's header, matching the mark's knockout to the gradient it
 * sits on) carries the same non-text, shape-fill role `DECORATIVE_SHAPE_KEYS` covers inside
 * `BrandMark.tsx` itself. Applied to every scanned file, not gated by `isDecorativeShapeFile` —
 * doing that for `fill`/`stroke`/`stopColor` too would risk a future real icon's fill silently
 * escaping its own contrast obligation (see that set's header comment); no such risk here since
 * the key name is unique to this one component's prop.
 */
const GROUND_COLOR_KEY = new Set(['groundColor']);

/**
 * Named, reasoned exemption list for tokens that legitimately never render text or an icon —
 * per the brief, "not a silent filter". A token found via `BORDER_KEYS` that isn't listed here
 * fails the "classifies every reference" test below, so growing this list is a deliberate,
 * visible edit, not something that happens by omission the way `surface`/`textInverse` did.
 */
const EXEMPT_TOKENS: Readonly<Record<string, string>> = {
  border: 'Decorative outline only (TextField input, Card, OTP segment boxes) — never text or an icon.',
  borderStrong: 'Reserved stronger outline, same non-text role as `border`; not yet used by any component.',
  dangerBorder: "Button's destructive-variant outline — same non-text role as `border`.",
  focusRing: 'Focus-indicator outline, never a text or icon fill; not yet used by any component.',
  brand: "Button's secondary-variant outline — same non-text role as `border`. Its fg/bg roles "
    + 'elsewhere (link text, Toggle track) already have their own contrastPairs entries above.',
  brandGlow: "BrandMark's gradient top stop (P0-7.0 geometry v3) — decorative-only, never a text colour.",
  surface: "BrandMark's `groundColor` default (P0-7.0 geometry v3) — the splash's white ground, "
    + 'passed as the inner flame knockout fill. Already covered as a bgToken above; this entry '
    + 'is for its separate, non-text use as a shape fill.',
  groundTopStrong: "BrandMark's `groundColor` at Home's header (P0-7.0 follow-up) — matches the "
    + "inner flame knockout to CurtainGround's gradient top stop so the mark reads seamlessly "
    + 'there, the same non-text shape-fill role as the `surface` entry above.',
  homeWashStop1: "BrandMark's `groundColor` at Home's header (full-screen brand wash) — matches "
    + "the inner flame knockout to CurtainGround's new gradient top stop on Home, same non-text "
    + 'shape-fill role as the `groundTopStrong` entry above.',
  pressRipple: "Android's `android_ripple` tint on HomeScreen's device row — a transient "
    + 'translucent veil drawn over the finished row while a finger is down. Never a text or icon '
    + 'colour, and rgba by necessity (a ripple takes one colour string, with no `opacity` style to '
    + "dim a solid token the way `Sheet`'s backdrop does), so it has no parseable hex for a "
    + 'contrastPairs entry either.',
  pressVeil: 'The iOS counterpart to `pressRipple` — `Pressable` has no ripple there, so the same '
    + 'veil is drawn as an absolutely-positioned overlay. Same non-text role, same rgba reason.',
};

/** The destructured form (`const { color } = tokens; color.surface`) produces a different
 * source string than `tokens.color.surface` and would slip past `COLOR_REFERENCE` uncounted —
 * asserted absent below rather than also matched, per the brief's "Traps" section. */
const DESTRUCTURED_COLOR_ACCESS = /\{\s*color\b[^}]*\}\s*=\s*tokens\b/;

interface ScanResult {
  fg: Set<string>;
  bg: Set<string>;
  border: Set<string>;
  unclassified: string[];
  destructured: string[];
}

function scan(files: SourceFile[]): ScanResult {
  const fg = new Set<string>();
  const bg = new Set<string>();
  const border = new Set<string>();
  const unclassified: string[] = [];
  const destructured: string[] = [];

  for (const file of files) {
    if (DESTRUCTURED_COLOR_ACCESS.test(file.contents)) {
      destructured.push(file.relativePath);
    }
    const borderKeysForFile = new Set([
      ...BORDER_KEYS,
      ...GROUND_COLOR_KEY,
      ...(isDecorativeShapeFile(file.relativePath) ? DECORATIVE_SHAPE_KEYS : []),
    ]);
    for (const match of file.contents.matchAll(COLOR_REFERENCE)) {
      const [, key, tokenName] = match;
      // Name-based exemptions are checked FIRST, before any key-based classification. A token in
      // `EXEMPT_TOKENS` is asserted to never render text or an icon anywhere, and some of the
      // props that carry one — `android_ripple={{ color }}` in particular — share the literal key
      // `color` with real text colours, which `COLOR_REFERENCE` cannot tell apart. Adding a name
      // here is a deliberate, reviewed edit to the list above; nothing lands in it by omission,
      // which is the property this guard exists to protect.
      if (Object.prototype.hasOwnProperty.call(EXEMPT_TOKENS, tokenName)) {
        border.add(tokenName);
      } else if (FG_KEYS.has(key)) {
        fg.add(tokenName);
      } else if (BG_KEYS.has(key)) {
        bg.add(tokenName);
      } else if (borderKeysForFile.has(key)) {
        // Before ICON_SHAPE_KEYS, so a decorative-shape file's fill/stroke keeps its exemption.
        border.add(tokenName);
      } else if (ICON_SHAPE_KEYS.has(key)) {
        fg.add(tokenName);
      } else {
        unclassified.push(`${file.relativePath}: "${key}" -> tokens.color.${tokenName}`);
      }
    }
  }

  return { fg, bg, border, unclassified, destructured };
}

describe('contrast-pair completeness guard', () => {
  it('scans a non-empty set of files', () => {
    // The empty-collection trap (brief, "Testing traps" in the original P0-7.0 brief): a scan
    // that silently returns zero files would make every assertion below vacuously true.
    expect(scannedFiles().length).toBeGreaterThan(0);
  });

  it('finds no tokens.color access via destructuring (would bypass this scan)', () => {
    expect(scan(scannedFiles()).destructured).toEqual([]);
  });

  it('classifies every tokens.color reference as foreground, background, or a named exemption', () => {
    expect(scan(scannedFiles()).unclassified).toEqual([]);
  });

  it('finds a non-empty set of foreground colour references', () => {
    expect(scan(scannedFiles()).fg.size).toBeGreaterThan(0);
  });

  it('finds a non-empty set of background colour references', () => {
    expect(scan(scannedFiles()).bg.size).toBeGreaterThan(0);
  });

  const { fg, bg, border } = scan(scannedFiles());

  it.each([...fg].map((name) => [name] as const))(
    'foreground token "%s" appears as some contrastPairs entry\'s fgToken',
    (tokenName) => {
      expect(contrastPairs.some((pair) => pair.fgToken === tokenName)).toBe(true);
    },
  );

  it.each([...bg].map((name) => [name] as const))(
    'background token "%s" appears as some contrastPairs entry\'s bgToken',
    (tokenName) => {
      expect(contrastPairs.some((pair) => pair.bgToken === tokenName)).toBe(true);
    },
  );

  it.each([...border].map((name) => [name] as const))(
    'border/decoration token "%s" is in the named exemption list',
    (tokenName) => {
      expect(Object.prototype.hasOwnProperty.call(EXEMPT_TOKENS, tokenName)).toBe(true);
    },
  );

  it('every fgToken/bgToken named in contrastPairs is a real tokens.color key', () => {
    // Guards the guard: a typo'd token name in tokens.ts would make the `.some()` checks above
    // pass against nothing.
    const validNames = new Set(Object.keys(tokens.color));
    expect(contrastPairs.length).toBeGreaterThan(0);
    for (const pair of contrastPairs) {
      expect(validNames.has(pair.fgToken)).toBe(true);
      expect(validNames.has(pair.bgToken)).toBe(true);
    }
  });
});
