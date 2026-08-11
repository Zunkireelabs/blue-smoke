import * as path from 'path';
import { listSourceFiles, readSourceFile } from '../sourceFiles';

/**
 * P0-7.0's token-only guard (execution brief, "The token-only guard"). The actual deliverable
 * of P0-7.0 is that every visual value in `src/shared/ui/**` and the restyled screens comes
 * from `tokens.ts`, so reskinning is a single-file edit — enforced here, not by good
 * intentions. Fails on a literal `#rrggbb`/`rgb(`/`rgba(` outside `tokens.ts`.
 *
 * `listSourceFiles` already skips `__tests__/`, so this only ever sees production source, and
 * `tokens.ts` is excluded by name below (it's the one file allowed to hold literal colors).
 */
const LITERAL_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/;

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

function filesUnderGuard() {
  const kitFiles = listSourceFiles('src/shared/ui').filter((f) => path.basename(f.relativePath) !== 'tokens.ts');
  const screenFiles = RESTYLED_SCREENS.map(readSourceFile);
  return [...kitFiles, ...screenFiles];
}

describe('token-only guard — no literal colors outside tokens.ts', () => {
  it('checks a non-empty set of files', () => {
    expect(filesUnderGuard().length).toBeGreaterThan(0);
  });

  it.each(filesUnderGuard().map((f) => [f.relativePath, f] as const))('%s has no literal color value', (_name, file) => {
    expect(file.contents).not.toMatch(LITERAL_COLOR);
  });

  it('tokens.ts is excluded from the scan and may hold literal colors', () => {
    const tokensFile = readSourceFile('src/shared/ui/tokens.ts');
    expect(tokensFile.contents).toMatch(LITERAL_COLOR);
    expect(filesUnderGuard().some((f) => f.relativePath === tokensFile.relativePath)).toBe(false);
  });
});
