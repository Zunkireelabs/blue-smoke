/**
 * P1-3.0/P1-2.0 — drives `PairDeviceScreen` against the real mock peripheral
 * through `BleClientProvider`, the same seam `MockAuthClient`/`AuthClientProvider`
 * tests use. `@testing-library/react-native` is not installed (a deliberate
 * package.json-avoidance decision recorded in `src/features/auth/testUtils.ts`);
 * this follows the same react-test-renderer + `testUtils` convention as the
 * auth-screen tests instead of adding it.
 */
import React from 'react';
import { AppState, Platform } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { checkMultiple, requestMultiple } from 'react-native-permissions';

import { createMockPeripheral } from '../../../../tools/mock-peripheral/bleAdapter';
import { FakeClock } from '../../../../tools/mock-peripheral/clock';
import { BleClientProvider, type BleManagerLike, type BleScannerLike } from '@/features/ble/BleClientContext';
import { ADVERTISING_MANUFACTURER_DATA_OFFSETS, BLE_SERVICE_UUID, PROTOCOL_VERSION } from '@/features/ble/protocol';
import { PairDeviceScreen } from '../PairDeviceScreen';
import { findByLabel, renderedText } from '@/features/auth/testUtils';
import type { RootStackParamList } from '@/app/navigation';

// requestMultiple is only ever reached on the Android branch (permissions.ts short-circuits
// to 'granted' on iOS without calling it) — mocked unconditionally so the iOS-path tests below
// never touch it, and the Android describe block controls its resolved value per test.
jest.mock('react-native-permissions', () => ({
  PERMISSIONS: {
    ANDROID: { BLUETOOTH_SCAN: 'BLUETOOTH_SCAN', BLUETOOTH_CONNECT: 'BLUETOOTH_CONNECT' },
  },
  RESULTS: {
    UNAVAILABLE: 'unavailable',
    BLOCKED: 'blocked',
    DENIED: 'denied',
    GRANTED: 'granted',
    LIMITED: 'limited',
  },
  requestMultiple: jest.fn(),
  checkMultiple: jest.fn(),
  openSettings: jest.fn().mockResolvedValue(undefined),
}));

const mockRequestMultiple = requestMultiple as unknown as jest.MockedFunction<
  (permissions: string[]) => Promise<Record<string, string>>
>;
const mockCheckMultiple = checkMultiple as unknown as jest.MockedFunction<
  (permissions: string[]) => Promise<Record<string, string>>
>;

/**
 * P1-7.0 — the seam PairDeviceScreen's foreground-recovery coordinator runs
 * against: RN's real `AppState` throws under Jest (no native module), so
 * `addEventListener`/`currentState` are stubbed directly on the real
 * singleton, same shape as `appState.test.ts`'s `FakeAppState` but applied to
 * the actual object the screen imports.
 */
function mockAppStateTransitions() {
  let listener: ((state: string) => void) | undefined;
  Object.defineProperty(AppState, 'currentState', { value: 'active', writable: true, configurable: true });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
    if (type === 'change') {
      listener = handler as (state: string) => void;
    }
    return { remove: () => { listener = undefined; } };
  });
  return {
    emit(state: string) {
      Object.defineProperty(AppState, 'currentState', { value: state, writable: true, configurable: true });
      listener?.(state);
    },
  };
}

const K_DEV = Uint8Array.from({ length: 16 }, (_, i) => 0x10 + i);

function manufacturerData(batteryPercent: number): Uint8Array {
  const bytes = new Uint8Array(4);
  bytes[ADVERTISING_MANUFACTURER_DATA_OFFSETS.protocolVersion] = PROTOCOL_VERSION;
  bytes[ADVERTISING_MANUFACTURER_DATA_OFFSETS.stateHint] = 0;
  bytes[ADVERTISING_MANUFACTURER_DATA_OFFSETS.battery] = batteryPercent;
  bytes[ADVERTISING_MANUFACTURER_DATA_OFFSETS.flags] = 0;
  return bytes;
}

function setup(extra: Parameters<typeof createMockPeripheral>[0] extends infer T ? Partial<T> : never = {}) {
  return createMockPeripheral({
    kDev: K_DEV,
    clock: new FakeClock(0),
    advertisedRssi: -50,
    manufacturerData: manufacturerData(77),
    ...extra,
  } as never);
}

const Stack = createNativeStackNavigator<Pick<RootStackParamList, 'PairDevice'>>();

// PairDeviceScreen's useEffect cleanup (scanner.dispose()) only runs on unmount — leaving a
// renderer mounted past a test's end leaks its scan timer into later tests/teardown ("import
// after the Jest environment has been torn down"). Every renderer this suite creates is tracked
// here and unmounted in the afterEach below, so no test has to remember to do it by hand.
let mountedRenderers: ReactTestRenderer.ReactTestRenderer[] = [];

afterEach(() => {
  act(() => {
    mountedRenderers.forEach((renderer) => renderer.unmount());
  });
  mountedRenderers = [];
});

function renderScreen(manager: BleManagerLike) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    renderer = ReactTestRenderer.create(
      <NavigationContainer>
        <BleClientProvider manager={manager}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="PairDevice" component={PairDeviceScreen} />
          </Stack.Navigator>
        </BleClientProvider>
      </NavigationContainer>,
    );
  });
  mountedRenderers.push(renderer);
  return renderer;
}

