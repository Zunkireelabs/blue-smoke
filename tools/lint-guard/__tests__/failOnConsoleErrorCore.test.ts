/**
 * Direct tests of tools/jest/failOnConsoleErrorCore.js — the record/assert/allow logic behind
 * the standing console.error guard (docs/execution-briefs/UI-BUILD-E-console-error-guard.md).
 *
 * Live here rather than in tools/jest itself: the guard's own module must not gain a fifth Jest
 * project (the brief wires it into the existing four), and this is the one of those four whose
 * scope is repo tooling in general rather than a specific domain (mock-peripheral is BLE,
 * supabase/functions is Edge Functions) — see this project's own jest.config.js header.
 *
 * This is what proves the guard is not a no-op: it exercises reset/recordConsoleError/
 * allowConsoleError/assertNoUnexpectedConsoleErrors directly, without going through a real
 * console.error call or Jest's own beforeEach/afterEach — so a bug in the guard's Jest wiring
 * (failOnConsoleError.js) can't hide a bug in the guard's logic, or vice versa.
 */
import {
  reset,
  beginTest,
  endTest,
  recordConsoleError,
  allowConsoleError,
  assertNoUnexpectedConsoleErrors,
} from '../../jest/failOnConsoleErrorCore';

// This module's state is a singleton shared with the guard's own Jest wiring
// (failOnConsoleError.js), which is itself active for this suite (it's wired into every
// project, including this one, and its afterEach is registered before this file loads, so it
// runs before any afterEach declared here). reset() before each test, so a prior test's
// leftovers can't taint this one, and so a deliberately-provoked call or allowance never survives
// to reach the guard's own afterEach and fail the test for real. assertNoUnexpectedConsoleErrors()
// also drains, so an assertion under test leaves nothing behind either way.
beforeEach(() => {
  reset();
});

test('an unasserted console.error call throws on assert', () => {
  recordConsoleError(['boom']);
  expect(() => assertNoUnexpectedConsoleErrors()).toThrow(/boom/);
  reset();
});

test('no console.error calls does not throw on assert', () => {
  expect(() => assertNoUnexpectedConsoleErrors()).not.toThrow();
});

test('a console.error call matching an allowance does not throw', () => {
  allowConsoleError('boom');
  recordConsoleError(['boom']);
  expect(() => assertNoUnexpectedConsoleErrors()).not.toThrow();
});

test('a console.error call matching a regexp allowance does not throw', () => {
  allowConsoleError(/^boo.$/);
  recordConsoleError(['boom']);
  expect(() => assertNoUnexpectedConsoleErrors()).not.toThrow();
});

test('an allowance that never matches a call fails the assert', () => {
  allowConsoleError('never fires');
  expect(() => assertNoUnexpectedConsoleErrors()).toThrow(/never fires/);
  reset();
});

test('reset clears both recorded calls and allowances', () => {
  allowConsoleError('boom');
  recordConsoleError(['boom']);
  reset();
  expect(() => assertNoUnexpectedConsoleErrors()).not.toThrow();
});

// The blind spots the guard had to close: a call raised outside a test body used to be dropped
// silently by a reset() at the top of beforeEach, so a beforeAll hook or a late async callback
// could log an act() warning and leave the run green.

test('a call recorded outside a test body is carried to the next boundary, not dropped', () => {
  // No beginTest() — this is what a beforeAll hook or module-scope call looks like.
  recordConsoleError(['from a beforeAll']);
  beginTest(); // the next test starts; the earlier call must survive it
  expect(() => assertNoUnexpectedConsoleErrors()).toThrow(/from a beforeAll/);
  endTest();
});

test('a call recorded outside a test body is labelled as such', () => {
  recordConsoleError(['late timer']);
  expect(() => assertNoUnexpectedConsoleErrors()).toThrow(/recorded outside a test body/);
});

test('a call recorded inside a test body carries no outside-a-test caveat', () => {
  beginTest();
  recordConsoleError(['in the test']);
  expect(() => assertNoUnexpectedConsoleErrors()).not.toThrow(/recorded outside a test body/);
  endTest();
});

test('endTest marks a later call as outside a test body', () => {
  beginTest();
  endTest();
  recordConsoleError(['arrived after the test finished']);
  expect(() => assertNoUnexpectedConsoleErrors()).toThrow(/recorded outside a test body/);
});

test('assert drains, so one unexpected call fails exactly one boundary', () => {
  recordConsoleError(['boom']);
  expect(() => assertNoUnexpectedConsoleErrors()).toThrow(/boom/);
  // Without draining, every subsequent assert would re-throw on the same call and cascade the
  // failure across every remaining test in the file.
  expect(() => assertNoUnexpectedConsoleErrors()).not.toThrow();
});

test('assert drains allowances too, so a matched one cannot go stale later', () => {
  allowConsoleError('boom');
  recordConsoleError(['boom']);
  expect(() => assertNoUnexpectedConsoleErrors()).not.toThrow();
  expect(() => assertNoUnexpectedConsoleErrors()).not.toThrow();
});
