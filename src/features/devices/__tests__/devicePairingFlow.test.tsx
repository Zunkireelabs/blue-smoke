/**
 * End-to-end press-and-assert coverage for Home's real "Pair a device" button, same philosophy
 * as `auth/__tests__/deadEndExits.test.tsx`: proving a CTA GOES somewhere, not just that it
 * renders. Walks the real, composed screens (not a hand-rolled stand-in for any of them) from
 * `HomeScreen`'s "Pair a device" through to a connected H158 device.
 *
 * 2026-08-24 — retargeted from the §4 mock-protocol chain (`DevicePairingGateScreen.tsx` →
 * `DeviceScanScreen.tsx` → `PairingBoundaryScreen.tsx`) to the real-hardware H158 chain
 * (`H158GateScreen.tsx` → `H158PairScreen.tsx`): Home's live button now points there (see
 * `HomeScreen.tsx`'s `PairingModal.onContinue` and `TODO-phase-1.md`'s 2026-08-24 update). The
 * §4 chain stays registered in `navigation.tsx` and independently covered by
 * `DevicePairingGateScreen.test.tsx`/`DeviceScanScreen.test.tsx`/`BluetoothGateScreen.test.tsx` —
 * this file no longer duplicates that coverage, since Home's CTA no longer reaches it.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PermissionsAndroid, Platform } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  BleClientProvider,
  type BleAdvertisementLike,
  type BleDeviceLike,
  type BleManagerLike,
} from '@/features/ble/BleClientContext';
import { HomeScreen } from '../HomeScreen';
import { H158GateScreen } from '../H158GateScreen';
import { H158PairScreen } from '../H158PairScreen';
import { __resetH158ConnectionStoreForTests } from '@/features/ble/h158/useH158ConnectionStore';
import { findByLabel, renderedText } from '@/features/auth/testUtils';

const Stack = createNativeStackNavigator();

// Granted by default — none of these tests exercise the runtime-permission-ungranted case
// itself (that's `BluetoothGateScreen.test.tsx`'s job); this just keeps `readBluetoothGateState`
// falling through to the adapter-state mapping these tests actually assert on.
let checkSpy: jest.SpyInstance;
beforeEach(() => {
  checkSpy = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
});
afterEach(() => {
  checkSpy.mockRestore();
});

// `createDeviceScanner`'s scan timeout is a REAL, un-mocked timer in these tests — left running
// past the test that scheduled it, it's exactly the dangling-timer class that once hung a whole
// jest run (see transportErrorAndPending.test.tsx's own note on this). Unmounting fires the
// scanner's own dispose-on-unmount cleanup, clearing it.
const renderers: ReactTestRenderer.ReactTestRenderer[] = [];
// `HomeScreen`'s hero now reads `useProfile()` (display-name greeting), which needs a real
// `QueryClientProvider` ancestor — same pattern as `ProfileScreen.test.tsx`. No session is set
// here, so `useProfile`'s query stays `enabled: false` (userId is null) and never actually hits
// the network; this client exists only so the hook doesn't throw for lack of context.
const clients: QueryClient[] = [];

afterEach(() => {
  for (const renderer of renderers.splice(0)) {
    act(() => {
      renderer.unmount();
    });
  }
  for (const client of clients.splice(0)) {
    client.clear();
  }
  __resetH158ConnectionStoreForTests();
  // A connect in one test (e.g. "Done leaves the device connected…") writes
  // `h158DeviceStorage.ts`'s remembered-device flag, same module-level-leak risk
  // `__resetH158ConnectionStoreForTests` exists for above — otherwise the next test's fresh
  // `HomeScreen` render would inherit a device it never itself connected.
  (AsyncStorage as unknown as { __resetMockStorage: () => void }).__resetMockStorage();
});

function buildFakeDevice(advertisement: BleAdvertisementLike): BleDeviceLike {
  const device: BleDeviceLike = {
    id: advertisement.id,
    name: advertisement.name,
    rssi: advertisement.rssi,
    discoverAllServicesAndCharacteristics: async function (this: void) {
      return device;
    },
    readCharacteristicForService: async () => {
      throw new Error('not used by this test');
    },
    writeCharacteristicWithResponseForService: async () => {
      throw new Error('not used by this test');
    },
    monitorCharacteristicForService: () => ({ remove: () => {} }),
  };
  return device;
}

/**
 * A minimal `BleManagerLike` that also duck-types `BleScannerLike` (structural cast in
 * `useBleScanner()`) — same double-duty shape `scanner.test.ts`'s `fakeScanner()` and
 * `DeviceScanScreen.test.tsx`'s `fakeManager()` each cover one half of; H158PairScreen needs
 * both halves at once, since it drives `createDeviceScanner` (needs `onStateChange`) and
 * `connectH158Session` (needs the connect/discover/subscribe trio) from the same object.
 *
 * Supports firing the scan listener with more than one advertisement at once, so a test can
 * cover two H158 units discovered simultaneously (per the hardware notes, two physical units can
 * share one advertised name) — `connectToDevice`/`cancelDeviceConnection` look their target up
 * by id rather than always returning a single fixed device, so pressing a specific chip/row
 * connects to the correct one.
 */
