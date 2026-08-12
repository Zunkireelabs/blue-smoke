/**
 * P1-3.0 — regression cover for the documented `BluetoothGateScreen` trap, specific to THIS
 * caller's wiring: an inline `onResolved` arrow would change identity every render and re-fire
 * the gate's resolve effect. `DevicePairingGateScreen`'s `handleResolved` is `useCallback`'d
 * against `navigation`, which stays referentially stable across re-renders of a mounted screen
 * — this proves that stability holds even when something ABOVE this screen re-renders it
 * repeatedly after the gate has already resolved: a broken version would re-run
 * `navigation.replace('DeviceScan')` on every one of those re-renders, remounting `DeviceScan`
 * and restarting its BLE scan each time. `startDeviceScan`'s call count is the observable half
 * of "did this loop".
 */
import React, { useReducer, type MutableRefObject } from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BleClientProvider, type BleManagerLike } from '@/features/ble/BleClientContext';
import { DevicePairingGateScreen } from '../DevicePairingGateScreen';
import { DeviceScanScreen } from '../DeviceScanScreen';
import { renderedText } from '@/features/auth/testUtils';

const Stack = createNativeStackNavigator();

function fakeManager(scanCalls: { count: number }): BleManagerLike {
  return {
    state: async () => 'PoweredOn',
    startDeviceScan: (_serviceUUIDs, _options, _listener) => {
      scanCalls.count += 1;
    },
    stopDeviceScan: () => {},
    connectToDevice: async () => {
      throw new Error('not used by this test');
    },
    isDeviceConnected: async () => false,
    cancelDeviceConnection: async () => {
      throw new Error('not used by this test');
    },
    // Required by BleManagerLike since P1-7.0. This screen never connects, so it never
    // subscribes — a no-op subscription rather than a throw, so the fake stays inert
    // instead of turning an unrelated future change into a failure here.
    onDeviceDisconnected: () => ({ remove() {} }),
  };
}

function TickWrapper({
  manager,
  tickRef,
}: {
  manager: BleManagerLike;
  tickRef: MutableRefObject<(() => void) | undefined>;
}) {
  const [, forceTick] = useReducer((c: number) => c + 1, 0);
  tickRef.current = forceTick;
  return (
    <BleClientProvider manager={manager}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="BluetoothGate" component={DevicePairingGateScreen} />
          <Stack.Screen name="DeviceScan" component={DeviceScanScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </BleClientProvider>
  );
}

describe('DevicePairingGateScreen — onResolved stability across re-renders', () => {
  // `DeviceScanScreen` schedules a real 20s `setTimeout` (`useDeviceScan`) the moment it
  // mounts, which this test never advances or unmounts — fake timers keep that from dangling.
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('replaces to DeviceScan exactly once even when forced to re-render repeatedly after resolving', async () => {
    const scanCalls = { count: 0 };
    const manager = fakeManager(scanCalls);
    const tickRef: MutableRefObject<(() => void) | undefined> = { current: undefined };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<TickWrapper manager={manager} tickRef={tickRef} />);
      // Forced synchronously, in the same tick as mount — `manager.state()` is an async
      // function with no internal `await`, so its `.then(setState, ...)` continuation is a
      // microtask that hasn't run yet. This re-renders `DevicePairingGateScreen` three times
      // WHILE it is still resolving (`state` still null): exactly the window where an unstable
      // `onResolved` identity would matter, well before any navigation.replace() has happened.
      tickRef.current?.();
      tickRef.current?.();
      tickRef.current?.();
    });

    expect(renderedText(renderer)).toContain('Looking for your device…');
    expect(scanCalls.count).toBe(1);

    // Force five re-renders of everything ABOVE DevicePairingGateScreen, well after resolution.
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        tickRef.current?.();
      });
    }

    // A stable onResolved never re-fires the effect, so DeviceScan is never remounted and never
    // restarts its scan — still exactly one startDeviceScan call.
    expect(scanCalls.count).toBe(1);
    expect(renderedText(renderer)).toContain('Looking for your device…');
  });
});
