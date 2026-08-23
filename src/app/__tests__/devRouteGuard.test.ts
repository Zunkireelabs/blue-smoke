import { readSourceFile } from '@/shared/ui/sourceFiles';

/**
 * `H158BringUp` is a dev-only bring-up spike for real H158/YP65-AT hardware. It must stay
 * behind the age gate, and it must stay out of the URL surface.
 *
 * This guard exists because of a specific near-miss. On 2026-08-20 a bench session needed to
 * reach the bring-up screen on a machine with no backend configured, and did it by registering
 * the route on the **auth** stack — reachable with no session and no age verification. It was
 * reverted before anything was committed (see `docs/session-log/anish.md`, 2026-08-20, "Tried
 * and abandoned"), but it was reverted by hand, under time pressure, on a branch with other
 * uncommitted work. The failure mode is a single `git add -A` away, and nothing would have
 * caught it: `navigation.gating.test.tsx` asserts on `selectStack`, which such a change does
 * not touch.
 *
 * The legitimate way to reach this screen is the `__DEV__` button on `HomeScreen`, which needs
 * no bypass at all — that screen only mounts once you are signed in and verified.
 *
 * Source-scanned rather than rendered, for the reason `navigation.gating.test.tsx` explains at
 * length: React Navigation mounts only the focused screen, so "is this route reachable from
 * that stack" is not observable in the rendered tree.
 */
const NAVIGATION = 'src/app/navigation.tsx';
const DEV_ROUTE = 'H158BringUp';

function navigationSource(): string {
  return readSourceFile(NAVIGATION).contents;
}

/** The `stack === 'auth' ? (…)` arm — from its opening to the start of the `home` arm. */
function authStackBlock(source: string): string {
  const start = source.indexOf("stack === 'auth'");
  const end = source.indexOf("stack === 'home'");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('dev-only route guard — H158BringUp stays behind the age gate', () => {
  it('reads a navigation file that still registers the route', () => {
    // Guards the guard: if the route is renamed or removed, the assertions below would pass
    // vacuously against a file that no longer contains it.
    expect(navigationSource()).toContain(DEV_ROUTE);
  });

  it('does not register the route on the auth stack', () => {
    // The exact 2026-08-20 regression. An unauthenticated user must not be able to reach a
    // screen that drives real hardware, even in a dev build.
    expect(authStackBlock(navigationSource())).not.toContain(DEV_ROUTE);
  });

  it('keeps the route behind a __DEV__ guard', () => {
    // `__DEV__` is stripped from release bundles, so this is what keeps the screen out of
    // production entirely rather than merely out of reach.
    const source = navigationSource();
    const routeIndex = source.lastIndexOf(DEV_ROUTE);
    const precedingBlock = source.slice(0, routeIndex);
    expect(precedingBlock.lastIndexOf('__DEV__')).toBeGreaterThan(
      precedingBlock.lastIndexOf('<Stack.Navigator'),
    );
  });

  it('is not reachable by deep link', () => {
    // navigation.tsx's own comment: "a deep link that could reach Home would be a way around
    // the age gate's UI". The same reasoning applies with more force to this route.
    const source = navigationSource();
    const linkingStart = source.indexOf('const linking');
    const linkingEnd = source.indexOf('};', linkingStart);
    expect(linkingStart).toBeGreaterThan(-1);
    expect(source.slice(linkingStart, linkingEnd)).not.toContain(DEV_ROUTE);
  });
});