function buildH158FakeManagerWithDevices(advertisements: BleAdvertisementLike[]): BleManagerLike {
  const devices = advertisements.map(buildFakeDevice);
  const findDevice = (id: string): BleDeviceLike => {
    const device = devices.find((candidate) => candidate.id === id);
    if (!device) {
      throw new Error(`buildH158FakeManagerWithDevices: no fake device registered for id ${id}`);
    }
    return device;
  };

  return {
    state: async () => 'PoweredOn',
    // Not part of `BleManagerLike`'s declared shape — added for `useBleScanner()`'s structural
    // cast, same as the real `BleManager`/`MockBleManager` (see `BleClientContext.tsx`).
    onStateChange(listener: (state: string) => void, emitCurrentState?: boolean) {
      if (emitCurrentState) {
        listener('PoweredOn');
      }
      return { remove: () => {} };
    },
    startDeviceScan: (_serviceUUIDs, _options, listener) => {
      advertisements.forEach((advertisement) => listener(null, advertisement as unknown as BleDeviceLike));
    },
    stopDeviceScan: () => {},
    connectToDevice: async (id: string) => findDevice(id),
    isDeviceConnected: async () => true,
    cancelDeviceConnection: async (id: string) => findDevice(id),
  } as BleManagerLike;
}

function buildH158FakeManager(advertisement: BleAdvertisementLike): BleManagerLike {
  return buildH158FakeManagerWithDevices([advertisement]);
}

/**
 * A manager that reports the adapter switched off. Used by the two tests that need the ON-4
 * priming sheet to actually appear: Home now skips it whenever the gate already reads
 * `poweredOn`, so a "powered on" fake would never render the sheet whose "Continue"/"Not now"
 * those tests press. Nothing past the gate is reachable with Bluetooth off, so every method
 * beyond `state()` throws rather than pretending to work.
 */
