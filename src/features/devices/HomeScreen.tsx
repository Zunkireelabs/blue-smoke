import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  LayoutAnimation,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';
import { GlassEffectView } from 'react-native-glass-effect-view';
import { Badge, CurtainGround, HOME_WASH_LOCATIONS, Text, tokens } from '@/shared/ui';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { BluetoothPrimingBody } from '@/features/onboarding/BluetoothPrimingBody';
import { useProfile } from '@/features/profile/useProfile';
import { useBleManager } from '@/features/ble/BleClientContext';
import { readBluetoothGateState } from '@/features/ble/bluetoothPermission';
import {
  useH158ConnectionStore,
  type ConnectedH158Device,
} from '@/features/ble/h158/useH158ConnectionStore';
import {
  clearLastConnectedH158Device,
  getLastConnectedH158Device,
} from '@/features/ble/h158/h158DeviceStorage';
import type { RootStackParamList } from '@/app/navigation';

/** The hero's headline, below the greeting — fixed rather than branching on paired-device count.
 * `useH158ConnectionStore` now carries a live single-connection flag (see `ConnectedDeviceCard`
 * below), but there is still no multi-device *list* (P1-5.0, `TODO-phase-1.md`) for this copy to
 * summarize — one connected device isn't a count worth branching a headline on. Revisit once
 * P1-5.0 lands. */
const HERO_HEADLINE = 'Get your device\nconnected.';

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

/** Profile glyph — reference screenshot uses a real photo; we have none (no avatar-upload
 * feature exists), so this is a plain outline "user" mark instead of an avatar stand-in: same
 * thin stroke weight and rounded joins as `BellGlyph` beside it, rather than the old avatar-chip
 * treatment (a translucent filled circle behind a solid mark), which read as a different visual
 * language from the bell rather than its match. No icon set exists yet, so hand-authored inline
 * rather than pulling in a library for one glyph. Relocated from `app/navigation.tsx` (P0-7.0
 * follow-up): Home now owns its header, so this has no other consumer. */
function ProfileGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="3.6" stroke={color} strokeWidth={1.8} />
      <Path
        d="M5 20.2c0-3.6 3.1-6.2 7-6.2s7 2.6 7 6.2"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Bell glyph for the (currently decorative) notifications slot — a single continuous flared
 * silhouette (reference screenshot) rather than the old handbell-shaped outline, thinner stroke
 * to match the reference's lighter weight. Hand-authored inline for the same reason
 * `ProfileGlyph` is: no icon set exists yet, and it's one glyph. */
function BellGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8.5a6 6 0 0 0-12 0c0 6-2.5 7.8-2.5 7.8h17S18 14.5 18 8.5Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M13.7 19.8a2 2 0 0 1-3.4 0" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** Soft circular backing behind a header glyph (reference screenshot) — `iconChipBg` is an
 * absolutely-positioned sibling of `children`, not a parent wrapping them, so its own `opacity`
 * only fades the circle itself; nesting the glyph inside an opacity'd view would have faded the
 * icon along with it. Doubles as the touch target (`tokens.touchTarget.min*`), so this replaces
 * the old bare `iconTouchTarget` rather than sitting inside it. */
function IconChip({ children }: { children: ReactNode }) {
  return (
    <View style={styles.iconChip}>
      <View style={styles.iconChipBg} />
      {children}
    </View>
  );
}

/** Rounded-device-with-padlock mark for the Devices empty state (design reference) — a single
 * self-contained SVG (outline + solid interior fill), not a bare stroke icon, so it reads as one
 * opaque mark on the card rather than a thin outline floating on it. `color`/`backgroundColor`
 * both come from `tokens.color.*` at the call site (`link`/`surface`), not hardcoded here, same
 * convention as `BellGlyph`/`ProfileGlyph` above. */
function DeviceLockGlyph({ size, color, backgroundColor }: { size: number; color: string; backgroundColor: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 88" fill="none">
      <Rect x="4" y="4" width="56" height="80" rx="16" fill={backgroundColor} stroke={color} strokeWidth={3} />
      <Path d="M25 38v-6a7 7 0 0 1 14 0v6" stroke={color} strokeWidth={3} strokeLinecap="round" />
      <Rect x="22" y="38" width="20" height="16" rx="4" fill={backgroundColor} stroke={color} strokeWidth={3} />
      <Circle cx="32" cy="46" r="1.8" fill={color} />
    </Svg>
  );
}

/** Plain padlock, no outer device silhouette — distinct from `DeviceLockGlyph` above, which
 * draws its own pill-shaped device outline. In `DeviceSignalIllustration` below, the "device" is
 * a real styled box (`emptyDeviceBox`), not an SVG outline, so the glyph sitting inside it only
 * needs to be the lock itself; layering `DeviceLockGlyph`'s outline on top of that box would
 * have drawn two competing device shapes on top of each other. */
function PadlockGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="6" y="11" width="12" height="9" rx="2.4" stroke={color} strokeWidth={2} />
      <Path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx="12" cy="15.2" r="1.1" fill={color} />
    </Svg>
  );
}

