import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BrandMark } from './BrandMark';
import { tokens } from './tokens';

const RADAR_RING_SIZE = 104;
const RADAR_OUTER_NEAR_SIZE = 184;
const RADAR_OUTER_FAR_SIZE = 300;
const RADAR_OUTER_FAR_OFFSET = (RADAR_RING_SIZE - RADAR_OUTER_FAR_SIZE) / 2;
const RADAR_RING_BORDER_WIDTH = 2.5;
const RADAR_PULSE_MS = 1800;
// See DeviceScanScreen.tsx's `useRipple` header comment for why each ring gets its own delayed
// `Animated.loop` rather than nesting `Animated.delay` inside the loop (a known-flaky combination
// in RN's Animated API that made rings ripple once and then stop).
const RADAR_RIPPLE_STAGGER_MS = 550;
const RADAR_RIPPLE_GROWTH = 1.18;

function useRipple(delayMs: number): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      loop = Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration: RADAR_PULSE_MS,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      );
      loop.start();
    }, delayMs);
    return () => {
      clearTimeout(timer);
      loop?.stop();
    };
  }, [value, delayMs]);

  return value;
}

export interface RadarSearchProps {
  /** Optional style override for the outer wrapper, e.g. spacing within the caller's layout. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The brand mark sitting inside a ring that pulses outward on a loop — a shared, resting-state
 * extraction of `DeviceScanScreen.tsx`'s `RadarSearch` (see that file's own header comment for the
 * full design reasoning and reference). That version also drives a shrink/lift animation tied to
 * its results card sliding into place, which needs a snapped (non-animated) size/border-width
 * swap to avoid mixing a JS-driven and native-driven Animated value in one style object — see its
 * `RADAR_OUTER_FAR_SIZE_REST` comment. This component has no results card to make room for, so
 * every animated value here is native-driven (`useNativeDriver: true`) and the ring's size/border
 * are fixed constants, not `Animated.Value`s — that failure mode doesn't apply.
 */
export function RadarSearch({ style }: RadarSearchProps = {}) {
  const corePulse = useRipple(0);
  const nearPulse = useRipple(RADAR_RIPPLE_STAGGER_MS);
  const farPulse = useRipple(RADAR_RIPPLE_STAGGER_MS * 2);

  const coreScale = corePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const coreOpacity = corePulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0.15, 0] });

  const nearScale = nearPulse.interpolate({ inputRange: [0, 1], outputRange: [1, RADAR_RIPPLE_GROWTH] });
  const nearOpacity = nearPulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.28, 0.1, 0] });

  const farScale = farPulse.interpolate({ inputRange: [0, 1], outputRange: [1, RADAR_RIPPLE_GROWTH] });
  const farOpacity = farPulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.15, 0.05, 0] });

  return (
    <View style={[styles.radar, style]}>
      <Animated.View
        style={[
          styles.radarOuterRing,
          {
            width: RADAR_OUTER_FAR_SIZE,
            height: RADAR_OUTER_FAR_SIZE,
            top: RADAR_OUTER_FAR_OFFSET,
            left: RADAR_OUTER_FAR_OFFSET,
            opacity: farOpacity,
            transform: [{ scale: farScale }],
          },
        ]}
      />
      <Animated.View
        style={[styles.radarOuterRing, styles.radarOuterRingNear, { opacity: nearOpacity, transform: [{ scale: nearScale }] }]}
      />
      <Animated.View
        style={[
          styles.radarRing,
          { borderWidth: RADAR_RING_BORDER_WIDTH, transform: [{ scale: coreScale }], opacity: coreOpacity },
        ]}
      />
      <View style={[styles.radarRing, styles.radarRingStatic]} />
      <BrandMark size={44} groundColor={tokens.color.homeWashStop1} />
    </View>
  );
}

const styles = StyleSheet.create({
  radar: {
    width: RADAR_RING_SIZE,
    height: RADAR_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    position: 'absolute',
    width: RADAR_RING_SIZE,
    height: RADAR_RING_SIZE,
    borderRadius: tokens.radii.full,
    borderWidth: 2,
    // `surface` (white) — same as `DeviceScanScreen.tsx`'s own ring, both assuming a dark ground
    // (its `HOME_WASH_COLORS` gradient, or a caller reproducing it, e.g. `H158PairScreen.tsx`
    // once it adopted that same background). A caller on a light ground needs its own override —
    // see `RadarSearchProps.style` — this component doesn't try to guess its background.
    borderColor: tokens.color.surface,
  },
  radarRingStatic: {
    opacity: 0.35,
  },
  radarOuterRing: {
    position: 'absolute',
    borderRadius: tokens.radii.full,
    borderWidth: 1,
    borderColor: tokens.color.surface,
  },
  radarOuterRingNear: {
    width: RADAR_OUTER_NEAR_SIZE,
    height: RADAR_OUTER_NEAR_SIZE,
    top: (RADAR_RING_SIZE - RADAR_OUTER_NEAR_SIZE) / 2,
    left: (RADAR_RING_SIZE - RADAR_OUTER_NEAR_SIZE) / 2,
  },
});