describe('PairDeviceScreen — iOS (default under the jest preset)', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  });

  test('lists a discovered device with its name, signal strength, and battery', async () => {
    const { manager } = setup();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderScreen(manager);
    });

    const text = renderedText(renderer);
    expect(text).toContain('BlueSmoke-0000');
    expect(text).toContain('-50 dBm');
    expect(text).toContain('Battery 77%');
    expect(mockRequestMultiple).not.toHaveBeenCalled();

    // 🔴 §4.1 gap: stateHint/flags encoding is undefined — never rendered raw.
    expect(text).not.toContain('stateHintRaw');
    expect(text).not.toContain('flagsRaw');
  });

  test('an empty room times out into noDevicesFound, naming the filtered service UUID', async () => {
    // createMockPeripheral() always advertises at least its primary device on
    // startDeviceScan() (bleAdapter.ts), so a genuinely empty room needs a
    // hand-rolled double instead — same approach scanner.test.ts's own
    // fakeScanner() takes for this exact path.
    const manager: BleManagerLike & BleScannerLike = {
      async state() {
        return 'PoweredOn';
      },
      async connectToDevice() {
        throw new Error('not used by this screen');
      },
      async isDeviceConnected() {
        return false;
      },
      async cancelDeviceConnection() {
        throw new Error('not used by this screen');
      },
      onStateChange(listener, emitCurrentState) {
        if (emitCurrentState) {
          listener('PoweredOn');
        }
        return { remove: () => undefined };
      },
      startDeviceScan() {
        // Never advertises anything — the empty room.
      },
      stopDeviceScan() {},
    };

    jest.useFakeTimers();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderScreen(manager);
    });
    // scanner.ts's default SCAN_TIMEOUT_MS is 15s.
    await act(async () => {
      jest.advanceTimersByTime(15_000);
    });

    const text = renderedText(renderer);
    expect(text).toContain('No devices found');
    expect(text).toContain(BLE_SERVICE_UUID);
    jest.useRealTimers();
  });

  test('Bluetooth off blocks the scan with a distinct message, and turning it back on resumes with no tap', async () => {
    const { manager } = setup();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderScreen(manager);
    });

    await act(async () => {
      manager.setAdapterState('PoweredOff');
    });
    expect(renderedText(renderer)).toContain('Bluetooth is off');

    await act(async () => {
      manager.setAdapterState('PoweredOn');
    });
    expect(renderedText(renderer)).toContain('BlueSmoke-0000');
  });

  test('stops the radio scan when the screen unmounts', async () => {
    const { manager } = setup();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderScreen(manager);
    });
    expect(manager.isScanning()).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
    expect(manager.isScanning()).toBe(false);
  });
});

describe('PairDeviceScreen — Android permission gate', () => {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    Object.defineProperty(Platform, 'Version', { value: 33, configurable: true });
    mockRequestMultiple.mockReset();
    mockCheckMultiple.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    Object.defineProperty(Platform, 'Version', { value: originalVersion, configurable: true });
  });

  test('a denied permission blocks the scan and offers a distinct re-prompt, not Settings', async () => {
    mockRequestMultiple.mockResolvedValue({ BLUETOOTH_SCAN: 'denied', BLUETOOTH_CONNECT: 'denied' });
    const { manager } = setup();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderScreen(manager);
    });

    const text = renderedText(renderer);
    expect(text).toContain('Bluetooth permission needed');
    expect(findByLabel(renderer, 'Allow Bluetooth')).toBeTruthy();
    // The scan never starts — no device row should appear.
    expect(text).not.toContain('BlueSmoke-0000');
  });

  test('a permanently-blocked permission routes to Settings, a different action than denied', async () => {
    mockRequestMultiple.mockResolvedValue({ BLUETOOTH_SCAN: 'blocked', BLUETOOTH_CONNECT: 'granted' });
    const { manager } = setup();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderScreen(manager);
    });

    expect(findByLabel(renderer, 'Open Settings')).toBeTruthy();
  });

  test('a granted permission proceeds to scan', async () => {
    mockRequestMultiple.mockResolvedValue({ BLUETOOTH_SCAN: 'granted', BLUETOOTH_CONNECT: 'granted' });
    const { manager } = setup();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderScreen(manager);
    });

    expect(renderedText(renderer)).toContain('BlueSmoke-0000');
  });

  test('P1-2.0 item 8 — blocked, user returns from Settings granted: the screen scans, without a second OS prompt', async () => {
    mockRequestMultiple.mockResolvedValue({ BLUETOOTH_SCAN: 'blocked', BLUETOOTH_CONNECT: 'granted' });
    mockCheckMultiple.mockResolvedValue({ BLUETOOTH_SCAN: 'granted', BLUETOOTH_CONNECT: 'granted' });
    const appState = mockAppStateTransitions();
    const { manager } = setup();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = renderScreen(manager);
    });

    expect(findByLabel(renderer, 'Open Settings')).toBeTruthy();
    expect(mockRequestMultiple).toHaveBeenCalledTimes(1);

    // The user leaves for Settings (backgrounding this app) and returns having granted it.
    await act(async () => {
      appState.emit('background');
      appState.emit('active');
    });

    expect(renderedText(renderer)).toContain('BlueSmoke-0000');
    expect(mockCheckMultiple).toHaveBeenCalledTimes(1);
    // The proof: foreground recovery used check, never request — a second
    // request would mean a second unescapable OS prompt.
    expect(mockRequestMultiple).toHaveBeenCalledTimes(1);
  });
});
