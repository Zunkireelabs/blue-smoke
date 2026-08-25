import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { BrandMark, Button, HOME_WASH_LOCATIONS, ListRow, Text, tokens } from '@/shared/ui';

const HOME_WASH_COLORS = [
  tokens.color.homeWashStop1,
  tokens.color.homeWashStop2,
  tokens.color.homeWashStop3,
  tokens.color.homeWashStop4,
  tokens.color.homeWashStop5,
  tokens.color.homeWashStop6,
  tokens.color.homeWashStop7,
];
import type { RootStackParamList } from '@/app/navigation';
import { useDeviceScan, type ScannedDevice } from './useDeviceScan';
import { DEVICES_CURTAIN_TOP_RATIO } from './HomeScreen';

const RADAR_RING_SIZE = 104;
// Two extra rings, well beyond the core pair, so the resting scan reads as a fuller radar rather
// than one small badge — sized and offset off `RADAR_RING_SIZE` below so they stay concentric
// with it without needing their own centring logic.
const RADAR_OUTER_NEAR_SIZE = 184;
const RADAR_OUTER_FAR_SIZE = 260;
// Full-screen (resting, pre-shrink) sizes — bigger than the shrunk-state values above, which stay
// exactly what they were so the ring beside the results card is untouched by this. Swapped for
// the shrunk values below the instant `hasResults` flips (a plain conditional, not an animated
// interpolation — see `DeviceScanScreen`'s `outerFarSize`/`innerRingBorderWidth`): a plain
// `transform: scale` on the whole radar (as used for the rest of the shrink) would grow both ends
// together, since it scales whatever base size it's given, so getting only the resting end bigger
// needs the size/border themselves, not just the wrapping scale, to change. Animating that change
// smoothly would need a second, JS-driven twin of `cardSlide` (width/height/borderWidth aren't
// native-driver props) — but mixing a native-driven Animated value (this ring's own
// opacity/scale ripple) and a JS-driven one in the *same* style object throws at render
// ("`<prop>` is not supported by the native animated module"), so instead this snaps at the exact
// moment the shrink starts, while the ring is simultaneously fading out via `outerRingOpacity`
// over that same motion — fast enough, and hidden by the fade, that it doesn't read as a jump.
const RADAR_OUTER_FAR_SIZE_REST = 300;
const RADAR_RING_BORDER_WIDTH = 2;
const RADAR_RING_BORDER_WIDTH_REST = 2.5;
const RADAR_PULSE_MS = 1800;
// Gap between each ring's ripple launching. Applied once, before each ring's loop starts (see
// `useRipple`) — not baked into the loop itself — so all three share the exact same
// `RADAR_PULSE_MS` period and stay permanently staggered by this amount, cycle after cycle.
const RADAR_RIPPLE_STAGGER_MS = 550;
const RADAR_RIPPLE_GROWTH = 1.18;
// How long the results card takes to slide up into place, and how the ring+copy above it react —
// slow and eased enough to read as one continuous motion (the card arriving pushes the header out
// of its way) rather than the card popping in over static content.
const CARD_SLIDE_MS = 650;
const RADAR_SHRINK_SCALE = 0.55;
// Where the shrunk ring rests once the card's fully in place: this far below the title+subtitle
// block's own measured bottom edge — a fixed, small gap, not a fraction of the screen.
const RING_TARGET_GAP = tokens.spacing.xxl;
// Deliberate manual lift off the ring's own centred rest position (not a measured correction) —
// the ring is centred in the space below the title+subtitle, full stop; this is a small stylistic
// nudge on top of that, not part of the centring maths.
const RING_REST_NUDGE = -20;
// Small synced lift on the title+subtitle block, same drive value as the ring/card — otherwise
// they're the one static element while everything else visibly moves, which reads as unrelated
// rather than one screen responding to the same event. Kept modest: a heading's job is to stay the
// stable anchor, not compete with the ring as its own animation.
const TITLE_LIFT = -12;
// Gap between the title and its subtitle, directly below it — one small header block, not
// scattered pieces.
const TITLE_SUBTITLE_GAP = tokens.spacing.sm;

