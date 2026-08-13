/**
 * ON-4 (BluetoothPrimingScreen) and ON-6 (NotificationPrimingScreen) — both presentational,
 * callback-driven (Phase D/F wire the real trigger). Every CTA is pressed and its callback
 * asserted called, per the project's "press it, don't just render it" test rule.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BluetoothPrimingScreen } from '../BluetoothPrimingScreen';
import { NotificationPrimingScreen } from '../NotificationPrimingScreen';
import { findByLabel } from '@/features/auth/testUtils';

// BluetoothPrimingScreen now renders via CurtainGround, which reads safe-area insets —
// same convention as OnboardingCarouselScreen.test.tsx for a screen with no SafeAreaProvider
// ancestor in this standalone render.
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

async function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  await act(async () => {
    findByLabel(renderer, label).props.onPress();
  });
}

describe('ON-4 — BluetoothPrimingScreen', () => {
  it('Continue calls onContinue', async () => {
    const onContinue = jest.fn();
    const onNotNow = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <BluetoothPrimingScreen onContinue={onContinue} onNotNow={onNotNow} />,
      );
    });

    await press(renderer, 'Continue');
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onNotNow).not.toHaveBeenCalled();
  });

  it('Not now calls onNotNow', async () => {
    const onContinue = jest.fn();
    const onNotNow = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <BluetoothPrimingScreen onContinue={onContinue} onNotNow={onNotNow} />,
      );
    });

    await press(renderer, 'Not now');
    expect(onNotNow).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });
});

describe('ON-6 — NotificationPrimingScreen', () => {
  it('Enable notifications calls onEnable', async () => {
    const onEnable = jest.fn();
    const onNotNow = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <NotificationPrimingScreen onEnable={onEnable} onNotNow={onNotNow} />,
      );
    });

    await press(renderer, 'Enable notifications');
    expect(onEnable).toHaveBeenCalledTimes(1);
  });

  it('Not now calls onNotNow', async () => {
    const onEnable = jest.fn();
    const onNotNow = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <NotificationPrimingScreen onEnable={onEnable} onNotNow={onNotNow} />,
      );
    });

    await press(renderer, 'Not now');
    expect(onNotNow).toHaveBeenCalledTimes(1);
  });
});
