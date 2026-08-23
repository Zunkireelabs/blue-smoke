/**
 * P1-5.0 — the device-list screen's own rendering contract: two mock peripherals connect and
 * report status independently, rename and unpair actually mutate the store, and disconnected
 * devices show no stale lock chrome.
 */
import React from 'react';
import ReactTestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { createMockBleFleet } from '../../../../tools/mock-peripheral/bleAdapter';
import { nodeDeviceCoreCrypto, nodeNonceSource } from '../../../../tools/mock-peripheral/crypto';
import { FakeClock } from '../../../../tools/mock-peripheral/clock';
import { BleClientProvider } from '@/features/ble/BleClientContext';
import { addPairedDevice, __resetDeviceStoreForTests } from '@/app/stores/useDeviceStore';
import { DeviceListScreen } from '../DeviceListScreen';
import { findByLabel, renderedText } from '@/features/auth/testUtils';

const K_DEV = Uint8Array.from({ length: 16 }, (_, i) => 0x50 + i);

function buildFleet() {
  return createMockBleFleet([
    {
      kDev: K_DEV,
      clock: new FakeClock(0),
      deviceId: 'mock-device-0001',
      initialBatteryPercent: 88,
      crypto: nodeDeviceCoreCrypto,
      nonceSource: nodeNonceSource,
    },
    {
      kDev: K_DEV,
      clock: new FakeClock(0),
      deviceId: 'mock-device-0002',
      initialBatteryPercent: 90,
      crypto: nodeDeviceCoreCrypto,
      nonceSource: nodeNonceSource,
    },
  ]);
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// `useDeviceStore` is a module-level singleton — an un-unmounted renderer from a prior test
// stays subscribed and fires an "update not wrapped in act()" warning the moment the next test
// mutates the store, even though nothing in that later test is wrong. Tracked here so `afterEach`
// can unmount it.
let activeRenderer: ReactTestRenderer.ReactTestRenderer | undefined;

function render(manager: ReturnType<typeof buildFleet>['manager']): ReactTestRenderer.ReactTestRenderer {
  act(() => {
    activeRenderer = ReactTestRenderer.create(
      <BleClientProvider manager={manager}>
        <DeviceListScreen />
      </BleClientProvider>,
    );
  });
  return activeRenderer as ReactTestRenderer.ReactTestRenderer;
}

/**
 * `Pressable` forwards `accessibilityRole`/`accessibilityLabel` down to its host node, so
 * `findAllByProps` matches two instances per button — the composite `Pressable` (which has
 * `onPress`) and its host child (which doesn't). Filtering to a callable `onPress` keeps only
 * the pressable one.
 */
function findAllPressables(renderer: ReactTestRenderer.ReactTestRenderer, label: string): ReactTestInstance[] {
  return renderer.root
    .findAllByProps({ accessibilityRole: 'button', accessibilityLabel: label })
    .filter((instance) => typeof instance.props.onPress === 'function');
}

/** Connect/Disconnect/Unpair repeat per row — order follows insertion order into the store. */
function nthButton(renderer: ReactTestRenderer.ReactTestRenderer, label: string, index: number): ReactTestInstance {
  return findAllPressables(renderer, label)[index];
}

/**
 * Once a confirmation sheet is open, its own action button shares a label with the row action
 * that opened it (e.g. two "Unpair"s: the row's and the sheet's). The sheet's is always the
 * last match — `Sheet` renders after the device list in `DeviceListScreen`'s JSX.
 */
function lastButton(renderer: ReactTestRenderer.ReactTestRenderer, label: string): ReactTestInstance {
  const matches = findAllPressables(renderer, label);
  return matches[matches.length - 1];
}

describe('DeviceListScreen', () => {
  beforeEach(() => {
    __resetDeviceStoreForTests();
  });

  afterEach(() => {
    act(() => {
      activeRenderer?.unmount();
    });
    activeRenderer = undefined;
  });

  it('shows the empty state when no device is paired', () => {
    const { manager } = buildFleet();
    const renderer = render(manager);
    expect(renderedText(renderer)).toContain('No devices paired');
  });

  it('lists every paired device, disconnected, with no lock chrome until it connects', () => {
    addPairedDevice('mock-device-0001', 'Kitchen BlueSmoke');
    addPairedDevice('mock-device-0002', 'Travel BlueSmoke');
    const { manager } = buildFleet();

    const renderer = render(manager);
    const text = renderedText(renderer);

    expect(text).toContain('Kitchen BlueSmoke');
    expect(text).toContain('Travel BlueSmoke');
    expect(text).not.toContain('Battery');
  });

  it('connecting one device leaves the other untouched — independent status and battery', async () => {
    addPairedDevice('mock-device-0001', 'Kitchen BlueSmoke');
    addPairedDevice('mock-device-0002', 'Travel BlueSmoke');
    const { manager } = buildFleet();
    const renderer = render(manager);

    await act(async () => {
      nthButton(renderer, 'Connect', 0).props.onPress();
      await flushMicrotasks();
    });

    const text = renderedText(renderer);
    expect(text).toContain('Battery 88%');
    expect(text).not.toContain('Battery 90%');
    expect(nthButton(renderer, 'Disconnect', 0)).toBeDefined();
    expect(nthButton(renderer, 'Connect', 0)).toBeDefined(); // device 2's Connect button, still present
  });

  it('disconnecting stops showing that device as connected', async () => {
    addPairedDevice('mock-device-0001', 'Kitchen BlueSmoke');
    const { manager } = buildFleet();
    const renderer = render(manager);

    await act(async () => {
      nthButton(renderer, 'Connect', 0).props.onPress();
      await flushMicrotasks();
    });
    expect(renderedText(renderer)).toContain('Connected');

    await act(async () => {
      nthButton(renderer, 'Disconnect', 0).props.onPress();
      await flushMicrotasks();
    });

    expect(renderedText(renderer)).not.toContain('"Connected"');
    expect(nthButton(renderer, 'Connect', 0)).toBeDefined();
  });

  it('renaming a device updates the list, local-only (no backend call exists yet)', () => {
    addPairedDevice('mock-device-0001', 'Old name');
    const { manager } = buildFleet();
    const renderer = render(manager);

    act(() => {
      findByLabel(renderer, 'Old name').props.onPress();
    });
    act(() => {
      findByLabel(renderer, 'Name').props.onChangeText('New name');
    });
    act(() => {
      findByLabel(renderer, 'Save').props.onPress();
    });

    const text = renderedText(renderer);
    expect(text).toContain('New name');
    expect(text).not.toContain('Old name');
  });

  it('tapping Unpair opens a confirmation sheet without removing the device yet', () => {
    addPairedDevice('mock-device-0001', 'Kitchen BlueSmoke');
    const { manager } = buildFleet();
    const renderer = render(manager);

    act(() => {
      nthButton(renderer, 'Unpair', 0).props.onPress();
    });

    expect(renderedText(renderer)).toContain('Kitchen BlueSmoke');
    expect(renderedText(renderer)).toContain('Cancel');
  });

  it('canceling the unpair sheet keeps the device paired', () => {
    addPairedDevice('mock-device-0001', 'Kitchen BlueSmoke');
    const { manager } = buildFleet();
    const renderer = render(manager);

    act(() => {
      nthButton(renderer, 'Unpair', 0).props.onPress();
    });
    act(() => {
      findByLabel(renderer, 'Cancel').props.onPress();
    });

    expect(renderedText(renderer)).toContain('Kitchen BlueSmoke');
  });

  it('confirming the unpair sheet removes the device', async () => {
    addPairedDevice('mock-device-0001', 'Kitchen BlueSmoke');
    const { manager } = buildFleet();
    const renderer = render(manager);

    act(() => {
      nthButton(renderer, 'Unpair', 0).props.onPress(); // row action — opens the sheet
    });
    await act(async () => {
      lastButton(renderer, 'Unpair').props.onPress(); // sheet's own confirm button
      await flushMicrotasks();
    });

    expect(renderedText(renderer)).toContain('No devices paired');
  });
});
