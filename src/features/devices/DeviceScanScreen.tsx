import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, GradientGround, ListRow, Text, tokens } from '@/shared/ui';
import type { RootStackParamList } from '@/app/navigation';
import { useDeviceScan, type ScannedDevice } from './useDeviceScan';

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
      <GradientGround style={styles.centered}>
        <Text variant="title" style={styles.centerText}>
          We couldn&apos;t find it
        </Text>
        <Text variant="body" tone="secondary" style={styles.centerText}>
          A few things to check: is it charged, is it within arm&apos;s reach, and is it already
          paired to another phone?
        </Text>
        <View style={styles.actions}>
          <Button label="Scan again" onPress={restart} />
          <Button label="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
        </View>
      </GradientGround>
    );
  }

  const isScanning = status === 'scanning';

  return (
    <GradientGround>
      {/*
        The header states what is ACTUALLY happening. Once the scan has stopped, the spinner and
        the "looking" copy both go — claiming to still be searching over a radio that is off is
        the same class of lie as rendering "unlocked" before the device confirms it.
      */}
      <View style={styles.header}>
        {isScanning && <ActivityIndicator size="large" />}
        <Text variant="title" style={styles.centerText}>
          {isScanning ? 'Looking for your device…' : 'Finished looking'}
        </Text>
        <Text variant="body" tone="secondary" style={styles.centerText}>
          {isScanning
            ? "Hold your BlueSmoke close and make sure it's switched on."
            : "Don't see the one you want? Scan again with it closer to your phone."}
        </Text>
      </View>

      {devices.length > 0 && (
        <View style={styles.results}>
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
        </View>
      )}

      <View style={styles.actions}>
        {/* Only once the scan has actually ended — offering it mid-scan would invite restarting
            a scan that is still working, and throw away results already on screen. */}
        {!isScanning && <Button label="Scan again" onPress={restart} />}
        <Button label="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      </View>
    </GradientGround>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
  centerText: {
    textAlign: 'center',
  },
  header: {
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.xl,
  },
  results: {
    gap: tokens.spacing.sm,
  },
  resultsLabel: {
    marginBottom: tokens.spacing.xs,
  },
  actions: {
    marginTop: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
});