function buildPoweredOffManager(): BleManagerLike {
  return {
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
}

// Flushes the pending async reads the screens sit on — Home's `readBluetoothGateState` focus
// read, the gate's own `state()` read, a connect. Real timers, matching this file's convention.
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderFlow(manager: BleManagerLike) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <QueryClientProvider client={queryClient}>
        {/* One provider above the whole navigator, exactly where `AppProviders` puts it in the
            real app. It used to wrap only `H158Gate`, which was enough while `HomeScreen` read
            no BLE state of its own; Home now reads `readBluetoothGateState` on focus to decide
            whether the ON-4 priming sheet still teaches anything, so it needs the same injected
            fake — without it `useBleManager()` falls through to the lazily-constructed real
            `BleManager`, which throws under Jest. */}
        <BleClientProvider manager={manager}>
          <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Home" component={HomeScreen} />
              {/* H158GateScreen reuses BluetoothGateScreen directly, no nested provider of its
                  own — it reads whatever manager `BleClientProvider` supplies above, same as the
                  real app reads whatever `AppProviders` supplies. */}
              <Stack.Screen name="H158Gate" component={H158GateScreen} />
              <Stack.Screen name="H158Pair">
                {/* H158PairScreen deliberately shadows whatever's above it in real navigation
                    (see its own header comment) — `testManager` is the escape hatch that exists
                    solely so this test can inject a fake `BleManagerLike` instead of the real,
                    native-backed `BleManager`, which throws under Jest. */}
                {() => <H158PairScreen testManager={manager} />}
              </Stack.Screen>
            </Stack.Navigator>
          </NavigationContainer>
        </BleClientProvider>
      </QueryClientProvider>,
    );
  });
  renderers.push(renderer);
  // Home reads the Bluetooth gate state on focus to decide whether the ON-4 priming sheet still
  // teaches anything. Settling here rather than leaving it to whatever the first assertion
  // happens to await is the difference between these tests exercising that decision and passing
  // by accident on a flag that hadn't resolved yet.
  await settle();
  return renderer;
}

async function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  await act(async () => {
    await findByLabel(renderer, label).props.onPress();
  });
}

/**
 * Home's "Pair a device" CTA. Where it lands now depends on the Bluetooth gate state Home read
 * on focus: with the radio already `poweredOn` it goes straight to `H158Gate` (which resolves
 * immediately and replaces to the scan), and only otherwise does `PairingModal` open the ON-4
 * "We need Bluetooth to pair" sheet whose "Continue"/"Not now" the callers below press. Each
 * test asserts which of the two it got rather than this helper assuming either.
 */
async function pressPairDevice(renderer: ReactTestRenderer.ReactTestRenderer) {
  await press(renderer, 'Pair a device');
  await settle();
}

