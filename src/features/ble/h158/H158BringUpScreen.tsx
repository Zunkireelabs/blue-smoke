import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Screen, Text, tokens } from '@/shared/ui';
import { useBleManager, useBleScanner } from '@/features/ble/BleClientContext';
import { createDeviceScanner, type DiscoveredDevice, type ScanState } from '@/features/ble/scanner';

import { H158_DEVICE_NAME_PREFIX } from './h158Protocol';
import { connectH158Session, type H158Session } from './h158Session';

/**
 * Dev-only bring-up spike for the real H158/YP65-AT hardware — NOT the §4
 * pairing flow (`PairDeviceScreen.tsx`, untouched). Deliberately plain:
 * scan → device list → connect → raw TX/RX hex log → Read Status / Lock /
 * Unlock. Modelled on the manufacturer's own `MainActivity` and
 * `docs/ble-manual-test.md`
 * (docs/hardware/manufacturer-supplied-2026-08-17/H158-itronlib-sdk/), so a
 * discrepancy against their reference app is directly comparable.
 *
 * The hex log is the actual deliverable of this spike: a ground-truth trace
 * of real bytes exchanged with real hardware, which nothing in this repo
 * has produced before. See docs/hardware/hqd-device-architecture.md for
 * where to file a captured trace.
 *
 * Registered behind `__DEV__` in navigation.tsx — see that file's route.
 */

interface LogEntry {
  direction: 'tx' | 'rx' | 'info';
  text: string;
  atMs: number;
}

type ConnectionPhase =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected'; session: H158Session }
  | { kind: 'failed'; detail: string };

export function H158BringUpScreen() {
  const scannerLike = useBleScanner();
  const manager = useBleManager();

  const scannerRef = useRef<ReturnType<typeof createDeviceScanner> | null>(null);
  if (!scannerRef.current) {
    scannerRef.current = createDeviceScanner({
      scanner: scannerLike,
      // H158/YP65-AT doesn't advertise a service UUID (reply item 5) — see
      // scanner.ts's DeviceScanFilter doc.
      filter: { serviceUuids: null, namePrefix: H158_DEVICE_NAME_PREFIX },
    });
  }
  const scanner = scannerRef.current;

  const [scanState, setScanState] = useState<ScanState>(() => scanner.getState());
  const [phase, setPhase] = useState<ConnectionPhase>({ kind: 'idle' });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const sessionRef = useRef<H158Session | null>(null);

  useEffect(() => {
    const unsubscribe = scanner.subscribe(setScanState);
    scanner.start();
    return () => {
      unsubscribe();
      scanner.dispose();
      sessionRef.current?.dispose();
    };
  }, [scanner]);

  const appendLog = useCallback((entry: Omit<LogEntry, 'atMs'>) => {
    setLog((prev) => [...prev.slice(-49), { ...entry, atMs: Date.now() }]);
  }, []);

  const connect = useCallback(
    async (device: DiscoveredDevice) => {
      scanner.stop();
      setPhase({ kind: 'connecting' });
      appendLog({ direction: 'info', text: `connecting to ${device.name ?? device.id}…` });

      const outcome = await connectH158Session(manager, device.id, (direction, hex) => {
        appendLog({ direction, text: hex });
      });

      if (!outcome.ok) {
        const detail = outcome.reason === 'timeout' ? `timeout at stage "${outcome.stage}"` : outcome.detail;
        appendLog({ direction: 'info', text: `connect failed: ${detail}` });
        setPhase({ kind: 'failed', detail });
        return;
      }

      sessionRef.current = outcome.session;
      appendLog({ direction: 'info', text: 'connected' });
      setPhase({ kind: 'connected', session: outcome.session });
    },
    [manager, scanner, appendLog],
  );

  const readStatus = useCallback(async () => {
    if (phase.kind !== 'connected') {
      return;
    }
    const outcome = await phase.session.readStatus();
    if (!outcome.ok) {
      appendLog({ direction: 'info', text: `read status failed: ${outcome.reason}` });
      return;
    }
    const { locked, systemStateLabel, batteryPercent } = outcome.value;
    setLastStatus(`${locked ? 'Locked' : 'Unlocked'} · ${systemStateLabel} · ${batteryPercent}% battery`);
  }, [phase, appendLog]);

  const setLock = useCallback(
    async (locked: boolean) => {
      if (phase.kind !== 'connected') {
        return;
      }
      const outcome = await phase.session.setChildLock(locked);
      if (!outcome.ok) {
        appendLog({ direction: 'info', text: `${locked ? 'lock' : 'unlock'} failed: ${outcome.reason}` });
        return;
      }
      setLastStatus((prev) => (prev ? prev.replace(/^(Locked|Unlocked)/, outcome.value.locked ? 'Locked' : 'Unlocked') : null));
    },
    [phase, appendLog],
  );

  return (
    <Screen scroll centered={false}>
      <View style={styles.section}>
        <Text variant="label">H158 bring-up (dev only)</Text>
        <Text variant="caption" tone="secondary">
          Real hardware, real bytes — not the §4 pairing flow.
        </Text>
      </View>

      {phase.kind === 'idle' && (
        <View style={styles.section}>
          <ScanSection state={scanState} onSelect={connect} />
        </View>
      )}

      {phase.kind === 'connecting' && (
        <View style={styles.section}>
          <Text>Connecting…</Text>
        </View>
      )}

      {phase.kind === 'failed' && (
        <View style={styles.section}>
          <Text tone="danger">Connect failed: {phase.detail}</Text>
          <Button label="Back to scan" onPress={() => setPhase({ kind: 'idle' })} />
        </View>
      )}

      {phase.kind === 'connected' && (
        <View style={styles.section}>
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
        </View>
      )}

      <View style={styles.section}>
        <Text variant="label">Frame log</Text>
        <ScrollView style={styles.log}>
          {log.map((entry, i) => (
            <Text key={i} variant="caption" tone={entry.direction === 'info' ? 'secondary' : undefined}>
              {`${entry.direction.toUpperCase().padEnd(4)} ${entry.text}`}
            </Text>
          ))}
        </ScrollView>
      </View>
    </Screen>
  );
}

