import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Badge, Button, EmptyState, GradientGround, ListRow, Sheet, Text, TextField, tokens } from '@/shared/ui';
import { LockState } from '@/features/ble/protocol';
import {
  useDeviceStore,
  removePairedDevice,
  renameDevice,
  type PairedDevice,
} from '@/app/stores/useDeviceStore';
import { useDeviceConnection } from './useDeviceConnection';

// Not a §4/§9 spec value — spec §9.3 requires "a staleness indicator" but sets no threshold for
// what counts as stale. §4.4's own notify cadence (on every state/reason/battery-threshold
// change, no periodic heartbeat) means a connected, perfectly healthy device can go minutes
// between notifications, so this has to be well above that or every idle-but-fine device would
// read as stale. A UX choice, not a protocol one — same footing as `useDeviceScan.ts`'s
// `SCAN_TIMEOUT_MS`.
export const LOCK_STATE_STALE_AFTER_MS = 2 * 60 * 1000;

function lockStateLabel(state: LockState): string {
  switch (state) {
    case LockState.LOCKED:
      return 'Locked';
    case LockState.UNLOCKED:
      return 'Unlocked';
    case LockState.LOCKED_PENDING_ACTIVATION:
      return 'Locked (pending activation)';
    case LockState.FAULT:
      return 'Fault';
  }
}

function lockStateTone(state: LockState): 'success' | 'danger' | 'neutral' {
  if (state === LockState.UNLOCKED) return 'success';
  if (state === LockState.FAULT) return 'danger';
  return 'neutral';
}

function batteryLabel(percent: number | null): string {
  return percent === null ? 'Battery unknown' : `Battery ${percent}%`;
}

function connectionLabel(status: PairedDevice['connectionStatus']): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting…';
    case 'error':
      return 'Connection failed';
    case 'disconnected':
      return 'Disconnected';
  }
}

interface DeviceRowProps {
  device: PairedDevice;
  now: number;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onRename: (device: PairedDevice) => void;
  onUnpair: (device: PairedDevice) => void;
}

function DeviceRow({ device, now, onConnect, onDisconnect, onRename, onUnpair }: DeviceRowProps) {
  const isConnected = device.connectionStatus === 'connected';
  const isBusy = device.connectionStatus === 'connecting';
  const stale = device.lock !== null && now - device.lock.updatedAt > LOCK_STATE_STALE_AFTER_MS;

  return (
    <View style={styles.card}>
      <ListRow
        label={device.nickname}
        onPress={() => onRename(device)}
        trailing={
          <Badge
            label={connectionLabel(device.connectionStatus)}
            tone={isConnected ? 'success' : device.connectionStatus === 'error' ? 'danger' : 'neutral'}
          />
        }
      />

      {device.lock && (
        <View style={styles.lockRow}>
          <Badge label={lockStateLabel(device.lock.state)} tone={lockStateTone(device.lock.state)} />
          <Text variant="caption" tone="secondary">
            {batteryLabel(device.lock.batteryPercent)}
            {device.lock.lowBattery ? ' · Low battery' : ''}
          </Text>
          {stale && (
            <Text variant="caption" tone="danger">
              Status may be out of date
            </Text>
          )}
        </View>
      )}

      <View style={styles.rowActions}>
        {isConnected ? (
          <Button label="Disconnect" variant="secondary" onPress={() => onDisconnect(device.id)} />
        ) : (
          <Button label="Connect" variant="secondary" loading={isBusy} onPress={() => onConnect(device.id)} />
        )}
        <Button label="Unpair" variant="destructive" onPress={() => onUnpair(device)} />
      </View>
    </View>
  );
}

