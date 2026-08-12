/**
 * Dev-only harness for the discovery → connection flow: scan (§4.1), pick a
 * device from the results, connect (P1-7.0), and read `deviceInfo` (§4.3).
 *
 * 🔴 A DEVELOPER TOOL, not the product's pairing screen. It is mounted under
 * `__DEV__` only and drives `createDevFakeManager()`, never a radio. The real
 * pairing UX is P1-4.0/P1-6.0 and will look nothing like this; what is worth
 * keeping from here is the *flow* — scan is bounded and stoppable, the list is
 * de-duplicated, connecting is a separate step from discovering, and the
 * post-connect read is where a device stops being a name and starts being
 * facts.
 *
 * What is deliberately absent: bonding and the §4.5 handshake. Bonding is
 * OS-level and cannot be faked in-process at all; the handshake needs a
 * `K_sess` only `issue-device-session` can mint (blocked on OQ-12), and
 * showing an "authenticated" badge backed by an invented key would prove
 * nothing. So this screen stops at "connected, and here is what it says it
 * is", which is exactly as far as the honest evidence goes.
 *
 * §7.1: no lock state is shown anywhere here, and none should be added. The
 * firmware dead-man timer is the safety authority; a connection badge is not.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text, tokens } from '@/shared/ui';
import { useBleManager, type ScannedDevice } from './BleClientContext';
import { requestAndroidBluetoothPermission } from './bluetoothPermission';
import { createConnectionManager, type ConnectionState } from './connection';
import { createDevFakeManager } from './devFakeManager';
import { readDeviceInfo, type DeviceInfo } from './deviceInfo';
import { createDeviceScanner, YP65_DISCOVERY, type ScanHandle } from './scan';
import { ProvisioningState, YP65_LOCAL_NAME_PREFIX } from './protocol';

/**
 * Which radio this harness drives.
 *
 * `fake` is the in-process fixture — deterministic, no permissions, no
 * hardware, and the default so the screen still works on a simulator.
 *
 * `yp65` drives the REAL radio against the real discovery profile, and exists
 * so the transport can be exercised before the client's board is powerable.
 * A phone running nRF Connect's Peripheral mode (service 0xFFF0, five
 * Notify + Write-Without-Response characteristics) stands in for the device
 * convincingly enough to prove permissions, scanning, connection, service
 * discovery and notifications — everything except HQD's application
 * behaviour, which only the real board can answer.
 */
type RadioSource = 'fake' | 'yp65';

const SCAN_TIMEOUT_MS = 6000; // shorter than scan.ts's default: this is a demo, not a pairing session

const PROVISIONING_LABEL: Record<ProvisioningState, string> = {
  [ProvisioningState.UNPROVISIONED]: 'unprovisioned',
  [ProvisioningState.PROVISIONED]: 'provisioned',
  [ProvisioningState.ACTIVATED]: 'activated',
};

type ReadStatus =
  | { kind: 'idle' }
  | { kind: 'reading' }
  | { kind: 'ok'; info: DeviceInfo; compatible: boolean }
  | { kind: 'failed'; detail: string };

function signalLabel(rssi: number | null): string {
  if (rssi === null) {
    return 'signal unknown';
  }
  if (rssi >= -55) {
    return `${rssi} dBm · near`;
  }
  if (rssi >= -75) {
    return `${rssi} dBm · in range`;
  }
  return `${rssi} dBm · far`;
}

