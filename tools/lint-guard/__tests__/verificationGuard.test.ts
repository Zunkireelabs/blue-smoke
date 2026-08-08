/**
 * Proves the `.eslintrc.js` overrides added for P2-1.0 (follow-up) actually fire — the same
 * discipline as every other proof file in this repo: a green check that was never broken is
 * not evidence, it's a guess. `docs/audits/P2-1.0-retroactive-review.md` (finding F1) showed a
 * `console.log` of an `inquiry_id` beside an email lints clean with no guard at all; this file
 * is what stops that regressing silently a second time.
 *
 * ── What is being proved, and what is NOT ──────────────────────────────────────────────
 * These rules are a TRIPWIRE for the direct case — an identifier that looks like `inquiry_id`
 * passed straight into `console.*`, or a banned import — not a proof of the underlying
 * data-flow rule ("never log inquiry_id alongside anything re-identifying"). ESLint has no
 * data-flow analysis; `const p = { id: inquiryId, who: user.email }; log(p)` would sail
 * through every rule below. Nothing here should be read as saying otherwise.
 *
 * ── The trap this file exists to avoid ─────────────────────────────────────────────────
 * A probe file containing a deliberate violation cannot be committed inside
 * `src/features/verification/**` or `supabase/functions/{persona-webhook,create-inquiry}/**`
 * — `npm run lint` would then fail for the whole repo, for everyone, forever. Every probe
 * below is written just before its assertion and removed in a `finally` block immediately
 * after, so a failing assertion cannot leave a stray file behind. The fixed probe filename
 * (`__eslint_probe__.ts`) is also listed in `.gitignore` as a second line of defence, in case
 * a crash ever skips the `finally`.
 *
 * Assertions are on `ruleId`, never on message text — messages get reworded and a text-based
 * assertion would be testing prose, not enforcement.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PROBE_FILENAME = '__eslint_probe__.ts';

interface EslintMessage {
  ruleId: string | null;
  severity: number;
}

interface EslintResult {
  filePath: string;
  messages: EslintMessage[];
  errorCount: number;
}

/** Runs `eslint --format json` on one file and returns its parsed result. Never throws on
 * lint errors — ESLint exits non-zero when it finds any, which is the expected outcome for
 * every probe here except the clean-file cases. */
function lintFile(absolutePath: string): EslintResult {
  let stdout: string;
  try {
    stdout = execFileSync(
      'npx',
      ['eslint', absolutePath, '--format', 'json', '--no-eslintrc', '--no-ignore', '-c', path.join(REPO_ROOT, '.eslintrc.js')],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
  } catch (err) {
    // ESLint exits 1 when it reports any error — that is success for this helper, not failure.
    // The lint output is still on stdout of the child process, captured on the exception.
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

describe('verification-subtree ESLint guard (§4 of the P2-1.0 follow-up brief)', () => {
  it('flags console.log of an inquiryId in the RN subtree — no-console', () => {
    withProbe(
      'src/features/verification',
      `export function probe(inquiryId: string) {\n  console.log('inquiry', inquiryId);\n  return inquiryId;\n}\n`,
      (result) => {
        expect(result.errorCount).toBeGreaterThan(0);
        expect(ruleIds(result)).toContain('no-console');
      },
    );
  });

  it('flags a @sentry/react-native import in the RN subtree — no-restricted-imports', () => {
    withProbe(
      'src/features/verification',
      `import * as Sentry from '@sentry/react-native';\n\nexport function probe() {\n  Sentry.captureException(new Error('x'));\n}\n`,
      (result) => {
        expect(result.errorCount).toBeGreaterThan(0);
        expect(ruleIds(result)).toContain('no-restricted-imports');
      },
    );
  });

  it('flags console.error(`… ${inquiryId}`) in persona-webhook — no-restricted-syntax', () => {
    withProbe(
      'supabase/functions/persona-webhook',
      `export function probe(inquiryId: string) {\n  console.error(\`failed for \${inquiryId}\`);\n  return inquiryId;\n}\n`,
      (result) => {
        expect(result.errorCount).toBeGreaterThan(0);
        expect(ruleIds(result)).toContain('no-restricted-syntax');
      },
    );
  });

  it('does NOT flag no-console in persona-webhook — genuine console.error must survive', () => {
    // The negative case for §3.2's central constraint: a blanket no-console would break the 9
    // real call sites. This proves the override for that directory really omits no-console,
    // not just that this one probe happens to avoid it.
    withProbe(
      'supabase/functions/persona-webhook',
      `export function probe() {\n  console.error('operational message, no identifier');\n}\n`,
      (result) => {
        expect(ruleIds(result)).not.toContain('no-console');
        expect(result.errorCount).toBe(0);
      },
    );
  });

  it('flags console.error(`… ${inquiryId}`) in create-inquiry too — same override', () => {
    withProbe(
      'supabase/functions/create-inquiry',
      `export function probe(inquiryId: string) {\n  console.error(\`failed for \${inquiryId}\`);\n  return inquiryId;\n}\n`,
      (result) => {
        expect(result.errorCount).toBeGreaterThan(0);
        expect(ruleIds(result)).toContain('no-restricted-syntax');
      },
    );
  });

  it('CLEAN CASE: an unremarkable file in the RN subtree reports zero errors', () => {
    // Not optional (§4 of the brief): a rule that fires on everything is indistinguishable
    // from a working rule until it blocks someone's legitimate commit. This is the mutation
    // check for the guard itself.
    withProbe(
      'src/features/verification',
      `export function clean(x: number): number {\n  return x + 1;\n}\n`,
      (result) => {
        expect(result.errorCount).toBe(0);
      },
    );
  });

  it('CLEAN CASE: an unremarkable file in persona-webhook reports zero errors', () => {
    withProbe(
      'supabase/functions/persona-webhook',
      `export function clean(x: number): number {\n  return x + 1;\n}\n`,
      (result) => {
        expect(result.errorCount).toBe(0);
      },
    );
  });
});