/**
 * One ripple's own 0→1 clock, its *loop* starting `delayMs` after mount — see
 * `RADAR_RIPPLE_STAGGER_MS`. The delay is a one-time `setTimeout` before `Animated.loop` starts,
 * not `Animated.delay` inside the loop itself — nesting `Animated.delay` inside
 * `Animated.sequence` inside `Animated.loop` is a known-flaky combination in RN's Animated API
 * (the delay step doesn't reliably replay on later iterations), which is what made the two
 * outer rings ripple once and then stop. A bare `Animated.loop(Animated.timing(...))` is the
 * same proven shape the single ring used before this file added staggering, so it's guaranteed
 * to keep looping.
 */
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

/**
 * Reference: a vendor app's "Discovering product…" screen — the brand mark sitting inside a ring
 * that pulses outward on a loop, in place of a bare `ActivityIndicator`. Kept our own palette
 * (`groundColor`/ring both brand tokens, not the reference's own colour) — only the motion and
 * composition are borrowed. Unmounts whenever the caller stops rendering it, which is what stops
 * the loop — no `isScanning` prop here, `DeviceScanScreen` already only renders this while
 * `isScanning` is true, same as the `ActivityIndicator` it replaces.
 *
 * All three rings — this one plus the two bigger ones below — are their own `useRipple` clock,
 * staggered by `RADAR_RIPPLE_STAGGER_MS` so they read as one continuous ripple launching outward
 * from the mark rather than three independent, disconnected pulses. Every ring's `scale` transform
 * originates from its own centre regardless of its `top`/`left` offset (RN default), so the ripple
 * stays concentric with the mark through the whole animation, not just at rest.
 *
 * `outerRingOpacity` additionally caps the two bigger rings' peak opacity — driven by the same
 * `cardSlide` value the results card uses, so they fade out entirely over the same motion that
 * shrinks/lifts this whole component, leaving exactly the original ring once a device is found,
 * rather than still rippling behind the results card.
 *
 * `innerRingBorderWidth`/`outerFarSize`/`outerFarOffset` are plain numbers, not animated values —
 * see `RADAR_OUTER_FAR_SIZE_REST`'s comment for why this snaps on `hasResults` rather than easing
 * alongside `cardSlide`. They let the core ring's border and the outer-most ring's radius be
 * bigger pre-shrink than the shrunk state settles to, without touching the shrunk numbers.
 */
function RadarSearch({
  outerRingOpacity,
  innerRingBorderWidth,
  outerFarSize,
  outerFarOffset,
}: {
  outerRingOpacity: Animated.AnimatedInterpolation<number>;
  innerRingBorderWidth: number;
  outerFarSize: number;
  outerFarOffset: number;
}) {
  const corePulse = useRipple(0);
  const nearPulse = useRipple(RADAR_RIPPLE_STAGGER_MS);
  const farPulse = useRipple(RADAR_RIPPLE_STAGGER_MS * 2);

  const coreScale = corePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const coreOpacity = corePulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0.15, 0] });

  const nearScale = nearPulse.interpolate({ inputRange: [0, 1], outputRange: [1, RADAR_RIPPLE_GROWTH] });
  const nearOpacity = Animated.multiply(
    nearPulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.28, 0.1, 0] }),
    outerRingOpacity,
  );

  const farScale = farPulse.interpolate({ inputRange: [0, 1], outputRange: [1, RADAR_RIPPLE_GROWTH] });
  const farOpacity = Animated.multiply(
    farPulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.15, 0.05, 0] }),
    outerRingOpacity,
  );

  return (
    <View style={styles.radar}>
      <Animated.View
        style={[
          styles.radarOuterRing,
          {
            width: outerFarSize,
            height: outerFarSize,
            top: outerFarOffset,
            left: outerFarOffset,
            opacity: farOpacity,
            transform: [{ scale: farScale }],
          },
        ]}
      />
      <Animated.View
        style={[styles.radarOuterRing, styles.radarOuterRingNear, { opacity: nearOpacity, transform: [{ scale: nearScale }] }]}
      />
      <Animated.View
        style={[styles.radarRing, { borderWidth: innerRingBorderWidth, transform: [{ scale: coreScale }], opacity: coreOpacity }]}
      />
      <View style={[styles.radarRing, styles.radarRingStatic]} />
      <BrandMark size={44} groundColor={tokens.color.homeWashStop1} />
    </View>
  );
}

