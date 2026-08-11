import { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { tokens } from './tokens';

export interface BrandMarkProps {
  /** Square side length, in points. The mark is authored on a 100x100 grid, so width == height. */
  size: number;
  /**
   * Colour of the ground the mark sits on. The inner flame is a knockout, not a shape with its
   * own fill, so it must always match whatever it's rendered over — white on the splash
   * (the default), brand blue on PR 2's icon tile.
   */
  groundColor?: string;
  /**
   * `'gradient'` (default, unchanged) — the outer flame in the brand gradient, as shipped.
   * `'solid'` — the outer flame in flat white, for use on `BrandGround`: the gradient's
   * `brandGlow` top stop loses contrast against the same blue it would sit on. `groundColor`
   * still carries the inner knockout either way — this only changes the outer fill.
   */
  tone?: 'gradient' | 'solid';
}

// 100x100 grid — execution brief P0-7.0 geometry v3 "Geometry" table. Do not improvise these
// numbers; they are mirrored exactly (and must stay in sync by hand) in
// tools/dev/generate-brand-assets.py, which rasters the same shapes for the launch storyboard.
// v2 (a narrow-tip, near-symmetric outline) rendered as a water droplet, not a flame — v3's
// narrow high neck flaring into a wide low belly is what actually reads as one.
const OUTER_FLAME_PATH =
  'M52 4 C56 16 58 24 58 32 C60 44 74 50 77 63 C80 80 66 93 50 93 ' +
  'C34 93 20 80 23 63 C26 50 40 44 42 32 C42 24 48 14 52 4 Z';
const INNER_FLAME_PATH =
  'M50.4 47.2 C52.2 52.7 53.1 56.4 53.1 60.1 C54.1 65.6 60.5 68.4 61.9 74.3 ' +
  'C63.3 82.2 56.8 88.1 49.5 88.1 C42.1 88.1 35.7 82.2 37 74.3 ' +
  'C38.4 68.4 44.9 65.6 45.8 60.1 C45.8 56.4 48.5 52.7 50.4 47.2 Z';

// Motion "Core" (brief). Each leg is one direction of the alternate — the loop below plays
// rest -> peak -> rest forever. Rest (0.90/0.97) is the compressed frame; peak (1.0/1.0) is the
// flame's authored, undistorted geometry.
const BREATH_LEG_MS = 4600;
const REST_SCALE_Y = 0.9;
const REST_SCALE_X = 0.97;
const PEAK_SCALE = 1;

function startBreath(scaleY: Animated.Value, scaleX: Animated.Value) {
  const toPeak = Animated.parallel([
    Animated.timing(scaleY, {
      toValue: PEAK_SCALE,
      duration: BREATH_LEG_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }),
    Animated.timing(scaleX, {
      toValue: PEAK_SCALE,
      duration: BREATH_LEG_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }),
  ]);
  const toRest = Animated.parallel([
    Animated.timing(scaleY, {
      toValue: REST_SCALE_Y,
      duration: BREATH_LEG_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }),
    Animated.timing(scaleX, {
      toValue: REST_SCALE_X,
      duration: BREATH_LEG_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }),
  ]);
  const loop = Animated.loop(Animated.sequence([toPeak, toRest]));
  loop.start();
  return loop;
}

/**
 * The BlueSmoke mark (execution brief P0-7.0, geometry v3): a blue flame, an outer silhouette
 * with an inner flame knocked out of it.
 *
 * 🔴 Structural rule: each animated layer is its own `<Svg>`, inside its own `Animated.View`,
 * with the transform on the View — a flame can't be an `Animated.View` the way the withdrawn
 * bars mark's rectangles were, so `useNativeDriver: true` has to reach the SVG through a
 * wrapping View instead of a shape prop (which it can't animate natively at all). Two layers:
 * the outer flame, a static `<Svg>` that never re-renders, and the inner flame, its own `<Svg>`
 * inside an `Animated.View` that breathes. Both use the full `0 0 100 100` viewBox at identical
 * size and absolute position, so registration between them is automatic.
 *
 * Reduced motion is mandatory: while `AccessibilityInfo.isReduceMotionEnabled()` is unresolved
 * or reports `true`, the mark renders its rest state (the flame's authored, undistorted
 * geometry) and starts no animation at all.
 */
export function BrandMark({ size, groundColor = tokens.color.surface, tone = 'gradient' }: BrandMarkProps) {
  // Per-instance — a module constant would collide when two BrandMarks mount at once (PR 2's
  // icon tile alongside the splash), silently pointing both gradients at whichever <LinearGradient>
  // rendered last.
  const gradientId = `brandMarkGradient-${useId()}`;
  const scaleY = useRef(new Animated.Value(REST_SCALE_Y)).current;
  const scaleX = useRef(new Animated.Value(REST_SCALE_X)).current;
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        setReduceMotion(enabled);
      }
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion !== false) {
      // Unresolved (null) or explicitly on: hold the rest state, start nothing.
      scaleY.setValue(PEAK_SCALE);
      scaleX.setValue(PEAK_SCALE);
      return;
    }
    const loop = startBreath(scaleY, scaleX);
    return () => {
      loop.stop();
    };
  }, [reduceMotion, scaleY, scaleX]);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        {tone === 'gradient' ? (
          <>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={tokens.color.brandGlow} />
                <Stop offset="1" stopColor={tokens.color.brand} />
              </LinearGradient>
            </Defs>
            <Path d={OUTER_FLAME_PATH} fill={`url(#${gradientId})`} />
          </>
        ) : (
          <Path d={OUTER_FLAME_PATH} fill={tokens.color.surface} />
        )}
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, styles.innerLayer, { transform: [{ scaleY }, { scaleX }] }]}>
        <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
          <Path d={INNER_FLAME_PATH} fill={groundColor} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 🔴 '50% 88%', not '50% 100%' (brief, geometry v3 rework — a real defect in the first pass).
  // This View is StyleSheet.absoluteFill, so its box is the whole 100x100 grid and '100%' would
  // resolve to y=100 — 12 units below the inner flame's actual base at y=88.1. At '100%' the
  // core visibly sank as it breathed instead of staying hinged to its base.
  innerLayer: { transformOrigin: '50% 88%' },
});
