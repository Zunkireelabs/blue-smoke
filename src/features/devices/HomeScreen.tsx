import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Path } from 'react-native-svg';
import { GlassEffectView } from 'react-native-glass-effect-view';
import { BrandMark, CurtainGround, EmptyState, Text, tokens } from '@/shared/ui';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { BluetoothPrimingBody } from '@/features/onboarding/BluetoothPrimingBody';
import type { RootStackParamList } from '@/app/navigation';

// F6.P (USER_FLOWS.md) — after roughly this long pending, stop implying imminence and offer an
// exit rather than a bare spinner with no timeout (DE-8).
const TAKING_LONGER_MS = 2 * 60 * 1000;

// Native bottom sheets (iOS share sheet, Android modal sheets) dismiss on a short pull, not a
// drag to the edge of the screen — a small distance, or a quick flick even short of that
// distance, both read as "let go of this".
const SHEET_DISMISS_DISTANCE = 60;
const SHEET_DISMISS_VELOCITY = 0.5;

/** How far down the Devices card's own top edge parks — passed through to `CurtainGround`.
 * Exported so `DeviceScanScreen`'s results card parks at the same height as this one. */
export const DEVICES_CURTAIN_TOP_RATIO = 0.31;

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

/** Person-in-a-circle glyph (reference screenshot) — no icon set exists yet, this is small
 * enough to hand-author inline rather than pull in an icon library for one glyph. Relocated from
 * `app/navigation.tsx` (P0-7.0 follow-up): Home now owns its header, so this has no other
 * consumer. */
function ProfileGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={1.5} />
      <Circle cx="12" cy="10" r="2.5" fill={color} />
      <Path d="M6.5 18c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

/** Bell glyph for the (currently decorative) notifications slot — hand-authored inline for the
 * same reason `ProfileGlyph` is: no icon set exists yet, and it's one glyph. */
function BellGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3c-3 0-5 2.2-5 5.5v3.4c0 .6-.2 1.2-.6 1.7L5 15.3c-.6.8 0 2 1 2h12c1 0 1.6-1.2 1-2l-1.4-1.7c-.4-.5-.6-1.1-.6-1.7V8.5C17 5.2 15 3 12 3Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Path d="M10 19a2 2 0 0 0 4 0" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Notifications glyph, top-left of the header (reference screenshot) — a plain glyph, no chip
 * behind it. No notifications screen exists yet (nothing registered in `navigation.tsx`), so
 * this is deliberately not a `Pressable` — a button with no destination is the dead-CTA bug this
 * project's tests exist to catch. Revisit once a Notifications route lands.
 */
function BellButton() {
  return <BellGlyph size={24} color={tokens.color.textInverse} />;
}

/** Profile control, top-right of the header (reference screenshot) — a plain glyph, no chip
 * behind it, no account identifier label; `ProfileScreen` itself is where the signed-in
 * email/phone is shown. `iconTouchTarget` keeps the tap area at the kit's minimum without
 * drawing anything extra around the icon. */
function ProfileIconButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Profile"
      style={({ pressed }) => [styles.iconTouchTarget, pressed && styles.iconPressed]}
    >
      <ProfileGlyph size={24} color={tokens.color.textInverse} />
    </Pressable>
  );
}

/** A header action rendered as text — still used for the dev-only "Screens" gallery link. */
function HeaderTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.headerTextButton}
    >
      <Text variant="label" tone="link">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * "Pair a device"'s "+" control — a squircle, not a full circle (a plain circle read as a
 * generic FAB, not the tile-shaped tap targets modern iOS/watchOS controls use). Its active state
 * uses the REAL iOS 26 "Liquid Glass" material (`react-native-glass-effect-view` —
 * added for this, not previously a dependency), not an approximation: on iOS 26+ it bridges
 * Apple's own `UIGlassEffect`, so the refraction/specular highlight are the OS compositor's, not
 * hand-drawn layers. On older iOS and on Android — both still in this project's Definition of
 * Done — the library falls back to its own blur+shadow rendering, which is why there's no manual
 * blur/gradient here on top of it; that fallback is the library's job, not this component's.
 * `scale` pops slightly ABOVE 1 rather than down — Liquid Glass's active segment visually
 * lifts/bulges off the surface, the opposite direction a normal button's press-in dip would
 * suggest. `overflow: 'hidden'` on `glassButton` clips the glass layer to the squircle.
 *
 * No `tintColor` prop — the library's native iOS side (`GlassEffectView.mm`'s
 * `hexStringToColor:`) hard-codes ANY tint it's given to full opacity, so passing one at all
 * paints a flat colored block over the material instead of a translucent frost (tried `brand`,
 * then `brandTint`; both still looked like solid fills, just different shades). Leaving the prop
 * out skips that code path entirely (`GlassEffectView.mm`'s `updateProps` only replaces the view
 * when `tintColor` actually changes from its default, so never setting it never triggers the
 * broken tint logic) and falls through to the bare `UIGlassEffect` `initWithFrame` already
 * creates — real, untinted, native glass. It still isn't colorless in practice: `glassButton`'s
 * own `brandTint` fill stays underneath at all times (this view only overlays it on press), so
 * the translucent glass picks up that color from what's actually behind it, the way real Liquid
 * Glass gets its color from context rather than a paint. `UIGlassEffect` itself is resolved by
 * string (`NSClassFromString`), a very new, undocumented API surface — expect rough edges.
 */
function PairDeviceButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateScale = useCallback(
    (toValue: number) => {
      Animated.spring(scale, {
        toValue,
        useNativeDriver: true,
        speed: 20,
        bounciness: 6,
      }).start();
    },
    [scale],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Pair a device"
      onPress={onPress}
      onPressIn={() => animateScale(1.08)}
      onPressOut={() => animateScale(1)}
    >
      {({ pressed }) => (
        <Animated.View style={[styles.glassButton, { transform: [{ scale }] }]}>
          {pressed && <GlassEffectView style={styles.glassButtonGlass} />}
          <Text variant="title" tone="link" style={styles.glassPlus}>
            +
          </Text>
        </Animated.View>
      )}
    </Pressable>
  );
}

/**
 * "+" opens this alongside `HomeScreen`'s own dimmed backdrop (rendered directly in the body,
 * not in here — see `HomeScreen`) instead of navigating. Deliberately NOT the backdrop-inside-
 * the-`Modal` idiom `Sheet.tsx` uses: a `Modal`'s `animationType="slide"` animates its whole
 * subtree as one unit, so a backdrop rendered alongside the sheet *inside* the `Modal` slides up
 * together with it — visibly "attached" to the card instead of reading as a separate dim layer
 * that was already there. Keeping the backdrop in `HomeScreen`'s own tree means only the sheet
 * card itself is inside this `Modal`, so only the card slides; the root `View` here is
 * `pointerEvents="box-none"` so taps in the space around the card (not covered by it) fall
 * through to `HomeScreen`'s backdrop `Pressable` underneath, which is what actually closes it.
 *
 * The "We need Bluetooth to pair" dialog renders as a bottom sheet — same curved top (`radii.xl`)
 * as `CurtainGround`'s own curtain — sliding up from off screen (native `Modal`
 * `animationType="slide"`) to rest with its top edge just below Home's "Devices" label
 * (`sheetTop`, measured live off that label so it lines up regardless of device size — see
 * `HomeScreen`).
 *
 * "Continue" calls `onContinue` straight away — no artificial delay first. There used to be a
 * fixed-`PAIRING_LOADING_MS` "Looking for your device…" beat here, but it wasn't tied to any
 * real scan (no Bluetooth permission exists yet at this point to scan with) — it was just a fixed
 * timer standing in front of `BluetoothGate`, and it read as fake progress conflicting with the
 * REAL scan-until-found beat `DeviceScanScreen` shows later (`useDeviceScan`'s actual
 * `SCAN_TIMEOUT_MS`). Removed rather than kept "for feel".
 *
 * Swipe-to-dismiss rides on top of the same `translateY`, via core `Animated`/`PanResponder` —
 * no gesture/reanimated dependency exists in this project yet, and this interaction doesn't need
 * one. `onMoveShouldSetPanResponder` only claims the gesture once the touch has moved
 * predominantly downward past a tiny slop, so a plain tap on "Continue"/"Not now" is never
 * intercepted — only an actual drag is. Releasing past `SHEET_DISMISS_DISTANCE` (or a fast-enough
 * flick short of it) calls `onClose` directly rather than animating fully off-screen first: the
 * `Modal`'s own `animationType="slide"` close continues the sheet's motion from wherever the
 * finger let go, so it reads as one continuous slide down instead of two stacked animations.
 * Falling short of the threshold springs `translateY` back to 0.
 */