function ScanSection({
  state,
  onSelect,
}: {
  state: ScanState;
  onSelect: (device: DiscoveredDevice) => void;
}) {
  switch (state.status) {
    case 'idle':
      return <Text>Starting scan…</Text>;
    case 'blocked':
      return <Text tone="danger">Bluetooth blocked: {state.reason}</Text>;
    case 'failed':
      return <Text tone="danger">Scan failed: {state.detail}</Text>;
    case 'noDevicesFound':
      return (
        <EmptyState
          title={`No "${H158_DEVICE_NAME_PREFIX}" devices found`}
          body="Press the device's button once to start advertising — it drops back into sleep after 10 minutes idle."
        />
      );
    case 'scanning':
    case 'stopped':
      return (
        <View style={styles.deviceList}>
          {state.devices.length === 0 && <Text tone="secondary">Scanning…</Text>}
          {state.devices.map((device) => (
            <Card key={device.id} style={styles.deviceRow}>
              <Text variant="label">{device.name ?? 'Unnamed device'}</Text>
              <Text variant="caption" tone="secondary">
                {device.id} · {device.rssi ?? '?'} dBm
              </Text>
              <Button label="Connect" onPress={() => onSelect(device)} />
            </Card>
          ))}
        </View>
      );
  }
}

const styles = StyleSheet.create({
  section: {
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  statusCard: {
    padding: tokens.spacing.sm,
  },
  deviceList: {
    gap: tokens.spacing.sm,
  },
  deviceRow: {
    gap: tokens.spacing.xs,
  },
  log: {
    maxHeight: 240,
    backgroundColor: tokens.color.backgroundMuted,
  },
});
