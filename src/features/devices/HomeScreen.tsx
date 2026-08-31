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
  ScrollView,
  StyleSheet,
  Vibration,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import LinearGradient from 'react-native-linear-gradient';
import { GlassEffectView } from 'react-native-glass-effect-view';
import { Badge, Button, CurtainGround, HOME_WASH_LOCATIONS, Sheet, Text, tokens } from '@/shared/ui';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { BluetoothPrimingBody } from '@/features/onboarding/BluetoothPrimingBody';
import { useProfile } from '@/features/profile/useProfile';
import { BleClientProvider, useBleManager, type BleManagerLike } from '@/features/ble/BleClientContext';
import { readBluetoothGateState, requestAndroidBluetoothPermission } from '@/features/ble/bluetoothPermission';
import { useH158ConnectionStore, setH158LockState } from '@/features/ble/h158/useH158ConnectionStore';
import {
  getPairedH158Devices,
  removePairedH158Device,
  type RememberedH158Device,
} from '@/features/ble/h158/h158DeviceStorage';
import {
  connectAndRememberH158Device,
  type ConnectH158DeviceOutcome,
} from '@/features/ble/h158/connectAndRememberH158Device';
import type { RootStackParamList } from '@/app/navigation';

/** The hero's headline, below the greeting — fixed rather than branching on paired-device count.
 * P1-5.0's real multi-device list now exists (below), but "you have N devices" isn't copy this
 * pass's scope covers — that's a design decision for whoever next touches this hero block, not a
 * byproduct of the list existing. */
const HERO_HEADLINE = 'Get your device\nconnected.';

// F6.P (USER_FLOWS.md) — after roughly this long pending, stop implying imminence and offer an
// exit rather than a bare spinner with no timeout (DE-8).
const TAKING_LONGER_MS = 2 * 60 * 1000;

// Native bottom sheets (iOS share sheet, Android modal sheets) dismiss on a short pull, not a
// drag to the edge of the screen — a small distance, or a quick flick even short of that
// distance, both read as "let go of this".
const SHEET_DISMISS_DISTANCE = 60;
const SHEET_DISMISS_VELOCITY = 0.5;

// Swipe-to-lock/unlock on a connected `ConnectedDeviceCard` row (design ask, 2026-08-31) — the
// row itself is the drag surface (`PanResponder`), and the reveal is driven by plain `useState`
// updated directly in `onPanResponderMove`, not an `Animated.Value.setValue()`: `PairingModal`
// above already found (and documents, see its own header comment) that `setValue()` inside a
// responder move never actually painted on the real devices this project was tested on, while a
// React-state-driven style update did. `LayoutAnimation.configureNext` is what supplies the
// spring feel on release/settle, exactly as `PairingModal` also does for its own snap-back.
const SWIPE_ACTION_WIDTH = 96;
const SWIPE_ACTIVATION_RATIO = 0.6;
const SWIPE_ACTIVATION_THRESHOLD = SWIPE_ACTION_WIDTH * SWIPE_ACTIVATION_RATIO;
// A short, single buzz — not a haptics library. None exists in this project yet (`Vibration` is
// core React Native), and one glyph's worth of feedback doesn't justify adding a dependency.
// 30ms, not 10 (reported "no haptic on my Android device", 2026-08-31, on real hardware with the
// `VIBRATE` permission already installed) — many Android motors have enough startup latency that
// a 10ms pulse completes before it ever reaches a felt amplitude. Still short enough to read as a
// single tap, not a buzz.
const SWIPE_HAPTIC_MS = 30;

/** How far down the Devices card's own top edge parks — passed through to `CurtainGround`.
 * Exported so `DeviceScanScreen`'s results card parks at the same height as this one. Nudged up
 * from 0.31 (design ask, 2026-08-31) to give the card a little more height, alongside the hero
 * text size/spacing bumps above — same curved top radius (`CurtainGround`'s own `radii.xl`),
 * only the resting position moved. */
export const DEVICES_CURTAIN_TOP_RATIO = 0.28;

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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "Last connected 2h ago" copy for a disconnected `ConnectedDeviceCard` row (design ask,
 * 2026-08-31) — coarse buckets (minute/hour/day), same as every other relative-time treatment a
 * user actually reads at a glance; nothing finer-grained is worth the extra precision. `elapsed`
 * is clamped to 0 so a `lastConnectedAt` that's (implausibly) in the future — clock skew, a bad
 * device clock — reads as "just now" rather than a negative number. */
