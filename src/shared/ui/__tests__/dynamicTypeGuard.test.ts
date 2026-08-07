import { listSourceFiles } from '../sourceFiles';

/**
 * P0-7.0's accessibility pass, dynamic-type half (execution brief, "Accessibility"):
 * `allowFontScaling={false}` opts a Text/TextInput out of the OS's dynamic type setting, and is
 * banned outright. Scanned as source text, not rendered output — RN's default for
 * `allowFontScaling` is already `true`, so a render-based assertion on a component that never
 * mentions the prop would pass without proving anything about a later regression that adds
 * `allowFontScaling={false}` next to it.
 */
const SCANNED_DIRS = ['src/shared/ui', 'src/features/auth'];

describe('no component disables dynamic type', () => {
  it('scans a non-empty set of files', () => {
    const files = SCANNED_DIRS.flatMap(listSourceFiles);
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(SCANNED_DIRS.flatMap(listSourceFiles).map((f) => [f.relativePath, f] as const))(
    '%s does not set allowFontScaling={false}',
    (_name, file) => {
      expect(file.contents).not.toMatch(/allowFontScaling\s*=\s*{?\s*false\s*}?/);
    },
  );
});
