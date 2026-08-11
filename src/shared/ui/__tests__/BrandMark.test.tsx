import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { AccessibilityInfo, Animated } from 'react-native';
import { Path } from 'react-native-svg';
import { BrandMark } from '../BrandMark';
import { tokens } from '../tokens';

/**
 * Execution brief P0-7.0, geometry v3. Reduced-motion assertions check `Animated.loop` itself
 * rather than a rendered frame — a mid-breath frame is a moving target, `Animated.loop` having
 * been called (or not) is not.
 *
 * Every test unmounts its renderer (review finding, geometry v3 rework): the "reduced motion
 * OFF" test starts a real `Animated.loop`, and without an unmount its cleanup (`loop.stop()`)
 * never runs — the suite passed locally but hung when run in isolation, and would have hung CI.
 */
describe('BrandMark', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    renderer = undefined;
    jest.restoreAllMocks();
  });

  const OUTER_FLAME_PATH =
    'M52 4 C56 16 58 24 58 32 C60 44 74 50 77 63 C80 80 66 93 50 93 ' +
    'C34 93 20 80 23 63 C26 50 40 44 42 32 C42 24 48 14 52 4 Z';
  const INNER_FLAME_PATH =
    'M50.4 47.2 C52.2 52.7 53.1 56.4 53.1 60.1 C54.1 65.6 60.5 68.4 61.9 74.3 ' +
    'C63.3 82.2 56.8 88.1 49.5 88.1 C42.1 88.1 35.7 82.2 37 74.3 ' +
    'C38.4 68.4 44.9 65.6 45.8 60.1 C45.8 56.4 48.5 52.7 50.4 47.2 Z';

  it('renders the outer flame with the brand gradient, and the inner flame as a knockout', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    await act(async () => {
      renderer = ReactTestRenderer.create(<BrandMark size={100} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const outerPath = renderer!.root.findByProps({ d: OUTER_FLAME_PATH });
    // Gradient id is per-instance (useId) — assert the fill *references* a gradient, not a
    // literal id, and that the referenced <LinearGradient> carries the brand stops.
    expect(outerPath.props.fill).toMatch(/^url\(#brandMarkGradient-.+\)$/);

    const topStop = renderer!.root.findAllByProps({ offset: '0' })[0];
    expect(topStop.props.stopColor).toBe(tokens.color.brandGlow);
    const bottomStop = renderer!.root.findAllByProps({ offset: '1' })[0];
    expect(bottomStop.props.stopColor).toBe(tokens.color.brand);

    const innerPath = renderer!.root.findByProps({ d: INNER_FLAME_PATH });
    // Defaults to the splash's white ground when no `groundColor` prop is given.
    expect(innerPath.props.fill).toBe(tokens.color.surface);
  });

  it('gives two mounted instances distinct gradient ids', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    await act(async () => {
      renderer = ReactTestRenderer.create(
        <>
          <BrandMark size={100} />
          <BrandMark size={100} />
        </>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    // `findAllByProps` also matches react-native-svg's internal host-layer instances (which
    // carry `d` too, resolved to a brush object rather than the `fill` string) — `findAllByType`
    // stays at the composite <Path> element, exactly the two we rendered.
    const fills = renderer!.root
      .findAllByType(Path)
      .filter((p) => p.props.d === OUTER_FLAME_PATH)
      .map((p) => p.props.fill as string);
    expect(fills).toHaveLength(2);
    expect(fills[0]).not.toBe(fills[1]);
  });

  it('passes a groundColor prop through to the inner flame knockout', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    await act(async () => {
      renderer = ReactTestRenderer.create(<BrandMark size={100} groundColor={tokens.color.brand} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const innerPath = renderer!.root.findByProps({ d: INNER_FLAME_PATH });
    expect(innerPath.props.fill).toBe(tokens.color.brand);
  });

  it('reduced motion ON: starts no animation', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const loopSpy = jest.spyOn(Animated, 'loop');

    await act(async () => {
      renderer = ReactTestRenderer.create(<BrandMark size={100} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loopSpy).not.toHaveBeenCalled();
  });

  it('reduced motion OFF: starts the loop, animating with useNativeDriver: true', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const fakeLoop = { start: jest.fn(), stop: jest.fn(), reset: jest.fn() };
    const loopSpy = jest.spyOn(Animated, 'loop').mockImplementation(() => fakeLoop as never);
    const timingSpy = jest.spyOn(Animated, 'timing');

    await act(async () => {
      renderer = ReactTestRenderer.create(<BrandMark size={100} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    // One loop, driving both scaleY and scaleX of the inner layer only.
    expect(loopSpy).toHaveBeenCalledTimes(1);
    expect(fakeLoop.start).toHaveBeenCalledTimes(1);

    expect(timingSpy.mock.calls.length).toBeGreaterThan(0);
    timingSpy.mock.calls.forEach(([, config]) => {
      expect(config.useNativeDriver).toBe(true);
    });

    await act(async () => {
      renderer?.unmount();
    });
    renderer = undefined;
    expect(fakeLoop.stop).toHaveBeenCalledTimes(1);
  });
});
