import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

/**
 * Two ticks, not one: the first settles `AccessibilityInfo.isReduceMotionEnabled()`'s `.then`
 * (which `BrandMark`'s mount effect awaits), the second lets the `setReduceMotion` state update
 * that `.then` triggers actually flush. Both must happen inside the same `act` the renderer is
 * created in, or the state update lands outside any act scope and React warns.
 */
async function flushReduceMotionMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** For suites that just need `ReactTestRenderer.create`, wrapped so the effects it triggers are captured. */
export async function renderSettled(
  element: React.ReactElement,
): Promise<ReactTestRenderer.ReactTestRenderer> {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(element);
    await flushReduceMotionMicrotasks();
  });
  return renderer;
}

/** For suites that must construct the renderer themselves (e.g. wrapping it in a navigator) —
 * call this inside the same `act` the renderer was created in. */
export async function flushSettled(): Promise<void> {
  await flushReduceMotionMicrotasks();
}