/**
 * Home's empty-state illustration (design review round 3) — a shadowed device with concentric
 * signal rings and a few floating dots behind it, suggesting it's broadcasting/discoverable.
 * Replaces the old `DeviceLockGlyph`-in-a-card mark, which read as two unrelated shapes (a pill
 * outline, a padlock badge) overlaid rather than one. Purely decorative besides the lock glyph;
 * the rings/glow/dots are plain `View`s, not SVG, so translucency comes from this file's existing
 * "solid token + opacity style" trick (`iconChipBg`, `pairingBackdrop`) rather than new color
 * tokens.
 */
function DeviceSignalIllustration() {
  return (
    <View style={styles.illustration}>
      <View style={[styles.signalRing, styles.signalRingOuter]} />
      <View style={[styles.signalRing, styles.signalRingMid]} />
      <View style={[styles.signalRing, styles.signalRingInner]} />
      <View style={styles.signalGlow} />
      <View style={styles.signalDotA} />
      <View style={styles.signalDotB} />
      <View style={styles.signalDotC} />
      <View style={styles.signalDotD} />
      <View style={styles.emptyDeviceBox}>
        <View style={styles.emptyDeviceNub} />
        <PadlockGlyph size={24} color={tokens.color.link} />
      </View>
    </View>
  );
}

// UI-only display threshold for `BatteryGlyph`'s low-battery tinting — not a device/protocol
// value (h158Protocol.ts's `batteryPercent` carries no such threshold of its own), so this is a
// client-side design choice, not something read from spec or manufacturer docs.
const LOW_BATTERY_PERCENT = 20;

/** Small outline battery mark with a proportionally-filled body — sits at the right end of
 * `ConnectedDeviceCard`'s row (design ask: "battery percentage in the right end of the device").
 * Hand-drawn inline for the same reason every other glyph in this file is (no icon set exists yet).
 * `percent` is clamped defensively — `h158Protocol.ts`'s `batteryPercent` is a raw device byte
 * (0-255) with no documented sentinel for "unknown" the way the old §4 mock protocol's DV-9 note
 * described, so nothing here assumes the value is always 0-100. */
