// Small, framework-agnostic core for the standing console.error guard (see
// docs/execution-briefs/UI-BUILD-E-console-error-guard.md). Kept separate from
// failOnConsoleError.js's Jest wiring (beforeEach/afterEach/afterAll) so this logic can be
// exercised directly in a test, rather than only ever proven by the guard itself running clean.
//
// Deliberately plain module state, not a class — there is exactly one console.error stream per
// Jest worker, and failOnConsoleError.js drives the boundaries.

let calls = [];
let allowances = [];
let insideTest = false;

function reset() {
  calls = [];
  allowances = [];
  insideTest = false;
}

// Called from beforeEach. Note what it does *not* do: it does not clear `calls`. A console.error
// raised in a beforeAll hook, at module scope, or from an async callback that landed after the
// previous test's afterEach would otherwise be dropped on the floor and the run would stay green
// — the exact blind spot that lets a late-arriving act() warning survive. Such calls are already
// carried into this test so they surface. Anything still buffered when a test begins was by
// definition produced before this test's body ran, so tag it — a 0ms timer can fire before the
// previous test's afterEach and would otherwise be blamed on this test with no caveat.
function beginTest() {
  for (const call of calls) {
    call.outsideTest = true;
  }
  insideTest = true;
}

// Called from afterEach *before* asserting, so anything arriving after this point (a stray timer,
// a settled promise) is tagged as having landed outside a test body rather than being blamed
// silently on whichever test happens to run next.
function endTest() {
  insideTest = false;
}

function recordConsoleError(args) {
  calls.push({ message: args.map(String).join(' '), outsideTest: !insideTest });
}

// Escape hatch for a test that legitimately asserts on console.error output. Per-test, explicit,
// never global — see the brief for why a blanket mute or allowlist is not an option.
function allowConsoleError(matcher) {
  allowances.push({ matcher, matched: false });
}

function matchesAllowance(allowance, message) {
  return typeof allowance.matcher === 'string'
    ? message.includes(allowance.matcher)
    : allowance.matcher.test(message);
}

const OUTSIDE_TEST_NOTE =
  '      ↑ recorded outside a test body (a beforeAll/afterAll hook, module scope, or an async\n' +
  '        callback that arrived after the previous test finished). It is reported here because\n' +
  '        this is the nearest test boundary — the call site is not necessarily this test.';

function describeCall(call) {
  return call.outsideTest ? `  - ${call.message}\n${OUTSIDE_TEST_NOTE}` : `  - ${call.message}`;
}

// Throws (does not report via a return value) so a caller wiring this into afterEach gets a
// failure attributed to the test that produced the unexpected call, with no chance to forget to
// check a return value. Drains both buffers first, so one unexpected call fails exactly one test
// rather than cascading into every test after it.
function assertNoUnexpectedConsoleErrors() {
  const recorded = calls;
  const declared = allowances;
  calls = [];
  allowances = [];

  const unmatched = [];
  for (const call of recorded) {
    const allowance = declared.find((candidate) => matchesAllowance(candidate, call.message));
    if (allowance) {
      allowance.matched = true;
    } else {
      unmatched.push(call);
    }
  }
  const stale = declared.filter((allowance) => !allowance.matched);

  if (unmatched.length === 0 && stale.length === 0) {
    return;
  }

  const parts = [];
  if (unmatched.length > 0) {
    parts.push(`Unexpected console.error call(s):\n${unmatched.map(describeCall).join('\n')}`);
  }
  if (stale.length > 0) {
    parts.push(
      `allowConsoleError() matcher(s) that never matched a console.error call:\n${stale
        .map((allowance) => `  - ${allowance.matcher}`)
        .join('\n')}`
    );
  }
  throw new Error(parts.join('\n\n'));
}

module.exports = {
  reset,
  beginTest,
  endTest,
  recordConsoleError,
  allowConsoleError,
  assertNoUnexpectedConsoleErrors,
};
