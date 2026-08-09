import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet } from 'react-native';
import { GradientGround } from '@/shared/ui';
import { useBleManager } from '@/features/ble/BleClientContext';
import {
  readBluetoothGateState,
  requestAndroidBluetoothPermission,
  type BluetoothGateState,
} from '@/features/ble/bluetoothPermission';
import { BluetoothOffScreen } from './BluetoothOffScreen';
import { BluetoothDeniedScreen } from './BluetoothDeniedScreen';
import { BluetoothBlockedScreen } from './BluetoothBlockedScreen';

export interface BluetoothGateScreenProps {
  /** Called once the real state is `poweredOn` — there's nothing to gate, so nothing renders. */
  onResolved: () => void;
}

/**
 * The ON-7/ON-8/ON-9 SELECTOR — reads real state via the BLE seam (`useBleManager().state()`,
 * P2-6.0) and picks one of three genuinely separate components. This is the piece the brief
 * calls out by name: "ON-7/8/9 resolve from real BleManager state rather than being one
 * component with a variant prop." The three screens above take no `state` prop at all — each
 * only knows how to render itself; this file is the only thing that decides which one mounts.
 *
 * Re-checks on `AppState` foreground (`USER_FLOWS.md` F1: "permission state is re-checked on
 * every app foreground") — a user who fixes Bluetooth in Settings and returns must land back
 * here already resolved, never stuck on the screen that sent them there.
 *
 * Not wired into any navigator route yet: ON-4/7/8/9 are shown at the moment of need during
 * pairing, which is Phase D's job (`UI-BUILD-B-seam-and-verification.md` §0). This component is
 * the real, working piece Phase D mounts once that trigger exists.
 */
export function BluetoothGateScreen({ onResolved }: BluetoothGateScreenProps) {
  const manager = useBleManager();
  const [state, setState] = useState<BluetoothGateState | null>(null);

  const check = useCallback(() => {
    readBluetoothGateState(manager).then(setState);
  }, [manager]);

  useEffect(() => {
    check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        check();
      }
    });
    return () => subscription.remove();
  }, [check]);

  useEffect(() => {
    if (state === 'poweredOn') {
      onResolved();
    }
  }, [state, onResolved]);

  if (state === 'poweredOff') {
    return <BluetoothOffScreen />;
  }
  if (state === 'deniedOnce') {
    return (
      <BluetoothDeniedScreen
        onTryAgain={() => {
          requestAndroidBluetoothPermission().then(check);
        }}
      />
    );
  }
  if (state === 'permanentlyDenied') {
    return <BluetoothBlockedScreen />;
  }

  // null (still checking) / 'poweredOn' (resolved, caller takes over) / 'unsupported' /
  // 'unknown' (ble-plx's own transient states) — none of these are this selector's business to
  // render a dedicated screen for; a brief spinner is honest about "still figuring this out."
  return (
    <GradientGround style={styles.centered}>
      <ActivityIndicator size="large" />
    </GradientGround>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