function formatLastConnected(lastConnectedAt: number): string {
  const elapsed = Math.max(0, Date.now() - lastConnectedAt);
  if (elapsed < MINUTE_MS) {
    return 'Last connected just now';
  }
  if (elapsed < HOUR_MS) {
    return `Last connected ${Math.floor(elapsed / MINUTE_MS)}m ago`;
  }
  if (elapsed < DAY_MS) {
    return `Last connected ${Math.floor(elapsed / HOUR_MS)}h ago`;
  }
  return `Last connected ${Math.floor(elapsed / DAY_MS)}d ago`;
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

/** Lock-state glyph for a connected `ConnectedDeviceCard` row (swipe-to-lock rev, design ask
 * 2026-08-31) — same padlock body/shackle geometry as `PadlockGlyph` above, but drawn with the
 * shackle open (swung clear of one side) when `locked` is false, so the same component serves
 * both the row's small persistent trailing icon AND the swipe-reveal action's icon (the action
 * always shows the glyph for the state the swipe is ABOUT to reach, i.e. `locked={!currentLock}`
 * at that call site) — one glyph, two sizes/colors, rather than two icons that could drift apart
 * on what "open" is supposed to look like. */
function LockStateGlyph({ size, color, locked }: { size: number; color: string; locked: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="6" y="11" width="12" height="9" rx="2.4" stroke={color} strokeWidth={2} />
      {locked ? (
        <Path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" stroke={color} strokeWidth={2} strokeLinecap="round" />
      ) : (
        <Path d="M8.5 11V8a3.5 3.5 0 0 1 6.6-1.9" stroke={color} strokeWidth={2} strokeLinecap="round" />
      )}
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

/** Small outline battery mark with a bolt glyph inside its body (design ask, 2026-08-31,
 * reference screenshot) — replaces the old proportionally-filled bar: the reference shows a flat
 * charge-status bolt, not a percentage-width fill, so `percent` no longer drives anything visual
 * here (the actual number still renders as its own `Text` at the call site). Hand-drawn inline
 * for the same reason every other glyph in this file is (no icon set exists yet). The bolt's
 * points intentionally poke a little past the outline's own top/bottom edge (`y` from 0.5 to
 * 13.5, against the outline's 1-13) — the same slight overflow a real device's charging-bolt
 * battery icon uses, rather than a bolt shrunk to fit strictly inside the body with dead space
 * around it.
 *
 * `color` is a single glyph-wide color (outline, cap, and bolt together) — a real device battery
 * indicator's own convention: `success` green for plenty of charge, `dangerText` red once
 * `lowBattery` trips, chosen at the call site the same way every other `color`-prop glyph in this
 * file already does (`ProfileGlyph`, `BellGlyph`, ...). Deliberately NOT computed here as a single
 * ternary picking between the two danger/success tokens — the contrast-completeness guard's regex
 * misreads a token name sitting directly before a bare colon that's followed by another token
 * reference as a fake style-key entry when both are written colon-adjacent in one expression (same
 * trap the call site's own comment below documents for its two branches). */
function BatteryGlyph({ color }: { color: string }) {
  return (
    <Svg width={22} height={12} viewBox="0 0 26 14" fill="none">
      <Rect x="1" y="1" width="22" height="12" rx="2.5" stroke={color} strokeWidth={1.5} />
      <Rect x="24" y="4.5" width="2" height="5" rx="1" fill={color} />
      <Path d="M13.7,0.5 L7.2,8.3 L13,8.3 L12.4,13.5 L18.9,5.7 L13,5.7 Z" fill={color} />
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
 * One row in Home's real P1-5.0 multi-device list, replacing what used to be a single branch on
 * `useH158ConnectionStore`'s one connection slot — a compact light-grey row (design reference,
 * matching `ListRow`'s own "list rows as light-grey rounded containers with a leading icon"
 * convention, execution brief §3) rather than the old tall, centred hero card: this reads as one
 * entry in a real list, one per row. Tapping through re-enters `H158Gate` → `H158Pair`, carrying
 * THIS device's id as a nav param, so `H158PairScreen` resumes/reconnects the right one rather
 * than whichever happened to be live — see that screen's own header comment for the two entry
 * shapes this now supports.
 *
 * `connected` is membership in `useH158ConnectionStore`'s connection map, not a field on it —
 * `locked`/`batteryPercent`/`lowBattery` come along only when `connected` is true, since a
 * remembered-but-not-connected device has no live connection object to read them from at all.
 * All three are a confirmed device reply (`readStatus`/`setChildLock`) or nothing, never a guess
 * (CLAUDE.md: "Lock state UI is notification-driven, never optimistic") — `null` renders no
 * Locked/Unlocked/Low-battery badge and no battery reading. The accessibility label mirrors
 * that: the lock/battery clauses are appended only once each value is known.
 *
 * No "Forget device" action on the row itself any more — that now lives on the detail screen
 * this card's own `onPress` opens (`H158PairScreen`'s connected/failed-to-reconnect states),
 * alongside Disconnect/Lock/Unlock rather than duplicated here too.
 *
 * `onToggleLock`/`isOpen`/`onOpenChange` (swipe-to-lock rev, design ask 2026-08-31) are only
 * ever passed for a connected row with a known `locked` value — `HomeScreen` never wires them up
 * for a "Paired devices" row, so `swipeEnabled` below is really just `connected && locked !==
 * null`, `onToggleLock` being defined is implied by the caller. Swipe direction always mirrors
 * `locked`: an unlocked device's row swipes to LOCK, a locked device's row swipes to UNLOCK —
 * there is no "unknown" swipe, matching CLAUDE.md's "Lock state UI is notification-driven, never
 * optimistic" rule: without a confirmed `locked` reading there's no confirmed direction to offer.
 */
function ConnectedDeviceCard({
  device,
  connected,
  locked,
  batteryPercent,
  lowBattery,
  isConnecting,
  onPress,
  onToggleLock,
  isOpen,
  onOpenChange,
}: {
  device: RememberedH158Device;
  connected: boolean;
  locked: boolean | null;
  batteryPercent: number | null;
  lowBattery: boolean | null;
  /** Set only on a `!connected` row, only for the specific device `HomeScreen` last pressed —
   * true for as long as `HomeScreen`'s own `H158HomeConnectAgent` is actually dialing that
   * device (design ask, 2026-08-31; replaces the old fixed 2s timer that stood in front of a
   * separate "Connecting to <device>…" screen). Swaps the "Connect ›" hint below for a small
   * spinner for the real duration of the attempt, not a guessed one. */
  isConnecting?: boolean;
  onPress: () => void;
  /** Sends the device the opposite of its current `locked` reading; resolves `true` only once
   * the device has confirmed the new state (`useH158ConnectionStore`'s own `setH158LockState`
   * has already run by the time this resolves), `false` on any failure/timeout. Never throws. */
  onToggleLock?: (nextLocked: boolean) => Promise<boolean>;
  /** Whether THIS row is the one `HomeScreen` currently considers open — used only to force this
   * row closed when another row opens; a row closing itself (snap-back, or after its own command
   * settles) reports that back via `onOpenChange(false)` rather than waiting on this prop. */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const lockClause = locked === null ? '' : locked ? ', locked' : ', unlocked';
  const batteryClause = batteryPercent === null ? '' : `, battery ${batteryPercent}%`;
  const statusClause = connected ? `connected${lockClause}${batteryClause}` : isConnecting ? 'connecting' : 'disconnected';

  const swipeEnabled = connected && locked !== null && !!onToggleLock;

  // Read inside the `PanResponder` via refs, not closed over directly — same reasoning
  // `PairingModal`'s own `onCloseRef` documents above: rebuilding the responder mid-gesture
  // (e.g. because `locked` flipped, or `onOpenChange`'s identity changed on a parent re-render)
  // would reset its internal gesture tracking, which is exactly what made that swipe look dead.
  const lockedRef = useRef(locked);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);
  const onToggleLockRef = useRef(onToggleLock);
  useEffect(() => {
    onToggleLockRef.current = onToggleLock;
  }, [onToggleLock]);
  const onOpenChangeRef = useRef(onOpenChange);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  // Plain `useState`, not an `Animated.Value` fed by `Animated.event` — that native-driver combo
  // (bound through `PanResponder`, plus `.addListener()`/`.extractOffset()`/`.flattenOffset()` on
  // the same node) was tried here and broke the gesture outright on a real device (the touch fell
  // through to the inner `Pressable`'s own press feedback instead of ever registering as a drag).
  // `PairingModal`'s own header comment above already documents this project finding the
  // JS-state route the one that reliably paints on its tested devices — this stays consistent
  // with that rather than re-introducing the native-driver path a second time.
  const [dragX, setDragXState] = useState(0);
  const dragXRef = useRef(0);
  const setDragX = useCallback((value: number) => {
    dragXRef.current = value;
    setDragXState(value);
  }, []);
  const dragBaseRef = useRef(0);
  const pastThresholdRef = useRef(false);

  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [swipeFailed, setSwipeFailed] = useState(false);

  // Another row opening (`isOpen` turning false here) snaps this one shut — "only one row open
  // at a time". A row's own release/settle already drives `dragX` back to 0 through the
  // responder handlers below, so this only ever fires for a DIFFERENT row than the one the user
  // is actually touching.
  useEffect(() => {
    if (isOpen === false && dragXRef.current !== 0) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
      setDragX(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // A failed lock/unlock gets a brief, subtle inline note rather than a persistent badge — CLAUDE.md's
  // "user-facing errors are coaching, never diagnostic" is written for verification copy, but the
  // same instinct applies here: state what to do, nothing about *why* the BLE write failed.
  useEffect(() => {
    if (!swipeFailed) {
      return;
    }
    const timer = setTimeout(() => setSwipeFailed(false), 3000);
    return () => clearTimeout(timer);
  }, [swipeFailed]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          !pendingRef.current && Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: () => {
          pastThresholdRef.current = false;
          dragBaseRef.current = dragXRef.current;
          onOpenChangeRef.current?.(true);
        },
        onPanResponderMove: (_event, gesture) => {
          const next = Math.min(0, Math.max(-SWIPE_ACTION_WIDTH, dragBaseRef.current + gesture.dx));
          setDragX(next);
          const pastThreshold = next <= -SWIPE_ACTIVATION_THRESHOLD;
          if (pastThreshold && !pastThresholdRef.current) {
            Vibration.vibrate(SWIPE_HAPTIC_MS);
          }
          pastThresholdRef.current = pastThreshold;
        },
        onPanResponderRelease: () => {
          if (!pastThresholdRef.current) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
            setDragX(0);
            onOpenChangeRef.current?.(false);
            return;
          }
          LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
          setDragX(-SWIPE_ACTION_WIDTH);
          pendingRef.current = true;
          setPending(true);
          setSwipeFailed(false);
          const nextLocked = !lockedRef.current;
          void (onToggleLockRef.current?.(nextLocked) ?? Promise.resolve(false)).then((success) => {
            pendingRef.current = false;
            setPending(false);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
            setDragX(0);
            onOpenChangeRef.current?.(false);
            if (!success) {
              setSwipeFailed(true);
            }
          });
        },
        onPanResponderTerminate: () => {
          if (pendingRef.current) {
            return;
          }
          LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
          setDragX(0);
          onOpenChangeRef.current?.(false);
        },
      }),
    [setDragX],
  );

  const row = (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${device.name ?? 'BlueSmoke device'}, ${statusClause}. ${
        connected ? 'Open device.' : isConnecting ? 'Connecting.' : 'Reconnect.'
      }`}
      // Real native ripple on Android (`android_ripple`), not the `iconPressed` opacity fade —
      // reported as "a glitch" (2026-08-31): fading the WHOLE row's opacity double-dims every
      // overlapping opaque shape stacked inside it independently (`connectedDot`'s white ring over
      // `DeviceLockGlyph`'s own white backing, in particular), rather than reading as one flat dim.
      // `deviceRowPressOverlay` below is the iOS equivalent (`Pressable` has no ripple there) — a
      // single translucent veil drawn OVER the finished row, rather than dimming the row's own
      // layers, so nothing underneath it can show through unevenly.
      android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
      // Delays `onPressIn` (and therefore `pressed` below) just long enough for the sibling
      // `PanResponder` to claim a real swipe first — reported as "I get the tap effect when I
      // swipe" (2026-08-31): without this, `Pressable` shows its press feedback the instant a
      // finger goes down, and only cancels it once the drag crosses the `PanResponder`'s own >6px
      // threshold a beat later, so every swipe start flashed the tap effect first. Only on
      // swipeable rows — a disconnected row has no competing `PanResponder`, so its own tap
      // should still feel instant.
      unstable_pressDelay={swipeEnabled ? 100 : 0}
      style={styles.deviceRow}
    >
      {({ pressed }) => (
        <>
          <View style={styles.deviceIconWrapper}>
        <DeviceLockGlyph size={36} color={tokens.color.link} backgroundColor={tokens.color.surface} />
        {/* Green online dot on the device mockup itself (design ask, 2026-08-31, reference
            screenshot) — replaces the old text "Connected" badge below rather than sitting
            alongside it: the two were the same claim made twice. */}
        {connected && <View style={styles.connectedDot} />}
      </View>
      <View style={styles.deviceRowInfo}>
        <Text variant="label" style={styles.deviceRowName} numberOfLines={1}>
          {device.name ?? 'BlueSmoke device'}
        </Text>
        {/* Battery, directly under the device name (layout rev, 2026-08-31) — was its own
            standalone column at the row's trailing edge; that slot now belongs to the lock-state
            icon/swipe hint (`deviceRowLockColumn` below), so battery moved in here instead,
            reading as a second line under the name rather than a separate column. */}
        {connected && batteryPercent !== null && (
          <View style={styles.deviceRowBattery}>
            {/* Two isolated JSX branches, not a single ternary picking between two token
                references — the contrast-completeness guard's regex misreads a token name sitting
                directly before a bare colon that's followed by another token reference as a fake
                style-key entry, when the two are written colon-adjacent in one expression.
                `success` green for a healthy charge (design ask, 2026-08-31 — a real battery
                indicator's own convention), replacing the old neutral `textSecondary` grey; the
                `dangerText` red branch for `lowBattery` is unchanged. */}
            {lowBattery ? (
              <BatteryGlyph color={tokens.color.dangerText} />
            ) : (
              <BatteryGlyph color={tokens.color.success} />
            )}
            <Text variant="caption" tone="secondary">
              {batteryPercent}%
            </Text>
          </View>
        )}
        {/* No "Disconnected" badge any more (design ask, 2026-08-31) — the "Last connected X
            ago" line below already says that, so the badge was a second, more clinical-sounding
            claim about the same fact. The badges row itself only renders at all when there's
            something to put in it. No Locked/Unlocked badge here any more either (swipe-to-lock
            rev) — that state now lives solely in the trailing `LockStateGlyph` below, never as
            text, so the two never say the same thing twice. */}
        {connected && lowBattery && (
          <View style={styles.deviceRowBadges}>
            <Badge label="Low battery" tone="danger" />
          </View>
        )}
        {/* "Last connected 2h ago" (design ask, 2026-08-31, reference screenshot) — only for a
            disconnected row: a live connection already says "Connected" above, and restating
            "last connected" alongside that would just be a second, redundant claim about the
            same fact. `device.lastConnectedAt` always exists once a device is remembered at all
            (`addPairedH158Device` stamps it on every successful connect), so this is unconditional
            on the disconnected branch rather than another `!== null` guard. */}
        {!connected && (
          <Text variant="caption" tone="secondary">
            {formatLastConnected(device.lastConnectedAt)}
          </Text>
        )}
      </View>
      {/* Trailing lock column (swipe-to-lock rev, layout rev 2026-08-31) — the small persistent
          lock-state icon stacked directly above its own swipe hint/error text, so both read as one
          unit describing the same gesture rather than the hint being a caption under the device
          name with no visual tie to the icon it's actually about. States ONLY the lock state,
          never battery or connection, per this file's own "keep these concepts separate"
          convention (see this component's header comment). `success` green for locked (reusing
          the same green the connected dot and battery-glyph "healthy charge" state already use,
          rather than a new token) — `textSecondary` for unlocked, since an unlocked device isn't
          itself an alarming state, just the default one. */}
      {connected && locked !== null && (
        <View style={styles.deviceRowLockColumn}>
          {locked ? (
            <LockStateGlyph size={20} color={tokens.color.success} locked />
          ) : (
            <LockStateGlyph size={20} color={tokens.color.textSecondary} locked={false} />
          )}
          {/* Swipe discoverability hint — only while the row is at rest (not mid-drag, not
              awaiting a reply, nothing to report yet). `numberOfLines={1}` keeps it a single row
              under the icon rather than wrapping if the row ever runs short on space. */}
          {swipeEnabled && dragX === 0 && !pending && !swipeFailed && (
            <Text
              variant="caption"
              tone="secondary"
              numberOfLines={1}
              style={styles.deviceRowLockColumnText}
            >
              {locked ? 'Swipe to unlock' : 'Swipe to lock'}
            </Text>
          )}
          {swipeFailed && (
            <Text
              variant="caption"
              tone="danger"
              numberOfLines={1}
              style={styles.deviceRowLockColumnText}
            >
              {`Couldn't ${locked ? 'unlock' : 'lock'}`}
            </Text>
          )}
        </View>
      )}
      {/* "Connect  ›" trailing affordance for a disconnected row (design ask, 2026-08-31,
          reference screenshot) — makes explicit what tapping the row already did (re-enters
          `H158Gate`/`H158Pair` to reconnect), rather than leaving that discoverable only via the
          row's own `accessibilityLabel`. Plain `Text`, not a nested `Pressable`: the whole row is
          already the one tap target (`onPress` above) — a second pressable stacked on top of it
          would either double-fire or need its own `onPress` doing the exact same thing, and
          nested touchables are exactly what `deviceRow`'s single `Pressable` was written to
          avoid. The chevron is a bare glyph character, same "hand-authored, no icon set" as every
          other glyph in this file (`BackChevron` in `DeviceScanScreen.tsx` does the same for `‹`). */}
      {!connected && (
        <View style={styles.deviceRowConnectHint}>
          {isConnecting ? (
            // Swaps the whole "Connect  ›" hint for a small spinner — same reasoning
            // `H158PairScreen.tsx`'s Disconnect chip spinner documents: an abrupt wait with
            // nothing shown reads as broken, not fast. The row stays tappable-looking
            // otherwise, so this is the only signal the tap actually registered.
            <ActivityIndicator size="small" color={tokens.color.link} />
          ) : (
            <>
              <Text variant="label" tone="link">
                Connect
              </Text>
              <Text variant="label" tone="link" style={styles.deviceRowChevron}>
                {'›'}
              </Text>
            </>
          )}
        </View>
      )}
          {/* iOS has no `android_ripple` equivalent — a translucent veil drawn ON TOP of the
              finished row, not an opacity fade of the row itself (see this `Pressable`'s own
              `android_ripple` comment for why that fade was the bug). `pointerEvents="none"` so it
              never steals the touch that's already down. */}
          {pressed && Platform.OS !== 'android' && (
            <View pointerEvents="none" style={styles.deviceRowPressOverlay} />
          )}
        </>
      )}
    </Pressable>
  );

  if (!swipeEnabled) {
    return row;
  }

  // Full-row swipe (swipe-to-lock rev) — `row` above is entirely unchanged, just relocated onto
  // an `Animated.View` that slides left over a static reveal layer underneath it, the classic
  // "swipe action" composition. The reveal layer reuses this app's own existing danger/success
  // TINTS (`dangerBackground`/`successBg` + `dangerText`/`success`), the same light-fill-plus-
  // dark-content pairing `Button`'s `destructive` variant and `Badge`'s `success` tone already
  // use elsewhere, rather than a new saturated solid-color fill this design system has never
  // used — that keeps the reveal looking like it belongs to this app instead of a borrowed
  // pattern, and needs no new `contrastPairs` entry in `tokens.ts` (`dangerText on
  // dangerBackground` and `success on successBg` are both already registered).
  return (
    <View style={[styles.swipeRowWrapper, locked ? styles.swipeActionUnlock : styles.swipeActionLock]}>
      <View style={styles.swipeAction}>
        {pending ? (
          locked ? (
            <ActivityIndicator size="small" color={tokens.color.success} />
          ) : (
            <ActivityIndicator size="small" color={tokens.color.dangerText} />
          )
        ) : (
          <>
            {locked ? (
              <LockStateGlyph size={20} color={tokens.color.success} locked={false} />
            ) : (
              <LockStateGlyph size={20} color={tokens.color.dangerText} locked />
            )}
            {/* `Text`'s own `Tone` union has no `'success'` member (only `Badge`/raw style
                consumers reach for that token) — rather than extend a shared component's API for
                one label here, `tone="danger"` covers the red case directly and the green case
                overrides `primary`'s color inline via `swipeActionUnlockLabel`. */}
            <Text
              variant="label"
              tone={locked ? 'primary' : 'danger'}
              style={locked ? styles.swipeActionUnlockLabel : undefined}
            >
              {locked ? 'Unlock' : 'Lock'}
            </Text>
          </>
        )}
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.swipeFront, { transform: [{ translateX: dragX }] }]}
      >
        {row}
      </Animated.View>
    </View>
  );
}

