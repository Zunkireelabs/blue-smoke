/**
 * P1-3.0 §3.4 — proves the `.eslintrc.js` overrides added for P1-3.0 actually fire, same
 * discipline as `verificationGuard.test.ts`, whose header says it plainly: "a green check that
 * was never broken is not evidence, it's a guess." `tools/mock-peripheral` is now reachable
 * from `src/` at exactly one point (`src/app/providers.tsx`, `__DEV__`-gated) — this file is
 * what stops a second import site from ever landing unnoticed. A fake BLE stack reachable from
 * any other production path is a device that unlocks without a device.
 *
 * Probe files are written just before their assertion and removed in a `finally` immediately
 * after — see `verificationGuard.test.ts`'s header for why. Assertions are on `ruleId`, never
 * message text.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PROBE_FILENAME = '__eslint_probe__.ts';
const MOCK_IMPORT_LINE = "import { createMockPeripheral } from '../../../tools/mock-peripheral/bleAdapter';\n";

interface EslintMessage {
  ruleId: string | null;
  severity: number;
}

interface EslintResult {
  filePath: string;
  messages: EslintMessage[];
  errorCount: number;
}

/** Runs `eslint --format json` on one file and returns its parsed result. Never throws on lint
 * errors — ESLint exits non-zero when it finds any, which is the expected outcome for every
 * probe here except the clean-file and sanctioned-import cases. */
function lintFile(absolutePath: string): EslintResult {
  let stdout: string;
  try {
    stdout = execFileSync(
      'npx',
      ['eslint', absolutePath, '--format', 'json', '--no-eslintrc', '--no-ignore', '-c', path.join(REPO_ROOT, '.eslintrc.js')],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
  } catch (err) {
    const execErr = err as { stdout?: string | Buffer };
    stdout = execErr.stdout ? execErr.stdout.toString() : '[]';
  }
  const results = JSON.parse(stdout) as EslintResult[];
  return results[0];
}

/** Writes `content` to `<dir>/__eslint_probe__.ts`, runs the assertion, and guarantees the
 * probe is gone afterwards — including when the assertion throws. */
function withProbe(dir: string, content: string, run: (result: EslintResult) => void): void {
  const absoluteDir = path.join(REPO_ROOT, dir);
  const absolutePath = path.join(absoluteDir, PROBE_FILENAME);
  fs.writeFileSync(absolutePath, content, 'utf8');
  try {
    run(lintFile(absolutePath));
  } finally {
    fs.rmSync(absolutePath, { force: true });
  }
}

function ruleIds(result: EslintResult): (string | null)[] {
  return result.messages.map((m) => m.ruleId);
}

describe('tools/mock-peripheral import guard (P1-3.0 §3.4)', () => {
  it('flags an import of the mock from an ordinary src/ feature directory', () => {
    withProbe('src/features/devices', MOCK_IMPORT_LINE, (result) => {
      expect(result.errorCount).toBeGreaterThan(0);
      expect(ruleIds(result)).toContain('no-restricted-imports');
    });
  });

  it('flags an import of the mock from src/features/verification too — same guard, folded into that subtree\'s own override', () => {
    withProbe('src/features/verification', MOCK_IMPORT_LINE, (result) => {
      expect(result.errorCount).toBeGreaterThan(0);
      expect(ruleIds(result)).toContain('no-restricted-imports');
    });
  });

  it('flags an import of the mock from src/app itself, outside providers.tsx', () => {
    withProbe('src/app', MOCK_IMPORT_LINE, (result) => {
      expect(result.errorCount).toBeGreaterThan(0);
      expect(ruleIds(result)).toContain('no-restricted-imports');
    });
  });

  it('does NOT flag a __tests__/ file that imports the mock — the other sanctioned caller', () => {
    withProbe('src/features/devices/__tests__', MOCK_IMPORT_LINE, (result) => {
      expect(ruleIds(result)).not.toContain('no-restricted-imports');
    });
  });

  it('does NOT flag the real src/app/providers.tsx — the one sanctioned wiring point', () => {
    // Not a probe: this lints the actual file, which by now genuinely does import the mock
    // (behind __DEV__) — the strongest version of this assertion, not a synthetic stand-in.
    const result = lintFile(path.join(REPO_ROOT, 'src/app/providers.tsx'));
    expect(ruleIds(result)).not.toContain('no-restricted-imports');
  });

  it('CLEAN CASE: an unremarkable file with no mock import reports zero errors', () => {
    withProbe(
      'src/features/devices',
      `export function clean(x: number): number {\n  return x + 1;\n}\n`,
      (result) => {
        expect(result.errorCount).toBe(0);
      },
    );
  });
});