function PairingModal({
  visible,
  onContinue,
  onClose,
  sheetTop,
}: {
  visible: boolean;
  onContinue: () => void;
  onClose: () => void;
  sheetTop: number;
}) {
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
    }
  }, [visible, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (_event, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > SHEET_DISMISS_DISTANCE || gesture.vy > SHEET_DISMISS_VELOCITY) {
            onClose();
            return;
          }
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        },
      }),
    [onClose, translateY],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.pairingRoot} pointerEvents="box-none">
        <Animated.View
          style={[styles.pairingSheet, { top: sheetTop, transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.pairingSheetHandle} />
          <BluetoothPrimingBody onContinue={onContinue} onNotNow={onClose} />
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * The landing screen once a user is signed in AND past the age gate.
 *
 * DV-1/DV-2 (F7.1, `SCREEN_MAP.md`) — the old hardcoded "No devices paired" card collapses into
 * this one render because no paired-device store exists yet — pairing dead-ends at
 * `PairingBoundaryScreen` (OQ-12), so a paired device can never actually reach this screen in
 * the current build. When a device store lands (P1-5.0), that's the point to branch this into
 * an actual list.
 *
 * Built on `CurtainGround` (P0-7.0 follow-up) — the gradient + "BlueSmoke" wordmark + curtain
 * card shell shared with `BluetoothPrimingScreen`. Native header turned off in `navigation.tsx`
 * so the gradient runs edge-to-edge behind the status bar; the header row's three slots (bell,
 * brand mark, profile icon — reference screenshot) replace the old native `headerRight` avatar
 * button.
 *
 * Tapping "+" no longer navigates — `PairingModal` opens in place, a bottom sheet sliding up over
 * a dimmed Home rather than a pushed screen. The dim itself renders right here in the body (the
 * `pairingBackdrop` `Pressable` below), not inside `PairingModal`'s `Modal` — see that
 * component's own header comment for why: keeping it out of the `Modal` is what stops it sliding
 * up "attached" to the card instead of reading as a backdrop that was already there. It rests
 * with its top edge just below the "Devices" label below — `devicesLabelRef` measures that
 * label's live on-screen position (`measureInWindow`, not `onLayout`'s parent-relative numbers)
 * so the sheet lines up under it on any device size. "Continue" inside it still moves on to the
 * real permission-check screen (`BluetoothGate`); "Not now"/the backdrop just closes it, since
 * there was never anywhere to navigate back from.
 *
 * Sign-out moved to the Profile screen in P1-8.0, which is where the TODO puts it and which is
 * reachable from this screen's profile icon. It is still the only way back out of the gated
 * stack.
 */
export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [pairingOpen, setPairingOpen] = useState(false);
  const [sheetTop, setSheetTop] = useState(0);
  const devicesLabelRef = useRef<View>(null);

  const measureDevicesLabel = useCallback(() => {
    devicesLabelRef.current?.measureInWindow((_x, y, _width, height) => {
      setSheetTop(y + height);
    });
  }, []);

  return (
    <View style={styles.root}>
      <CurtainGround
        curtainTopRatio={DEVICES_CURTAIN_TOP_RATIO}
        titleTopSpacing={tokens.spacing.lg}
        subtitle={getGreeting()}
        headerLeft={
          <View style={styles.headerLeftGroup}>
            <BellButton />
            {__DEV__ && (
              <HeaderTextButton label="Screens" onPress={() => navigation.navigate('ScreenGallery')} />
            )}
            {__DEV__ && (
              // The only way to reach H158BringUpScreen on a real build — see that route's
              // own registration in navigation.tsx for why this needs no auth bypass.
              <HeaderTextButton label="H158" onPress={() => navigation.navigate('H158BringUp')} />
            )}
          </View>
        }
        headerCenter={<BrandMark size={28} groundColor={tokens.color.groundTopStrong} />}
        headerRight={<ProfileIconButton onPress={() => navigation.navigate('Profile')} />}
      >
        <View ref={devicesLabelRef} onLayout={measureDevicesLabel}>
          <Text variant="label" tone="secondary" style={styles.sectionLabel}>
            Devices
          </Text>
        </View>
        <EmptyState
          title="No devices paired"
          body="Pair your BlueSmoke to lock and unlock it from your phone."
        />
        <View style={styles.pairSpacer} />
        <View style={styles.pairSection}>
          <PairDeviceButton onPress={() => setPairingOpen(true)} />
          <Text variant="body" style={styles.centerText}>
            Pair a device
          </Text>
        </View>
      </CurtainGround>
      {pairingOpen && (
        <Pressable
          style={styles.pairingBackdrop}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => setPairingOpen(false)}
        />
      )}
      <PairingModal
        visible={pairingOpen}
        sheetTop={sheetTop}
        onContinue={() => {
          setPairingOpen(false);
          navigation.navigate('BluetoothGate');
        }}
        onClose={() => setPairingOpen(false)}
      />
    </View>
  );
}

