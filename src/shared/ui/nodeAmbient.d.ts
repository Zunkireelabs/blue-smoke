/**
 * The root `tsconfig.json` deliberately omits `@types/node` (`"types": ["jest"]` — see
 * `tools/lint-guard/tsconfig.json`'s header for why a Node-only test project normally gets its
 * own tsconfig instead). These two guard tests need to read repo source as plain text rather
 * than render anything, which needs `fs`/`path`/`__dirname` — minimal ambient shapes for just
 * the calls they make, scoped to this directory only, so the fix doesn't touch the shared root
 * tsconfig (a shared-truth file per CLAUDE.md) or add `tools/**` to this branch's diff.
 */
declare module 'fs' {
  export interface Dirent {
    name: string;
    isDirectory(): boolean;
  }
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
}

declare module 'path' {
  export function resolve(...parts: string[]): string;
  export function join(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function basename(path: string): string;
}

declare const __dirname: string;