/**
 * What `RadarSearch` settles into once scanning has stopped — the flame + the one static ring,
 * no pulsing rings, no outer rings, no animation at all. Deliberately not a checkmark or any new
 * "success" glyph: whether the scan actually succeeded is the results card's job to say (it shows
 * the real list, or this state is never reached at all — zero results routes to the separate
 * "We couldn't find it" screen instead). This icon only ever needs to say "search's over", not
 * grade the outcome, and stillness (vs. `RadarSearch`'s motion) is what says that.
 */
function StaticDeviceIcon() {
  return (
    <View style={styles.radar}>
      <View style={[styles.radarRing, styles.radarRingStatic]} />
      <BrandMark size={44} groundColor={tokens.color.homeWashStop1} />
    </View>
  );
}

/** Plain white chevron, no chip — same "no background, just the glyph" convention as Home's own
 * bell/profile header icons (`HomeScreen.tsx`'s `BellButton`/`ProfileIconButton`), rather than
 * `BackButton`'s filled square, which read as too heavy against this screen's own gradient. */
function BackChevron({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back to Home"
      style={({ pressed }) => [styles.backTouchTarget, pressed && styles.backPressed]}
    >
      <Text variant="title" tone="inverse" style={styles.backGlyph}>
        {'‹'}
      </Text>
    </Pressable>
  );
}

function signalLabel(rssi: number | null): string {
  // Raw dBm, never a bucketed "strong/weak" label or a distance — no §4 threshold exists for
  // bucketing scan-time signal quality (§7.2's -85/-75 dBm figures are the proximity auto-lock
  // hysteresis, a different, already-connected-session concern, out of scope this phase), and
  // inventing one here would dress a UX guess up as spec truth.
  return rssi === null ? 'Signal unknown' : `${rssi} dBm`;
}

/**
 * DV-3 / DV-4 / DV-5 (F7.3–F7.4, F7.E3) — one screen, not three routes. `USER_FLOWS.md` F7.4:
 * "Keep DV-3 responsive throughout: results appear as they arrive... The 20s is only when DV-5
 * replaces DV-3, never a wait imposed on a successful scan." So the physical-instructions header
 * (DV-3) and the results list (DV-4) are the SAME screen's live state — a device found at
 * second 2 is in the list, and selectable, at second 2. DV-5 only replaces this screen's content
 * when the 20s timeout (`useDeviceScan`) elapses with zero results.
 *
 * 🔴 HARD BOUNDARY — selecting a device hands off to `DevicePairingBoundary`, not connect/bond/
 * handshake (DV-6+). Those are gated on OQ-12 (the `serial_hash` salt) — see that screen's
 * header comment.
 */