/**
 * P1-5.0 — device list, live status, rename, unpair. Dev-only entry point today
 * (`DeviceListDevScreen.tsx`, `__DEV__`-gated like every P1-3.0 seam screen): the list has
 * nothing real to hydrate from until P1-6.0 (device↔account sync) exists, and pairing itself is
 * blocked on OQ-12, so `useDeviceStore` is populated by a dev seed rather than a bonded-device
 * fetch. Everything below this — connection, live `lockState`, rename, unpair's local half — is
 * real and exercised against the mock, not stubbed; only the data source is provisional.
 *
 * Unpair is scoped to its reachable half per the P1-5.0 brief: `FACTORY_UNPAIR` → revoke session
 * → clear `K_sess` all require a `K_sess` that doesn't exist yet (OQ-12). This flow cancels the
 * OS-level connection and drops the local record; the device-side and session-side halves stay
 * open TODO items, not silently faked here.
 */
export function DeviceListScreen() {
  // `Object.values(...)` builds a new array every call; without `useShallow`, zustand v5's
  // `useSyncExternalStore`-backed selector sees a changed reference on every render and loops.
  const devices = useDeviceStore(useShallow((s) => Object.values(s.devices)));
  const { connect, disconnect } = useDeviceConnection();
  const [renameTarget, setRenameTarget] = useState<PairedDevice | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [unpairTarget, setUnpairTarget] = useState<PairedDevice | null>(null);
  // Re-rendered on each device action rather than on a ticking timer — the staleness read only
  // needs to be fresh at the moments the list actually re-renders for another reason (a status
  // change, a rename, a mount); a live-ticking clock is more machinery than §9.3 asks for.
  const [now] = useState(() => Date.now());

  const openRename = (device: PairedDevice) => {
    setRenameDraft(device.nickname);
    setRenameTarget(device);
  };

  const confirmRename = () => {
    if (renameTarget && renameDraft.trim().length > 0) {
      renameDevice(renameTarget.id, renameDraft.trim());
    }
    setRenameTarget(null);
  };

  const confirmUnpair = async () => {
    if (!unpairTarget) return;
    await disconnect(unpairTarget.id);
    removePairedDevice(unpairTarget.id);
    setUnpairTarget(null);
  };

  if (devices.length === 0) {
    return (
      <GradientGround style={styles.centered}>
        <EmptyState title="No devices paired" body="Pair your BlueSmoke to see it here." />
      </GradientGround>
    );
  }

  return (
    <GradientGround>
      <Text variant="title" style={styles.heading}>
        Your devices
      </Text>
      <View style={styles.list}>
        {devices.map((device) => (
          <DeviceRow
            key={device.id}
            device={device}
            now={now}
            onConnect={connect}
            onDisconnect={disconnect}
            onRename={openRename}
            onUnpair={setUnpairTarget}
          />
        ))}
      </View>

      <Sheet visible={renameTarget !== null} onClose={() => setRenameTarget(null)}>
        <Text variant="title" style={styles.sheetHeading}>
          Rename device
        </Text>
        <TextField
          label="Name"
          accessibilityLabel="Name"
          value={renameDraft}
          onChangeText={setRenameDraft}
          autoFocus
        />
        <View style={styles.sheetActions}>
          <Button label="Save" onPress={confirmRename} />
          <Button label="Cancel" variant="secondary" onPress={() => setRenameTarget(null)} />
        </View>
      </Sheet>

      <Sheet visible={unpairTarget !== null} onClose={() => setUnpairTarget(null)}>
        <Text variant="title" style={styles.sheetHeading}>
          Unpair {unpairTarget?.nickname}?
        </Text>
        <Text variant="body" tone="secondary" style={styles.sheetBody}>
          This disconnects the device and removes it from this phone. You can pair it again later.
        </Text>
        <View style={styles.sheetActions}>
          <Button label="Unpair" variant="destructive" onPress={confirmUnpair} />
          <Button label="Cancel" variant="secondary" onPress={() => setUnpairTarget(null)} />
        </View>
      </Sheet>
    </GradientGround>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
  heading: {
    marginBottom: tokens.spacing.lg,
  },
  list: {
    gap: tokens.spacing.md,
  },
  card: {
    gap: tokens.spacing.sm,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.xs,
  },
  rowActions: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  sheetHeading: {
    marginBottom: tokens.spacing.sm,
  },
  sheetBody: {
    marginBottom: tokens.spacing.lg,
  },
  sheetActions: {
    marginTop: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
});
