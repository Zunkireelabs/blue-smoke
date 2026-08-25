import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { RadarSearch } from './RadarSearch';
import { Text } from './Text';
import { tokens } from './tokens';

export interface RadarDeviceChip {
  id: string;
  /** The device's display name — used both as the chip's own visible label and, prefixed with an
   * action, as its `accessibilityLabel` (see `DeviceChip` below). Not reused verbatim as the
   * chip's accessible name: this project's Pressables each carry a distinct
   * `accessibilityLabel` (`testUtils.ts`'s `findByLabel` relies on exactly one match per label),
   * and the caller's paired `ListRow` already uses the bare name for its own label. */
  label: string;
}

export interface DeviceRadarProps {
  style?: StyleProp<ViewStyle>;
  devices: RadarDeviceChip[];
  onSelectDevice: (id: string) => void;
}

// Matches `RadarSearch`'s own far-ring visual footprint (`RADAR_OUTER_FAR_SIZE`) — reserving the
// same box this component already painted into today means adding chips doesn't grow the
// screen's overall layout footprint.
const CONTAINER_SIZE = 300;
const CHIP_VISUAL_SIZE = 32;
const CHIP_LABEL_WIDTH = 76;
// Sits between `RadarSearch`'s near ring (92 radius) and far ring (150 radius) — chips read as
// part of the ring rather than floating separately from it.
const CHIP_ORBIT_RADIUS = 96;
// Fanned across the ring's upper arc rather than a full 360° spread, so a chip never lands
// directly above the curved results card `H158PairScreen.tsx` renders below this component —
// no visual collision between "found on the ring" and "found in the list" for the same device.
const SLOT_ANGLES_DEG = [-60, -20, 20, 60];
const MAX_RING_CHIPS = SLOT_ANGLES_DEG.length;

function slotPosition(index: number): { left: number; top: number } {
  const angleRad = (SLOT_ANGLES_DEG[index % MAX_RING_CHIPS] * Math.PI) / 180;
  const x = CHIP_ORBIT_RADIUS * Math.sin(angleRad);
  const y = -CHIP_ORBIT_RADIUS * Math.cos(angleRad);
  return {
    left: CONTAINER_SIZE / 2 + x - CHIP_LABEL_WIDTH / 2,
    top: CONTAINER_SIZE / 2 + y - tokens.touchTarget.minHeight / 2,
  };
}

/**
 * A single found-device chip. Keyed by `chip.id` at the call site (not here) — that's what makes
 * "play the entrance animation once" work without any manual bookkeeping: a device's chip is a
 * fresh component instance the first time it appears, so its own mount effect is exactly its one
 * entrance, and it never remounts (and never re-plays the animation) on every re-render.
 */
function DeviceChip({
  chip,
  index,
  onPress,
}: {
  chip: RadarDeviceChip;
  index: number;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    // Same "hold rest state, animate nothing" reduced-motion contract `BrandMark.tsx` already
    // implements — duplicated here rather than shared, since this is the second occurrence, not
    // yet a pattern worth extracting a hook for.
    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) {
        return;
      }
      if (reduceMotion) {
        scale.setValue(1);
        opacity.setValue(1);
        return;
      }
      Animated.parallel([
        // Same spring constants `HomeScreen.tsx`'s `PairDeviceButton` already uses, for one
        // consistent "pop in" feel across the app rather than a second hand-tuned curve.
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    });
    return () => {
      cancelled = true;
    };
  }, [scale, opacity]);

  return (
    <Animated.View style={[styles.chipSlot, slotPosition(index), { opacity, transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Connect to ${chip.label}`}
        onPress={onPress}
        style={({ pressed }) => [styles.chipTouchable, pressed && styles.chipPressed]}
      >
        <View style={styles.chipCircle} />
      </Pressable>
      <Text variant="caption" tone="inverse" numberOfLines={1} style={styles.chipLabel}>
        {chip.label}
      </Text>
    </Animated.View>
  );
}

/**
 * `RadarSearch` (the pulsing ring + `BrandMark`, unmodified) with a layer of tappable
 * found-device chips on top — the live "the radar is finding your device" screen `H158PairScreen`
 * shows while scanning. Deliberately built by composing `RadarSearch`, not by adding `devices`/
 * `onSelect` props to it: `RadarSearch` stays a pure, data-free decoration usable anywhere (its
 * only real consumer today, `H158PairScreen.tsx`, keeps its existing 0-device path — a bare
 * `<RadarSearch />` — completely untouched; this component only renders once a device exists).
 *
 * Chips sit at a fixed slot assigned purely by each device's index in the caller's `devices`
 * array — never by RSSI or any other live-changing value, matching `scanner.ts`'s own
 * anti-jitter reasoning for why found devices are kept in discovery order. Devices beyond
 * `MAX_RING_CHIPS` render only via the caller's own list, not on the ring — an edge case (the
 * H158 hardware realistically surfaces one or two simultaneous units), not the common path.
 *
 * A chip is a second affordance for the same action as its paired `ListRow`, not a separate
 * "preview" — `onSelectDevice` should call the exact same connect handler the row's `onPress`
 * does. A screen-reader user never needs to navigate the chips' absolute geometry to reach
 * "connect to device": the ordinary linear list underneath already gets them there. The chip's
 * own `accessibilityLabel` names the same device but isn't the identical string the row uses
 * (see `RadarDeviceChip.label`'s doc comment) — that's for this project's one-label-per-Pressable
 * test convention, not because they're meant to read as different things.
 */
export function DeviceRadar({ style, devices, onSelectDevice }: DeviceRadarProps) {
  return (
    <View style={[styles.container, style]}>
      <RadarSearch />
      {devices.slice(0, MAX_RING_CHIPS).map((chip, index) => (
        <DeviceChip key={chip.id} chip={chip} index={index} onPress={() => onSelectDevice(chip.id)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CONTAINER_SIZE,
    height: CONTAINER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSlot: {
    position: 'absolute',
    width: CHIP_LABEL_WIDTH,
    alignItems: 'center',
  },
  // Sized to `tokens.touchTarget` regardless of the smaller visible circle inside it — same
  // "tappable box bigger than the visual mark" convention `HomeScreen.tsx`'s `IconChip` already
  // uses, so this clears the platform-minimum hit area without inflating the chip's look.
  chipTouchable: {
    minWidth: tokens.touchTarget.minWidth,
    minHeight: tokens.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipPressed: {
    opacity: 0.7,
  },
  chipCircle: {
    width: CHIP_VISUAL_SIZE,
    height: CHIP_VISUAL_SIZE,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.surface,
    borderWidth: 2,
    borderColor: tokens.color.brand,
  },
  chipLabel: {
    marginTop: tokens.spacing.xs,
    textAlign: 'center',
  },
});