function BatteryGlyph({ percent, color }: { percent: number; color: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillWidth = (clamped / 100) * 20;
  return (
    <Svg width={22} height={12} viewBox="0 0 26 14" fill="none">
      <Rect x="1" y="1" width="22" height="12" rx="2.5" stroke={color} strokeWidth={1.5} />
      <Rect x="24" y="4.5" width="2" height="5" rx="1" fill={color} />
      <Rect x="3" y="3" width={fillWidth} height="8" rx="1" fill={color} />
    </Svg>
  );
}

/**
 * Replaces the old plain `EmptyState` text-only render for Home's "No devices paired" section
 * (design review round 3). No wrapping card — `DeviceSignalIllustration`, the headline, and the
 * body sit directly on the curtain sheet, same as every reference this redesign is built from.
 * The old `emptyCard` was its own white/bordered/shadowed surface floating inside the sheet's
 * own white fill — a card inside a card, which is exactly the pattern those references drop.
 * Local to `HomeScreen.tsx` rather than a new `EmptyState` variant: `EmptyState` itself stays the
 * plain, terse version for its other three consumers (`PairDeviceScreen`, `H158PairScreen`,
 * `H158BringUpScreen`), which didn't ask for this and shouldn't get it as a side effect of
 * Home's own redesign.
 */
function DevicesEmptyState() {
  return (
    <View style={styles.emptyState}>
      <DeviceSignalIllustration />
      <Text variant="title" style={styles.emptyHeadline}>
        No devices paired yet
      </Text>
      <Text variant="body" tone="secondary" style={styles.emptyBody}>
        Pair your device to start locking and unlocking it from your phone.
      </Text>
    </View>
  );
}

/**
 * Replaces `DevicesEmptyState` when `useH158ConnectionStore` has a live device — a compact
 * light-grey row (design reference, matching `ListRow`'s own "list rows as light-grey rounded
 * containers with a leading icon" convention, execution brief §3) rather than the old tall,
 * centred hero card: this reads as one entry in a device list, which is the shape P1-5.0's real
 * multi-device list will eventually be, even though today there is still only ever one row. This
 * is a live *connection* indicator only, sourced from `H158PairScreen`'s `connectH158Session`
 * call — not the P1-5.0 multi-device list (bonded-device list, rename, unpair, battery, §4
 * backend sync), which is a separate, much larger, still-unclaimed task (see
 * `TODO-phase-1.md`). Tapping through re-enters the same `H158Gate` → `H158Pair` chain the "+"
 * button uses — but `H158PairScreen` now resumes straight into the connected controls (Read
 * Status/Lock/Unlock/Disconnect) when `useH158ConnectionStore` already has a live session, rather
 * than re-scanning for a device that's already connected, so this card is a real way back into
 * those controls, not just a status readout.
 *
 * `locked`/`batteryPercent` are `useH158ConnectionStore`'s own fields — a confirmed device reply
 * (`readStatus`/`setChildLock`) or nothing, never a guess (CLAUDE.md: "Lock state UI is
 * notification-driven, never optimistic"). `null` (nothing heard back yet) renders no
 * Locked/Unlocked badge and no battery reading — nothing here stands in for an unconfirmed
 * state. The accessibility label mirrors that: the lock/battery clauses are appended only once
 * each value is known, so a fresh connection with no reply yet still reads exactly as it did
 * before this state existed.
 */
function ConnectedDeviceCard({
  device,
  connected,
  locked,
  batteryPercent,
  onPress,
  onForget,
}: {
  device: ConnectedH158Device;
  connected: boolean;
  locked: boolean | null;
  batteryPercent: number | null;
  onPress: () => void;
  onForget: () => void;
}) {
  const lockClause = locked === null ? '' : locked ? ', locked' : ', unlocked';
  const batteryClause = batteryPercent === null ? '' : `, battery ${batteryPercent}%`;
  const statusClause = connected ? `connected${lockClause}${batteryClause}` : 'disconnected';
  return (
    <View style={styles.deviceRowWrapper}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${device.name ?? 'BlueSmoke device'}, ${statusClause}. ${
          connected ? 'Open device.' : 'Reconnect.'
        }`}
        style={({ pressed }) => [styles.deviceRow, pressed && styles.iconPressed]}
      >
        <DeviceLockGlyph size={40} color={tokens.color.link} backgroundColor={tokens.color.surface} />
        <View style={styles.deviceRowInfo}>
          <Text variant="label" numberOfLines={1}>
            {device.name ?? 'BlueSmoke device'}
          </Text>
          <View style={styles.deviceRowBadges}>
            {connected ? (
              <Badge label="Connected" tone="success" />
            ) : (
              <Badge label="Disconnected" tone="neutral" />
            )}
            {connected && locked !== null && (
              <Badge label={locked ? 'Locked' : 'Unlocked'} tone={locked ? 'neutral' : 'danger'} />
            )}
          </View>
        </View>
        {connected && batteryPercent !== null && (
          <View style={styles.deviceRowBattery}>
            {/* Two isolated JSX branches, not a single ternary picking between two token
                references — the contrast-completeness guard's regex misreads a token name sitting
                directly before a bare colon that's followed by another token reference as a fake
                style-key entry, when the two are written colon-adjacent in one expression. */}
            {batteryPercent <= LOW_BATTERY_PERCENT ? (
              <BatteryGlyph percent={batteryPercent} color={tokens.color.dangerText} />
            ) : (
              <BatteryGlyph percent={batteryPercent} color={tokens.color.textSecondary} />
            )}
            <Text variant="caption" tone="secondary">
              {batteryPercent}%
            </Text>
          </View>
        )}
      </Pressable>
      {/* Local-only "forget" — no OS bond or server record exists for H158 to also revoke
          (h158DeviceStorage.ts), so this is the entire unpair action. */}
      <Pressable
        onPress={onForget}
        accessibilityRole="button"
        accessibilityLabel={`Forget ${device.name ?? 'BlueSmoke device'}`}
        style={({ pressed }) => [styles.forgetLink, pressed && styles.iconPressed]}
      >
        <Text variant="caption" tone="link">
          Forget device
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Notifications glyph, top-right of the header (reference screenshot). No notifications screen
 * exists yet (nothing registered in `navigation.tsx`), so this is deliberately not a `Pressable`
 * — a button with no destination is the dead-CTA bug this project's tests exist to catch. Revisit
 * once a Notifications route lands. No unread-count badge either — there's no notification data
 * to back one, and a decorative dot with no real state behind it is exactly the kind of fake
 * state this kit avoids (see the "Lock state UI is notification-driven, never optimistic" rule).
 */
function BellButton() {
  return (
    <IconChip>
      <BellGlyph size={22} color={tokens.color.textInverse} />
    </IconChip>
  );
}

/** Profile control, top-left of the header (reference screenshot) — no account identifier label;
 * `ProfileScreen` itself is where the signed-in email/phone is shown. */
function ProfileIconButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Profile"
      style={({ pressed }) => pressed && styles.iconPressed}
    >
      <IconChip>
        <ProfileGlyph size={22} color={tokens.color.textInverse} />
      </IconChip>
    </Pressable>
  );
}

/** A header action rendered as text — still used for the dev-only "Screens" gallery link.
 * `tone="inverse"` (white), not `"link"` (brand blue) — this sits on Home's own brand-blue
 * gradient, same as the bell/profile glyphs beside it, so a brand-colored link would nearly
 * disappear against it. */
function HeaderTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.headerTextButton}
    >
      <Text variant="label" tone="inverse">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * "Pair a device" — a compact, content-width pill (not full-bleed — sized to its icon + label,
 * centred via `pairButtonPressable`'s `alignSelf: 'center'`, since `emptyCardWrapper`'s default
 * `alignItems: 'stretch'` would otherwise stretch the whole `Pressable` to the sheet's width).
 *
 * Its resting fill is a diagonal blue gradient (`glassButtonBg`, `LinearGradient` over
 * `homeWashStop5`→`homeWashStop2`→`homeWashStop4` — reusing Home's own approved wash stops
 * rather than inventing new hex values `tokens.ts`'s header comment asks not to add without
 * asking) plus a colored glow shadow (`shadowColor: tokens.color.brand`, iOS only — Android has
 * no colored-shadow equivalent, same platform gap `elevation.card`/`sheetEdge` already accept),
 * matching the glossy gradient-pill reference this round is built from. `+`/label read
 * `tone="inverse"` (white) again — a saturated gradient fill, unlike the translucent chip this
 * replaced, needs white content to stay legible.
 *
 * On press, the REAL iOS 26 "Liquid Glass" material takes over (`react-native-glass-effect-view`),
 * not an approximation: on iOS 26+ it bridges Apple's own `UIGlassEffect`, so the
 * refraction/specular highlight are the OS compositor's, not hand-drawn layers. On older iOS and
 * on Android — both still in this project's Definition of Done — the library falls back to its
 * own blur+shadow rendering, which is why there's no manual blur/gradient here on top of it; that
 * fallback is the library's job, not this component's. `scale` pops slightly ABOVE 1 rather than
 * down — Liquid Glass's active segment visually lifts/bulges off the surface, the opposite
 * direction a normal button's press-in dip would suggest. `overflow: 'hidden'` on `glassButton`
 * clips both `glassButtonBg` and the glass layer to the pill's rounded edge.
 *
 * No `tintColor` prop on `GlassEffectView` — the library's native iOS side
 * (`GlassEffectView.mm`'s `hexStringToColor:`) hard-codes ANY tint it's given to full opacity, so
 * passing one at all paints a flat colored block over the material instead of a translucent
 * frost (tried `brand`, then `brandTint`; both still looked like solid fills, just different
 * shades). Leaving the prop out skips that code path entirely (`GlassEffectView.mm`'s
 * `updateProps` only replaces the view when `tintColor` actually changes from its default, so
 * never setting it never triggers the broken tint logic) and falls through to the bare
 * `UIGlassEffect` `initWithFrame` already creates — real, untinted, native glass. It still isn't
 * colorless in practice: `glassButtonBg`'s own fill stays underneath at all times (the
 * `GlassEffectView` layer only overlays it on press), so the translucent glass picks up its color
 * from what's actually behind it, the way real Liquid Glass gets its color from context rather
 * than a paint. `UIGlassEffect` itself is resolved by string (`NSClassFromString`), a very new,
 * undocumented API surface — expect rough edges.
 *
 * `glassButtonBg` is an absolutely-positioned sibling of the icon/label, not a parent wrapping
 * them — the same fix `IconChip`'s own `iconChipBg` needed and this component itself briefly got
 * wrong once already: nesting visible content inside an `opacity`'d view fades the content along
 * with the background, which very nearly shipped a "+" and label at 16% opacity.
 *
 * `style` lets the empty-state call site tighten the gap above it (`emptyStatePairButton`)
 * without the connected-device call site (which wraps it in `pairSection` instead) picking up
 * that spacing too.
 */
function PairDeviceButton({ onPress, style }: { onPress: () => void; style?: StyleProp<ViewStyle> }) {
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
      onPressIn={() => animateScale(1.02)}
      onPressOut={() => animateScale(1)}
      style={styles.pairButtonPressable}
    >
      {({ pressed }) => (
        <Animated.View style={[styles.glassButton, style, { transform: [{ scale }] }]}>
          <LinearGradient
            colors={[tokens.color.homeWashStop5, tokens.color.homeWashStop2, tokens.color.homeWashStop4]}
            locations={[0, 0.55, 1]}
            style={styles.glassButtonBg}
          />
          {pressed && <GlassEffectView style={styles.glassButtonGlass} />}
          <Text variant="title" tone="inverse" style={styles.glassPlus}>
            +
          </Text>
          <Text variant="label" tone="inverse" style={styles.glassButtonLabel}>
            Pair a device
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
  // Plain state, not an `Animated.Value` — the handle-color diagnostic below proved that a
  // React-state-driven style change paints correctly mid-gesture on the actual devices this was
  // tested on, while `Animated.Value.setValue()` inside the same `onPanResponderMove` never
  // moved the sheet at all despite the gesture being granted. That's a legacy-`Animated`/Fabric
  // interop gap (this project has no Reanimated dependency to reach for instead), not a gesture
  // recognition bug — so the fix is to stop routing the drag position through `Animated`, not to
  // keep chasing the responder wiring.
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    if (visible) {
      setDragOffset(0);
    }
  }, [visible]);

  // `onClose` is passed as a fresh inline arrow at the call site, so it changes identity on
  // every `HomeScreen` re-render. A ref, read inside the responder instead of closed over
  // directly, keeps `panResponder` below out of that dependency — building it fresh mid-drag
  // (e.g. from a `useH158ConnectionStore` update landing while a finger is down) would reset
  // `PanResponder`'s internal gesture tracking, which is exactly what made the swipe look dead:
  // `gesture.dy` kept restarting from a new baseline instead of accumulating.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // TEMP diagnostic (remove once the swipe is confirmed working on-device) — darkens the handle
  // the instant the gesture is granted, so a tester can see with their own eyes whether the
  // touch is even being recognized as a pan at all, independent of whether `translateY` itself
  // visibly moves the sheet.
  const [isDragging, setIsDragging] = useState(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 5 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          setIsDragging(true);
        },
        onPanResponderMove: (_event, gesture) => {
          setDragOffset(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          setIsDragging(false);
          if (gesture.dy > SHEET_DISMISS_DISTANCE || gesture.vy > SHEET_DISMISS_VELOCITY) {
            onCloseRef.current();
            return;
          }
          LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
          setDragOffset(0);
        },
        onPanResponderTerminate: () => {
          setIsDragging(false);
          LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
          setDragOffset(0);
        },
      }),
    [],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.pairingRoot} pointerEvents="box-none">
        <View
          style={[styles.pairingSheet, { top: sheetTop, transform: [{ translateY: dragOffset }] }]}
          {...panResponder.panHandlers}
        >
          <View style={[styles.pairingSheetHandle, isDragging && styles.pairingSheetHandleActive]} />
          <View style={styles.pairingSheetBody}>
            <BluetoothPrimingBody onContinue={onContinue} onNotNow={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * The landing screen once a user is signed in AND past the age gate.
 *
 * DV-1/DV-2 (F7.1, `SCREEN_MAP.md`) — the old hardcoded "No devices paired" card now branches on
 * `useH158ConnectionStore`: the real H158 hardware chain (`H158GateScreen`/`H158PairScreen`) can
 * actually reach a connected state, unlike the §4 mock flow, which still dead-ends at
 * `PairingBoundaryScreen` (OQ-12). This is a single live-connection flag, not a device list —
 * when the full P1-5.0 store lands (bonded-device list, rename, unpair, battery), that's the
 * point to replace this branch with a real list.
 *
 * Built on `CurtainGround` (P0-7.0 follow-up) — the gradient + curtain card shell shared with
 * `BluetoothPrimingScreen`, which keeps that screen's default centred "BlueSmoke" wordmark
 * (`CurtainGround`'s `title` prop defaults to it) while Home opts into `align="left"` and
 * replaces `title`/adds `eyebrow`/`divider` for its own personalised hero — greeting + display
 * name (`eyebrow`, via `useProfile`) above an action headline (`title`, no separate `subtitle`),
 * left-aligned under the header row rather than the old centred "BlueSmoke" +
 * time-of-day-greeting pair.
 * Native header turned off in `navigation.tsx` so the gradient runs edge-to-edge behind the
 * status bar; the header row's `headerLeft`/`headerRight` slots (profile avatar, bell —
 * reference screenshot, avatar left/notifications right) replace the old native `headerRight`
 * avatar button. No `headerCenter` — the flame `BrandMark` that used to sit there was dropped;
 * the hero block below the header row now carries the brand identity instead.
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
  const { profile } = useProfile();
  const connectedDevice = useH158ConnectionStore((state) => state.device);
  const connectedDeviceLocked = useH158ConnectionStore((state) => state.locked);
  const connectedDeviceBattery = useH158ConnectionStore((state) => state.batteryPercent);
  // Local-only "remembered device" — survives a disconnect (`useH158ConnectionStore`'s own
  // `device` does not, see `setH158Disconnected()`), so a device that's merely out of range
  // still renders as a row here instead of Home falling back to `DevicesEmptyState`. Reloaded on
  // every focus, not just mount, so returning from `H158Pair` after a fresh pair (or after
  // "Forget device" below) picks up the change immediately.
  const [lastKnownDevice, setLastKnownDevice] = useState<ConnectedH158Device | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getLastConnectedH158Device().then((device) => {
        if (!cancelled) {
          setLastKnownDevice(device);
        }
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );
  const displayDevice = connectedDevice ?? lastKnownDevice;
  const forgetDevice = useCallback(() => {
    void clearLastConnectedH158Device().then(() => setLastKnownDevice(null));
  }, []);

  // ON-4's priming sheet (`PairingModal` below) exists to explain Bluetooth BEFORE the OS
  // permission dialog the gate triggers — F7.2. Once `readBluetoothGateState` already reports
  // `poweredOn`, there is no dialog left to pre-empt and nothing for the user to fix, so the
  // sheet is pure friction between "Pair a device" and the scan. It was showing on every press,
  // including with Bluetooth on and a device already connected. Every other gate state
  // (permission never asked, denied, blocked, adapter off, unsupported, still-unknown) still
  // gets the sheet exactly as before — this narrows the skip to the one case where priming
  // teaches nothing.
  //
  // Read on focus AND on foreground, the same re-check rule `BluetoothGateScreen` follows
  // (USER_FLOWS.md F1: "permission state is re-checked on every app foreground"), rather than
  // awaited inside the press handler — a press must not sit on an unbounded BLE read. That
  // leaves a window where the flag is stale if Bluetooth is toggled without Home losing focus
  // or the app backgrounding; both stale outcomes are safe. Stale `true` skips the sheet and
  // lands on `BluetoothGateScreen`'s own ON-9 "Bluetooth is off" screen, which is the honest
  // destination anyway; stale `false` shows the sheet, which is just the old behaviour.
  const bleManager = useBleManager();
  const [bluetoothReady, setBluetoothReady] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const check = () => {
        // A rejected read resolves to "not ready" rather than propagating: the fallback is the
        // priming sheet, i.e. today's behaviour, never a skip on an answer we never got.
        readBluetoothGateState(bleManager).then(
          (state) => {
            if (!cancelled) {
              setBluetoothReady(state === 'poweredOn');
            }
          },
          () => {
            if (!cancelled) {
              setBluetoothReady(false);
            }
          },
        );
      };
      check();
      const subscription = AppState.addEventListener('change', (next) => {
        if (next === 'active') {
          check();
        }
      });
      return () => {
        cancelled = true;
        subscription.remove();
      };
    }, [bleManager]),
  );
  const startPairing = useCallback(() => {
    if (bluetoothReady) {
      navigation.navigate('H158Gate');
      return;
    }
    setPairingOpen(true);
  }, [bluetoothReady, navigation]);

  const measureDevicesLabel = useCallback(() => {
    devicesLabelRef.current?.measureInWindow((_x, y, _width, height) => {
      setSheetTop(y + height);
    });
  }, []);

  // `profile.displayName` is null until someone sets one in Profile — true for most first
  // sign-ins, so this drops the name from the greeting line entirely rather than showing
  // "Good afternoon," with a trailing comma and nothing after it.
  const eyebrow = profile?.displayName ? `${getGreeting()}, ${profile.displayName}!` : `${getGreeting()}!`;

  return (
    <View style={styles.root}>
      <CurtainGround
        curtainTopRatio={DEVICES_CURTAIN_TOP_RATIO}
        titleTopSpacing={tokens.spacing.md}
        eyebrow={eyebrow}
        title={HERO_HEADLINE}
        align="left"
        washColors={[
          tokens.color.homeWashStop1,
          tokens.color.homeWashStop2,
          tokens.color.homeWashStop3,
          tokens.color.homeWashStop4,
          tokens.color.homeWashStop5,
          tokens.color.homeWashStop6,
          tokens.color.homeWashStop7,
        ]}
        washLocations={HOME_WASH_LOCATIONS}
        titleTone="inverse"
        subtitleTone="inverse"
        headerLeft={<ProfileIconButton onPress={() => navigation.navigate('Profile')} />}
        headerRight={
          <View style={styles.headerRightGroup}>
            {__DEV__ && (
              // The only way to reach H158BringUpScreen on a real build — see that route's
              // own registration in navigation.tsx for why this needs no auth bypass.
              <HeaderTextButton label="H158" onPress={() => navigation.navigate('H158BringUp')} />
            )}
            {__DEV__ && (
              <HeaderTextButton label="Screens" onPress={() => navigation.navigate('ScreenGallery')} />
            )}
            <BellButton />
          </View>
        }
      >
        <View ref={devicesLabelRef} onLayout={measureDevicesLabel}>
          <Text variant="label" tone="secondary" style={styles.sectionLabel}>
            Devices
          </Text>
        </View>
        {/* `emptyCardWrapper`'s `flexGrow: 1` still centres its contents in the space between
            the "Devices" label and the curtain's bottom edge — only `justifyContent` branches on
            state. Unconnected, `DevicesEmptyState` and its "Pair a device" pill render together
            as one block (design review round 3 — every reference this redesign is built from
            composes the illustration, copy, and CTA tightly, not as two disconnected pieces), so
            they centre as a single unit. Connected, `ConnectedDeviceCard` sits top-aligned like a
            single row in a list (design reference), and `pairSection` below stays a separate
            "add another device" row rather than getting folded into the list row. */}
        <View style={[styles.emptyCardWrapper, displayDevice && styles.deviceListWrapper]}>
          {displayDevice ? (
            <ConnectedDeviceCard
              device={displayDevice}
              connected={connectedDevice !== null}
              locked={connectedDeviceLocked}
              batteryPercent={connectedDeviceBattery}
              onPress={() => navigation.navigate('H158Gate')}
              onForget={forgetDevice}
            />
          ) : (
            <>
              <DevicesEmptyState />
              <PairDeviceButton onPress={startPairing} style={styles.emptyStatePairButton} />
            </>
          )}
        </View>
        {displayDevice && (
          <View style={styles.pairSection}>
            <PairDeviceButton onPress={startPairing} />
          </View>
        )}
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
          // Real H158 hardware chain (see navigation.tsx) — the §4 BluetoothGate/DeviceScan
          // chain stays registered and untouched for P1-4.0's mock-based work, but the live
          // button now finds actual shipped hardware instead of a mock or dead end.
          navigation.navigate('H158Gate');
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
  // TEMP diagnostic — see `isDragging` above, remove together.
  pairingSheetHandleActive: {
    backgroundColor: tokens.color.brand,
    opacity: 1,
  },
  // `pairingSheet`'s height runs from `top` (measured off the "Devices" label, so it varies by
  // device) down to the screen bottom — often much taller than the title/body/buttons need. Left
  // to the sheet's default `flex-start`, that content stacks under the handle and leaves a dead
  // gap below the buttons instead of reading as one balanced block. Centering only this wrapper —
  // not `pairingSheet` itself — keeps the handle pinned to the sheet's top edge, where a drag
  // handle belongs, while the copy and buttons still occupy the same horizontal band the handle
  // does (`pairingSheet`'s own `padding`, unchanged).
  pairingSheetBody: {
    flex: 1,
    justifyContent: 'center',
  },
  headerTextButton: {
    minHeight: tokens.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.sm,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  // Sized off the kit's touch-target minimum, so the chip itself is the tap area rather than
  // padding around a smaller circle.
  iconChip: {
    width: tokens.touchTarget.minWidth,
    height: tokens.touchTarget.minHeight,
    borderRadius: tokens.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Absolutely positioned behind `iconChip`'s glyph child, not a parent of it — see `IconChip`'s
  // own comment for why. `textInverse` (white) at low opacity, the same "solid token + opacity
  // style" trick `pairingBackdrop`/`pairingSheetHandle` already use elsewhere in this file, so no
  // new rgba/translucent token is needed in `tokens.ts`.
  iconChipBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.textInverse,
    opacity: 0.16,
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
    fontSize: 18,
    lineHeight: 23,
    fontWeight: tokens.typography.fontWeight.semibold,
    marginBottom: tokens.spacing.sm,
  },
  // No background/border/shadow — design review round 3 dropped the old nested white card in
  // favour of the illustration + copy sitting directly on the curtain sheet's own fill.
  emptyState: {
    alignItems: 'center',
  },
  emptyHeadline: {
    textAlign: 'center',
    marginBottom: tokens.spacing.xs,
  },
  emptyBody: {
    textAlign: 'center',
  },
  // Fixed footprint for `DeviceSignalIllustration`'s absolutely-positioned rings/glow/dots to
  // anchor against — sized to the largest ring (`signalRingOuter`) plus a little breathing room.
  illustration: {
    width: 168,
    height: 156,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing.lg,
  },
  // Concentric, decreasing-opacity circles suggesting the device broadcasting — same
  // "solid token + opacity style" trick as `iconChipBg`/`pairingBackdrop` elsewhere in this
  // file, not new translucent color tokens. `brand`, not `link` — `link` has no registered
  // border/decoration role (`contrastCompleteness.test.ts` only exempts it as text), while
  // `brand` is already exempted there for exactly this non-text outline use.
  signalRing: {
    position: 'absolute',
    borderRadius: tokens.radii.full,
    borderWidth: 1,
    borderColor: tokens.color.brand,
  },
  signalRingOuter: {
    width: 156,
    height: 156,
    opacity: 0.1,
  },
  signalRingMid: {
    width: 112,
    height: 112,
    opacity: 0.16,
  },
  signalRingInner: {
    width: 74,
    height: 74,
    opacity: 0.24,
  },
  // Soft filled halo directly behind the device box — `brandTint` is already a pale enough blue
  // that it reads as a glow against `surfaceTint` without needing an opacity trick of its own.
  signalGlow: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.brandTint,
  },
  // Four fixed positions around the rings — purely decorative "signal" specks, not meaningful
  // enough individually to warrant named coordinates beyond which corner each sits in. `brand`,
  // not `link` — see `signalRing`'s comment; `brand` already has a registered `bgToken` pairing
  // (`textInverse on brand`), so this reuses an already-validated background use.
  signalDotA: {
    position: 'absolute',
    top: 14,
    left: 18,
    width: 6,
    height: 6,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.brand,
    opacity: 0.5,
  },
  signalDotB: {
    position: 'absolute',
    top: 30,
    right: 14,
    width: 5,
    height: 5,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.brand,
    opacity: 0.4,
  },
  signalDotC: {
    position: 'absolute',
    bottom: 28,
    left: 10,
    width: 6,
    height: 6,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.brand,
    opacity: 0.4,
  },
  signalDotD: {
    position: 'absolute',
    bottom: 14,
    right: 18,
    width: 4,
    height: 4,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.brand,
    opacity: 0.5,
  },
  // The illustration's centrepiece — a real shadowed box standing in for the physical device,
  // not an SVG outline (see `DeviceSignalIllustration`'s own comment for why that distinction
  // matters here).
  emptyDeviceBox: {
    width: 60,
    height: 88,
    borderRadius: tokens.radii.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...tokens.elevation.card,
  },
  // A small decorative nub near the device box's top edge (design reference) — reads as a
  // physical detail (a button, a seam) rather than a bare rounded rectangle. `backgroundMuted`,
  // not `border` — `border` has no registered `bgToken` pairing (only exempted as a non-text
  // outline), while `backgroundMuted` already does (`textPrimary on backgroundMuted`).
  emptyDeviceNub: {
    position: 'absolute',
    top: 12,
    width: 16,
    height: 3,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.backgroundMuted,
  },
  // Replaces the old bare `pairSpacer` (flexGrow only, card top-aligned above it) — centres
  // this wrapper's contents (the empty state + its attached CTA, or the connected-device row) in
  // the space between the "Devices" label and the curtain's bottom edge, rather than leaving
  // them pinned to the top with empty space underneath.
  emptyCardWrapper: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  // Overrides `emptyCardWrapper`'s centring so `ConnectedDeviceCard` sits top-aligned instead —
  // see the wrapper's own inline comment at the call site.
  deviceListWrapper: {
    justifyContent: 'flex-start',
  },
  // Compact light-grey row (design reference; same fill/radius `ListRow` uses for `DV-4`/`DV-9`/
  // `PF-*`) rather than `DevicesEmptyState`'s illustration + copy — this reads as one entry in a
  // list, not a standalone status screen.
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.backgroundMuted,
    borderRadius: tokens.radii.lg,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    gap: tokens.spacing.md,
  },
  // Wraps `deviceRow` + the "Forget device" link below it as one block, distinct from the row
  // itself so the link doesn't compete with `deviceRow`'s own Pressable touch target.
  deviceRowWrapper: {
    gap: tokens.spacing.xs,
  },
  forgetLink: {
    alignSelf: 'flex-end',
    minHeight: tokens.touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.xs,
  },
  // Rightmost element of `deviceRow` — battery glyph stacked above its percentage, kept narrow
  // so it doesn't compete with the device icon/name for space.
  deviceRowBattery: {
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  deviceRowInfo: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  deviceRowBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  // Connected-device state only now — the empty state attaches its own `PairDeviceButton`
  // directly (`emptyStatePairButton`) instead of wrapping it here. Kept for the "add another
  // device" row below `ConnectedDeviceCard`, a deliberately separate action from the list row
  // above it.
  pairSection: {
    paddingTop: tokens.spacing.sm,
    paddingBottom: tokens.spacing.md,
  },
  // Tightens the gap above the pill when it's attached directly under `DevicesEmptyState`
  // (design review round 3) — see `PairDeviceButton`'s own comment on why this is a `style`
  // prop rather than baked into `glassButton` itself.
  emptyStatePairButton: {
    marginTop: tokens.spacing.lg,
  },
  // `alignSelf: 'center'` breaks `PairDeviceButton` out of `emptyCardWrapper`'s default
  // `alignItems: 'stretch'` — without this, the `Pressable` (and the pill inside it) would
  // stretch to the sheet's full width instead of sizing to its own icon + label content.
  pairButtonPressable: {
    alignSelf: 'center',
  },
  glassButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    minHeight: tokens.touchTarget.minHeight,
    borderRadius: tokens.radii.full,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.lg,
    overflow: 'hidden',
    borderWidth: 1,
    // Light rim highlight (reference: a bright edge around the glossy pill) — `surface` (white)
    // is already exempted for non-text border use in `contrastCompleteness.test.ts`.
    borderColor: tokens.color.surface,
    // Colored glow (reference: a soft blue halo around the pill) — iOS only, `shadowColor`
    // has no Android equivalent (colored shadows aren't part of the elevation model there), same
    // platform gap `tokens.elevation`'s own `card`/`sheetEdge` already accept via `Platform.select`.
    // `brand`, not `link` — see `signalRing`'s comment elsewhere in this file: `brand` already has
    // a registered non-text/border role in `contrastCompleteness.test.ts`.
    ...Platform.select({
      ios: {
        shadowColor: tokens.color.brand,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      default: {
        elevation: 6,
      },
    }),
  },
  // Absolutely positioned behind the icon/label, not a parent of them — a `LinearGradient` here
  // rather than a plain colored `View` (design round 4: was a translucent `textInverse` chip
  // matching the header's `IconChip` material; now a diagonal blue gradient matching a glossy
  // gradient-pill reference instead). Still layered as a sibling, not a parent, of the icon/label
  // — nesting visible content inside a translucent/gradient view would fade or wash out the
  // content along with the fill (see `PairDeviceButton`'s own comment on the bug this already
  // caused once).
  glassButtonBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: tokens.radii.full,
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
    borderRadius: tokens.radii.full,
  },
  glassPlus: {
    fontSize: 18,
    lineHeight: 20,
  },
  glassButtonLabel: {
    fontWeight: tokens.typography.fontWeight.bold,
  },
});
