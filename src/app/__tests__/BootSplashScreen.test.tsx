import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Dimensions, Pressable, Text as RNText } from 'react-native';
import { BootSplashScreen } from '../BootSplashScreen';
import { BrandMark } from '@/shared/ui';

/**
 * SH-1 (execution brief P0-7.0). Renders no text and no controls, deliberately — the boot
 * splash mounts before session/verification state is known, so any affordance here risks
 * flashing a login screen at an already-signed-in user. Asserted directly so it survives a
 * future "improvement".
 *
 * This renders the real `BrandMark` (`AccessibilityInfo.isReduceMotionEnabled` unmocked), which
 * starts a real `Animated.loop` backed by a real native-module timer (review finding, P0-7.0
 * geometry v3 rework). Without an unmount, that timer outlives the test and keeps the process
 * alive — unmounting runs BrandMark's cleanup (`loop.stop()`), which clears it.
 */
describe('BootSplashScreen (SH-1)', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    renderer = undefined;
  });

  it('renders the mark, and no text and no controls', () => {
    act(() => {
      renderer = ReactTestRenderer.create(<BootSplashScreen />);
    });

    expect(renderer!.root.findAllByType(RNText)).toHaveLength(0);
    expect(renderer!.root.findAllByType(Pressable)).toHaveLength(0);
    expect(renderer!.root.findAllByType(BrandMark)).toHaveLength(1);
  });

  it('sizes the mark to 22% of screen width — same placement as LaunchScreen.storyboard', () => {
    const { width } = Dimensions.get('window');

    act(() => {
      renderer = ReactTestRenderer.create(<BootSplashScreen />);
    });

    const mark = renderer!.root.findByType(BrandMark);
    expect(mark.props.size).toBeCloseTo(width * 0.22);
  });
});
