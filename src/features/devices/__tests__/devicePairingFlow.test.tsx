/**
 * End-to-end press-and-assert coverage for Home's real "Pair a device" button AND its P1-5.0
 * multi-device list, same philosophy as `auth/__tests__/deadEndExits.test.tsx`: proving a CTA
 * GOES somewhere, not just that it renders. Walks the real, composed screens (not a hand-rolled
 * stand-in for any of them) from `HomeScreen`'s "Pair a device" through to one or more connected
 * H158 devices.
 *
 * 2026-08-24 — retargeted from the §4 mock-protocol chain (`DevicePairingGateScreen.tsx` →
 * `DeviceScanScreen.tsx` → `PairingBoundaryScreen.tsx`) to the real-hardware H158 chain
 * (`H158GateScreen.tsx` → `H158PairScreen.tsx`): Home's live button now points there (see
 * `HomeScreen.tsx`'s `PairingModal.onContinue` and `TODO-phase-1.md`'s 2026-08-24 update). The
 * §4 chain stays registered in `navigation.tsx` and independently covered by
 * `DevicePairingGateScreen.test.tsx`/`DeviceScanScreen.test.tsx`/`BluetoothGateScreen.test.tsx` —
 * this file no longer duplicates that coverage, since Home's CTA no longer reaches it.
 *
 * P1-5.0 — generalised from a single-device flag to a real list: `useH158ConnectionStore` is now
 * a map keyed by device id (`__resetH158ConnectionStoreForTests` clears the whole map) and
 * `h158DeviceStorage.ts`'s remembered devices are a list backed by the same AsyncStorage mock
 * `useOnboardingStore`'s own tests reset, so this file resets both between tests. `BleClientProvider`
 * now wraps the whole navigator, not just `H158Gate` — `HomeScreen` reads it too (to decide
 * whether the ON-4 priming sheet still has anything to teach), so without it `useBleManager()`
 * would fall through to the real, lazily-constructed `BleManager`, which throws under Jest.
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
  // A connect in one test writes `h158DeviceStorage.ts`'s remembered-devices list, same
  // module-level-leak risk `__resetH158ConnectionStoreForTests` exists for above — otherwise the
  // next test's fresh `HomeScreen` render would inherit devices it never itself paired.
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
 * A manager that reports the adapter switched off. Used by the tests that need the ON-4 priming
 * sheet to actually appear: Home skips it whenever the gate already reads `poweredOn`, so a
 * "powered on" fake would never render the sheet whose "Continue"/"Not now" those tests press.
 * Nothing past the gate is reachable with Bluetooth off, so every method beyond `state()` throws
 * rather than pretending to work.
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

// Both `H158PairScreen.tsx`'s `handleDisconnectPress` and `HomeScreen.tsx`'s
// `handleConnectPress` hold their actual navigate behind a minimum-delay floor (2s) even though
// the underlying work finishes near-instantly — purely a perceived-feedback affordance (each
// one's own spinner) — so `settle()`'s single macrotask tick isn't enough to reach the
// post-navigation state a full Disconnect/Reconnect test needs to assert on. Real timer, same
// convention `settle()` above documents, not `jest.useFakeTimers()` — this file's own
// scanner-timeout tests already found that global fake timers here reintroduce the dangling-timer
// class that once hung a whole run.
async function settleMinDelay() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2100));
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
            no BLE state of its own; Home now reads `readBluetoothGateState` on focus, so it
            needs the same injected fake — without it `useBleManager()` falls through to the
            lazily-constructed real `BleManager`, which throws under Jest. */}
        <BleClientProvider manager={manager}>
          <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              <Stack.Screen name="Home">
                {/* `HomeScreen` now dials a reconnect itself (P1-5.0 follow-up, 2026-08-31)
                    through its own `H158HomeConnectAgent`, which shadows whatever's above it in
                    real navigation the same way `H158PairScreen` does — `testManager` is the
                    same escape hatch, for the same reason: without it, that agent's own
                    `useBleManager()` falls through to the real, native-backed `BleManager`,
                    which throws under Jest. */}
                {() => <HomeScreen testManager={manager} />}
              </Stack.Screen>
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

/** Drives a full scan-and-connect from Home through to a connected device, for tests whose real
 * subject is what happens AFTER that (a second pairing, a forget, a disconnect). Bluetooth is
 * already on, so `pressPairDevice` goes straight to the scan with no sheet to press through. */
