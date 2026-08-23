/**
 * P1-3.0 — end-to-end press-and-assert coverage for F7.1-F7.5, same philosophy as
 * `auth/__tests__/deadEndExits.test.tsx`: proving a CTA GOES somewhere, not just that it
 * renders. Walks the real, composed screens (not a hand-rolled stand-in for any of them) from
 * `HomeScreen`'s "Pair a device" through to the hard boundary at device selection, against the
 * real mock peripheral (`tools/mock-peripheral`) per CLAUDE.md's BLE testing rule.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform } from 'react-native';

import { createMockPeripheral } from '../../../../tools/mock-peripheral/bleAdapter';
import { FakeClock } from '../../../../tools/mock-peripheral/clock';
import { nodeDeviceCoreCrypto, nodeNonceSource } from '../../../../tools/mock-peripheral/crypto';
import { BleClientProvider, type BleManagerLike } from '@/features/ble/BleClientContext';
import { HomeScreen } from '../HomeScreen';
import { DevicePairingPrimingScreen } from '../DevicePairingPrimingScreen';
import { DevicePairingGateScreen } from '../DevicePairingGateScreen';
import { DeviceScanScreen } from '../DeviceScanScreen';
import { PairingBoundaryScreen } from '../PairingBoundaryScreen';
import { findByLabel, renderedText } from '@/features/auth/testUtils';

const Stack = createNativeStackNavigator();

// `useDeviceScan`'s 20s timeout is a REAL, un-mocked timer in these tests — left running past
// the test that scheduled it, it's exactly the dangling-timer class that once hung a whole jest
// run (see transportErrorAndPending.test.tsx's own note on this). Unmounting fires the hook's
// cleanup, clearing it.
const renderers: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of renderers.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
});

function renderFlow(manager: BleManagerLike) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <BleClientProvider manager={manager}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="BluetoothPriming" component={DevicePairingPrimingScreen} />
            <Stack.Screen name="BluetoothGate" component={DevicePairingGateScreen} />
            <Stack.Screen name="DeviceScan" component={DeviceScanScreen} />
            <Stack.Screen name="DevicePairingBoundary" component={PairingBoundaryScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </BleClientProvider>,
    );
  });
  renderers.push(renderer);
  return renderer;
}

async function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  await act(async () => {
    await findByLabel(renderer, label).props.onPress();
  });
}

// HomeScreen's `PairingModal` opens straight into the "We need Bluetooth to pair" dialog — this
// just waits a beat (real timers, matching the rest of this file's convention) for it to settle
// so `findByLabel(renderer, 'Continue' | 'Not now')` has something to find.
async function openPairingDialog(renderer: ReactTestRenderer.ReactTestRenderer) {
  await press(renderer, 'Pair a device');
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('F7.1-F7.5 — device pairing, Home through the hard boundary', () => {
  const K_DEV = Uint8Array.from({ length: 16 }, (_, i) => 0x30 + i);

  it('Pair a device -> priming -> gate -> scan -> select -> the honest not-yet-implemented boundary', async () => {
    const { manager } = createMockPeripheral({
      kDev: K_DEV,
      clock: new FakeClock(0),
      deviceId: 'mock-device-0001',
      crypto: nodeDeviceCoreCrypto,
      nonceSource: nodeNonceSource,
    });
    const renderer = renderFlow(manager);

    expect(renderedText(renderer)).toContain('No devices paired');
    await openPairingDialog(renderer);
    expect(renderedText(renderer)).toContain('We need Bluetooth to pair');

    await press(renderer, 'Continue');
    // The gate resolves against the mock's `state()` ('PoweredOn') and replaces to DeviceScan,
    // which shows this same "Finding your device" copy for its real scan.
    expect(renderedText(renderer)).toContain('Finding your device');

    // The mock's single device advertises `BLE_SERVICE_UUID` and is found synchronously.
    expect(renderedText(renderer)).toContain('BlueSmoke-');

    await press(renderer, 'BlueSmoke-0000');
    // Never a fake success or a fake progress screen (CLAUDE.md / the brief's hard boundary).
    // Note: react-native-screens keeps every pushed screen mounted, so `renderedText` here
    // includes Home's and the priming screen's copy too ("Pair a device" etc.) — this asserts
    // the exact boundary copy landed, rather than a blanket substring check that the earlier
    // screens' own legitimate text would trip.
    expect(renderedText(renderer)).toContain("Pairing isn't finished in this build yet");
  });

  it('"Not now" on the priming screen returns to the device list, not a dead end', async () => {
    const { manager } = createMockPeripheral({
      kDev: K_DEV,
      clock: new FakeClock(0),
      crypto: nodeDeviceCoreCrypto,
      nonceSource: nodeNonceSource,
    });
    const renderer = renderFlow(manager);

    await openPairingDialog(renderer);
    expect(renderedText(renderer)).toContain('We need Bluetooth to pair');

    await press(renderer, 'Not now');
    expect(renderedText(renderer)).toContain('No devices paired');
  });

  it('F7.E1 — Bluetooth off resolves to ON-9 through the real composed flow, not a rebuilt copy of it', async () => {
    const offManager: BleManagerLike = {
      state: async () => 'PoweredOff',
      startDeviceScan: () => {
        throw new Error('not used by this test');
      },
      stopDeviceScan: () => {},
      connectToDevice: async () => {
        throw new Error('not used by this test');
      },
      isDeviceConnected: async () => false,
      cancelDeviceConnection: async () => {
        throw new Error('not used by this test');
      },
    };
    const renderer = renderFlow(offManager);

    await openPairingDialog(renderer);
    await press(renderer, 'Continue');

    expect(renderedText(renderer)).toContain('Bluetooth is off');
    expect(renderedText(renderer)).not.toContain('Finding your device');
  });

  it('F7.E2 — permission denied (Android) resolves to ON-7 through the real composed flow', async () => {
    const originalOS = Platform.OS;
    Platform.OS = 'android';
    try {
      const deniedManager: BleManagerLike = {
        state: async () => 'Unauthorized',
        startDeviceScan: () => {
          throw new Error('not used by this test');
        },
        stopDeviceScan: () => {},
        connectToDevice: async () => {
          throw new Error('not used by this test');
        },
        isDeviceConnected: async () => false,
        cancelDeviceConnection: async () => {
          throw new Error('not used by this test');
        },
      };
      const renderer = renderFlow(deniedManager);

      await openPairingDialog(renderer);
      await press(renderer, 'Continue');

      expect(renderedText(renderer)).toContain('We need permission to continue');
      expect(renderedText(renderer)).not.toContain('Finding your device');
    } finally {
      Platform.OS = originalOS;
    }
  });
});
