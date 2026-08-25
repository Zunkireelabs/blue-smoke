import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { tokens } from '../tokens';

export interface ProximityIllustrationProps {
  size: number;
}

interface ArcPair {
  left: string;
  right: string;
  baseOpacity: number;
}

// ON-2 geometry table (execution brief UI-BUILD-E part 3) — centre (50, 57), exact paths, do not
// improvise. Three concentric arc pairs, r=26/35/44, dimming outward.
const ARC_PAIRS: readonly ArcPair[] = [
  {
    left: 'M33.99 77.49 A26 26 0 0 1 33.99 36.51',
    right: 'M66.01 36.51 A26 26 0 0 1 66.01 77.49',
    baseOpacity: 0.62,
  },
  {
    left: 'M28.45 84.58 A35 35 0 0 1 28.45 29.42',
    right: 'M71.55 29.42 A35 35 0 0 1 71.55 84.58',
    baseOpacity: 0.38,
  },
  {
    left: 'M22.91 91.67 A44 44 0 0 1 22.91 22.33',
    right: 'M77.09 22.33 A44 44 0 0 1 77.09 91.67',
    baseOpacity: 0.2,
  },
];
const ARC_STROKE_WIDTH = 3.2;

const SHACKLE_PATH = 'M41.6 45.98 A8.4 8.4 0 0 1 58.4 45.98';

// Motion (brief, "arcs only"): each pair pulses independently between its base opacity and
// ~35% of it, staggered 0.4s apart, one ~3s cycle, looping.
const PULSE_HALF_MS = 1500;
const STAGGER_MS = 400;
const DIM_FACTOR = 0.35;

function startPulse(opacity: Animated.Value, base: number, delayMs: number) {
  const toDim = Animated.timing(opacity, {
    toValue: base * DIM_FACTOR,
    duration: PULSE_HALF_MS,
    easing: Easing.inOut(Easing.ease),
    useNativeDriver: true,
  });
  const toBase = Animated.timing(opacity, {
    toValue: base,
    duration: PULSE_HALF_MS,
    easing: Easing.inOut(Easing.ease),
    useNativeDriver: true,
  });
  const loop = Animated.loop(Animated.sequence([toDim, toBase]));
  const timer = setTimeout(() => loop.start(), delayMs);
  return () => {
    clearTimeout(timer);
    loop.stop();
  };
}

function ArcPairLayer({
  pair,
  size,
  delayMs,
  animate,
}: {
  pair: ArcPair;
  size: number;
  delayMs: number;
  animate: boolean;
}) {
  const opacity = useRef(new Animated.Value(pair.baseOpacity)).current;

  useEffect(() => {
    if (!animate) {
      opacity.setValue(pair.baseOpacity);
      return;
    }
    return startPulse(opacity, pair.baseOpacity, delayMs);
  }, [animate, delayMs, opacity, pair.baseOpacity]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Path d={pair.left} stroke={tokens.color.surface} strokeWidth={ARC_STROKE_WIDTH} strokeLinecap="round" fill="none" />
        <Path d={pair.right} stroke={tokens.color.surface} strokeWidth={ARC_STROKE_WIDTH} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  );
}

/**
 * ON-2 · It locks itself (execution brief UI-BUILD-E part 3): three arc pairs signalling
 * proximity, over a closed padlock.
 *
 * 🔴 The padlock never moves and never opens. Animating it would say the device unlocks by
 * itself — the opposite of the card's meaning. Only the arcs pulse; the lock is the resting
 * state, always drawn shut.
 *
 * Reduced motion (same contract as `BrandMark`): while `AccessibilityInfo.isReduceMotionEnabled`
 * is unresolved or reports `true`, every arc pair renders at its base opacity and starts nothing.
 */
export function ProximityIllustration({ size }: ProximityIllustrationProps) {
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

  const animate = reduceMotion === false;

  return (
    <View style={{ width: size, height: size }}>
      {ARC_PAIRS.map((pair, index) => (
        <ArcPairLayer key={index} pair={pair} size={size} delayMs={index * STAGGER_MS} animate={animate} />
      ))}
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Path d={SHACKLE_PATH} stroke={tokens.color.surface} strokeWidth={4.2} strokeLinecap="round" fill="none" />
        <Rect x={38.45} y={45.98} width={61.55 - 38.45} height={68.03 - 45.98} rx={4.2} fill={tokens.color.surface} />
        <Circle cx={50} cy={56.16} r={2.94} fill={tokens.color.brand} />
        <Rect x={48.64} y={55.95} width={51.37 - 48.64} height={62.78 - 55.95} rx={1.37} fill={tokens.color.brand} />
      </Svg>
    </View>
  );
}
