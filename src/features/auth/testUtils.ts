import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';

/**
 * Shared helpers for driving react-hook-form + react-native inputs without
 * @testing-library/react-native — that package isn't installed, and adding
 * it is a package.json change requiring the CLAUDE.md announcement first.
 * `react-test-renderer`'s own instance API (already a devDependency) is
 * enough for these screens' needs.
 *
 * Lives outside `__tests__/` deliberately — the jest preset's default
 * `testMatch` treats every file under a `__tests__/` directory as a test
 * file, and a helper module with no `test()`/`it()` calls fails that way.
 */

export function findInput(renderer: ReactTestRenderer, accessibilityLabel: string): ReactTestInstance {
  return renderer.root.findByProps({ accessibilityLabel });
}

export function findButton(renderer: ReactTestRenderer): ReactTestInstance {
  return renderer.root.findByProps({ accessibilityRole: 'button' });
}

/** Flattens the rendered tree to a single string for substring assertions on visible text. */
export function renderedText(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}
