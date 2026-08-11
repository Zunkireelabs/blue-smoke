import { useCallback, useEffect, useRef, useState } from 'react';
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
import { BluetoothUnsupportedScreen } from './BluetoothUnsupportedScreen';
import { BluetoothCheckTimeoutScreen } from './BluetoothCheckTimeoutScreen';

export interface BluetoothGateScreenProps {
  /** Called once the real state is `poweredOn` — there's nothing to gate, so nothing renders. */
  onResolved: () => void;
}

// App-level choice, not a §4 spec value — same convention as `auth.ts:29-41`. Bounds how long
// `null`/`'unknown'` (still-checking / ble-plx's own transient `Resetting`/`Unknown`) get a bare
// spinner before P1-2.0's fix offers a way out. Real hardware settles well under a second; 8s
// leaves generous margin without leaving a genuinely stuck check spinning indefinitely, which is
// the defect this constant exists to close.
export const GATE_UNKNOWN_TIMEOUT_MS = 8000;

/**
 * The ON-7/ON-8/ON-9/ON-10 SELECTOR — reads real state via the BLE seam
 * (`useBleManager().state()`, P2-6.0) and picks one of several genuinely separate components.
 * This is the piece the brief calls out by name: "ON-7/8/9 resolve from real BleManager state
 * rather than being one component with a variant prop." None of the leaf screens take a `state`
 * prop — each only knows how to render itself; this file is the only thing that decides which
 * one mounts.
 *
 * Re-checks on `AppState` foreground (`USER_FLOWS.md` F1: "permission state is re-checked on
 * every app foreground") — a user who fixes Bluetooth in Settings and returns must land back
 * here already resolved, never stuck on the screen that sent them there.
 *
 * 🔴 P1-2.0 — `'unsupported'` and `null`/`'unknown'` used to fall through the same bare-spinner
 * branch below. They are not the same fact: `'unsupported'` is CoreBluetooth's final word that
 * this phone has no BLE radio (ON-10, terminal, no retry can help); `null`/`'unknown'` is "still
 * figuring this out," which is only honest for `GATE_UNKNOWN_TIMEOUT_MS` before it becomes an
 * unbounded `await` the *user* is stuck inside — the DoD's "every BLE operation has an explicit
 * timeout" applies here even though nothing in this file's own code ever awaits forever.
 */
export function BluetoothGateScreen({ onResolved }: BluetoothGateScreenProps) {
  const manager = useBleManager();
  const [state, setState] = useState<BluetoothGateState | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearGateTimeout = useCallback(() => {
    if (timeoutRef.current !== undefined) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const check = useCallback(() => {
    // Every call — initial mount, an `AppState` foreground re-check, or the timeout screen's
    // "Try again" — is a fresh bounded wait: clear any pending timer, drop a stale `timedOut`,
    // and re-arm. Scheduling here rather than in an effect keyed on `state` matters: if the read
    // resolves to the SAME state as before (e.g. still 'unknown'), `setState` is a no-op React
    // bails out of, so an effect keyed on `state` would never re-fire and "Try again" would stop
    // timing out on a second stuck read.
    setTimedOut(false);
    clearGateTimeout();
    timeoutRef.current = setTimeout(() => setTimedOut(true), GATE_UNKNOWN_TIMEOUT_MS);
    // A rejected `state()` read resolves to 'unknown' rather than propagating: an unhandled
    // rejection here would leave `state` null forever, which renders the same spinner but with
    // no record of why. 'unknown' is the honest answer — we asked and did not learn anything.
    readBluetoothGateState(manager).then(setState, () => setState('unknown'));
  }, [manager, clearGateTimeout]);

  useEffect(() => {
    check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        check();
      }
    });
    return () => {
      subscription.remove();
      clearGateTimeout();
    };
  }, [check, clearGateTimeout]);

  // Once the state stops being 'still figuring this out', the bounded wait is over — clear the
  // pending timer so a late firing can't flip `timedOut` true under a screen that no longer needs
  // it (harmless either way for rendering, since every conclusive branch below is checked first,
  // but a stray `setTimedOut` after the fact is exactly the kind of loose end this task is about).
  useEffect(() => {
    if (state !== null && state !== 'unknown') {
      clearGateTimeout();
    }
  }, [state, clearGateTimeout]);

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
          // Re-check on BOTH settlements. If the OS request itself rejects, a bare `.then(check)`
          // would make "Try again" a silently dead button; re-reading the real state is the
          // right response either way, since that read is what decides ON-7 vs ON-8 vs resolved.
          requestAndroidBluetoothPermission().then(check, check);
        }}
      />
    );
  }
  if (state === 'permanentlyDenied') {
    return <BluetoothBlockedScreen />;
  }
  if (state === 'unsupported') {
    return <BluetoothUnsupportedScreen />;
  }
  if (timedOut && state !== 'poweredOn') {
    // Reachable only from null/'unknown'. Every other state returned above EXCEPT 'poweredOn',
    // which deliberately falls through to the spinner while the caller takes over — so it needs
    // the explicit exclusion here rather than an early return of its own. Without it, a caller
    // that keeps this gate mounted after `onResolved` (today's `DevicePairingGateScreen` calls
    // `navigation.replace`, so it doesn't) would flip to "Still checking Bluetooth" over a
    // working radio: an `AppState` foreground re-check re-arms the timer, and the re-read
    // settling on the SAME 'poweredOn' is a no-op `setState` React bails out of, so the
    // conclusive-state effect above never re-runs to clear it.
    return <BluetoothCheckTimeoutScreen onTryAgain={check} />;
  }

  // null (still checking) / 'poweredOn' (resolved, caller takes over) / 'unknown' (ble-plx's own
  // transient states), all within GATE_UNKNOWN_TIMEOUT_MS of the most recent check() — a brief
  // spinner is honest about "still figuring this out" for exactly that long, not indefinitely.
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
