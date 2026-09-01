import { statusBarStyleFor } from '../GroundStatusBar';
import { tokens } from '../tokens';

/**
 * Guards the fix for the 2026-09-01 device finding: with the phone in dark mode, the app set
 * `light-content` globally from `useColorScheme()`, so Profile's white header rendered the OS
 * clock/wifi/signal white-on-white and they vanished. The style must follow the colour under
 * the bar, never the OS theme.
 *
 * Asserted against real `tokens.color.*` values rather than hand-picked hexes, so a reskin that
 * darkens a ground has to come past this test.
 */
describe('statusBarStyleFor', () => {
  it('picks light content on the dark brand blue (auth header, BrandGround)', () => {
    expect(statusBarStyleFor(tokens.color.brand)).toBe('light-content');
  });

  it("picks light content on Home's brand wash top stop", () => {
    expect(statusBarStyleFor(tokens.color.homeWashStop1)).toBe('light-content');
  });

  it("picks dark content on CurtainGround's pale default wash top stop", () => {
    // The case a single global value cannot get right: same component as Home, opposite answer.
    expect(statusBarStyleFor(tokens.color.groundTopStrong)).toBe('dark-content');
  });

  it("picks dark content on GradientGround's pale default top stop", () => {
    expect(statusBarStyleFor(tokens.color.groundTop)).toBe('dark-content');
  });

  it('picks dark content on the plain white Screen background', () => {
    // The exact regression: Profile is a `Screen`, and this is what went invisible.
    expect(statusBarStyleFor(tokens.color.background)).toBe('dark-content');
  });

  it('picks light content on near-black and dark content on pure white', () => {
    expect(statusBarStyleFor(tokens.color.textPrimary)).toBe('light-content');
    expect(statusBarStyleFor(tokens.color.surface)).toBe('dark-content');
  });

  it('falls back to dark content for a value it cannot parse', () => {
    // Alpha-blended tints and platform colours have no hex to measure; guessing would be worse
    // than defaulting for a light-only app.
    expect(statusBarStyleFor(tokens.color.pressVeil)).toBe('dark-content');
    expect(statusBarStyleFor('transparent')).toBe('dark-content');
    expect(statusBarStyleFor('')).toBe('dark-content');
  });

  it('accepts a hex with or without the leading hash', () => {
    expect(statusBarStyleFor(tokens.color.brand.replace('#', ''))).toBe('light-content');
  });
});
