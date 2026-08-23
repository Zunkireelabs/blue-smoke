/**
 * DV-3/DV-4/DV-5 — the screen's own rendering contract: physical instructions while scanning,
 * a live results list, the DV-5 timeout using fake timers, and Cancel actually leaving.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Pressable, Text } from 'react-native';
import { BleClientProvider, type BleDeviceLike, type BleManagerLike } from '@/features/ble/BleClientContext';
import { SCAN_TIMEOUT_MS } from '../useDeviceScan';
import { DeviceScanScreen } from '../DeviceScanScreen';
import { findByLabel, renderedText } from '@/features/auth/testUtils';
import { flushSettled } from '@/shared/testing/renderWithEffects';

const Stack = createNativeStackNavigator();

function fakeDevice(id: string, rssi: number | null): BleDeviceLike {
  return {
    id,
    rssi,
    name: `BlueSmoke-${id}`,
    discoverAllServicesAndCharacteristics: async () => {
      throw new Error('not used by this test');
    },
    readCharacteristicForService: async () => {
      throw new Error('not used by this test');
    },
    writeCharacteristicWithResponseForService: async () => {
      throw new Error('not used by this test');
    },
    monitorCharacteristicForService: () => ({ remove: () => {} }),
  };
}

function fakeManager(devices: BleDeviceLike[]): BleManagerLike & { stopCalls: number } {
  const state = { stopCalls: 0 };
  return {
    state: async () => 'PoweredOn',
    startDeviceScan: (_serviceUUIDs, _options, listener) => {
      for (const device of devices) {
        listener(null, device);
      }
    },
    stopDeviceScan: () => {
      state.stopCalls += 1;
    },
    connectToDevice: async () => {
      throw new Error('not used by this test');
    },
    isDeviceConnected: async () => false,
    cancelDeviceConnection: async () => {
      throw new Error('not used by this test');
    },
    get stopCalls() {
      return state.stopCalls;
    },
  };
}

// `RadarSearch` mounts a `BrandMark` while scanning, which probes `AccessibilityInfo.
// isReduceMotionEnabled()` on mount — same two-microtask flush `OnboardingCarouselScreen.test.tsx`
// needs for its own `BrandMark` illustrations, or the state update it triggers lands outside any
// `act` scope and fails the suite's `console.error` guard.
async function renderScreen(manager: BleManagerLike) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <BleClientProvider manager={manager}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Home">
            <Stack.Screen name="Home">
              {({ navigation }) => (
                <Pressable accessibilityLabel="Go" onPress={() => navigation.navigate('DeviceScan')}>
                  <Text>ARRIVED HOME</Text>
                </Pressable>
              )}
            </Stack.Screen>
            <Stack.Screen name="DeviceScan" component={DeviceScanScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </BleClientProvider>,
    );
  });
  // Navigate to DeviceScan for real, so Home is genuinely behind it in the stack — required
  // for the Cancel/goBack assertions below to mean anything. This is also where `RadarSearch`
  // first mounts, hence the flush.
  await act(async () => {
    findByLabel(renderer, 'Go').props.onPress();
    await flushSettled();
  });
  return renderer;
}

// `RadarSearch` unmounts and remounts a fresh `BrandMark` across a "Scan again" press (scanning
// stops, then starts again), so this press needs the same flush `renderScreen`'s navigation does.
async function pressScanAgain(renderer: ReactTestRenderer.ReactTestRenderer) {
  await act(async () => {
    findByLabel(renderer, 'Scan again').props.onPress();
    await flushSettled();
  });
}

// When the timeout fires WITH results already found, `RadarSearch` swaps for `StaticDeviceIcon`
// — a different component, so a fresh `BrandMark` mounts and needs the same flush. (The
// zero-results timeout doesn't: that early-returns to `noDevicesFound`, which never renders
// either ring component.)
async function advanceScanTimeout() {
  await act(async () => {
    jest.advanceTimersByTime(SCAN_TIMEOUT_MS);
    await flushSettled();
  });
}

describe('DeviceScanScreen', () => {
  // Fake timers throughout — `useDeviceScan` always schedules a real 20s `setTimeout`, and a
  // test that neither advances nor unmounts the screen would otherwise leave it dangling.
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('DV-3: shows physical instructions while scanning', async () => {
    const renderer = await renderScreen(fakeManager([]));
    expect(renderedText(renderer)).toContain('Finding your device');
    expect(renderedText(renderer)).toContain('Keep your BlueSmoke nearby');
  });

  it('DV-4: found devices are listed with signal strength, and an unknown rssi says so honestly', async () => {
    const renderer = await renderScreen(
      fakeManager([fakeDevice('a', -62), fakeDevice('b', null)]),
    );
    const text = renderedText(renderer);
    expect(text).toContain('BlueSmoke-a');
    expect(text).toContain('-62 dBm');
    expect(text).toContain('BlueSmoke-b');
    expect(text).toContain('Signal unknown');
  });

  it('DV-5: after the timeout with zero results, shows the coaching state, not a diagnostic', async () => {
    const renderer = await renderScreen(fakeManager([]));

    act(() => {
      jest.advanceTimersByTime(SCAN_TIMEOUT_MS);
    });

    const text = renderedText(renderer);
    expect(text).toContain("We couldn't find it");
    expect(text).toContain('charged');
    expect(text).not.toMatch(/error|code \d/i);
  });

  it('DV-5: Scan again re-arms scanning, not stuck on the empty state', async () => {
    const renderer = await renderScreen(fakeManager([]));
    act(() => {
      jest.advanceTimersByTime(SCAN_TIMEOUT_MS);
    });
    expect(renderedText(renderer)).toContain("We couldn't find it");

    await pressScanAgain(renderer);
    expect(renderedText(renderer)).toContain('Finding your device');
  });

  it('DV-4: once the scan ends with results, it stops claiming to still be looking', async () => {
    // Regression: the spinner and "Finding your device" used to persist forever whenever
    // anything had been found, over a radio the timeout had already switched off.
    const renderer = await renderScreen(fakeManager([fakeDevice('a', -62)]));
    expect(renderedText(renderer)).toContain('Finding your device');

    await advanceScanTimeout();

    const text = renderedText(renderer);
    expect(text).not.toContain('Finding your device');
    expect(text).toContain('Finished looking');
    // The results it did find are still there — this must not become DV-5.
    expect(text).toContain('BlueSmoke-a');
    expect(text).not.toContain("We couldn't find it");
  });

  it('DV-4: Scan again is offered after a finished scan, and pressing it really re-scans', async () => {
    const renderer = await renderScreen(fakeManager([fakeDevice('a', -62)]));
    await advanceScanTimeout();
    expect(renderedText(renderer)).toContain('Finished looking');

    await pressScanAgain(renderer);

    expect(renderedText(renderer)).toContain('Finding your device');
  });

  it('Scan again is NOT offered mid-scan — it would discard results still arriving', async () => {
    const renderer = await renderScreen(fakeManager([fakeDevice('a', -62)]));
    expect(renderedText(renderer)).toContain('Finding your device');
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Scan again' })).toHaveLength(0);
  });

  it('Cancel actually leaves the screen — not a button that renders and goes nowhere', async () => {
    const renderer = await renderScreen(fakeManager([]));
    act(() => {
      findByLabel(renderer, 'Cancel').props.onPress();
    });
    expect(renderedText(renderer)).toContain('ARRIVED HOME');
  });

  it('stops the scan on unmount (navigating away via Cancel)', async () => {
    const manager = fakeManager([]);
    const renderer = await renderScreen(manager);
    act(() => {
      findByLabel(renderer, 'Cancel').props.onPress();
    });
    expect(manager.stopCalls).toBeGreaterThanOrEqual(1);
  });
});
