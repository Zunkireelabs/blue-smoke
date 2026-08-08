import { contrastPairs } from '../tokens';

/**
 * WCAG 2.x contrast ratio, computed here from the token hex values — not asserted against a
 * precomputed number derived by running the code (brief, "Accessibility" §). AA thresholds:
 * 4.5:1 for body text, 3:1 for large text (§1.4.3).
 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [channel(r), channel(g), channel(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_BODY = 4.5;
const AA_LARGE = 3;

describe('token contrast pairs meet WCAG AA', () => {
  it('has at least one pair to check', () => {
    // Guards against the empty-collection trap (brief, "Testing traps"): an `it.each` over an
    // empty array reports zero tests, not a failure, and would look green for the wrong reason.
    expect(contrastPairs.length).toBeGreaterThan(0);
  });

  it.each(contrastPairs.map((p) => [p.name, p] as const))('%s meets its AA threshold', (_name, pair) => {
    const threshold = pair.size === 'large' ? AA_LARGE : AA_BODY;
    const ratio = contrastRatio(pair.fg, pair.bg);
    expect(ratio).toBeGreaterThanOrEqual(threshold);
  });
});

export { contrastRatio };