export function BleDiscoveryScreen() {
  const [source, setSource] = useState<RadioSource>('fake');

  // Built once for the lifetime of the screen — rebuilding either would reset
  // the state machine mid-flow.
  const fake = useMemo(() => createDevFakeManager(), []);
  const realManager = useBleManager();

  // Keyed on `source` so switching radios rebuilds the whole chain. A
  // connection manager still holding a handle to the other radio's device
  // would report a state that belongs to a link nobody is looking at.
  const manager = source === 'fake' ? fake.manager : realManager;
  const connectionManager = useMemo(() => createConnectionManager(manager), [manager]);
  const deviceScanner = useMemo(
    () =>
      source === 'fake'
        ? createDeviceScanner(fake.scanner)
        : createDeviceScanner(realManager, YP65_DISCOVERY),
    [source, fake.scanner, realManager],
  );
  const controls = fake.controls;

  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [readStatus, setReadStatus] = useState<ReadStatus>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const scanHandleRef = useRef<ScanHandle | null>(null);

  // A scan left running when the screen unmounts keeps the radio busy — the
  // one resource leak this flow can actually cause.
  useEffect(() => () => scanHandleRef.current?.stop(), []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    return connectionManager.onStateChange(selectedId, setConnectionState);
  }, [connectionManager, selectedId]);

  const handleScan = useCallback(() => {
    setDevices([]);
    setError(null);

    const begin = () => {
      setScanning(true);
      scanHandleRef.current = deviceScanner.start(
        {
          onUpdate: setDevices,
          onFinished: () => setScanning(false),
          onError: (detail) => setError(detail),
        },
        { timeoutMs: SCAN_TIMEOUT_MS },
      );
    };

    if (source === 'fake') {
      begin();
      return;
    }

    // Android 12+ refuses to scan without the runtime permission and reports
    // NO error — the callback simply never fires. That is indistinguishable
    // from "nothing in range", so ask first and say so when refused, rather
    // than letting the user watch an empty list and blame the hardware.
    requestAndroidBluetoothPermission()
      .then((outcome) => {
        if (outcome === 'granted') {
          begin();
          return;
        }
        setError(
          outcome === 'permanentlyDenied'
            ? 'Nearby-devices permission is blocked. Enable it in system settings, then scan again.'
            : 'Nearby-devices permission was denied, so the scan cannot run.',
        );
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not request Bluetooth permission.');
      });
  }, [deviceScanner, source]);

  const handleStopScan = useCallback(() => {
    scanHandleRef.current?.stop();
  }, []);

  const handleSelect = useCallback(
    (device: ScannedDevice) => {
      // Stop scanning before connecting: on a real radio, scanning while
      // connecting slows the connection down and on some Android stacks
      // fails it outright.
      scanHandleRef.current?.stop();
      setSelectedId(device.id);
      setReadStatus({ kind: 'idle' });
      setError(null);

      connectionManager
        .connect(device.id)
        .then(async () => {
          setReadStatus({ kind: 'reading' });
          // §4.3 read goes through the same `readDeviceInfo` the product will
          // use — the fake serves real 20-byte payloads, so this exercises the
          // actual parser, not a stand-in.
          const connected = await manager.connectToDevice(device.id);
          const outcome = await readDeviceInfo(connected);
          if (outcome.ok) {
            setReadStatus({ kind: 'ok', info: outcome.info, compatible: outcome.compatible });
          } else {
            setReadStatus({
              kind: 'failed',
              detail: outcome.reason === 'timeout' ? 'read timed out' : outcome.detail,
            });
          }
        })
        .catch((caught: unknown) => {
          setError(caught instanceof Error ? caught.message : 'connect failed');
          setReadStatus({ kind: 'idle' });
        });
    },
    [connectionManager, manager],
  );

  const handleDisconnect = useCallback(() => {
    if (!selectedId) {
      return;
    }
    connectionManager.disconnect(selectedId).catch(() => {});
    setReadStatus({ kind: 'idle' });
  }, [connectionManager, selectedId]);

  const handleSimulateDrop = useCallback(() => {
    controls.simulateDrop();
  }, [controls]);

  return (
    <Screen scroll centered={false}>
      <Card style={styles.block}>
        <Text variant="caption" tone="secondary">
          RADIO
        </Text>
        <View style={styles.actions}>
          <Button
            label="In-app fake"
            variant={source === 'fake' ? 'primary' : 'secondary'}
            onPress={() => setSource('fake')}
            disabled={scanning}
          />
          <Button
            label="Real radio (YP65)"
            variant={source === 'yp65' ? 'primary' : 'secondary'}
            onPress={() => setSource('yp65')}
            disabled={scanning}
          />
        </View>
        <Text variant="caption" tone="secondary">
          {source === 'fake'
            ? 'Three scripted peripherals, no radio and no permissions. Works on a simulator.'
            : `Real radio, unfiltered scan, matching names starting "${YP65_LOCAL_NAME_PREFIX}". Needs a physical device.`}
        </Text>
      </Card>

      <View style={styles.actions}>
        <Button
          label={scanning ? 'Scanning…' : 'Scan for devices'}
          onPress={handleScan}
          disabled={scanning}
        />
        {scanning ? <Button label="Stop scan" onPress={handleStopScan} /> : null}
      </View>

      {error ? (
        <Card style={styles.block}>
          <Text variant="label" tone="danger">
            {error}
          </Text>
        </Card>
      ) : null}

      <Card style={styles.block}>
        <Text variant="caption" tone="secondary">
          DISCOVERED ({devices.length})
        </Text>
        {devices.length === 0 ? (
          <Text variant="caption" tone="secondary">
            {scanning ? 'Listening for advertisements…' : 'Nothing yet — run a scan.'}
          </Text>
        ) : (
          devices.map((device) => {
            const isSelected = device.id === selectedId;
            return (
              <Pressable
                key={device.id}
                onPress={() => handleSelect(device)}
                accessibilityRole="button"
                accessibilityLabel={`Connect to ${device.name ?? device.id}`}
                style={[styles.row, isSelected && styles.rowSelected]}
              >
                <Text variant="label">{device.name ?? '(unnamed)'}</Text>
                <Text variant="caption" tone="secondary">
                  {device.id} · {signalLabel(device.rssi)}
                </Text>
              </Pressable>
            );
          })
        )}
        {scanning ? <ActivityIndicator style={styles.spinner} /> : null}
      </Card>

      {selectedId ? (
        <Card style={styles.block}>
          <Text variant="caption" tone="secondary">
            LINK
          </Text>
          <Text variant="title">{connectionState}</Text>
          <Text variant="caption" tone="secondary">
            {selectedId}
          </Text>

          {readStatus.kind === 'reading' ? (
            <Text variant="caption" tone="secondary">
              reading deviceInfo…
            </Text>
          ) : null}

          {readStatus.kind === 'failed' ? (
            <Text variant="caption" tone="danger">
              deviceInfo read failed — {readStatus.detail}
            </Text>
          ) : null}

          {readStatus.kind === 'ok' ? (
            <View style={styles.infoBlock}>
              <Text variant="caption" tone="secondary">
                §4.3 DEVICE INFO
              </Text>
              <Text variant="caption">
                protocol v{readStatus.info.protocolVersion} · hw rev {readStatus.info.hwRevision} · fw{' '}
                {readStatus.info.fwVersion.major}.{readStatus.info.fwVersion.minor}
              </Text>
              <Text variant="caption">
                {PROVISIONING_LABEL[readStatus.info.provisioningState]} · key generation{' '}
                {readStatus.info.keyGeneration}
              </Text>
              {readStatus.compatible ? (
                <Text variant="caption" tone="secondary">
                  protocol version matches this build
                </Text>
              ) : (
                <Text variant="caption" tone="danger">
                  protocol mismatch — this build speaks a different version
                </Text>
              )}
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button label="Disconnect" onPress={handleDisconnect} />
            <Button label="Simulate dropped link" onPress={handleSimulateDrop} />
          </View>
        </Card>
      ) : null}

      <Text variant="caption" tone="secondary" style={styles.footnote}>
        Fake peripherals — no Bluetooth radio. Bonding and the §4.5 handshake are absent by design;
        the handshake needs a server-issued session key.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: tokens.spacing.sm, marginBottom: tokens.spacing.md },
  block: { gap: tokens.spacing.xs, marginBottom: tokens.spacing.lg },
  row: {
    paddingVertical: tokens.spacing.md,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    gap: 2,
  },
  rowSelected: { backgroundColor: tokens.color.backgroundMuted },
  spinner: { marginTop: tokens.spacing.sm },
  infoBlock: { gap: 2, marginTop: tokens.spacing.sm },
  footnote: { marginTop: tokens.spacing.md, textAlign: 'center' },
});
