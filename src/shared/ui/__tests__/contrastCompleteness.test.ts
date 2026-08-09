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
  'src/features/auth/SignupScreen.tsx',
  'src/features/auth/LoginScreen.tsx',
  'src/features/auth/PhoneInputScreen.tsx',
  'src/features/auth/CountryPicker.tsx',
  'src/features/auth/OtpEntryScreen.tsx',
  'src/features/auth/PasswordResetRequestScreen.tsx',
  'src/features/auth/ResetPasswordConfirmScreen.tsx',
  'src/features/profile/ProfileScreen.tsx',
  'src/features/devices/HomeScreen.tsx',
  'src/features/auth/SignOutButton.tsx',
  'src/features/verification/VerifyIntroScreen.tsx',
  'src/features/verification/CameraPrimingScreen.tsx',
  'src/features/verification/PersonaVerificationScreen.tsx',
  'src/features/verification/TransportErrorScreen.tsx',
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
/** Keys whose value is the surface text/an icon sits on. */
const BG_KEYS = new Set(['backgroundColor']);
/** Keys whose value never renders text or an icon — outlines only. Tokens found under these
 * keys must be named in `EXEMPT_TOKENS` below, not silently skipped. */
const BORDER_KEYS = new Set(['borderColor', 'shadowColor']);

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
    for (const match of file.contents.matchAll(COLOR_REFERENCE)) {
      const [, key, tokenName] = match;
      if (FG_KEYS.has(key)) {
        fg.add(tokenName);
      } else if (BG_KEYS.has(key)) {
        bg.add(tokenName);
      } else if (BORDER_KEYS.has(key)) {
        border.add(tokenName);
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