/**
 * VF-3 / VF-4 (F6.5, F6.P — `SCREEN_MAP.md`'s navigation-structure table assigns VF-3 to this
 * exact `pending` stack). Shown while the age-gate query is in flight, and while an inquiry is
 * awaiting the vendor's decision. Kept in this file so the gated stack has no partial-state
 * gaps.
 *
 * F6.Z — this was a second instance of the same stranding trap `PersonaVerificationScreen` had:
 * zero controls, on a stack `sessionStatus === 'signedIn'` keeps mounted indefinitely. Now
 * carries a persistent sign-out. After `TAKING_LONGER_MS`, the copy stops implying the check is
 * seconds away (VF-4) — "We'll notify you" is reassurance copy, not a button: there is no push
 * wiring to opt into (SY-2/3 are blocked on a backend that doesn't exist), and a button with no
 * destination is exactly the dead-CTA bug this project's tests exist to catch.
 */
export function VerificationPendingScreen() {
  const [takingLonger, setTakingLonger] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTakingLonger(true), TAKING_LONGER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" />
      {takingLonger ? (
        <>
          <Text variant="title" style={styles.centerText}>
            This is taking longer than usual
          </Text>
          <Text variant="body" tone="secondary" style={styles.centerText}>
            Nothing's wrong, and you don't need to do anything. We'll let you know as soon as
            it's done.
          </Text>
        </>
      ) : (
        <>
          <Text variant="title" style={styles.centerText}>
            Confirming your verification…
          </Text>
          <Text variant="body" tone="secondary" style={styles.centerText}>
            We're waiting on the result. This can take a moment — you don't need to do anything
            else right now.
          </Text>
        </>
      )}
      <View style={styles.signOut}>
        <SignOutButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  pairingRoot: {
    flex: 1,
  },
  // "Slight overlay", not the heavier 0.5 `Sheet.tsx` uses for destructive confirms — Home's own
  // gradient (already showing through, `Modal transparent`) should still read clearly behind it.
  pairingBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.color.textPrimary,
    opacity: 0.18,
  },
  // Same curved-top motif as `CurtainGround`'s own curtain (`radii.xl`) — `top` is set inline
  // per-render from the measured "Devices" label position, not a fixed value here. No elevation
  // shadow: against `pairingBackdrop`'s flat dim, `sheetEdge`'s glow read as a halo smeared
  // around the whole card rather than a clean edge, so the dim alone does the separating.
  pairingSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.color.surfaceTint,
    borderTopLeftRadius: tokens.radii.xl,
    borderTopRightRadius: tokens.radii.xl,
    padding: tokens.spacing.xl,
  },
  // `backgroundMuted` alone (as `Sheet.tsx`'s handle uses) reads as near-invisible against this
  // sheet's `surfaceTint` fill — the two are only a couple of `neutral` steps apart, and no other
  // registered `bgToken` sits any greyer. Same move as `pairingBackdrop` below: dim `textPrimary`
  // via the `opacity` *style* property rather than reach for a new literal/token pairing — a
  // plain style number, not a color, so it renders as a solid mid-grey fill without adding a
  // `contrastPairs` entry for a token nothing ever draws text on.
  pairingSheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.textPrimary,
    opacity: 0.2,
    marginBottom: tokens.spacing.lg,
  },
  headerTextButton: {
    minHeight: tokens.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  headerLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  // No chip — just enough padding around the glyph to keep the tap area at the kit's minimum.
  iconTouchTarget: {
    minWidth: tokens.touchTarget.minWidth,
    minHeight: tokens.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPressed: {
    opacity: 0.6,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
    backgroundColor: tokens.color.background,
  },
  centerText: {
    textAlign: 'center',
  },
  signOut: {
    marginTop: tokens.spacing.xl,
    alignSelf: 'stretch',
  },
  sectionLabel: {
    marginBottom: tokens.spacing.sm,
  },
  pairSpacer: {
    flexGrow: 1,
  },
  pairSection: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingBottom: tokens.spacing.md,
  },
  glassButton: {
    width: 72,
    height: 72,
    borderRadius: tokens.radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.brandTint,
    overflow: 'hidden',
    ...tokens.elevation.card,
  },
  // `borderRadius` set here too, not just relying on `glassButton`'s `overflow: 'hidden'` clip —
  // `GlassEffectView.mm` reads its own layer's `cornerRadius` to round the native material's edge
  // (`_view.layer.cornerRadius = self.layer.cornerRadius`), so this gives the glass a soft rounded
  // edge of its own rather than a hard rectangle masked from the outside.
  glassButtonGlass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: tokens.radii.xl,
  },
  glassPlus: {
    fontSize: 32,
    lineHeight: 34,
  },
});
