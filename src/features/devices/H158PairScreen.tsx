import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {
  Button,
  Card,
  DeviceRadar,
  EmptyState,
  HOME_WASH_LOCATIONS,
  ListRow,
  RadarSearch,
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
import { connectH158Session, type H158Session } from '@/features/ble/h158/h158Session';
import { addPairedH158Device, getPairedH158Devices } from '@/features/ble/h158/h158DeviceStorage';
import {
  useH158ConnectionStore,
  canConnectAnotherH158Device,
  setH158Connected,
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

  const connect = useCallback(
    async (deviceId: string, name: string | null) => {
      const outcome = await connectH158Session(manager, deviceId);

      if (!outcome.ok) {
        const detail =
          outcome.reason === 'timeout'
            ? `Couldn't connect — timed out at the "${outcome.stage}" step.`
            : `Couldn't connect: ${outcome.detail}`;
        setPhase({ kind: 'failed', detail });
        return;
      }

      const connected: ConnectedH158Device = { id: deviceId, name };
      setPhase({ kind: 'connected', device: connected, session: outcome.session });
      setH158Connected(connected, outcome.session);
      // Deliberately not torn down when this screen unmounts (same split as
      // `H158Session.dispose()` itself, see `useH158ConnectionStore.ts`'s doc comment) — the
      // GATT link outlives this screen, so the listener needs to too, or Home would keep
      // showing "connected" after a real drop it never heard about.
      outcome.device.onDisconnected?.(() => setH158Disconnected(deviceId));
      await addPairedH158Device(connected);

      // Fire-and-forget: populates Home's Locked/Unlocked badge and battery reading as soon as
      // the device is reachable, rather than leaving them blank until someone presses "Read
      // Status" here. A failed/timed-out read just leaves both at their unknown `null` default
      // — never a guessed value standing in for a confirmed reply.
      void outcome.session.readStatus().then((statusOutcome) => {
        if (statusOutcome.ok) {
          setH158LockState(deviceId, statusOutcome.value.locked);
          setH158BatteryPercent(deviceId, statusOutcome.value.batteryPercent);
        }
      });
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

  useEffect(() => {
    const unsubscribe = scanner.subscribe(setScanState);
    if (targetDeviceId) {
      // Resuming (already covered by the `phase` initializer above) or reconnecting — either
      // way, no scan: `connectH158Session` dials a known peripheral id directly. Looks the name
      // up from the remembered-devices list purely for the "Connecting to <name>…" caption; a
      // miss (a device this app has somehow never remembered) still connects, just with a
      // generic caption, rather than blocking on it.
      if (!useH158ConnectionStore.getState().connections[targetDeviceId]) {
        void getPairedH158Devices().then((devices) => {
          const remembered = devices.find((d) => d.id === targetDeviceId);
          setPhase((current) =>
            current.kind === 'connecting' ? { kind: 'connecting', name: remembered?.name ?? null } : current,
          );
        });
        void connect(targetDeviceId, null);
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
    // `connect`/`targetDeviceId` intentionally excluded: this effect is mount-time wiring
    // (subscribe to the scanner, kick off exactly one scan-or-direct-connect), not something
    // that should re-run if `connect`'s identity changes across a re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setLastStatus(`${locked ? 'Locked' : 'Unlocked'} · ${systemStateLabel} · ${batteryPercent}% battery`);
    setH158LockState(phase.device.id, locked);
    setH158BatteryPercent(phase.device.id, batteryPercent);
  }, [phase]);

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
      setLastStatus(`${outcome.value.locked ? 'Locked' : 'Unlocked'}`);
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
   * disconnect is not a "forget" (that's Home's own "Forget device" link).
   */
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
    navigation.popToTop();
  }, [phase, manager, navigation]);

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
        <Text variant="title" tone="inverse" style={styles.title}>
          {phase.kind === 'connected' ? 'Connected' : scanningEmpty ? 'Finding your device' : 'Connect your BlueSmoke'}
        </Text>
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
          </View>
        )}

        {phase.kind === 'connected' && (
          <View style={styles.section}>
            <Card style={styles.disclosureCard}>
              <Text tone="danger" variant="caption">
                This device has no lock code — anyone nearby with Bluetooth can lock or unlock it.
              </Text>
            </Card>
            <Text variant="label" tone="inverse" style={styles.centerText}>
              {phase.device.name ?? 'BlueSmoke device'}
            </Text>
            <View style={styles.buttonRow}>
              <Button label="Read Status" onPress={readStatus} />
              <Button label="Lock" onPress={() => setLock(true)} />
              <Button label="Unlock" onPress={() => setLock(false)} />
            </View>
            {lastStatus && (
              <Card style={styles.statusCard}>
                <Text>{lastStatus}</Text>
              </Card>
            )}
            <Button label="Done" variant="secondary" onPress={() => navigation.popToTop()} />
            {/* `secondary`, not `destructive` — `Button.tsx`'s own doc reserves `destructive` for
                irreversible actions (e.g. PF-7); disconnecting the GATT link is neither
                irreversible nor unsafe — reconnecting is just tapping this device again — so this
                matches `SignOutButton`'s precedent for the same kind of lesser, reversible exit
                action rather than overstating it. */}
            <Button label="Disconnect" variant="secondary" onPress={disconnect} />
          </View>
        )}
      </ScrollView>
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
  buttonRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  messageCard: {
    padding: tokens.spacing.sm,
  },
  disclosureCard: {
    padding: tokens.spacing.sm,
  },
  statusCard: {
    padding: tokens.spacing.sm,
  },
});
