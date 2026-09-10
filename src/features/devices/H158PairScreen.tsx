import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import {
  Button,
  Card,
  DeviceRadar,
  EmptyState,
  HOME_WASH_LOCATIONS,
  ListRow,
  RadarSearch,
  Sheet,
  Text,
  tokens,
  type RadarDeviceChip,
} from '@/shared/ui';
import {
  BleClientProvider,
  useBleManager,
  useBleScanner,
  type BleManagerLike,
} from '@/features/ble/BleClientContext';
import { createDeviceScanner, type DiscoveredDevice, type ScanState } from '@/features/ble/scanner';
import { H158_DEVICE_NAME_PREFIX } from '@/features/ble/h158/h158Protocol';
import type { H158Session } from '@/features/ble/h158/h158Session';
import { connectAndRememberH158Device } from '@/features/ble/h158/connectAndRememberH158Device';
import { getPairedH158Devices, removePairedH158Device } from '@/features/ble/h158/h158DeviceStorage';
import {
  useH158ConnectionStore,
  canConnectAnotherH158Device,
  setH158Disconnected,
  setH158LockState,
  setH158BatteryPercent,
  H158_MAX_CONCURRENT_CONNECTIONS,
  type ConnectedH158Device,
} from '@/features/ble/h158/useH158ConnectionStore';
import type { RootStackParamList } from '@/app/navigation';

// Same seven-stop wash `DeviceScanScreen.tsx` uses (brand blue at top fading to a near-white
// tint at the bottom) — not re-exported from `shared/ui` (only `HOME_WASH_LOCATIONS` is), so
// duplicated here the same way that file duplicates it, rather than reaching into another
// screen's local module scope.
const HOME_WASH_COLORS = [
  tokens.color.homeWashStop1,
  tokens.color.homeWashStop2,
  tokens.color.homeWashStop3,
  tokens.color.homeWashStop4,
  tokens.color.homeWashStop5,
  tokens.color.homeWashStop6,
  tokens.color.homeWashStop7,
];

/** Back-chevron for the detail (`connected`-phase) screen's own header — reference: a JBL-style
 * back arrow beside the device name, replacing the generic "Connected" title this phase used to
 * share with every other phase. Hand-authored inline, same reasoning as every other glyph
 * `HomeScreen.tsx` already hand-draws: no icon set exists yet, and it's one glyph. */
function BackChevronGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** This screen's own device mockup — the same rounded-device-with-padlock mark
 * `HomeScreen.tsx`'s `DeviceLockGlyph` draws for its list rows, duplicated here rather than
 * imported (`HOME_WASH_COLORS` above documents why: reaching into another screen's local module
 * scope isn't a pattern this file uses), rendered large as the hero visual the JBL reference
 * fills with an actual product photo. This app has no such photo asset for the H158, so the
 * app's own existing device mark stands in for it rather than inventing a new illustration this
 * round didn't ask for — outline-only (`backgroundColor="transparent"` at the call site) so it
 * reads against every stop of the gradient behind it, not just the light one `DeviceLockGlyph`'s
 * usual `surface` fill assumes. */
function DeviceMockupGlyph({
  size,
  color,
  backgroundColor,
}: {
  size: number;
  color: string;
  backgroundColor: string;
}) {
  return (
    <Svg width={size} height={(size * 88) / 64} viewBox="0 0 64 88" fill="none">
      <Rect x="4" y="4" width="56" height="80" rx="16" fill={backgroundColor} stroke={color} strokeWidth={3} />
      <Path d="M25 38v-6a7 7 0 0 1 14 0v6" stroke={color} strokeWidth={3} strokeLinecap="round" />
      <Rect x="22" y="38" width="20" height="16" rx="4" fill={backgroundColor} stroke={color} strokeWidth={3} />
      <Circle cx="32" cy="46" r="1.8" fill={color} />
    </Svg>
  );
}

/** Padlock mark for the "Device Lock" card's title row — same open/closed-shackle geometry
 * `HomeScreen.tsx`'s `LockStateGlyph` draws for its row's swipe-to-lock affordance, duplicated
 * here rather than imported (same reasoning as `DeviceMockupGlyph` above: no reaching into
 * another screen's local module scope). `locked` swings the shackle shut/open the same way that
 * one does, so the icon itself already shows which state the toggle beside it reflects. */
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

/** Lightning-bolt mark for the persistent battery bar below the device mockup (reference: a
 * bolt beside a fill bar) — same bolt geometry `HomeScreen.tsx`'s `BatteryGlyph` draws inside its
 * outline icon, extracted standalone since this screen's battery indicator is a bar, not an
 * outline-icon fill. */
function BoltGlyph({ color }: { color: string }) {
  return (
    <Svg width={18} height={10} viewBox="0 0 26 14" fill="none">
      <Path d="M13.7,0.5 L7.2,8.3 L13,8.3 L12.4,13.5 L18.9,5.7 L13,5.7 Z" fill={color} />
    </Svg>
  );
}

/** Standard power-button mark (a vertical line broken by an open arc) for the "Power" row's
 * title — same hand-authored-inline reasoning as every other glyph in this file. */
function PowerGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3v8" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M7 6a8 8 0 1 0 10 0" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Sliders mark (two rows, each a line with one filled handle) for the "Device Controls" card's
 * own title, matching the icon-before-label pattern the "Device Lock" and "Power" rows already
 * use. */
function ControlsGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h10M17 7h3" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M4 17h3M10 17h10" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx="14" cy="7" r="2" fill={color} />
      <Circle cx="7" cy="17" r="2" fill={color} />
    </Svg>
  );
}

/** Broken-ring "unlink" mark for the "Device Controls" card's Disconnect action (reference:
 * that card's own blue ring icon) — an incomplete circle rather than `PowerGlyph`'s complete
 * ring-plus-line, so the two read as distinct actions at a glance. */
function DisconnectGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18.5 8a8 8 0 1 1-9.9-7.8" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Trash-can mark for the "Device Controls" card's Forget Device action (reference: that
 * card's own red trash icon). */
function TrashGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M9 7V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V7" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M10 11v6M14 11v6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** One icon-above-label action in the "Device Controls" card's Disconnect/Forget Device row
 * (reference: that card's own icon-per-action layout) — its own tinted, bordered chip
 * (`backgroundColor`/`borderColor`) rather than a bare icon+label divided by a rule, so each
 * reads as its own button. `color` tints both the icon (passed separately, since each glyph
 * takes its own `color` prop) and this label together, so a destructive action reads as red
 * top to bottom, not just its icon. `loading` swaps the icon for a spinner and disables the
 * chip — Disconnect uses this (see its own call site's comment) so tearing down the GATT link
 * reads as something actually happening rather than an instant, jarring cut. */
function ControlAction({
  icon,
  label,
  color,
  backgroundColor,
  borderColor,
  loading = false,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={loading}
      onPress={onPress}
      style={[styles.controlAction, { backgroundColor, borderColor }, loading && styles.controlActionLoading]}
    >
      {loading ? <ActivityIndicator color={color} /> : icon}
      <Text variant="caption" style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}

// The "Device Lock" card's switch renders raw `Switch` rather than `shared/ui`'s `Toggle` —
// `Toggle` fixes its track to plain brand-blue/`backgroundMuted` (`ToggleProps` deliberately
// omits `trackColor`/`thumbColor`), which is exactly what made the lock switch ambiguous: a blue
// "on" track carries no lock/unlock meaning on its own, so the only way to tell the two states
// apart was reading the thumb's left/right position. `locked`/`unlocked` below are the chosen
// color mapping — locked reads red, unlocked reads green — shared with the "Device Lock" card's
// own caption text (`lockCaptionStyles` further down) so the track and the sentence under it
// never disagree about which color means which state. Colors are read back out via
// `StyleSheet.flatten` rather than passed as `tokens.color.*` directly on `trackColor`'s keys,
// same reasoning `Toggle.tsx` itself documents: `trackColor` is `Switch`'s own API, not a style
// prop, so a direct reference there would be an untracked color reference.
const lockSwitchTrackFill = StyleSheet.create({
  // No confirmed reading yet — neutral, not a guess at either color (CLAUDE.md: "Lock state UI
  // is notification-driven, never optimistic").
  unknown: { backgroundColor: tokens.color.backgroundMuted },
  unlocked: { backgroundColor: tokens.color.success },
  locked: { backgroundColor: tokens.color.dangerBorder },
});

const lockSwitchThumbFill = StyleSheet.create({
  base: { backgroundColor: tokens.color.surface },
});

// Same locked-red/unlocked-green mapping as `lockSwitchTrackFill` above, but the AA-verified
// *text* variant of each color (`dangerText`/`success`, not the more saturated `dangerBorder`
// the track fill uses) — a plain `tokens.color.textSecondary` fallback while the state is still
// unknown, same as everywhere else in this file that has nothing confirmed to color-code yet.
const lockCaptionStyles = StyleSheet.create({
  unknown: { color: tokens.color.textSecondary },
  unlocked: { color: tokens.color.success },
  locked: { color: tokens.color.dangerText },
});

type ConnectionPhase =
  | { kind: 'scanning' }
  | { kind: 'connecting'; name: string | null }
  // `ConnectedH158Device` (id/name only), not `DiscoveredDevice` — a resumed/reconnected
  // connection never went through THIS screen's own scan, so it has no rssi/firstSeenAtMs/
  // lastSeenAtMs to report, and nothing in this phase reads them anyway.
  | { kind: 'connected'; device: ConnectedH158Device; session: H158Session }
  | { kind: 'failed'; detail: string }
  | { kind: 'connectionLimitReached' };

/**
 * Real-hardware pairing screen for the H158/YP65-AT, reached from Home's live "Pair a device"
 * button and from each row in Home's device list, via `H158GateScreen`. Not the §4 flow
 * (`DeviceScanScreen.tsx`/`PairingBoundaryScreen.tsx`, both untouched) — that one is still what
 * P1-4.0's mock-based work targets, and it dead-ends deliberately on OQ-12. This screen talks to
 * the actual shipped hardware end to end: scan → connect → lock/unlock, using the same
 * `connectH158Session`/`H158Session` API the dev-only `H158BringUpScreen.tsx` already proved out
 * against real units.
 *
 * P1-5.0 — this screen now has TWO entry shapes, distinguished by the `deviceId` nav param
 * (`H158GateScreen.tsx` forwards it straight through):
 *   - No `deviceId` (Home's "Pair a device" CTA): always scans, to ADD a device. Never resumes
 *     whatever else is already connected — that was the single-slot design's bug (pairing a
 *     second unit silently evicted the first from view). `useH158ConnectionStore`'s own
 *     connection-count cap is checked before a scan-selected device is dialled, not before the
 *     scan itself — scanning to just LOOK is always allowed.
 *   - `deviceId` set (a row in Home's device list): resumes straight into the connected controls
 *     if that id already has a live entry in `useH158ConnectionStore`; otherwise dials it
 *     directly (`connectH158Session` takes a device id, not a scan result — ble-plx can connect
 *     a known peripheral id without a fresh scan on both platforms) rather than making the user
 *     re-scan to reconnect a device they've already paired once.
 *
 * Background/copy deliberately matches `DeviceScanScreen.tsx`'s look (same `HOME_WASH_COLORS`
 * wash, same "Finding your device" title while searching with no results yet, same
 * `RadarSearch` ring) across every phase of this screen, not just the scanning one — every
 * child rendered directly against the gradient below uses `tone="inverse"`, and anything
 * carrying `tone="danger"` is wrapped in a `Card` first (`Card`/`ListRow`/`Button` already paint
 * their own light fill, so they need no change).
 *
 * 🔴 Wrapped in its own `<BleClientProvider>` (no `manager` prop), shadowing the app-wide dev-mock
 * fleet — identical reasoning to `H158BringUpScreen.tsx`'s own header comment: without this,
 * `useBleManager()`/`useBleScanner()` would silently resolve to the §4 mock fleet and this screen
 * would never find real hardware.
 *
 * Per `docs/hardware/hqd-device-architecture.md` §13.3, H158 has no authentication and no
 * dead-man timer — any nearby phone can send raw lock/unlock. The connected state below carries a
 * persistent, unmissable disclosure of that fact rather than any "Secured"/padlock language, and
 * nothing here writes a Supabase `device_ownership` row: what "pairing" should mean for this
 * hardware is an open client product decision (§13.3), not an engineering default. Only a local
 * "remembered devices" list is kept (`h158DeviceStorage.ts`), the same AsyncStorage pattern
 * `onboardingStorage.ts` uses.
 */
export interface H158PairScreenProps {
  /**
   * Test-only override for the shadow-the-dev-mock manager below. Production code never passes
   * this — `navigation.tsx` registers `component={H158PairScreen}` with no props, so the real
   * app always gets the shadowing behaviour this screen's header comment describes. Exists so a
   * test can inject a fake `BleManagerLike` instead of the real, native-backed `BleManager`
   * (`new BleManager()` throws under Jest — no native module, same reason `BleClientContext.tsx`
   * constructs it lazily rather than eagerly).
   */
  testManager?: BleManagerLike;
}

export function H158PairScreen({ testManager }: H158PairScreenProps = {}) {
  return (
    <BleClientProvider manager={testManager}>
      <H158PairScreenContent />
    </BleClientProvider>
  );
}

function H158PairScreenContent() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'H158Pair'>>();
  const targetDeviceId = route.params?.deviceId;
  const scannerLike = useBleScanner();
  const manager = useBleManager();
  const insets = useSafeAreaInsets();

  const scannerRef = useRef<ReturnType<typeof createDeviceScanner> | null>(null);
  if (!scannerRef.current) {
    scannerRef.current = createDeviceScanner({
      scanner: scannerLike,
      // H158/YP65-AT doesn't advertise a service UUID (h158Protocol.ts, reply Q5) — name-prefix
      // is the only filter available, same as H158BringUpScreen.
      filter: { serviceUuids: null, namePrefix: H158_DEVICE_NAME_PREFIX },
    });
  }
  const scanner = scannerRef.current;

  const [scanState, setScanState] = useState<ScanState>(() => scanner.getState());
  // The screen's own connect logic (`connect`/`connectById` below) is what actually drives
  // `phase` — this initial value only decides what's on screen for the very first render, before
  // any of it has run. `targetDeviceId` set means "resume or reconnect that specific device", so
  // the initial phase must never be `scanning` in that case (a flash of the radar before the
  // mount effect below redirects it), but it also can't itself dial the connection — a `useState`
  // initializer must stay synchronous and side-effect-free.
  const [phase, setPhase] = useState<ConnectionPhase>(() => {
    if (targetDeviceId) {
      const resumed = useH158ConnectionStore.getState().connections[targetDeviceId];
      if (resumed) {
        return { kind: 'connected', device: resumed.device, session: resumed.session };
      }
      return { kind: 'connecting', name: null };
    }
    return { kind: 'scanning' };
  });
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  // Pending "Forget device?" confirmation (same `Sheet`-as-centered-dialog pattern
  // `ProfileScreen.tsx`'s "Log out?" confirm uses) — holds which device is about to be
  // forgotten, since this screen has two call sites for it (the `connected` phase's own device,
  // and the `failed`-to-reconnect phase's `targetDeviceId`, which carries no name). `null` means
  // the sheet is closed.
  const [forgetConfirm, setForgetConfirm] = useState<{ deviceId: string; name: string | null } | null>(null);
  // The "Power" row's own value — strips the redundant "Power " prefix `h158Protocol.ts`'s
  // `SYSTEM_STATE_LABELS` bakes into "Power On"/"Power Off" (the row's own label already says
  // "Power"), leaving "Preheating"/"Heating"/an error string from `readStatus`/`setLock` above
  // untouched, since none of those start with it.
  const powerValue = lastStatus?.startsWith('Power ') ? lastStatus.slice('Power '.length) : lastStatus;

  // Same confirmed-or-null contract `HomeScreen.tsx`'s `ConnectedDeviceCard` reads
  // (`locked`/`batteryPercent`/`lowBattery`, never a guess — CLAUDE.md: "Lock state UI is
  // notification-driven, never optimistic") — lets this screen show a persistent status readout
  // rather than only the transient `lastStatus` string left over from the last button press.
  const liveConnection = useH158ConnectionStore((state) =>
    phase.kind === 'connected' ? state.connections[phase.device.id] : undefined,
  );
  const lockKnown = liveConnection?.locked ?? null;
  // `false`-track color depends on WHY the switch reads as off: an unconfirmed device (`null`)
  // gets the same neutral grey a disabled control always would, never the red `unlocked` reads —
  // that red is reserved for an actual confirmed-unlocked reply. The `true`-track only ever
  // renders once `lockKnown` is confirmed `true` (the switch's `value` below), so it has no
  // equivalent "unknown" case to guard against.
  const lockOffTrackColor = StyleSheet.flatten(
    lockKnown === null ? lockSwitchTrackFill.unknown : lockSwitchTrackFill.unlocked,
  ).backgroundColor;
  const lockOnTrackColor = StyleSheet.flatten(lockSwitchTrackFill.locked).backgroundColor;
  const lockThumbColor = StyleSheet.flatten(lockSwitchThumbFill.base).backgroundColor;

  const connect = useCallback(
    async (deviceId: string, name: string | null) => {
      const outcome = await connectAndRememberH158Device(manager, deviceId, name);
      if (!outcome.ok) {
        setPhase({ kind: 'failed', detail: outcome.detail });
        return;
      }
      setPhase({ kind: 'connected', device: outcome.device, session: outcome.session });
    },
    [manager],
  );

  const connectFromScan = useCallback(
    (device: DiscoveredDevice) => {
      if (!canConnectAnotherH158Device()) {
        setPhase({ kind: 'connectionLimitReached' });
        return;
      }
      scanner.stop();
      setPhase({ kind: 'connecting', name: device.name });
      void connect(device.id, device.name);
    },
    [connect, scanner],
  );

  // `connect`/`targetDeviceId` are read through a ref rather than listed as deps on the mount
  // effect below: that effect is one-shot wiring (subscribe to the scanner, kick off exactly one
  // scan-or-direct-connect), and re-running it because `connect`'s identity moved across a
  // re-render would dispose a live scanner and re-dial mid-attempt. The ref states that intent
  // directly instead of asking the linter to ignore the effect.
  const mountArgs = useRef({ connect, targetDeviceId });
  mountArgs.current = { connect, targetDeviceId };

  useEffect(() => {
    const { connect: dial, targetDeviceId: resumeId } = mountArgs.current;
    const unsubscribe = scanner.subscribe(setScanState);
    if (resumeId) {
      // Resuming (already covered by the `phase` initializer above) or reconnecting — either
      // way, no scan: `connectH158Session` dials a known peripheral id directly. Looks the name
      // up from the remembered-devices list purely for the "Connecting to <name>…" caption; a
      // miss (a device this app has somehow never remembered) still connects, just with a
      // generic caption, rather than blocking on it.
      if (!useH158ConnectionStore.getState().connections[resumeId]) {
        void getPairedH158Devices().then((devices) => {
          const remembered = devices.find((d) => d.id === resumeId);
          setPhase((current) =>
            current.kind === 'connecting' ? { kind: 'connecting', name: remembered?.name ?? null } : current,
          );
        });
        void dial(resumeId, null);
      }
    } else {
      scanner.start();
    }
    return () => {
      unsubscribe();
      scanner.dispose();
      // Deliberately NOT `session.dispose()` here — unlike the scanner, an H158 session is owned
      // by `useH158ConnectionStore` now, not by this screen's lifecycle. Disposing the FFF1
      // subscription just because this screen unmounted would break Read Status/Lock/Unlock on
      // the very next visit `phase`'s resume-from-store branch is meant to support. Only
      // `disconnect()` below tears a session down.
    };
  }, [scanner]);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const retryScan = useCallback(() => {
    setPhase({ kind: 'scanning' });
    scanner.start();
  }, [scanner]);

  const retryDirectConnect = useCallback(() => {
    if (!targetDeviceId) {
      return;
    }
    setPhase({ kind: 'connecting', name: null });
    void connect(targetDeviceId, null);
  }, [connect, targetDeviceId]);

  const readStatus = useCallback(async () => {
    if (phase.kind !== 'connected') {
      return;
    }
    const outcome = await phase.session.readStatus();
    if (!outcome.ok) {
      setLastStatus(`Couldn't read status: ${outcome.reason}`);
      return;
    }
    const { locked, systemStateLabel, batteryPercent } = outcome.value;
    // Locked/Unlocked and the battery percent are already shown elsewhere on this screen (the
    // "Device Lock" card's switch, and the battery bar up top) — repeating them here in the
    // "Power" row was redundant. `systemStateLabel` isn't shown anywhere else, so it's the only
    // thing this row still needs to report.
    setLastStatus(systemStateLabel);
    setH158LockState(phase.device.id, locked);
    setH158BatteryPercent(phase.device.id, batteryPercent);
  }, [phase]);

  // Populates the "Power" row without a tap: `connect`'s own fire-and-forget read (above) already
  // covers a fresh pairing/reconnect, but a RESUMED visit (the mount effect's `targetDeviceId`
  // branch does nothing when the store already has a live connection) never fires a read at all,
  // so this screen would otherwise show nothing there until something else happened to trigger
  // one. Keyed on `phase.kind` alone, so it fires once per visit to the connected phase rather
  // than on every re-render `liveConnection`'s own updates cause — `readStatus` closes over the
  // whole `phase` object and `lastStatus` changes the moment the read lands, so listing either
  // would re-run this effect immediately. Both are therefore read through a ref, which keeps the
  // "once per visit" rule in the code rather than in a linter suppression.
  const statusRead = useRef({ lastStatus, readStatus });
  statusRead.current = { lastStatus, readStatus };

  useEffect(() => {
    if (phase.kind === 'connected' && statusRead.current.lastStatus === null) {
      void statusRead.current.readStatus();
    }
  }, [phase.kind]);

  const setLock = useCallback(
    async (locked: boolean) => {
      if (phase.kind !== 'connected') {
        return;
      }
      const outcome = await phase.session.setChildLock(locked);
      if (!outcome.ok) {
        setLastStatus(`Couldn't ${locked ? 'lock' : 'unlock'}: ${outcome.reason}`);
        return;
      }
      // No "Locked"/"Unlocked" message here any more — same redundancy `readStatus` above just
      // dropped, and the "Device Lock" card's own switch already reflects this the instant
      // `setH158LockState` below updates the store it reads from. Clears rather than leaves a
      // stale `lastStatus` behind for the "Read Status" row to show next time it's expanded.
      setLastStatus(null);
      setH158LockState(phase.device.id, outcome.value.locked);
    },
    [phase],
  );

  /**
   * `H158Session.dispose()` alone never drops the GATT link (its own doc comment — "that's the
   * caller's concern"), which is exactly why a device stayed connected after leaving this screen
   * with "Done" and Home had nothing to show. This is the actual disconnect: unsubscribe FFF1
   * (`phase.session`, the same session object `useH158ConnectionStore` holds — there's no
   * separate ref to it any more), then `cancelDeviceConnection` at the manager level (not the
   * optional `BleDeviceLike.cancelConnection` — `manager` is already in scope and its method
   * isn't optional). Update the store directly rather than waiting on the `onDisconnected`
   * listener registered in `connect` above — that listener still fires too, but only after the
   * native callback round-trips, and this is a user-initiated action that should read as
   * immediate. Only THIS device's connection entry is dropped — Home should keep showing every
   * other connected device exactly as it was, and the remembered-devices list is untouched: a
   * disconnect is not a "forget" (that's `forgetDevice` below).
   */
  // Deliberately does NOT navigate — `handleDisconnectPress` below does that once its own
  // minimum-delay floor has also elapsed, not the instant this resolves (which is usually near-
  // instant on its own: a local dispose plus a native call that's often already-settled).
  const disconnect = useCallback(async () => {
    if (phase.kind !== 'connected') {
      return;
    }
    const deviceId = phase.device.id;
    phase.session.dispose();
    try {
      await manager.cancelDeviceConnection(deviceId);
    } catch {
      // Already gone — e.g. the device dropped the link itself moments earlier. Nothing left to
      // retry; fall through to updating local/UI state either way.
    }
    setH158Disconnected(deviceId);
    setLastStatus(null);
  }, [phase, manager]);

  // `disconnect` above resolving near-instantly read as an abrupt cut, with nothing shown between
  // tapping Disconnect and the screen suddenly leaving. This holds the chip's spinner (and the
  // navigation away) behind a floor of 2s — whichever of the two finishes last — purely for
  // perceived feedback; it changes nothing about `disconnect`'s own behavior or timeout handling.
  // No `isDisconnecting` reset afterwards: `navigation.popToTop()` unmounts this screen.
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const handleDisconnectPress = useCallback(() => {
    setIsDisconnecting(true);
    const minimumDelay = new Promise<void>((resolve) => setTimeout(resolve, 2000));
    void Promise.all([disconnect(), minimumDelay]).then(() => navigation.popToTop());
  }, [disconnect, navigation]);

  /**
   * The whole "forget" action, now local to this screen (previously duplicated as a per-row link
   * on `HomeScreen`, removed in favour of living in exactly one place). Takes a `deviceId` rather
   * than reading `phase.device.id` directly, so it works from both call sites below: the
   * `connected` phase (a live session to tear down first) and the `failed` phase reached via a
   * reconnect attempt (`targetDeviceId` set, no live session — the connect itself never
   * succeeded) — a device that's gone permanently unreachable must still be forgettable, not
   * stuck in the list forever because it can no longer reach the connected state that used to be
   * the only place this action lived.
   *
   * Reads the live connection from the store directly, rather than requiring `phase.kind ===
   * 'connected'`, for the same reason: disconnect-then-remove only applies when a session
   * actually exists to dispose. `removePairedH158Device` runs either way — dropping the
   * remembered-list entry is the actual "forget", disconnecting is just cleanup when there's a
   * link to clean up.
   */
  const forgetDevice = useCallback(
    async (deviceId: string) => {
      const connection = useH158ConnectionStore.getState().connections[deviceId];
      if (connection) {
        connection.session.dispose();
        try {
          await manager.cancelDeviceConnection(deviceId);
        } catch {
          // Already gone — same reasoning as `disconnect` above.
        }
        setH158Disconnected(deviceId);
      }
      await removePairedH158Device(deviceId);
      setLastStatus(null);
      navigation.popToTop();
    },
    [manager, navigation],
  );

  // Mirrors `DeviceScanScreen.tsx`'s `isScanning` title swap — "Finding your device" only while
  // this screen is actually still looking with nothing found yet, not for the whole `scanning`
  // phase (once devices are listed there's nothing left to caption that way).
  const scanningEmpty =
    phase.kind === 'scanning' &&
    (scanState.status === 'scanning' || scanState.status === 'stopped') &&
    scanState.devices.length === 0;

  return (
    <View style={styles.root}>
      <LinearGradient colors={HOME_WASH_COLORS} locations={[...HOME_WASH_LOCATIONS]} style={styles.gradient} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + tokens.spacing.xl }]}>
        {/* The `connected` phase renders its own back-arrow + device-name header below instead
            (reference: JBL's device detail screen) — every other phase keeps this shared title. */}
        {phase.kind !== 'connected' && (
          <Text variant="title" tone="inverse" style={styles.title}>
            {scanningEmpty ? 'Finding your device' : 'Connect your BlueSmoke'}
          </Text>
        )}
        {scanningEmpty && (
          <Text variant="body" tone="inverse" style={[styles.centerText, styles.subtitle]}>
            Keep your BlueSmoke nearby and switched on.
          </Text>
        )}

        {phase.kind === 'scanning' && (
          <ScanBody state={scanState} onSelect={connectFromScan} onRetry={retryScan} onCancel={goBack} />
        )}

        {phase.kind === 'connecting' && (
          <View style={styles.section}>
            <Text tone="inverse" style={styles.centerText}>
              Connecting to {phase.name ?? 'your device'}…
            </Text>
          </View>
        )}

        {phase.kind === 'connectionLimitReached' && (
          <View style={styles.section}>
            <Card style={styles.messageCard}>
              <Text tone="danger" style={styles.centerText}>
                You can have up to {H158_MAX_CONCURRENT_CONNECTIONS} devices connected at once.
                Disconnect one from Home before adding another.
              </Text>
            </Card>
            <Button label="Cancel" variant="secondary" onPress={goBack} />
          </View>
        )}

        {phase.kind === 'failed' && (
          <View style={styles.section}>
            <Card style={styles.messageCard}>
              <Text tone="danger" style={styles.centerText}>
                {phase.detail}
              </Text>
            </Card>
            <Button label="Try again" onPress={targetDeviceId ? retryDirectConnect : retryScan} />
            <Button label="Cancel" variant="secondary" onPress={goBack} />
            {/* Only a reconnect attempt (`targetDeviceId` set) reaches `failed` for an already-
                remembered device — a fresh scan-based connect failure has nothing remembered yet
                to forget. Without this, a device that's gone permanently unreachable (broken,
                given away, factory reset) would be stuck in Home's list forever: it can never
                reach the `connected` phase's own Forget button again. */}
            {targetDeviceId && (
              <Button
                label="Forget device"
                variant="destructive"
                onPress={() => setForgetConfirm({ deviceId: targetDeviceId, name: null })}
              />
            )}
          </View>
        )}

        {phase.kind === 'connected' && (
          // Reference layout (JBL device-detail screen): a back-arrow + name header, a device
          // mockup, a persistent battery bar, then one concern per card — lock status/action,
          // an expandable status readout, and connection management — each with real air
          // between it and the next via `connectedSection`'s `gap`, replacing the old single
          // `section` list where everything (name, three same-weight buttons, a status card,
          // three more buttons) shared one `spacing.sm` gap with nothing to tell groups apart.
          <View style={styles.connectedSection}>
            <View style={styles.detailHeader}>
              {/* "Back", not "Done" — the connection-management card below now has its own
                  explicit "Done" button carrying that name and action (`navigation.popToTop()`,
                  same as this arrow), so this needed a distinct accessible name once there were
                  two controls doing the same thing on one screen. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={() => navigation.popToTop()}
                hitSlop={12}
                style={styles.backButton}
              >
                <BackChevronGlyph size={22} color={tokens.color.textInverse} />
              </Pressable>
              <Text
                variant="title"
                tone="inverse"
                numberOfLines={1}
                style={[styles.centerText, styles.detailHeaderTitle]}
              >
                {phase.device.name ?? 'BlueSmoke device'}
              </Text>
              {/* Balances the back button's width so the title above stays visually centered
                  between two equal slots, not pushed right by a one-sided leading icon. */}
              <View style={styles.backButton} />
            </View>

            <View style={styles.deviceMockupWrap}>
              <DeviceMockupGlyph size={110} color={tokens.color.textInverse} backgroundColor="transparent" />
            </View>

            {/* Confirmed-or-nothing, same as `HomeScreen.tsx`'s row battery reading — never a
                guessed value (CLAUDE.md: "Lock state UI is notification-driven, never
                optimistic"), so this simply doesn't render until a real reading exists. */}
            {liveConnection?.batteryPercent != null && (
              <View style={styles.batteryRow}>
                <BoltGlyph color={tokens.color.textInverse} />
                <View style={styles.batteryTrackWrap}>
                  <View style={styles.batteryTrackBg} />
                  <View
                    style={[
                      styles.batteryTrackFill,
                      { width: `${liveConnection.batteryPercent}%` },
                      liveConnection.lowBattery && styles.batteryTrackFillLow,
                    ]}
                  />
                </View>
                <Text variant="label" tone="inverse">
                  {liveConnection.batteryPercent}%
                </Text>
              </View>
            )}

            <Card style={styles.disclosureCard}>
              <Text tone="danger" variant="caption" style={styles.centerText}>
                This device has no lock code — anyone nearby with Bluetooth can lock or unlock it.
              </Text>
            </Card>

            {/* Plain power-state row, not an interactive "Read Status" action — `systemStateLabel`
                only ever really says "Power On"/"Power Off" (occasionally "Preheating"/
                "Heating" mid-puff), so a title + chevron + collapsed-by-default disclosure was
                more chrome than a one-word value needs, and neither is a tap: the effect above
                populates it as soon as this phase is reached, the same way the battery bar and
                the lock switch below are already populated without a button press. "Power " is
                stripped from the value so the row doesn't repeat itself ("Power" label, "Power
                On" value) — the four spec states remain hardware fact
                (`h158Protocol.ts`'s `SYSTEM_STATE_LABELS`), not narrowed to just "On"/"Off". */}
            <Card style={styles.powerCard}>
              <View style={styles.cardTitleRow}>
                <PowerGlyph size={20} color={tokens.color.textPrimary} />
                <Text variant="label">Power</Text>
              </View>
              <Text variant="label" tone="secondary">
                {powerValue ?? '—'}
              </Text>
            </Card>

            {/* Device Controls (reference: JBL's own "Device Controls" card) — everything that
                acts on THIS device or its BLE connection, in one card. Device Lock keeps its
                exact current row (icon + label + switch, color-coded per `lockSwitchTrackFill`'s
                own comment above — red/left for unlocked, green/right for locked, never flipped
                on tap itself; CLAUDE.md: "Lock state UI is notification-driven, never
                optimistic"), now in its own shadowed, tinted sub-panel rather than sitting flush
                against the card's white background — a visual "row" of its own, not just text
                floating in the card. Disconnect/Forget Device are each their own tinted, bordered
                chip below it (replacing the earlier thin-rule dividers with real separation via
                background instead of a line) — brand-blue for Disconnect, danger-red for Forget
                Device, matching `Button.tsx`'s own `secondary`/`destructive` color pairings.
                `Done` is deliberately NOT in here — it doesn't act on the device or the
                connection at all, it just leaves, so it stays its own button below (same action
                as the header's own back arrow — see that Pressable's comment for why the two
                need distinct accessible names). */}
            <Card style={styles.deviceControlsCard}>
              <View style={styles.cardTitleRow}>
                <ControlsGlyph size={20} color={tokens.color.textPrimary} />
                <Text variant="label">Device Controls</Text>
              </View>

              <View style={styles.lockRowPanel}>
                <View style={styles.lockCardHeader}>
                  <View style={styles.cardTitleRow}>
                    <LockStateGlyph size={20} color={tokens.color.textPrimary} locked={lockKnown ?? false} />
                    <Text variant="label">Device Lock</Text>
                  </View>
                  <Switch
                    accessibilityLabel={lockKnown ? 'Unlock device' : 'Lock device'}
                    value={lockKnown ?? false}
                    onValueChange={(next) => setLock(next)}
                    disabled={lockKnown === null}
                    trackColor={{ false: lockOffTrackColor, true: lockOnTrackColor }}
                    thumbColor={lockThumbColor}
                  />
                </View>
                <Text
                  variant="caption"
                  style={lockCaptionStyles[lockKnown === null ? 'unknown' : lockKnown ? 'locked' : 'unlocked']}
                >
                  {lockKnown === null
                    ? "Status unknown until it's read — see Power above."
                    : lockKnown
                      ? 'Locked — blocks usage until you unlock it.'
                      : 'Unlocked — allows usage until you lock it.'}
                </Text>
              </View>

              <View style={styles.controlActionsRow}>
                <ControlAction
                  icon={<DisconnectGlyph size={22} color={tokens.color.link} />}
                  label="Disconnect"
                  color={tokens.color.link}
                  backgroundColor={tokens.color.brandTint}
                  borderColor={tokens.color.brand}
                  loading={isDisconnecting}
                  onPress={handleDisconnectPress}
                />
                <ControlAction
                  icon={<TrashGlyph size={22} color={tokens.color.dangerText} />}
                  label="Forget device"
                  color={tokens.color.dangerText}
                  backgroundColor={tokens.color.dangerBackground}
                  borderColor={tokens.color.dangerBorder}
                  onPress={() => setForgetConfirm({ deviceId: phase.device.id, name: phase.device.name })}
                />
              </View>
            </Card>

            <Button label="Done" variant="secondary" onPress={() => navigation.popToTop()} />
          </View>
        )}
      </ScrollView>

      {/* Same `Sheet`-as-centered-dialog pattern `ProfileScreen.tsx`'s "Log out?" confirm uses,
          rather than a native `Alert` — this app has no other confirm dialog built any other
          way. One instance, shared by both `forgetDevice` call sites above (`forgetConfirm` says
          which device, `null` means closed) rather than one per call site. */}
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
              // Distinct from the trigger's own "Forget device" accessible name (the chip/button
              // that opens this sheet) — `Button.tsx` lets a caller override its default
              // `accessibilityLabel={label}` (spread via `...rest` after that default), so the
              // visible text can stay "Forget device" on both while remaining two distinguishable
              // controls for anything (a screen reader, a test) that looks them up by name.
              accessibilityLabel="Confirm forget device"
              variant="destructive"
              onPress={() => {
                const target = forgetConfirm;
                setForgetConfirm(null);
                if (target) {
                  void forgetDevice(target.deviceId);
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

function ScanBody({
  state,
  onSelect,
  onRetry,
  onCancel,
}: {
  state: ScanState;
  onSelect: (device: DiscoveredDevice) => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  switch (state.status) {
    case 'idle':
      return (
        <Text tone="inverse" style={styles.centerText}>
          Starting scan…
        </Text>
      );
    case 'blocked':
      return (
        <View style={styles.section}>
          <Card style={styles.messageCard}>
            <Text tone="danger" style={styles.centerText}>
              Bluetooth isn&apos;t available right now ({state.reason}).
            </Text>
          </Card>
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
      );
    case 'failed':
      return (
        <View style={styles.section}>
          <Card style={styles.messageCard}>
            <Text tone="danger" style={styles.centerText}>
              Scan failed: {state.detail}
            </Text>
          </Card>
          <Button label="Scan again" onPress={onRetry} />
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
      );
    case 'noDevicesFound':
      return (
        <View style={styles.section}>
          <Card>
            <EmptyState
              title="We couldn't find it"
              body="Press the device's button once to wake it, then scan again. Keep it within arm's reach."
            />
          </Card>
          <Button label="Scan again" onPress={onRetry} />
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
      );
    case 'scanning':
    case 'stopped': {
      // The curved "Devices found" card only appears once the scan has actually finished
      // (`status === 'stopped'`) — not the moment a device is first found mid-scan, while the
      // ring is still actively rippling. Surfacing a whole card of results underneath a still-
      // searching radar read as premature/noisy; the ring's own chips already give the
      // in-progress "found it" feedback live, so nothing is lost by holding the list back.
      const showResultsCard = state.status === 'stopped' && state.devices.length > 0;

      if (state.devices.length === 0) {
        return (
          <View style={[styles.section, styles.sectionGrow]}>
            <View style={styles.radarWrap}>
              <RadarSearch />
            </View>
            {state.status === 'stopped' && <Button label="Scan again" onPress={onRetry} />}
            <Button label="Cancel" variant="secondary" onPress={onCancel} />
          </View>
        );
      }

      // A device's ring chip fires the exact same `onSelect` its `ListRow` below does — the chip
      // is a second affordance for the same action, not a separate "preview" step. Mapped fresh
      // each render off `state.devices` (already discovery-ordered, never RSSI-sorted —
      // `scanner.ts`), so a chip's slot only ever depends on its stable index in that array, per
      // `DeviceRadar`'s own anti-jitter contract.
      const chips: RadarDeviceChip[] = state.devices.map((device) => ({
        id: device.id,
        label: device.name ?? 'BlueSmoke device',
      }));
      const selectById = (id: string) => {
        const device = state.devices.find((candidate) => candidate.id === id);
        if (device) {
          onSelect(device);
        }
      };

      return (
        <View style={[styles.section, !showResultsCard && styles.sectionGrow]}>
          <View style={[styles.deviceRadarWrap, !showResultsCard && styles.radarWrap]}>
            <DeviceRadar devices={chips} onSelectDevice={selectById} />
          </View>
          {showResultsCard && (
            <View style={styles.resultsCard}>
              <Text variant="label" tone="secondary" style={styles.resultsLabel}>
                Devices found
              </Text>
              {state.devices.map((device) => (
                <ListRow
                  key={device.id}
                  label={device.name ?? 'BlueSmoke device'}
                  trailing={
                    <Text variant="caption" tone="secondary">
                      {device.rssi === null ? 'Signal unknown' : `${device.rssi} dBm`}
                    </Text>
                  }
                  onPress={() => onSelect(device)}
                />
              ))}
            </View>
          )}
          {state.status === 'stopped' && <Button label="Scan again" onPress={onRetry} />}
          <Button label="Cancel" variant="secondary" onPress={onCancel} />
        </View>
      );
    }
  }
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
  content: {
    flexGrow: 1,
    // `paddingTop` is set inline (`insets.top + tokens.spacing.xl`) instead of here, so the
    // title/subtitle clear the status bar/notch on every device rather than sitting flush
    // against it — this screen has `headerShown: false` (navigation.tsx), so there's no native
    // header doing that for it.
    paddingHorizontal: tokens.spacing.xl,
    paddingBottom: tokens.spacing.xl,
    gap: tokens.spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: tokens.spacing.sm,
  },
  subtitle: {
    marginTop: -tokens.spacing.sm,
  },
  centerText: {
    textAlign: 'center',
  },
  section: {
    gap: tokens.spacing.sm,
  },
  // Only applied while the ring is showing (`ScanBody`'s `scanning`/`stopped` case, zero devices
  // yet) — lets `radarWrap` below grow to fill the space between the title block above and the
  // Cancel button below, so the ring lands centred in the screen (`content`'s `flexGrow: 1`
  // makes that space exist even when the ScrollView's content is shorter than the screen).
  // Not applied once devices are listed — that list should stay top-aligned, not stretched.
  sectionGrow: {
    flex: 1,
  },
  radarWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceRadarWrap: {
    alignItems: 'center',
  },
  // Values borrowed from (not imported from) `DeviceScanScreen.tsx`'s own equivalent card — same
  // duplication convention this file already follows for `HOME_WASH_COLORS` above. Unlike that
  // screen's version, this card isn't docked to the bottom of the viewport (this screen is a
  // plain `ScrollView`, not an absolutely-positioned sheet layout), so it's rounded on all four
  // corners rather than just the top two.
  resultsCard: {
    backgroundColor: tokens.color.surfaceTint,
    borderRadius: tokens.radii.xl,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
    ...tokens.elevation.sheetEdge,
  },
  resultsLabel: {
    marginBottom: tokens.spacing.xs,
  },
  messageCard: {
    padding: tokens.spacing.sm,
  },
  // Larger gap than plain `section` (spacing.sm) — this is spacing *between* the connected
  // phase's groups (header, mockup, battery, disclosure, lock card, status card, connection
  // card), each of which manages its own tighter internal spacing below. Distinguishing "space
  // between groups" from "space within a group" is what the old single `section`/`spacing.sm`
  // list was missing.
  connectedSection: {
    gap: tokens.spacing.xl,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Fixed to the touch-target size so it doubles as the balancing spacer on the title's other
  // side (`detailHeader`'s third child) — same box, empty the second time, keeps the title
  // centred between two equal slots instead of shifted by a one-sided leading icon.
  backButton: {
    width: tokens.touchTarget.minWidth,
    height: tokens.touchTarget.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailHeaderTitle: {
    flex: 1,
  },
  deviceMockupWrap: {
    alignItems: 'center',
    paddingVertical: tokens.spacing.sm,
  },
  batteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
  },
  batteryTrackWrap: {
    width: 120,
    height: 8,
    borderRadius: tokens.radii.full,
    overflow: 'hidden',
  },
  // Opacity dims only this background layer (the "solid token + opacity style" trick
  // `HomeScreen.tsx`'s `iconChipBg`/`pairingBackdrop` already use) — `batteryTrackFill` is a
  // separate absolutely-positioned sibling, not a nested child, so it stays fully opaque
  // regardless of how translucent the track behind it is.
  batteryTrackBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: tokens.color.textInverse,
    opacity: 0.3,
  },
  batteryTrackFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: tokens.color.success,
    borderRadius: tokens.radii.full,
  },
  batteryTrackFillLow: {
    backgroundColor: tokens.color.dangerText,
  },
  disclosureCard: {
    padding: tokens.spacing.md,
  },
  lockCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
  },
  powerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deviceControlsCard: {
    gap: tokens.spacing.md,
  },
  // The Device Lock row's own sub-panel — tinted + shadowed so it reads as a distinct row
  // inside the white `deviceControlsCard`, the same way `ListRow` (elsewhere in this kit) gives
  // a row its own light-grey ground rather than sitting flush against its container's fill.
  lockRowPanel: {
    backgroundColor: tokens.color.backgroundMuted,
    borderRadius: tokens.radii.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
    ...tokens.elevation.card,
  },
  controlActionsRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  // Each of Disconnect/Forget Device is its own tinted, bordered chip (`backgroundColor`/
  // `borderColor` set per action at the call site) rather than a bare icon+label divided by a
  // rule — separation via color, not a line.
  controlAction: {
    flex: 1,
    alignItems: 'center',
    gap: tokens.spacing.xs,
    borderRadius: tokens.radii.lg,
    borderWidth: 1.5,
    paddingVertical: tokens.spacing.sm,
  },
  // Same opacity `Button.tsx`'s own `disabled` style uses, for the same reason: a chip mid-action
  // should look inert, not identical to its normal pressable state.
  controlActionLoading: {
    opacity: 0.6,
  },
  // Same values `ProfileScreen.tsx` uses for its own "Log out?" `Sheet` confirm — kept identical
  // rather than re-derived, so every confirm dialog in the app shares one spacing rhythm.
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
});