async function pairDevice(renderer: ReactTestRenderer.ReactTestRenderer, deviceName: string) {
  await pressPairDevice(renderer);
  await press(renderer, `Connect to ${deviceName}`);
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
    await settle();

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
    await settle();

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
    await settle();

    expect(connectSpy).toHaveBeenCalledWith('h158-mock-0006-b');
    expect(renderedText(renderer)).toContain('Connected');
  });

  it('Disconnect drops the GATT link but Home keeps showing the device — remembered, not connected', async () => {
    const manager = buildH158FakeManager({
      id: 'h158-mock-0003',
      name: 'YP65-AT-TEST03',
      localName: null,
      rssi: -50,
      manufacturerData: null,
    });
    const cancelSpy = jest.spyOn(manager, 'cancelDeviceConnection');
    const renderer = await renderFlow(manager);

    await pairDevice(renderer, 'YP65-AT-TEST03');
    expect(renderedText(renderer)).toContain('Connected');

    await press(renderer, 'Disconnect');

    // The manager-level disconnect (not the optional `BleDeviceLike.cancelConnection`) is what
    // actually drops the link — see `H158PairScreen.tsx`'s `disconnect` callback.
    expect(cancelSpy).toHaveBeenCalledWith('h158-mock-0003');
    // `disconnect` pops back to Home. P1-5.0: a disconnect is NOT a forget — the remembered-
    // devices list (`h158DeviceStorage.ts`) is untouched, so the device still renders as its own
    // row rather than vanishing the way the old single-slot store made it (that behaviour was the
    // bug P1-5.0 exists to fix, not a feature to preserve). No "Disconnected" badge any more
    // (design ask, 2026-08-31) — the "Last connected X ago" line asserted below is what signals
    // the drop now.
    await settleMinDelay();
    expect(renderedText(renderer)).not.toContain('No devices paired');
    expect(renderedText(renderer)).toContain('YP65-AT-TEST03');
    // With zero connected devices, "Connected devices" now shows its own compact "0 connected"
    // placeholder row (design ask, 2026-08-31) rather than hiding the heading entirely — "Paired
    // devices" still follows below with the actual remembered device.
    expect(renderedText(renderer)).toContain('Connected devices');
    expect(renderedText(renderer)).toContain('0 connected');
    expect(renderedText(renderer)).toContain('No devices connected');
    expect(renderedText(renderer)).toContain('Paired devices');
    // "Last connected X ago" (design ask, 2026-08-31, reference screenshot) — `addPairedH158Device`
    // stamped this the moment `pairDevice` connected above, so right after disconnecting it reads
    // as "just now" rather than the badge being the only signal of the drop.
    expect(renderedText(renderer)).toContain('Last connected just now');
    // The "Connect ›" trailing hint (same reference screenshot) — makes explicit what tapping
    // the row already does. Checked via the chevron glyph, not the word "Connect" alone: that
    // substring is already trivially present in "Connected devices"/"Reconnect" elsewhere on this
    // screen, so it wouldn't actually catch a regression.
    expect(renderedText(renderer)).toContain('›');
  });

  it("Done leaves the device connected, and Home's connected row resumes the same controls", async () => {
    const manager = buildH158FakeManager({
      id: 'h158-mock-0004',
      name: 'YP65-AT-TEST04',
      localName: null,
      rssi: -55,
      manufacturerData: null,
    });
    const renderer = await renderFlow(manager);

    await pairDevice(renderer, 'YP65-AT-TEST04');
    expect(renderedText(renderer)).toContain('Connected');

    // "Done" only navigates back — it never disconnects (`H158Session.dispose()`'s own doc
    // comment: that's not its job). Home should show the device as connected, not empty.
    await press(renderer, 'Done');
    expect(renderedText(renderer)).toContain('YP65-AT-TEST04');
    expect(renderedText(renderer)).not.toContain('No devices paired');
    // With the only paired device now connected, "Paired devices" has nothing left in its own
    // list — it shows `NoPairedDevicesRow`'s placeholder rather than disappearing (design ask,
    // 2026-08-31), same treatment "Connected devices" already got for its own empty case.
    expect(renderedText(renderer)).toContain('Paired devices');
    expect(renderedText(renderer)).toContain('0 paired');
    expect(renderedText(renderer)).toContain('All devices connected');
    expect(renderedText(renderer)).toContain('1 connected');

    // Tapping the row re-enters H158Gate -> H158Pair with this device's id, which resumes
    // straight into the connected controls from `useH158ConnectionStore` instead of re-scanning
    // for a device that's already connected.
    await press(renderer, 'YP65-AT-TEST04, connected. Open device.');
    expect(renderedText(renderer)).toContain('Connected');
    expect(renderedText(renderer)).toContain('Disconnect');
  });

  it('P1-5.0 — pairing a SECOND device adds a row instead of replacing the first', async () => {
    // Two fully independent fake managers, exactly as pairing two different physical H158 units
    // would be — the point of this test is that connecting to the second one does not evict the
    // first from Home's list, the single-slot store's actual bug.
    const managerA = buildH158FakeManager({
      id: 'h158-mock-000a',
      name: 'YP65-AT-AAAA',
      localName: null,
      rssi: -50,
      manufacturerData: null,
    });
    const renderer = await renderFlow(managerA);

    await pairDevice(renderer, 'YP65-AT-AAAA');
    expect(renderedText(renderer)).toContain('Connected');
    await press(renderer, 'Done');
    expect(renderedText(renderer)).toContain('YP65-AT-AAAA');

    // Same fake-manager convention `H158PairScreen` itself relies on: `BleClientProvider` on the
    // `H158Pair` screen re-reads whatever `testManager` this render's tree was built with, so a
    // second call into "Pair a device" from the SAME renderer keeps using `managerA` — swap in a
    // manager whose scan/connect targets the second unit's id/name.
    const managerB = buildH158FakeManager({
      id: 'h158-mock-000b',
      name: 'YP65-AT-BBBB',
      localName: null,
      rssi: -60,
      manufacturerData: null,
    });
    const rendererB = await renderFlow(managerB);
    // Re-seed rendererB's Home with the FIRST device already paired, the way a real app would
    // have it in AsyncStorage from the earlier pairing above — `renderFlow` builds a fresh tree
    // per fake manager (mirroring `H158PairScreen`'s own per-screen `BleClientProvider` shadow),
    // but storage is a real shared module, so it already carries device A's entry here.
    expect(renderedText(rendererB)).toContain('YP65-AT-AAAA');

    await pairDevice(rendererB, 'YP65-AT-BBBB');
    expect(renderedText(rendererB)).toContain('Connected');
    await press(rendererB, 'Done');

    // BOTH devices show as their own row — this is the actual P1-5.0 assertion.
    expect(renderedText(rendererB)).toContain('YP65-AT-AAAA');
    expect(renderedText(rendererB)).toContain('YP65-AT-BBBB');
    expect(renderedText(rendererB)).not.toContain('No devices paired');
  });

  it('Forget device, from the detail screen it now lives on, removes just that row', async () => {
    // Home no longer carries a per-row "Forget device" link (moved onto H158PairScreen's own
    // connected-state controls) — this re-enters the device's detail screen the same way "Done
    // leaves the device connected..." above does, then presses Forget from there.
    const manager = buildH158FakeManagerWithDevices([
      { id: 'h158-mock-forget-a', name: 'YP65-AT-FRGT-A', localName: null, rssi: -50, manufacturerData: null },
    ]);
    const renderer = await renderFlow(manager);

    await pairDevice(renderer, 'YP65-AT-FRGT-A');
    await press(renderer, 'Done');
    expect(renderedText(renderer)).toContain('YP65-AT-FRGT-A');

    await press(renderer, 'YP65-AT-FRGT-A, connected. Open device.');
    expect(renderedText(renderer)).toContain('Connected');

    // "Forget device" now opens a confirm sheet (same pattern as ProfileScreen's "Log out?")
    // rather than forgetting immediately — the destructive action inside it is a distinct
    // control ("Confirm forget device") from the trigger, so both are findable by name.
    await press(renderer, 'Forget device');
    await settle();
    await press(renderer, 'Confirm forget device');
    await settle();

    expect(renderedText(renderer)).not.toContain('YP65-AT-FRGT-A');
    expect(renderedText(renderer)).toContain('No devices paired');
  });

  it('a device that fails to reconnect can still be forgotten, from the failed-attempt screen', async () => {
    // The gap this closes: once Home's row-level "Forget device" link was removed, the only
    // remaining path was through the `connected` phase's own Forget button — which a device
    // that's gone permanently unreachable (broken, given away, factory reset) can never reach
    // again. `H158PairScreen`'s `failed` phase carries its own Forget button for exactly this,
    // gated on `targetDeviceId` (a reconnect attempt for an already-remembered device, not a
    // fresh scan-based pairing failure with nothing remembered yet).
    const manager = buildH158FakeManagerWithDevices([
      { id: 'h158-mock-unreach-a', name: 'YP65-AT-UNREACH', localName: null, rssi: -50, manufacturerData: null },
    ]);
    const renderer = await renderFlow(manager);

    await pairDevice(renderer, 'YP65-AT-UNREACH');
    await press(renderer, 'Disconnect');
    await settleMinDelay();
    // No "Disconnected" badge any more (design ask, 2026-08-31) — "Last connected just now" is
    // what confirms the row dropped out of its connected state.
    expect(renderedText(renderer)).toContain('Last connected just now');

    // Simulate the device having gone permanently unreachable — the next connect attempt fails.
    jest.spyOn(manager, 'connectToDevice').mockRejectedValue(new Error('device unreachable'));

    // "Reconnect" now holds the actual navigate behind the same 2s minimum-delay floor
    // `HomeScreen.tsx`'s `handleConnectPress` gives the "Connect ›" hint's spinner.
    await press(renderer, 'YP65-AT-UNREACH, disconnected. Reconnect.');
    await settleMinDelay();
    expect(renderedText(renderer)).toContain("Couldn't connect");

    // Same confirm-sheet step as the "connected"-phase Forget test above.
    await press(renderer, 'Forget device');
    await settle();
    await press(renderer, 'Confirm forget device');
    await settle();

    expect(renderedText(renderer)).not.toContain('YP65-AT-UNREACH');
    expect(renderedText(renderer)).toContain('No devices paired');
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
