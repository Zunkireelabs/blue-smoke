/* eslint-env jest */
// Jest setupFilesAfterEnv entry, wired into all four projects — see the root jest.config.js and
// the three project configs under tools/mock-peripheral, tools/lint-guard, and
// supabase/functions. Turns an unexpected console.error into a failure of the test that produced
// it; see docs/execution-briefs/UI-BUILD-E-console-error-guard.md for the design rationale.
//
// This file only wires failOnConsoleErrorCore.js's record/assert/allow logic into Jest's
// lifecycle hooks — see that file for the actual logic, which is tested directly there.
const {
  beginTest,
  endTest,
  recordConsoleError,
  allowConsoleError,
  assertNoUnexpectedConsoleErrors,
} = require('./failOnConsoleErrorCore');

const originalConsoleError = console.error;

// Installed once, at module load, rather than re-installed in beforeEach: beforeAll hooks,
// module-scope code and async callbacks that land between tests all run outside any beforeEach,
// so installing there left them unguarded. The core tags anything recorded outside a test body
// and carries it to the next boundary, so it fails a test instead of vanishing.
//
// A plain assignment, not jest.spyOn: several suites call jest.restoreAllMocks() in their own
// afterEach, which would silently unhook a spyOn-based guard partway through a run. Assigning
// console.error directly is immune to that — restoreAllMocks() has nothing to restore here.
console.error = (...args) => {
  recordConsoleError(args);
  // Always forward to the real console.error — a guard that hides the output it fails on makes
  // debugging worse.
  originalConsoleError.apply(console, args);
};

beforeEach(() => {
  beginTest();
});

afterEach(() => {
  // Assert, don't throw from inside the console.error replacement — React calls console.error
  // from inside its own render/commit paths, some of which sit behind try/catch, so a throw
  // there is either swallowed or surfaces as an unrelated failure. Asserting here attributes the
  // failure cleanly to the test that produced the unexpected call.
  endTest();
  assertNoUnexpectedConsoleErrors();
});

afterAll(() => {
  console.error = originalConsoleError;
  // The tail: anything recorded after the final afterEach has no later test boundary to be
  // reported at, so assert once more here rather than let the last one escape.
  assertNoUnexpectedConsoleErrors();
});

module.exports = { allowConsoleError };