/**
 * The compact placeholder row shared by both list sections' empty states (design ask,
 * 2026-08-31; extended to "Paired devices" too, same day) — a single row, not `DevicesEmptyState`'s
 * full illustration+headline+body treatment: that one is reserved for the fully-empty "never
 * paired anything" state (see its own header comment), while this is a much smaller, quieter
 * placeholder that sits where a list still has a heading and a count above it, just nothing under
 * it. Device visual on the left (`DeviceLockGlyph`, same glyph/size/colors `ConnectedDeviceCard`
 * uses for its own leading icon, so this reads as the same "device" language rather than a new
 * one) and a dashed-border box on the right carrying the copy — matching `emptyStateCard`'s dashed
 * treatment, but no CTA inside it: whichever section is empty, the action lives in the OTHER
 * section's rows (connect from "Paired devices", or nothing to do at all once everything's
 * connected), never duplicated as a button in here.
 */
function DashedDeviceRow({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.dashedDeviceRow}>
      <View style={styles.dashedDeviceVisual}>
        <DeviceLockGlyph size={36} color={tokens.color.link} backgroundColor={tokens.color.surface} />
      </View>
      <View style={styles.dashedDeviceBox}>
        <Text variant="label" style={styles.dashedDeviceTitle}>
          {title}
        </Text>
        <Text variant="caption" tone="secondary" style={styles.dashedDeviceBody}>
          {body}
        </Text>
      </View>
    </View>
  );
}