export function DeviceScanScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { status, devices, restart } = useDeviceScan();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  // No native header (`navigation.tsx` gives this route `headerShown: false`, matching Home) —
  // this screen's own root starts at the true top of the screen, same as Home's, so the same
  // ratio Home uses lands the results card at an identical height without needing to measure
  // anything (a native header would have pushed this root down and thrown that off).
  const cardTop = Math.round(height * DEVICES_CURTAIN_TOP_RATIO);

  const hasResults = devices.length > 0;
  // Starts below the screen (0) and slides up to its resting position (1) the moment the first
  // device arrives — DV-4 (`USER_FLOWS.md` F7.4) has results appearing mid-scan, so this needs to
  // read as the card arriving, not as content popping into existence where the buttons just were.
  // Reset back to 0 (no animation) once results are gone, so a "Scan again" re-find slides in
  // again rather than just being visible already.
  const cardSlide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (hasResults) {
      Animated.timing(cardSlide, {
        toValue: 1,
        duration: CARD_SLIDE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      cardSlide.setValue(0);
    }
  }, [hasResults, cardSlide]);
  const cardTranslateY = cardSlide.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  // Plain numbers, not animated — see `RADAR_OUTER_FAR_SIZE_REST`'s comment. Swaps the instant
  // `hasResults` flips, same moment `cardSlide` starts easing toward the shrunk state.
  const innerRingBorderWidth = hasResults ? RADAR_RING_BORDER_WIDTH : RADAR_RING_BORDER_WIDTH_REST;
  const outerFarSize = hasResults ? RADAR_OUTER_FAR_SIZE : RADAR_OUTER_FAR_SIZE_REST;
  const outerFarOffset = (RADAR_RING_SIZE - outerFarSize) / 2;

  // The ring is centred in the space below the title+subtitle block, not anchored near it — so
  // clearing `cardTop` once the card arrives needs a real (layout-dependent) distance, not a
  // small fixed one. Measured, not computed from a formula: a formula here previously assumed a
  // rest position that went stale the moment the surrounding layout changed and silently overshot
  // (see git history). Measuring both ends directly (same technique `HomeScreen`'s pairing sheet
  // uses) can't drift out of sync with the layout that way.
  const titleBlockRef = useRef<View>(null);
  const ringAreaRef = useRef<View>(null);
  const [ringPushUp, setRingPushUp] = useState(0);
  const measureRingPushTarget = useCallback(() => {
    const titleBlockNode = titleBlockRef.current;
    const ringAreaNode = ringAreaRef.current;
    if (!titleBlockNode || !ringAreaNode) {
      return;
    }
    titleBlockNode.measureInWindow((_titleX, titleY, _titleWidth, titleHeight) => {
      ringAreaNode.measureInWindow((_ringX, ringY, _ringWidth, ringHeight) => {
        const ringRestCenterY = ringY + ringHeight / 2;
        const targetCenterY = titleY + titleHeight + RING_TARGET_GAP;
        setRingPushUp(Math.max(0, ringRestCenterY - targetCenterY));
      });
    });
  }, []);
  // Only the REST end carries `RING_REST_NUDGE` — `ringPushUp` is already measured relative to
  // the ring's un-nudged rest centre, so adding the nudge to the pushed end too would double-count
  // it and land the ring higher than the measured target.
  const ringTranslateY = cardSlide.interpolate({
    inputRange: [0, 1],
    outputRange: [RING_REST_NUDGE, -ringPushUp],
  });
  const radarScale = cardSlide.interpolate({ inputRange: [0, 1], outputRange: [1, RADAR_SHRINK_SCALE] });
  // 1 at rest (full radar) → 0 once the card's fully in place (down to just the original two
  // rings) — passed into `RadarSearch`'s own outer-ring opacity.
  const outerRingOpacity = cardSlide.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  // A small, deliberate lift on the title+subtitle block, same drive value as everything else —
  // otherwise it's the one static element while the ring/card visibly move, which reads as
  // unrelated rather than one screen reacting to the same event (Gestalt common fate).
  const titleTranslateY = cardSlide.interpolate({ inputRange: [0, 1], outputRange: [0, TITLE_LIFT] });

  const selectDevice = useCallback(
    (device: ScannedDevice) => {
      navigation.navigate('DevicePairingBoundary', {
        deviceId: device.id,
        deviceName: device.name,
      });
    },
    [navigation],
  );

  if (status === 'noDevicesFound') {
    return (
      <View style={styles.root}>
        <LinearGradient colors={HOME_WASH_COLORS} locations={[...HOME_WASH_LOCATIONS]} style={styles.gradient} />
        <View style={[styles.topRow, { paddingTop: insets.top + tokens.spacing.md, paddingLeft: insets.left + tokens.spacing.lg }]}>
          <BackChevron onPress={goBack} />
        </View>
        <View style={styles.centered}>
          <Text variant="title" tone="inverse" style={styles.centerText}>
            We couldn&apos;t find it
          </Text>
          <Text variant="body" tone="inverse" style={styles.centerText}>
            A few things to check: is it charged, is it within arm&apos;s reach, and is it already
            paired to another phone?
          </Text>
          <View style={styles.actions}>
            <Button label="Scan again" onPress={restart} />
            <Button label="Cancel" variant="secondary" onPress={goBack} />
          </View>
        </View>
      </View>
    );
  }

  const isScanning = status === 'scanning';

  // Only once the scan has actually ended — offering it mid-scan would invite restarting a scan
  // that is still working, and throw away results already on screen.
  //
  // Two placements share these same buttons: bare on the gradient (no card yet, so it needs its
  // own horizontal inset) and inside `resultsCard` (which already pads itself).
  const actionButtons = (
    <>
      {!isScanning && <Button label="Scan again" onPress={restart} />}
      <Button label="Cancel" variant="secondary" onPress={goBack} />
    </>
  );

  return (
    <View style={styles.root}>
      {/* Same wash as Home/CurtainGround (`homeWashStop1..7`), so this reads as a continuation of
          Home's gradient rather than a different screen's own colour. No curtain card while
          there's nothing to put on one — it appears below once a device is found. */}
      <LinearGradient colors={HOME_WASH_COLORS} locations={[...HOME_WASH_LOCATIONS]} style={styles.gradient} />

      {/* No native header (see `navigation.tsx`) — own back control, same reasoning as Home's. */}
      <View
        style={[
          styles.topRow,
          { paddingTop: insets.top + tokens.spacing.md, paddingLeft: insets.left + tokens.spacing.lg },
        ]}
      >
        <BackChevron onPress={goBack} />
      </View>

      {/* Fixed page heading + its subtitle, one small header block right under the back row —
          title centred to match this screen's own centred ring/button and every other
          `CurtainGround`-based screen's centred title (Home's "BlueSmoke", etc.). The subtitle
          states what's ACTUALLY happening: once the scan has stopped, the "looking" copy goes,
          same reasoning as the ring below not claiming to still be searching over a radio that's
          off. Carries `titleTranslateY` — a small lift synced with the ring/card below, so this
          block doesn't read as the one frozen element while everything else visibly moves (see
          `TITLE_LIFT`). Also `measureRingPushTarget`'s other measurement target — the ring below
          lands `RING_TARGET_GAP` under THIS block's measured bottom edge once the card arrives. */}
      <Animated.View
        ref={titleBlockRef}
        onLayout={measureRingPushTarget}
        style={{ transform: [{ translateY: titleTranslateY }] }}
      >
        <Text
          variant="title"
          tone="inverse"
          style={[styles.scanTitle, { paddingLeft: insets.left + tokens.spacing.lg, paddingRight: insets.right + tokens.spacing.lg }]}
        >
          {isScanning ? 'Finding your device' : 'Finished looking'}
        </Text>
        <Text variant="body" tone="inverse" style={[styles.centerText, styles.subtitle]}>
          {isScanning
            ? 'Keep your BlueSmoke nearby and switched on.'
            : "Don't see your device? Bring it closer and scan again."}
        </Text>
      </Animated.View>

      {/* The ring, centred in the space below the title+subtitle block — its own `flex: 1` zone,
          the ONLY thing being centred within it now that the subtitle moved up into the title
          block above, so there's nothing left to pull its visual centre off true-centre. Also
          `measureRingPushTarget`'s other measurement target — its rest centre is what
          `ringPushUp` is measured from.

          The wrapper's `ringTranslateY`/`radarScale` transform always applies, scanning or not —
          by the time `isScanning` goes false in this branch, `cardSlide` has already settled at 1
          (this branch is only reachable with results already found), so `StaticDeviceIcon` lands
          in exactly the same spot `RadarSearch` was sitting in, just without the animation. */}
      <View ref={ringAreaRef} onLayout={measureRingPushTarget} style={styles.ringArea}>
        <Animated.View style={{ transform: [{ translateY: ringTranslateY }, { scale: radarScale }] }}>
          {isScanning ? (
            <RadarSearch
              outerRingOpacity={outerRingOpacity}
              innerRingBorderWidth={innerRingBorderWidth}
              outerFarSize={outerFarSize}
              outerFarOffset={outerFarOffset}
            />
          ) : (
            <StaticDeviceIcon />
          )}
        </Animated.View>
      </View>

      {hasResults ? (
        <Animated.View
          style={[
            styles.resultsCard,
            {
              top: cardTop,
              paddingBottom: insets.bottom + tokens.spacing.md,
              transform: [{ translateY: cardTranslateY }],
            },
          ]}
        >
          <Text variant="label" tone="secondary" style={styles.resultsLabel}>
            Devices found
          </Text>
          {devices.map((device) => (
            <ListRow
              key={device.id}
              label={device.name ?? 'BlueSmoke device'}
              trailing={
                <Text variant="caption" tone="secondary">
                  {signalLabel(device.rssi)}
                </Text>
              }
              onPress={() => selectDevice(device)}
            />
          ))}
          <View style={styles.actions}>{actionButtons}</View>
        </Animated.View>
      ) : (
        // Pinned to the bottom safe area rather than in normal flow below `ringArea` — that
        // flex:1 box already claims the rest of the screen's height, so a normal-flow sibling
        // after it would land flush against the bottom edge with no inset.
        <View style={[styles.actionsBare, { bottom: insets.bottom + tokens.spacing.xl }]}>{actionButtons}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Was nested inside `GradientGround`'s own `flex: 1` sheet before; now a direct child of
  // `root`, so it needs that flex itself to still center within the full screen.
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.xl,
  },
  centerText: {
    textAlign: 'center',
  },
  // Holds the back control now that there's no native header to supply one — a plain row rather
  // than absolute positioning, so it can't overlap the title/ring content below it.
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // No chip — just enough padding around the glyph to keep the tap area at the kit's minimum,
  // same as `HomeScreen`'s bell/profile icons.
  // `alignItems: 'flex-start'` (not `'center'`) so the glyph's own visual left edge lands on
  // this box's left edge — `scanTitle` below shares this same touch target's `paddingLeft`
  // formula (`insets.left + tokens.spacing.lg`), so the two need to agree on where "left" is,
  // not just share a number.
  backTouchTarget: {
    minWidth: tokens.touchTarget.minWidth,
    minHeight: tokens.touchTarget.minHeight,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backPressed: {
    opacity: 0.6,
  },
  backGlyph: {
    fontSize: 32,
    lineHeight: 32,
  },
  // Fixed page heading below `topRow` — own left/right padding set inline from insets (matching
  // `topRow`'s).
  scanTitle: {
    textAlign: 'center',
    marginTop: tokens.spacing.xs,
  },
  subtitle: {
    marginTop: TITLE_SUBTITLE_GAP,
  },
  // Claims the rest of the screen's height below the title+subtitle block and centres the ring
  // within it. Now the ONLY thing being centred (the subtitle moved up into the title block above
  // it), so its rest centre lands at this box's true centre — no other element's height pulls it
  // off that.
  ringArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xl,
  },
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
    borderColor: tokens.color.surface,
  },
  radarRingStatic: {
    opacity: 0.35,
  },
  // Centred on the same point as `radarRing` via negative `top`/`left` (both bigger than
  // `RADAR_RING_SIZE`, offset by half the difference) rather than a separate wrapper, so they
  // stay concentric with the core rings with no extra centring logic, and don't add to `radar`'s
  // own layout footprint — `View` defaults to `overflow: 'visible'`, so they paint outside it
  // without affecting `ringArea`'s layout (and therefore `ringAreaRef`'s own measured size).
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
  // No `radarOuterRingFar` counterpart — that ring's width/height/top/left are animated
  // (`outerFarSize`/`outerFarOffset` in `DeviceScanScreen`), not fixed, so they're set inline
  // instead of here.
  // The curtain card (`CurtainGround`'s motif) — only rendered once there's a result to put on
  // it. Absolutely positioned at the same `DEVICES_CURTAIN_TOP_RATIO` offset as Home's own
  // Devices card (`top` set inline from that ratio) rather than `flex: 1`, so both cards land at
  // an identical height on screen regardless of what this header renders above it.
  resultsCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.color.surfaceTint,
    borderTopLeftRadius: tokens.radii.xl,
    borderTopRightRadius: tokens.radii.xl,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
    ...tokens.elevation.sheetEdge,
  },
  resultsLabel: {
    marginBottom: tokens.spacing.xs,
  },
  actions: {
    marginTop: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  // Only used when there's no `resultsCard` around the buttons — pinned to the bottom safe area
  // (`bottom` set inline from insets) since `ringArea` above claims the rest of the screen's
  // height as a sibling, not a parent, so this can't rely on normal flow to land near the bottom.
  actionsBare: {
    position: 'absolute',
    left: 0,
    right: 0,
    marginHorizontal: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
});
