import * as fs from 'fs';
import * as path from 'path';

/**
 * Shared by the source-scanning guard tests in `__tests__/` (the token-only guard and the
 * dynamic-type guard). Lives outside `__tests__/` deliberately — the jest preset's default
 * `testMatch` treats every file under a `__tests__/` directory as a test file, and a helper
 * module with no `test()`/`it()` calls fails that way (same reasoning as
 * `src/features/auth/testUtils.ts`). Node typings for `fs`/`path`/`__dirname` come from the
 * sibling `nodeAmbient.d.ts`, not `@types/node` — see its header for why.
 */

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export interface SourceFile {
  relativePath: string;
  absolutePath: string;
  contents: string;
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') {
        continue;
      }
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
}

/** Every non-test `.ts`/`.tsx` file under a directory, relative to the repo root. */
export function listSourceFiles(relativeDir: string): SourceFile[] {
  const absoluteDir = path.join(REPO_ROOT, relativeDir);
  const files: string[] = [];
  walk(absoluteDir, files);
  return files.map((absolutePath) => ({
    absolutePath,
    relativePath: path.relative(REPO_ROOT, absolutePath),
    contents: fs.readFileSync(absolutePath, 'utf8'),
  }));
}

/** Reads one file by its repo-relative path, without walking a directory. */
export function readSourceFile(relativePath: string): SourceFile {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  return { relativePath, absolutePath, contents: fs.readFileSync(absolutePath, 'utf8') };
}