function NoConnectedDevicesRow() {
  return <DashedDeviceRow title="No devices connected" body="Connect a paired device to get started." />;
}

/** Shown when every paired device is already connected, so "Paired devices" (the disconnected
 * list) has nothing left to show — not the same as having no paired devices at all, which is
 * `DevicesEmptyState`'s case instead. */
function NoPairedDevicesRow() {
  return <DashedDeviceRow title="All devices connected" body="Every paired device is already connected." />;
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

/**
 * "Pair a device" — a compact, content-width pill (not full-bleed — sized to its icon + label,
 * centred via `pairButtonPressable`'s `alignSelf: 'center'`, since both places this renders
 * (`pairSection`'s pinned footer, `emptyStateCard`'s attached CTA) sit inside an ancestor with
 * default `alignItems: 'stretch'`, which would otherwise stretch the whole `Pressable` to the
 * sheet's width).
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
 * `animationType="slide"`) to rest with its top edge just below Home's "Connected devices" label
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
 * Dials a disconnected row's device directly from Home (design ask, 2026-08-31, replacing the
 * old flow where pressing a row navigated to `H158Gate`/`H158Pair` and only THAT screen showed
 * "Connecting to <device>…") — `HomeScreen` now owns the whole connecting/failed lifecycle
 * itself, driving the row's own spinner (`ConnectedDeviceCard`'s `isConnecting`) and, on
 * failure, a dialog (`connectError` below) rather than a full-screen detour either way. Once
 * connected, `HomeScreen` still navigates to `H158Pair` for the lock/battery/disconnect
 * controls — that screen's own `phase` initializer resumes straight into `connected` at that
 * point (the device is already live in `useH158ConnectionStore`), so it never has anything of
 * its own left to show for the connect itself.
 *
 * A standalone child component, not inlined in `HomeScreen`, because `useBleManager()` resolves
 * to whatever `BleClientProvider` is nearest ABOVE it in the tree — `HomeScreen` itself needs to
 * stay on the ambient (dev-mock-in-`__DEV__`) manager for its own Bluetooth-gate check
 * (`bluetoothReady` below), so only this subtree gets wrapped in its own bare `<BleClientProvider>`
 * to shadow that with the real hardware manager, identical reasoning to `H158PairScreen.tsx`'s
 * own header comment. `HomeScreen` also only ever mounts this WHILE an attempt is in flight
 * (never unconditionally) — see that call site's own comment for why. Renders nothing —
 * `deviceId`/`onSettled` are its whole API.
 */
function H158HomeConnectAgent({
  deviceId,
  name,
  onSettled,
}: {
  deviceId: string;
  name: string | null;
  onSettled: (deviceId: string, outcome: ConnectH158DeviceOutcome) => void;
}) {
  const manager = useBleManager();
  useEffect(() => {
    let cancelled = false;
    // 🔴 2026-08-31 fix — this path (a direct row-tap reconnect, see this component's own header
    // comment) used to skip straight to `connectAndRememberH158Device`, unlike the `H158Gate`
    // chain every other entry point goes through (`BluetoothGateScreen`'s "Try again" calls this
    // same function). On Android 12+, `BLUETOOTH_CONNECT` is a runtime-requestable permission —
    // a manifest declaration alone grants nothing (`AndroidManifest.xml`'s own comment) — so a
    // reconnect that never asks never shows the OS dialog, and a device with the permission still
    // ungranted just fails to connect with no visible prompt at all. Requesting it here, right
    // before the dial, is what actually shows the system permission sheet; iOS has no such
    // preflight (`requestAndroidBluetoothPermission`'s own doc comment), so this is a no-op there.
    const dial = async () => {
      if (Platform.OS === 'android') {
        const permission = await requestAndroidBluetoothPermission();
        if (permission !== 'granted') {
          if (!cancelled) {
            onSettled(deviceId, {
              ok: false,
              detail:
                permission === 'permanentlyDenied'
                  ? "Couldn't connect — Bluetooth permission is off. Turn it on for this app in Settings."
                  : "Couldn't connect — Bluetooth permission is needed to reach your device.",
            });
          }
          return;
        }
      }
      const outcome = await connectAndRememberH158Device(manager, deviceId, name);
      if (!cancelled) {
        onSettled(deviceId, outcome);
      }
    };
    void dial();
    return () => {
      cancelled = true;
    };
    // `name`/`onSettled` intentionally excluded: this effect should fire exactly once per
    // `deviceId` change (a fresh connect attempt), not re-dial because `onSettled`'s identity
    // moved on a `HomeScreen` re-render mid-attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, manager]);
  return null;
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
 * with its top edge just below the "Connected devices" label below — `devicesLabelRef` measures that
 * label's live on-screen position (`measureInWindow`, not `onLayout`'s parent-relative numbers)
 * so the sheet lines up under it on any device size. "Continue" inside it still moves on to the
 * real permission-check screen (`BluetoothGate`); "Not now"/the backdrop just closes it, since
 * there was never anywhere to navigate back from.
 *
 * Sign-out moved to the Profile screen in P1-8.0, which is where the TODO puts it and which is
 * reachable from this screen's profile icon. It is still the only way back out of the gated
 * stack.
 */
export interface HomeScreenProps {
  /**
   * Test-only override for `H158HomeConnectAgent`'s own `<BleClientProvider>` shadow below.
   * Production code never passes this — `navigation.tsx` registers `component={HomeScreen}`
   * with no props — so the real app always gets the shadowing behaviour that agent's header
   * comment describes. Exists so a test can inject a fake `BleManagerLike` instead of the real,
   * native-backed `BleManager` (`new BleManager()` throws under Jest — no native module), same
   * escape hatch `H158PairScreenProps.testManager` already is.
   */
  testManager?: BleManagerLike;
}

export function HomeScreen({ testManager }: HomeScreenProps = {}) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [pairingOpen, setPairingOpen] = useState(false);
  const [sheetTop, setSheetTop] = useState(0);
  const devicesLabelRef = useRef<View>(null);
  const { profile } = useProfile();
  const connections = useH158ConnectionStore((state) => state.connections);

  // The one in-flight reconnect attempt, if any (design ask, 2026-08-31 — replaces the old fixed
  // 2s spinner-then-navigate: the spinner on the pressed row now tracks the REAL connect
  // `H158HomeConnectAgent` below is running, not a fake timer standing in front of a separate
  // screen's own "Connecting to <device>…" text). `name` rides along purely so a failure can
  // name the device in `connectError`'s dialog without a second lookup.
  const [pendingConnect, setPendingConnect] = useState<{ deviceId: string; name: string | null } | null>(
    null,
  );
  // "Couldn't connect" as a dialog (design ask, 2026-08-31) — replaces `H158PairScreen.tsx`'s old
  // full-screen `failed` phase for this path (that phase still exists there for the rare race
  // where a row was connected at press-time but dropped before that screen mounted; this dialog
  // is the common case, a reconnect that never got that far at all).
  const [connectError, setConnectError] = useState<{ deviceId: string; name: string | null; detail: string } | null>(
    null,
  );
  // Pending "Forget device?" confirmation, reached from the "Couldn't connect" dialog's own
  // "Forget device" action — the gap this closes: a device that's gone permanently unreachable
  // (broken, given away, factory reset) can never reach the `connected` phase's own Forget button
  // on `H158PairScreen` again, since it never gets there. `null` means the sheet is closed. Set
  // from `connectError`, not read from it directly, so the two sheets never both try to be open
  // at once (see the "Forget device" button's own `onPress` further down).
  const [forgetConfirm, setForgetConfirm] = useState<{ deviceId: string; name: string | null } | null>(null);
  // The connect never succeeded, so `useH158ConnectionStore` has nothing for this device to tear
  // down first (unlike `H158PairScreen.tsx`'s own general-purpose `forgetDevice`, which also
  // disconnects a live session) — this is only ever reached from `forgetConfirm`, which only ever
  // opens from a FAILED connect attempt, so there is never a session here to dispose.
  const forgetFailedDevice = useCallback(async (deviceId: string) => {
    await removePairedH158Device(deviceId);
    setPairedDevices((current) => current.filter((device) => device.id !== deviceId));
  }, []);
  // Guards `handleConnectSettled` below against acting on a connect that finishes after the user
  // has already left Home (a real BLE dial can't be cancelled mid-flight the way the old fixed
  // timer could — see `H158HomeConnectAgent`'s own header comment) — the store update still
  // happens either way (so Home shows it connected next time it's focused), only the
  // navigate-away/dialog side effects are skipped for a settle that lands off-screen.
  const homeFocusedRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      homeFocusedRef.current = true;
      return () => {
        homeFocusedRef.current = false;
      };
    }, []),
  );
  const handleConnectPress = useCallback((deviceId: string, name: string | null) => {
    setConnectError(null);
    setPendingConnect({ deviceId, name });
  }, []);

  // Which connected row's swipe is currently open — "only one row open at a time" (design ask,
  // 2026-08-31). Lives here rather than inside each `ConnectedDeviceCard` because enforcing that
  // rule needs one row to be able to close a DIFFERENT row, which no row can do to a sibling on
  // its own.
  const [openDeviceId, setOpenDeviceId] = useState<string | null>(null);

  // The whole swipe-to-lock action (swipe-to-lock rev, design ask 2026-08-31) — reads the live
  // session straight from the store rather than threading it through `deviceRows`/props, the same
  // way `H158PairScreen`'s own `setLock` does. Resolves `true` only once the device has actually
  // confirmed the new state; `setH158LockState` runs first so a caller awaiting this promise never
  // observes a resolved `true` before the store (and therefore this row's `locked` prop) has
  // already updated — CLAUDE.md: "Lock state UI is notification-driven, never optimistic."
  const toggleDeviceLock = useCallback(async (deviceId: string, nextLocked: boolean): Promise<boolean> => {
    const connection = useH158ConnectionStore.getState().connections[deviceId];
    if (!connection) {
      return false;
    }
    const outcome = await connection.session.setChildLock(nextLocked);
    if (!outcome.ok) {
      return false;
    }
    setH158LockState(deviceId, outcome.value.locked);
    return outcome.value.locked === nextLocked;
  }, []);

  // The REMEMBERED half of the list — survives a disconnect (`useH158ConnectionStore`'s own
  // `connections` map does not), so a device that's merely out of range still renders as a row
  // here instead of vanishing from the list. Reloaded on every focus, not just mount, so
  // returning from `H158Pair` after a fresh pair (or after "Forget device" there) picks up the
  // change immediately.
  const [pairedDevices, setPairedDevices] = useState<RememberedH158Device[]>([]);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getPairedH158Devices().then((devices) => {
        if (!cancelled) {
          setPairedDevices(devices);
        }
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Every row Home shows, merging the remembered list above with the live connection map — a
  // device connected but somehow not (yet) in the remembered list (e.g. `addPairedH158Device`
  // hasn't resolved yet after a just-completed connect) still gets a row rather than silently
  // going missing until storage catches up.
  const deviceRows = useMemo(() => {
    const remembered = pairedDevices.map((device) => ({
      device,
      connection: connections[device.id] ?? null,
    }));
    const rememberedIds = new Set(pairedDevices.map((device) => device.id));
    const liveOnly = Object.values(connections)
      .filter((connection) => !rememberedIds.has(connection.device.id))
      // `lastConnectedAt: Date.now()` is exact, not a placeholder — a live-only entry is by
      // definition a device that's connected right now but hasn't round-tripped through
      // `addPairedH158Device`'s AsyncStorage write yet, so "now" is the correct timestamp, not a
      // guess. It's also never actually displayed: `ConnectedDeviceCard` only reads
      // `lastConnectedAt` on its `!connected` branch, and every live-only row renders `connected`.
      .map((connection) => ({
        device: { ...connection.device, lastConnectedAt: Date.now() },
        connection,
      }));
    return [...remembered, ...liveOnly];
  }, [pairedDevices, connections]);

  // Split into the two sections the design calls for — connected devices surfaced above
  // disconnected ones, rather than one flat list ordered by whenever each was remembered.
  // `connection !== null` is the same membership test `ConnectedDeviceCard`'s own `connected`
  // prop already uses, so a row lands in exactly the section its badge agrees with.
  const connectedRows = deviceRows.filter((row) => row.connection !== null);
  const disconnectedRows = deviceRows.filter((row) => row.connection === null);

  // What `H158HomeConnectAgent` (rendered below) reports back once a connect attempt settles —
  // success navigates straight to the device's own controls (`H158Pair` resumes instantly, the
  // device already being live in the store by then); failure opens `connectError`'s dialog
  // instead. Declared after `pairedDevices` above since a failure looks the device's name back
  // up from it for the dialog's copy — `pendingConnect.name` isn't reused here because a
  // long-running attempt could in principle outlive whatever `pairedDevices` snapshot was
  // current when the press happened.
  const handleConnectSettled = useCallback(
    (deviceId: string, outcome: ConnectH158DeviceOutcome) => {
      setPendingConnect((current) => (current?.deviceId === deviceId ? null : current));
      if (!homeFocusedRef.current) {
        return;
      }
      if (outcome.ok) {
        navigation.navigate('H158Pair', { deviceId });
        return;
      }
      const name = pairedDevices.find((device) => device.id === deviceId)?.name ?? null;
      setConnectError({ deviceId, name, detail: outcome.detail });
    },
    [navigation, pairedDevices],
  );

  // Used by the Bluetooth gate check further down (deciding whether the ON-4 priming sheet still
  // teaches anything). "Forget device" itself now lives entirely on `H158PairScreen` — see
  // `ConnectedDeviceCard`'s own header comment — so this hook has no other consumer here.
  const bleManager = useBleManager();

  // ON-4's priming sheet (`PairingModal` below) exists to explain Bluetooth BEFORE the OS
  // permission dialog the gate triggers — F7.2. Once `readBluetoothGateState` already reports
  // `poweredOn`, there is no dialog left to pre-empt, so the sheet is pure friction — pairing a
  // SECOND or THIRD device (P1-5.0's whole point) would otherwise re-show it every single time.
  // Every other gate state (permission never asked, denied, blocked, adapter off, unsupported,
  // still-unknown) still gets the sheet exactly as before.
  //
  // Read on focus AND on foreground, the same re-check rule `BluetoothGateScreen` follows
  // (USER_FLOWS.md F1: "permission state is re-checked on every app foreground"), rather than
  // awaited inside the press handler — a press must not sit on an unbounded BLE read. That
  // leaves a window where the flag is stale if Bluetooth is toggled without Home losing focus
  // or the app backgrounding; both stale outcomes are safe. Stale `true` skips the sheet and
  // lands on `BluetoothGateScreen`'s own ON-9 "Bluetooth is off" screen, which is the honest
  // destination anyway; stale `false` shows the sheet, which is just the old behaviour.
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
        titleTopSpacing={tokens.spacing.xl}
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
            <BellButton />
          </View>
        }
      >
        {/* Everything from the "Connected devices" heading down through "Paired devices" lives
            inside ONE ScrollView now (design ask, 2026-08-31: no per-section fixed/capped height,
            and every scenario — 0 of either, a few of each, or 5+ connected/10+ paired — has to
            work without the "Pair a device" button ever scrolling out of reach). Neither section
            gets its own scroll box; they just stack at their natural height and the shared region
            scrolls as one continuous list once combined content outgrows the visible card, exactly
            like it wouldn't need to at all when both sections are short. `PairDeviceButton` below
            stays a sibling OUTSIDE this ScrollView, still pinned to the curtain's bottom via
            `pairSection` + this ScrollView's own `flexGrow: 1` consuming the leftover space above
            it — same mechanism `emptyCardWrapper` always used, just now on a scrollable container
            instead of a plain `View`. */}
        <ScrollView
          style={styles.deviceScroll}
          contentContainerStyle={deviceRows.length > 0 ? styles.deviceScrollContent : styles.emptyScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Always shown, and always the sheet-anchor ref/measurement — "Connected devices" used
              to hide itself when there were zero live connections but some remembered devices,
              leaving "Paired devices" to pick up both the heading duty and the anchor ref. It now
              covers that third state too (the compact `NoConnectedDevicesRow` below), so every
              state has something to show under this heading and the anchor no longer needs to move
              between two different headings depending on which is topmost. */}
          <View ref={devicesLabelRef} onLayout={measureDevicesLabel} style={styles.sectionHeadingRow}>
            <Text variant="label" tone="secondary" style={styles.sectionLabel}>
              Connected devices
            </Text>
            {/* The real live count in every non-empty state, not just the "0 connected" placeholder
                case — the fully-empty state (no paired devices at all) has no count worth stating.
                Sits on the same row as the heading, right-aligned via `sectionHeadingRow`'s
                `justify-content: space-between`. */}
            {deviceRows.length > 0 && (
              <Text variant="caption" tone="secondary" style={styles.sectionCountCaption}>
                {`${connectedRows.length} connected`}
              </Text>
            )}
          </View>
          {/* Non-empty, the list sits top-aligned and BOTH sections always render once there's at
              least one paired device (`deviceRows.length > 0`) — "Connected devices" and "Paired
              devices" each show their real rows, or `DashedDeviceRow` in that section's own
              empty-state flavor when the OTHER bucket has claimed every device: `NoConnectedDevicesRow`
              when nothing is connected, `NoPairedDevicesRow` when everything already is. Each
              heading carries its own live count on the right (`sectionHeadingRow`), so the two
              sections read as equal-weight groups rather than one primary and one secondary. Fully
              empty, `DevicesEmptyState` and its "Pair a device" pill render together as one block
              (design review round 3 — every reference this redesign is built from composes the
              illustration, copy, and CTA tightly, not as two disconnected pieces) inside
              `emptyStateCenterWrapper`, which centres them in the space below the heading — the
              same centring `emptyCardWrapper` used to do directly, now one layer in since the
              heading is a preceding sibling inside this same scroll content rather than a sibling
              above the whole wrapper. */}
          {deviceRows.length > 0 ? (
            <>
              {connectedRows.length > 0 ? (
                <View style={styles.deviceSectionList}>
                  {connectedRows.map(({ device, connection }) => (
                    <ConnectedDeviceCard
                      key={device.id}
                      device={device}
                      connected
                      locked={connection?.locked ?? null}
                      batteryPercent={connection?.batteryPercent ?? null}
                      lowBattery={connection?.lowBattery ?? null}
                      onPress={() => navigation.navigate('H158Gate', { deviceId: device.id })}
                      onToggleLock={(nextLocked) => toggleDeviceLock(device.id, nextLocked)}
                      isOpen={openDeviceId === device.id}
                      onOpenChange={(open) => setOpenDeviceId(open ? device.id : null)}
                    />
                  ))}
                </View>
              ) : (
                <NoConnectedDevicesRow />
              )}
              <View style={styles.deviceSection}>
                <View style={styles.sectionHeadingRow}>
                  <Text variant="label" tone="secondary" style={styles.sectionLabel}>
                    Paired devices
                  </Text>
                  <Text variant="caption" tone="secondary" style={styles.sectionCountCaption}>
                    {`${disconnectedRows.length} paired`}
                  </Text>
                </View>
                {disconnectedRows.length > 0 ? (
                  <View style={styles.deviceSectionList}>
                    {disconnectedRows.map(({ device }) => (
                      <ConnectedDeviceCard
                        key={device.id}
                        device={device}
                        connected={false}
                        locked={null}
                        batteryPercent={null}
                        lowBattery={null}
                        isConnecting={pendingConnect?.deviceId === device.id}
                        onPress={() => handleConnectPress(device.id, device.name ?? null)}
                      />
                    ))}
                  </View>
                ) : (
                  <NoPairedDevicesRow />
                )}
              </View>
            </>
          ) : (
            <View style={styles.emptyStateCenterWrapper}>
              <View style={styles.emptyStateCard}>
                <DevicesEmptyState />
                <PairDeviceButton onPress={startPairing} style={styles.emptyStatePairButton} />
              </View>
            </View>
          )}
        </ScrollView>
        {deviceRows.length > 0 && (
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
      {/* Mounted only while an attempt is actually in flight — not unconditionally — so a plain
          render of Home never constructs the real, native-backed `BleManager` (`useBleManager()`
          inside `H158HomeConnectAgent`, shadowed to the real manager by the `BleClientProvider`
          below, always constructs one the instant it's called if `testManager` is unset), the
          same "lazily, on first real use" rule `BleClientContext.tsx`'s own header comment sets
          for that constructor. Renders nothing itself otherwise — see the agent's own header
          comment for why the real connect has to happen inside a nested `BleClientProvider`
          rather than up here in `HomeScreen`'s own body. */}
      {pendingConnect && (
        <BleClientProvider manager={testManager}>
          <H158HomeConnectAgent
            deviceId={pendingConnect.deviceId}
            name={pendingConnect.name}
            onSettled={handleConnectSettled}
          />
        </BleClientProvider>
      )}
      {/* "Couldn't connect" dialog (design ask, 2026-08-31) — same `Sheet`-as-centered-dialog
          pattern `ProfileScreen.tsx`'s "Log out?" confirm and `H158PairScreen.tsx`'s own "Forget
          device?" confirm both use, rather than a native `Alert` this app has never reached for. */}
      <Sheet visible={connectError !== null} onClose={() => setConnectError(null)} position="center">
        <Text variant="title" style={styles.sheetHeading}>
          Couldn&apos;t connect
        </Text>
        <Text variant="body" tone="secondary" style={styles.sheetBody}>
          {connectError?.detail}
        </Text>
        <View style={styles.sheetActions}>
          <View style={styles.sheetActionButton}>
            <Button
              label="Try again"
              onPress={() => {
                const target = connectError;
                setConnectError(null);
                if (target) {
                  handleConnectPress(target.deviceId, target.name);
                }
              }}
            />
          </View>
          <View style={styles.sheetActionButton}>
            <Button label="Cancel" variant="secondary" onPress={() => setConnectError(null)} />
          </View>
        </View>
        {/* Escape hatch for a device that's gone permanently unreachable (`forgetConfirm` above)
            — a bare text-weight destructive link, not a third full `Button`, so "Try again" stays
            the visually primary action for the common case (a transient miss, worth retrying)
            rather than three equally-weighted buttons burying it. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Forget device"
          style={styles.connectErrorForgetLink}
          onPress={() => {
            const target = connectError;
            setConnectError(null);
            if (target) {
              setForgetConfirm({ deviceId: target.deviceId, name: target.name });
            }
          }}
        >
          <Text variant="label" tone="danger">
            Forget device
          </Text>
        </Pressable>
      </Sheet>
      {/* Same `Sheet`-as-centered-dialog pattern `H158PairScreen.tsx`'s own "Forget device?"
          confirm uses. A separate `Sheet` instance from `connectError` above rather than one
          reused for both — the two never need to be open together (`connectError`'s own "Forget
          device" link above closes it before opening this one), but sharing a single sheet
          between two unrelated bodies would have coupled their visible/hidden states for no
          reason. */}
      <Sheet visible={forgetConfirm !== null} onClose={() => setForgetConfirm(null)} position="center">
        <Text variant="title" style={styles.sheetHeading}>
          Forget device?
        </Text>
        <Text variant="body" tone="secondary" style={styles.sheetBody}>
          {forgetConfirm?.name ?? 'This device'} will be removed from your device list. You&apos;ll
          need to pair it again to reconnect.
        </Text>
        <View style={styles.sheetActions}>
          <View style={styles.sheetActionButton}>
            <Button
              label="Forget device"
              // Distinct from the trigger's own "Forget device" accessible name, same reasoning
              // `H158PairScreen.tsx`'s own confirm sheet documents.
              accessibilityLabel="Confirm forget device"
              variant="destructive"
              onPress={() => {
                const target = forgetConfirm;
                setForgetConfirm(null);
                if (target) {
                  void forgetFailedDevice(target.deviceId);
                }
              }}
            />
          </View>
          <View style={styles.sheetActionButton}>
            <Button label="Cancel" variant="secondary" onPress={() => setForgetConfirm(null)} />
          </View>
        </View>
      </Sheet>
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
  // Same values `ProfileScreen.tsx`/`H158PairScreen.tsx` use for their own `Sheet` confirms —
  // kept identical rather than re-derived, so every confirm/error dialog in the app shares one
  // spacing rhythm.
  sheetHeading: {
    marginBottom: tokens.spacing.sm,
  },
  sheetBody: {
    marginBottom: tokens.spacing.lg,
  },
  sheetActions: {
    flexDirection: 'row',
    marginTop: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  sheetActionButton: {
    flex: 1,
  },
  connectErrorForgetLink: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.touchTarget.minHeight,
    marginTop: tokens.spacing.sm,
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
  // per-render from the measured "Connected devices" label position, not a fixed value here. No elevation
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
  // `pairingSheet`'s height runs from `top` (measured off the "Connected devices" label, so it varies by
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
    // Negative — pulls the list up under the title, per design ask 2026-08-31. Shared by both
    // "Connected devices" and "Paired devices" headings, so both sections' title-to-list gap
    // stay in lockstep by construction.
    marginBottom: -tokens.spacing.sm,
  },
  // Lays a section's `sectionLabel` heading and its live count on one row (both "Connected
  // devices"/"N connected" and "Paired devices"/"N paired" use this), count right-aligned via
  // `space-between` — `sectionLabel`'s own `marginBottom` (a flex-item margin, not a container
  // one) still spaces this whole row from whatever renders below it, same as when it was the
  // row's only child.
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  // No margin of its own — vertical alignment comes from `sectionHeadingRow`'s `alignItems:
  // 'center'`, and the row's own height (and the space below it) comes from `sectionLabel`'s
  // `marginBottom` on the sibling label, not from this.
  sectionCountCaption: {},
  // No background/border/shadow — design review round 3 dropped the old nested white card in
  // favour of the illustration + copy sitting directly on the curtain sheet's own fill.
  emptyState: {
    alignItems: 'center',
  },
  // Dashed placeholder card for the "no device connected" state (reference: the dashed
  // "New Group"/"Combine Speakers" tiles) — a visible boundary around the illustration/copy/CTA
  // rather than them floating loose on the curtain sheet's own fill. `border` (neutral[200]), not
  // `brand` — this is a quiet placeholder outline, not a call-to-action stroke, and `border` is
  // already exempted for non-text border use (`contrastCompleteness.test.ts`). `alignSelf:
  // 'stretch'` so the card fills `emptyStateCenterWrapper`'s width rather than shrinking to its content.
  emptyStateCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: tokens.color.border,
    borderRadius: tokens.radii.xl,
    paddingVertical: tokens.spacing.xxl,
    paddingHorizontal: tokens.spacing.lg,
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
  // The scrollable region's OUTER size — `flexGrow: 1` consumes whatever's left of the curtain's
  // fixed height above `pairSection`'s pinned button, same role `emptyCardWrapper` (a plain
  // `View`) used to play before this became a `ScrollView` (design ask, 2026-08-31: 5+ connected/
  // 10+ paired devices must scroll instead of overflowing past the button). Layout of what's
  // INSIDE it — centring for the empty state, top-alignment + `gap` for the list — lives on
  // `contentContainerStyle` instead (`emptyScrollContent`/`deviceScrollContent` below), not here:
  // `ScrollView`'s own `style` sizes the scrollable viewport, it doesn't lay out its content.
  deviceScroll: {
    flexGrow: 1,
  },
  // `contentContainerStyle` for the fully-empty state — `flexGrow: 1` so `emptyStateCenterWrapper`
  // (its one child) has real leftover space to centre `emptyStateCard` into, the same effect
  // `emptyCardWrapper`'s own `justifyContent: 'center'` used to have directly, before the
  // "Connected devices" heading became a preceding sibling inside this same scroll content
  // instead of a sibling above the whole wrapper.
  emptyScrollContent: {
    flexGrow: 1,
  },
  // Centres `emptyStateCard` in the space left over after the heading above it — see
  // `emptyScrollContent`'s comment for why this extra layer exists now. `emptyStateCard`'s own
  // `alignSelf: 'stretch'` still wins over this wrapper's default `alignItems: 'stretch'` for
  // cross-axis width, so the card still spans full width; only the vertical centring comes from
  // here.
  emptyStateCenterWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  // `contentContainerStyle` for the non-empty state — top-aligned (no `flexGrow`, so content
  // sizes to its own natural height and the `ScrollView` only scrolls once that exceeds the
  // viewport) with `gap` separating the Connected section from the Paired one below it — `xl`,
  // not `lg`, so the two read as clearly separate groups rather than crowding into each other:
  // `lg` (16) was too close to `deviceSectionList`'s own within-section row gap (`sm`, 8), just
  // 2x it, so the section break barely read as one.
  deviceScrollContent: {
    gap: tokens.spacing.xl,
  },
  // The "Paired devices" group — its own `sectionLabel` heading (same style as the top-level
  // "Connected devices" one) plus its rows. `gap: xl` matches `deviceScrollContent`'s own `gap`
  // (design ask, 2026-08-31): "Connected devices"' heading and list are direct siblings of the
  // outer `ScrollView` content, so they pick up THAT gap on top of `sectionLabel`'s `marginBottom`
  // — without this same `gap` here, "Paired devices"' heading and list (nested one level deeper,
  // inside this `View`) only ever got the bare `marginBottom`, so the two sections' title-to-list
  // spacing silently diverged as soon as `marginBottom` was tuned away from its original value.
  deviceSection: {
    gap: tokens.spacing.xl,
  },
  // `gap` separates one `ConnectedDeviceCard` from the next within a single section — same value
  // the old flat list used before it was split into Connected/Disconnected groups.
  deviceSectionList: {
    gap: tokens.spacing.sm,
  },
  // Compact light-grey row (design reference; same fill/radius `ListRow` uses for `DV-4`/`DV-9`/
  // `PF-*`) rather than `DevicesEmptyState`'s illustration + copy — this reads as one entry in a
  // list, not a standalone status screen.
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.backgroundMuted,
    borderRadius: tokens.radii.lg,
    // `paddingVertical: md` (12), not the old flat `padding: sm` (8) — a small height bump
    // (design ask, 2026-08-31), horizontal padding left at `sm` since only the row's height was
    // asked for. Shared by both "Connected devices" and "Paired devices" rows, so both grow
    // together by construction.
    paddingVertical: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.sm,
    gap: tokens.spacing.md,
  },
  // iOS press feedback (design ask, 2026-08-31) — a flat, single translucent veil laid OVER the
  // whole finished row rather than fading the row's own `opacity`, which is what produced the
  // reported "glitch": `opacity` on `deviceRow` dims every overlapping opaque shape stacked inside
  // it independently (`connectedDot`'s white ring over `DeviceLockGlyph`'s own white backing, in
  // particular), so those seams became visible instead of the whole row reading as one flat dim.
  // A plain `rgba` literal, not a `tokens.color.*` reference — a transient press tint has no text
  // sitting on it, so it carries no WCAG contrast obligation the way a real background token would
  // (see `contrastCompleteness.test.ts`'s `BG_KEYS` handling).
  deviceRowPressOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.06)',
    borderRadius: tokens.radii.lg,
  },
  // Anchor for `connectedDot`'s absolute positioning — `position: 'relative'` is the only thing
  // this adds over rendering `DeviceLockGlyph` bare, since the glyph itself still sizes/centres
  // the same way it always did.
  deviceIconWrapper: {
    position: 'relative',
  },
  // The green "online" dot on the device mockup (reference screenshot, design ask, 2026-08-31) —
  // sits over the glyph's bottom-right corner rather than beside it, same placement the reference
  // uses. `borderColor: surface` (white) rings the dot so it reads as cut into the glyph's own
  // white backing (`DeviceLockGlyph`'s `backgroundColor` prop, also `surface`) rather than a flat
  // circle stamped on top of it. `success`, not a new token — same darkened green already
  // approved for connected/online states elsewhere in this file's badges.
  connectedDot: {
    position: 'absolute',
    // Top-left, not bottom-right (design ask, 2026-08-31) — bottom-right sat right next to the
    // green battery glyph rendered below the device name, two green dots close enough together to
    // read as one blurred cluster; top-left keeps this dot clearly its own mark on the device icon.
    top: -2,
    left: -2,
    width: 14,
    height: 14,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.color.success,
    borderWidth: 2,
    borderColor: tokens.color.surface,
  },
  // Swipe-to-lock/unlock (design ask, 2026-08-31) — `swipeRowWrapper` is the fixed-size outer
  // shell (matches `deviceRow`'s own rounding, `overflow: 'hidden'` clipping everything inside to
  // it) AND now the full-bleed reveal fill itself (`swipeActionLock`/`swipeActionUnlock` below,
  // applied here rather than to `swipeAction`) — `swipeFront`'s own rounded right corner (kept
  // natural, no longer flattened) exposes a sliver of whatever's directly behind it while sliding,
  // so that sliver has to be the same red/green fill across the WHOLE row, not just the narrow
  // `SWIPE_ACTION_WIDTH` strip `swipeAction` occupies — reported as a colour gap at the row's
  // curved corner (2026-08-31) when the fill was scoped to `swipeAction` alone. `swipeAction`
  // itself is now purely the icon+label layout, not a fill.
  swipeRowWrapper: {
    borderRadius: tokens.radii.lg,
    overflow: 'hidden',
  },
  swipeFront: {
    width: '100%',
  },
  swipeAction: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: SWIPE_ACTION_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
  },
  // Both reuse an existing tinted-fill/dark-content pairing this app already has elsewhere
  // (`Button`'s `destructive` variant, `Badge`'s `success` tone) rather than a new solid,
  // saturated fill — see `ConnectedDeviceCard`'s own comment on why. Applied to `swipeRowWrapper`
  // (full row width), not `swipeAction` (icon+label width only) — see that style's comment.
  swipeActionLock: {
    backgroundColor: tokens.color.dangerBackground,
  },
  swipeActionUnlock: {
    backgroundColor: tokens.color.successBg,
  },
  swipeActionUnlockLabel: {
    color: tokens.color.success,
  },
  // Sits directly under the device name inside `deviceRowInfo` now (layout rev, 2026-08-31) —
  // was its own standalone trailing column with the glyph stacked above the percentage; inline
  // under the name reads better as a single row (glyph beside its percentage), matching how the
  // "Last connected" caption below it already reads.
  deviceRowBattery: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  deviceRowInfo: {
    flex: 1,
    gap: tokens.spacing.xs,
  },
  // Trailing lock-state icon + its own swipe hint/error text, stacked as one unit (layout rev,
  // 2026-08-31) — takes over the row's trailing-column slot `deviceRowBattery` used to occupy.
  // `flex-end`/right-aligned text keeps a single-line hint ("Swipe to lock") flush under the
  // icon above it rather than trailing off to the left.
  deviceRowLockColumn: {
    alignItems: 'flex-end',
    gap: tokens.spacing.xs,
  },
  deviceRowLockColumnText: {
    textAlign: 'right',
  },
  // Reference screenshot (2026-08-31) shows the device name clearly larger/heavier than the
  // "Last connected" caption below it — `label`'s own 14/medium read too close in size to
  // `caption`'s 12/regular to carry that hierarchy, so this bumps the name up to `body`'s size
  // (16) at `semibold`, both already-registered tokens rather than a new hardcoded pair.
  deviceRowName: {
    fontSize: tokens.typography.fontSize.body,
    fontWeight: tokens.typography.fontWeight.semibold,
  },
  deviceRowBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  // Rightmost element of a disconnected `deviceRow` — mirrors `deviceRowBattery`'s role on a
  // connected row (same slot, mutually exclusive: a row is never both). `xs` gap between
  // "Connect" and the chevron, tighter than `deviceRowBattery`'s `sm` — the reference screenshot
  // reads them as one tightly-bound label, not two separate elements.
  deviceRowConnectHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  // The bare `›` glyph renders visually smaller than surrounding text at the same declared font
  // size, so it reads a touch undersized next to "Connect" without a small bump — same kind of
  // fix `DeviceScanScreen.tsx`'s `BackChevron` needed for its own `‹` (a different size there,
  // `title` variant rather than `label`, but the same glyph-runs-small reason).
  deviceRowChevron: {
    fontSize: 18,
  },
  // `DashedDeviceRow`'s outer shell — same light-grey/rounded language as `deviceRow`
  // (`backgroundMuted`, `radii.lg`) so it reads as a sibling of the device rows around it rather
  // than a different kind of surface, but with a tighter `padding` than `deviceRow`'s own
  // horizontal/vertical split: the design ask is explicitly a compact row, not another tall
  // status card like `emptyStateCard`.
  dashedDeviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.backgroundMuted,
    borderRadius: tokens.radii.lg,
    padding: tokens.spacing.sm,
    gap: tokens.spacing.md,
  },
  // Just enough room for `DeviceLockGlyph` to sit centred at its own natural size — no chip/
  // circle behind it (unlike `IconChip`), matching how `ConnectedDeviceCard` presents the same
  // glyph bare.
  dashedDeviceVisual: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The dashed placeholder box on the right half of the row — same dashed language as
  // `emptyStateCard` (`border`, dashed, `radii` rounding) but sized to a single compact row
  // rather than a full-height card, and with no button inside either usage.
  dashedDeviceBox: {
    flex: 1,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: tokens.color.border,
    borderRadius: tokens.radii.md,
    paddingVertical: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashedDeviceTitle: {
    textAlign: 'center',
  },
  dashedDeviceBody: {
    textAlign: 'center',
    marginTop: 2,
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
  // `alignSelf: 'center'` breaks `PairDeviceButton` out of its parent's default
  // `alignItems: 'stretch'` (`pairSection` or `emptyStateCard`, depending which call site) —
  // without this, the `Pressable` (and the pill inside it) would stretch to the sheet's full
  // width instead of sizing to its own icon + label content.
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
