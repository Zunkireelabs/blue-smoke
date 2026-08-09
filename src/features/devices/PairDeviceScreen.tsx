import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { openSettings } from 'react-native-permissions';

import { Button, Card, EmptyState, ErrorState, LoadingState, Screen, Text, tokens } from '@/shared/ui';
import { requestBlePermissions, type BlePermissionResult } from '@/features/ble/permissions';
import { useBleScanner } from '@/features/ble/BleClientContext';
import { createDeviceScanner, type DiscoveredDevice, type ScanBlockedReason, type ScanState } from '@/features/ble/scanner';

/**
 * P1-3.0/P1-2.0 — the pairing screen: request the OS Bluetooth permission,
 * then drive `createDeviceScanner()` and render every `ScanState` it can be
 * in.
 *
 * 🔴 Deliberately does NOT render `advertisement.stateHintRaw` or
 * `.flagsRaw`. §4.1 names both fields and defines the encoding of neither —
 * see the spec gap noted in `scanner.ts` and the provenance note added to
 * `docs/TECHNICAL_SPEC.md` §4.1. Only `batteryPercent`, which §4.1 does share
 * §4.4's 0–100/0xFF-unknown convention for, is rendered.
 */
export function PairDeviceScreen() {
  const scannerLike = useBleScanner();
  const scannerRef = useRef<ReturnType<typeof createDeviceScanner> | null>(null);
  if (!scannerRef.current) {
    scannerRef.current = createDeviceScanner({ scanner: scannerLike });
  }
  const scanner = scannerRef.current;

  const [scanState, setScanState] = useState<ScanState>(() => scanner.getState());
  const [permission, setPermission] = useState<BlePermissionResult | 'checking'>('checking');

  // Scanner lifetime is tied to the screen instance, not to focus — created
  // once above, disposed once here on unmount. Starting/stopping the radio
  // scan itself is useFocusEffect's job below, so a backgrounded screen
  // doesn't keep draining the battery (P1-3.0 brief §3.4).
  useEffect(() => {
    const unsubscribe = scanner.subscribe(setScanState);
    return () => {
      unsubscribe();
      scanner.dispose();
    };
  }, [scanner]);

  const checkPermissionAndScan = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      setPermission('checking');
      const result = await requestBlePermissions();
      if (isCancelled()) {
        return;
      }
      setPermission(result);
      if (result === 'granted') {
        scanner.start();
      }
    },
    [scanner],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      checkPermissionAndScan(() => cancelled);
      return () => {
        cancelled = true;
        scanner.stop();
      };
    }, [checkPermissionAndScan, scanner]),
  );

  if (permission === 'checking') {
    return (
      <Screen>
        <LoadingState message="Checking Bluetooth permission…" />
      </Screen>
    );
  }

  if (permission === 'denied') {
    return (
      <Screen>
        <ErrorState
          title="Bluetooth permission needed"
          body="Blue Smoke needs Bluetooth permission to find your device."
          retryLabel="Allow Bluetooth"
          onRetry={() => {
            checkPermissionAndScan();
          }}
        />
      </Screen>
    );
  }

  if (permission === 'blocked') {
    return (
      <Screen>
        <ErrorState
          title="Bluetooth permission needed"
          body="You've previously denied this permission. Enable Bluetooth for Blue Smoke in Settings, then come back here."
          retryLabel="Open Settings"
          onRetry={() => {
            openSettings().catch(() => {});
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll centered={false}>
      <ScanStateView state={scanState} onRetry={() => scanner.start()} />
    </Screen>
  );
}

function ScanStateView({ state, onRetry }: { state: ScanState; onRetry: () => void }) {
  switch (state.status) {
    case 'idle':
      return <LoadingState message="Preparing scan…" />;

    case 'scanning':
      return (
        <View style={styles.list}>
          <LoadingState message="Scanning for devices…" />
          <DeviceList devices={state.devices} />
        </View>
      );

    case 'stopped':
      return (
        <View style={styles.list}>
          <DeviceList devices={state.devices} />
          <View style={styles.retryRow}>
            <Button label="Scan again" onPress={onRetry} />
          </View>
        </View>
      );

    case 'noDevicesFound':
      return (
        <EmptyState
          title="No devices found"
          body={`Make sure your device is powered on and nearby, then try again. (Searched for ${state.filteredOnServiceUuid}.)`}
        />
      );

    case 'failed':
      return <ErrorState title="Scan failed" body={state.detail} onRetry={onRetry} />;

    case 'blocked':
      return <ScanBlockedView reason={state.reason} onRetry={onRetry} />;
  }
}

function ScanBlockedView({ reason, onRetry }: { reason: ScanBlockedReason; onRetry: () => void }) {
  switch (reason) {
    case 'bluetoothOff':
      return (
        <ErrorState
          title="Bluetooth is off"
          body="Turn on Bluetooth to find your device. Scanning will resume automatically."
          retryLabel="I turned it on"
          onRetry={onRetry}
        />
      );

    case 'unauthorized':
      return (
        <ErrorState
          title="Bluetooth access needed"
          body="Blue Smoke isn't authorized to use Bluetooth. Enable it for Blue Smoke in Settings."
          retryLabel="Open Settings"
          onRetry={() => {
            openSettings().catch(() => {});
          }}
        />
      );

    case 'unsupported':
      // Terminal — no retry offered, per the brief: "unsupported → terminal, honest."
      return (
        <EmptyState
          title="Bluetooth isn't available"
          body="This device doesn't support the Bluetooth features Blue Smoke needs, so pairing isn't possible here."
        />
      );

    case 'resetting':
      return (
        <ErrorState
          title="Bluetooth is restarting"
          body="This usually clears up in a moment."
          retryLabel="Try again"
          onRetry={onRetry}
        />
      );

    case 'unknown':
      return (
        <ErrorState
          title="Bluetooth state unknown"
          body="We couldn't tell what Bluetooth is doing right now."
          retryLabel="Try again"
          onRetry={onRetry}
        />
      );
  }
}

function DeviceList({ devices }: { devices: DiscoveredDevice[] }) {
  if (devices.length === 0) {
    return null;
  }
  return (
    <View style={styles.list}>
      {devices.map((device) => (
        <DeviceRow key={device.id} device={device} />
      ))}
    </View>
  );
}

function DeviceRow({ device }: { device: DiscoveredDevice }) {
  const battery = device.advertisement?.batteryPercent ?? null;
  return (
    <Card style={styles.row} accessibilityRole="text">
      <Text variant="label">{device.name ?? 'Unnamed device'}</Text>
      <View style={styles.rowMeta}>
        <Text variant="caption" tone="secondary">
          {signalLabel(device.rssi)}
        </Text>
        {battery !== null && (
          <Text variant="caption" tone="secondary">
            {`Battery ${battery}%`}
          </Text>
        )}
      </View>
    </Card>
  );
}

/**
 * Purely a UI presentation of `rssi` (an ordinary BLE quantity every scan
 * carries, not a §4-defined field) — not to be confused with the
 * `stateHintRaw`/`flagsRaw` bytes this screen deliberately leaves unrendered.
 */
function signalLabel(rssi: number | null): string {
  if (rssi === null) {
    return 'Signal unknown';
  }
  if (rssi >= -60) {
    return `Signal: strong (${rssi} dBm)`;
  }
  if (rssi >= -75) {
    return `Signal: fair (${rssi} dBm)`;
  }
  return `Signal: weak (${rssi} dBm)`;
}

const styles = StyleSheet.create({
  list: {
    gap: tokens.spacing.md,
  },
  row: {
    gap: tokens.spacing.xs,
  },
  rowMeta: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
  },
  retryRow: {
    marginTop: tokens.spacing.md,
  },
});