describe('Home -> real H158 pairing, through to a connected device', () => {
  it('Pair a device -> gate -> scan -> select -> connected, with the no-lock-code disclosure shown', async () => {
    const manager = buildH158FakeManager({
      id: 'h158-mock-0001',
      name: 'YP65-AT-TEST01',
      localName: null,
      rssi: -55,
      manufacturerData: null,
    });
    const renderer = await renderFlow(manager);

    expect(renderedText(renderer)).toContain('No devices paired');
    await pressPairDevice(renderer);
    // Bluetooth is already `poweredOn` here, so the ON-4 priming sheet is skipped entirely: the
    // gate resolves against the fake manager's `state()` and replaces straight to H158Pair,
    // which shows its own scanning UI for the real scan.
    expect(renderedText(renderer)).not.toContain('We need Bluetooth to pair');
    expect(renderedText(renderer)).toContain('Connect your BlueSmoke');

    // The fake manager's single advertisement matches H158_DEVICE_NAME_PREFIX and is found
    // synchronously.
    expect(renderedText(renderer)).toContain('YP65-AT-TEST01');

    // The results card only appears once the scan itself stops (not mid-scan) — the ring chip
    // is the only way to connect while still actively scanning.
    await press(renderer, 'Connect to YP65-AT-TEST01');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(renderedText(renderer)).toContain('Connected');
    // §13.3's no-auth reality, surfaced honestly rather than any "Secured"/padlock claim.
    expect(renderedText(renderer)).toContain('This device has no lock code');
  });

  it('the radar chip is a second way to trigger the same connect as its list row', async () => {
    const manager = buildH158FakeManager({
      id: 'h158-mock-0005',
      name: 'YP65-AT-TEST05',
      localName: null,
      rssi: -50,
      manufacturerData: null,
    });
    const renderer = await renderFlow(manager);

    await pressPairDevice(renderer);
    // Both the `ListRow` (label: the bare device name) and `DeviceRadar`'s chip (label: "Connect
    // to <name>" — distinct on purpose, see `DeviceRadar.tsx`'s `RadarDeviceChip` doc comment)
    // are present for the same found device.
    expect(renderedText(renderer)).toContain('YP65-AT-TEST05');

    // Press the CHIP, not the row — proves the chip reaches the exact same connected state via
    // its own `onSelectDevice` call, not a separate/divergent code path.
    await press(renderer, 'Connect to YP65-AT-TEST05');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(renderedText(renderer)).toContain('Connected');
    expect(renderedText(renderer)).toContain('This device has no lock code');
  });

  it('two H158 units found at once (sharing one advertised name) both connect correctly, no crash', async () => {
    const manager = buildH158FakeManagerWithDevices([
      { id: 'h158-mock-0006-a', name: 'YP65-AT-TEST06', localName: null, rssi: -50, manufacturerData: null },
      { id: 'h158-mock-0006-b', name: 'YP65-AT-TEST06', localName: null, rssi: -70, manufacturerData: null },
    ]);
    const connectSpy = jest.spyOn(manager, 'connectToDevice');
    const renderer = await renderFlow(manager);

    await pressPairDevice(renderer);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // Both units get their own chip (distinct ids -> distinct slots, no overlap/duplicate-key
    // crash) even though they share one advertised name — the results card itself is still
    // hidden here (scan hasn't stopped yet), so the chips are what's actually rendered.
    // `Pressable` matches more than once per instance here (its own composite fiber plus the
    // internal host `View`(s) it renders, none of which carry a real `onPress`) — filtering for
    // an actual function is what narrows this down to exactly one match per chip, same idea as
    // `touchTarget.test.ts`'s `findHostByProps` narrowing composite-vs-host matches, just picking
    // the opposite side (the pressable itself, not its host).
    const chips = renderer.root
      .findAllByProps({ accessibilityLabel: 'Connect to YP65-AT-TEST06' })
      .filter((instance) => typeof instance.props.onPress === 'function');
    expect(chips).toHaveLength(2);

    // Connecting via the SECOND unit's chip must reach the second unit's id, not silently
    // connect to whichever device happened to render first.
    await act(async () => {
      await chips[1].props.onPress();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(connectSpy).toHaveBeenCalledWith('h158-mock-0006-b');
    expect(renderedText(renderer)).toContain('Connected');
  });

  it('Disconnect drops the GATT link and Home stops showing the device as connected', async () => {
    const manager = buildH158FakeManager({
      id: 'h158-mock-0003',
      name: 'YP65-AT-TEST03',
      localName: null,
      rssi: -50,
      manufacturerData: null,
    });
    const cancelSpy = jest.spyOn(manager, 'cancelDeviceConnection');
    const renderer = await renderFlow(manager);

    await pressPairDevice(renderer);
    await press(renderer, 'Connect to YP65-AT-TEST03');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(renderedText(renderer)).toContain('Connected');

    await press(renderer, 'Disconnect');

    // The manager-level disconnect (not the optional `BleDeviceLike.cancelConnection`) is what
    // actually drops the link — see `H158PairScreen.tsx`'s `disconnect` callback.
    expect(cancelSpy).toHaveBeenCalledWith('h158-mock-0003');
    // `disconnect` pops back to Home. `useH158ConnectionStore` no longer has a live device, but
    // `disconnect()` never touches `h158DeviceStorage.ts`'s remembered device — a disconnect is
    // not a "forget" — so Home still shows the row, now as Disconnected, rather than falling
    // back to the empty state a real, previously-paired device shouldn't ever hit.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(renderedText(renderer)).not.toContain('No devices paired');
    expect(renderedText(renderer)).toContain('YP65-AT-TEST03');
    expect(renderedText(renderer)).toContain('Disconnected');
  });

  it("Done leaves the device connected, and Home's connected card resumes the same controls", async () => {
    const manager = buildH158FakeManager({
      id: 'h158-mock-0004',
      name: 'YP65-AT-TEST04',
      localName: null,
      rssi: -55,
      manufacturerData: null,
    });
    const renderer = await renderFlow(manager);

    await pressPairDevice(renderer);
    await press(renderer, 'Connect to YP65-AT-TEST04');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(renderedText(renderer)).toContain('Connected');

    // "Done" only navigates back — it never disconnects (`H158Session.dispose()`'s own doc
    // comment: that's not its job). Home should show the device as connected, not empty.
    await press(renderer, 'Done');
    expect(renderedText(renderer)).toContain('YP65-AT-TEST04');
    expect(renderedText(renderer)).not.toContain('No devices paired');

    // Tapping the connected card re-enters H158Gate -> H158Pair, which now resumes straight into
    // the connected controls from `useH158ConnectionStore` instead of re-scanning for a device
    // that's already connected.
    await press(renderer, 'YP65-AT-TEST04, connected. Open device.');
    expect(renderedText(renderer)).toContain('Connected');
    expect(renderedText(renderer)).toContain('Disconnect');
  });

  it('"Pair a device" with a device already connected skips the priming sheet, not re-primes', async () => {
    // The reported bug, in its worst-looking form: a device is connected and Bluetooth is
    // plainly working, and "+ Pair a device" still opened "We need Bluetooth to pair" — ON-4
    // copy that explains a permission the user has visibly already granted. Walked through a
    // real connect first (rather than seeding the store) so the assertion is about the state a
    // user actually arrives in.
    const manager = buildH158FakeManager({
      id: 'h158-mock-0007',
      name: 'YP65-AT-TEST07',
      localName: null,
      rssi: -55,
      manufacturerData: null,
    });
    const renderer = await renderFlow(manager);

    await pressPairDevice(renderer);
    await press(renderer, 'Connect to YP65-AT-TEST07');
    await settle();
    await press(renderer, 'Done');
    expect(renderedText(renderer)).toContain('Connected');

    await pressPairDevice(renderer);
    expect(renderedText(renderer)).not.toContain('We need Bluetooth to pair');
    // Where it lands instead is `H158PairScreen` resuming the live session (see the "Done leaves
    // the device connected" test above) — not a fresh scan. That is the honest current
    // behaviour, not the intended end state: with one connection slot there is nowhere for a
    // second device to go, so "Pair a device" can only ever return you to the one you have.
    // P1-5.0's device list is what makes this CTA mean "add another".
    expect(renderedText(renderer)).toContain('Disconnect');
  });

  it('"Not now" on the pairing dialog returns to the device list, not a dead end', async () => {
    // Bluetooth off, so the priming sheet this test exists to escape from is actually shown —
    // with the radio on, Home skips it and there is no "Not now" to press.
    const renderer = await renderFlow(buildPoweredOffManager());

    await pressPairDevice(renderer);
    expect(renderedText(renderer)).toContain('We need Bluetooth to pair');

    await press(renderer, 'Not now');
    expect(renderedText(renderer)).toContain('No devices paired');
  });

  it('Bluetooth off resolves to ON-9 through the real composed gate, not a rebuilt copy of it', async () => {
    const renderer = await renderFlow(buildPoweredOffManager());

    await pressPairDevice(renderer);
    await press(renderer, 'Continue');

    expect(renderedText(renderer)).toContain('Bluetooth is off');
    expect(renderedText(renderer)).not.toContain('Connect your BlueSmoke');
  });

  it('permission denied (Android) resolves to ON-7 through the real composed gate', async () => {
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
      const renderer = await renderFlow(deniedManager);

      await pressPairDevice(renderer);
      await press(renderer, 'Continue');

      expect(renderedText(renderer)).toContain('We need permission to continue');
      expect(renderedText(renderer)).not.toContain('Connect your BlueSmoke');
    } finally {
      Platform.OS = originalOS;
    }
  });
});
