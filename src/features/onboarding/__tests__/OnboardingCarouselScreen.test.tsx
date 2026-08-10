/**
 * ON-1..3 — same press-and-assert pattern as `deadEndExits.test.tsx` /
 * `verifyIntroAndCameraPriming.test.tsx`: every CTA is pressed and its actual effect asserted,
 * not just that the label renders.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingCarouselScreen } from '../OnboardingCarouselScreen';
import {
  useOnboardingStore,
  __resetOnboardingListenerForTests,
} from '@/app/stores/useOnboardingStore';
import { renderedText } from '@/features/auth/testUtils';

function renderCarousel() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(<OnboardingCarouselScreen />);
  });
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

describe('ON-1..3 — the onboarding carousel', () => {
  beforeEach(() => {
    (AsyncStorage as unknown as { __resetMockStorage: () => void }).__resetMockStorage();
    __resetOnboardingListenerForTests();
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
});
