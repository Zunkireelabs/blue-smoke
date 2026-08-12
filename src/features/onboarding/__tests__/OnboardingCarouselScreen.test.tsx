/**
 * ON-1..3 — same press-and-assert pattern as `deadEndExits.test.tsx` /
 * `verifyIntroAndCameraPriming.test.tsx`: every CTA is pressed and its actual effect asserted,
 * not just that the label renders.
 */
import React from 'react';
import { AccessibilityInfo, Dimensions, ScrollView, StyleSheet } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingCarouselScreen } from '../OnboardingCarouselScreen';
import {
  useOnboardingStore,
  __resetOnboardingListenerForTests,
} from '@/app/stores/useOnboardingStore';
import { renderedText } from '@/features/auth/testUtils';
import { tokens } from '@/shared/ui';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

let renderers: ReactTestRenderer.ReactTestRenderer[] = [];

function renderCarousel() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<OnboardingCarouselScreen />);
  });
  renderers.push(renderer);
  return renderer;
}

async function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  await act(async () => {
    const matches = renderer.root
      .findAllByProps({ accessibilityLabel: label })
      .filter((instance) => typeof instance.props.onPress === 'function');
    await matches[matches.length - 1].props.onPress();
  });
}

/** Scoped to the pager's own subtree, not the whole tree — the header illustration also sets a
 * numeric `{ width, height }` on its outer `View`, and searching from the root would find that
 * one first instead of an actual page. */
function findPageWidthNodes(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findByType(ScrollView)
    .findAll((node) => typeof node.type === 'string' && typeof StyleSheet.flatten(node.props.style ?? {}).width === 'number');
}

/** The pager's per-card page width, read off a rendered page `View` rather than recomputed —
 * this is "whatever the screen is actually using today", for driving `onMomentumScrollEnd`
 * the same way a real swipe's final offset would. */
function getRenderedPageWidth(renderer: ReactTestRenderer.ReactTestRenderer): number {
  const [first] = findPageWidthNodes(renderer);
  return StyleSheet.flatten(first.props.style).width as number;
}

function fireScrollEnd(renderer: ReactTestRenderer.ReactTestRenderer, x: number) {
  const scrollView = renderer.root.findByType(ScrollView);
  act(() => {
    scrollView.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x } } });
  });
}

function pageLabelCount(renderer: ReactTestRenderer.ReactTestRenderer, label: string): number {
  return renderer.root.findAllByProps({ accessibilityLabel: label }).length;
}

/** Lets each illustration's pending `AccessibilityInfo.isReduceMotionEnabled()` promise settle
 * before a synchronous test finishes and `afterEach` unmounts — same two-tick pattern as
 * `BrandMark.test.tsx`. Without it, the state update can land after unmount and print an act()
 * warning. */
async function flushReduceMotionCheck() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ON-1..3 — the onboarding carousel', () => {
  beforeEach(() => {
    (AsyncStorage as unknown as { __resetMockStorage: () => void }).__resetMockStorage();
    __resetOnboardingListenerForTests();
    // ON-2's ProximityIllustration animates its arcs unless reduced motion is on — same reasoning
    // as `BrandMark.test.tsx`: without this, a real `useNativeDriver: true` loop can start and
    // outlive the test (nothing here unmounts synchronously enough to race it), leaking a timer
    // into whichever suite runs next.
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  });

  afterEach(() => {
    act(() => {
      renderers.forEach((renderer) => renderer.unmount());
    });
    renderers = [];
    jest.restoreAllMocks();
  });

  it('Continue advances through all three cards in order', async () => {
    const renderer = renderCarousel();
    expect(renderedText(renderer)).toContain('Welcome to BlueSmoke');

    await press(renderer, 'Continue');
    expect(renderedText(renderer)).toContain('It locks itself');

    await press(renderer, 'Continue');
    expect(renderedText(renderer)).toContain('What we hold');
  });

  it('does not imply the app itself does the locking on card 2', async () => {
    const renderer = renderCarousel();
    await press(renderer, 'Continue');
    expect(renderedText(renderer)).toContain('even if BlueSmoke is closed');
  });

  it('Get started on the final card marks onboarding seen', async () => {
    const renderer = renderCarousel();
    await press(renderer, 'Continue');
    await press(renderer, 'Continue');

    await press(renderer, 'Get started');

    expect(useOnboardingStore.getState().status).toBe('seen');
    expect(await AsyncStorage.getItem('onboarding.seen.v1')).toBe('true');
  });

  it('Skip on card 2 marks onboarding seen without visiting card 3', async () => {
    const renderer = renderCarousel();
    await press(renderer, 'Continue');
    expect(renderedText(renderer)).toContain('It locks itself');

    await press(renderer, 'Skip');

    expect(useOnboardingStore.getState().status).toBe('seen');
  });

  it('card 1 has no Skip affordance', () => {
    const renderer = renderCarousel();
    const matches = renderer.root.findAllByProps({ accessibilityLabel: 'Skip' });
    expect(matches.length).toBe(0);
  });

  it("swipe (onMomentumScrollEnd) drives PageDots' label and the CTA off the same index", async () => {
    const renderer = renderCarousel();
    await flushReduceMotionCheck();
    const pageWidth = getRenderedPageWidth(renderer);

    fireScrollEnd(renderer, pageWidth * 2);
    expect(pageLabelCount(renderer, 'Page 3 of 3')).toBeGreaterThan(0);
    expect(pageLabelCount(renderer, 'Get started')).toBeGreaterThan(0);
    expect(pageLabelCount(renderer, 'Continue')).toBe(0);

    fireScrollEnd(renderer, 0);
    expect(pageLabelCount(renderer, 'Page 1 of 3')).toBeGreaterThan(0);
    expect(pageLabelCount(renderer, 'Continue')).toBeGreaterThan(0);
  });

  it("Continue also advances PageDots' label, not just the card text", async () => {
    const renderer = renderCarousel();
    expect(pageLabelCount(renderer, 'Page 1 of 3')).toBeGreaterThan(0);

    await press(renderer, 'Continue');

    expect(pageLabelCount(renderer, 'Page 2 of 3')).toBeGreaterThan(0);
  });

  it("the pager's page width tracks non-zero side insets (landscape-like)", async () => {
    // The stock safe-area mock returns all zeroes, which is exactly why this formula drifted
    // undetected in portrait — a non-zero left/right is the only way to catch it.
    jest.spyOn(require('react-native-safe-area-context'), 'useSafeAreaInsets').mockReturnValue({
      top: 0,
      bottom: 0,
      left: 59,
      right: 59,
    });

    const renderer = renderCarousel();
    await flushReduceMotionCheck();
    const windowWidth = Dimensions.get('window').width;
    const expectedWidth = windowWidth - 59 - 59 - tokens.spacing.xl * 2;

    const pageWidths = findPageWidthNodes(renderer).map((node) => StyleSheet.flatten(node.props.style).width as number);
    // One per card, all matching the formula.
    expect(pageWidths).toEqual([expectedWidth, expectedWidth, expectedWidth]);
  });
});
