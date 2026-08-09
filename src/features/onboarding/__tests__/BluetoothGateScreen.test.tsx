/**
 * THE critical regression test the brief calls out by name: ON-7/8/9 must resolve from real
 * `BleManager` state, never be one component switched by a `variant` prop. Each case below
 * feeds a different real state through the actual seam (`BleClientProvider`) and asserts a
 * genuinely different screen's copy is on screen — not a prop value.
 */
import React from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BleClientProvider, type BleManagerLike } from '@/features/ble/BleClientContext';
import { BluetoothGateScreen } from '../BluetoothGateScreen';
import { renderedText, findByLabel } from '@/features/auth/testUtils';

function fakeManager(...states: string[]): BleManagerLike {
  let call = 0;
  return {
    state: async () => states[Math.min(call++, states.length - 1)],
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

async function renderGate(manager: BleManagerLike, onResolved = jest.fn()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(
      <BleClientProvider manager={manager}>
        <BluetoothGateScreen onResolved={onResolved} />
      </BleClientProvider>,
    );
  });
  return { renderer, onResolved };
}

describe('BluetoothGateScreen — real-state selector', () => {
  const originalOS = Platform.OS;
  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('PoweredOn resolves and renders neither ON-7, ON-8, nor ON-9', async () => {
    const { renderer, onResolved } = await renderGate(fakeManager('PoweredOn'));
    expect(onResolved).toHaveBeenCalledTimes(1);
    const text = renderedText(renderer);
    expect(text).not.toContain('Bluetooth is off');
    expect(text).not.toContain('Permission is turned off');
    expect(text).not.toContain('We need permission to continue');
  });

  it('PoweredOff renders ON-9 (Bluetooth off), never claiming we can flip the toggle', async () => {
    const { renderer, onResolved } = await renderGate(fakeManager('PoweredOff'));
    expect(renderedText(renderer)).toContain('Bluetooth is off');
    expect(renderedText(renderer)).not.toContain('Turn on Bluetooth');
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('Unauthorized on iOS renders ON-8 (permanently denied), never ON-7', async () => {
    Platform.OS = 'ios';
    const { renderer } = await renderGate(fakeManager('Unauthorized'));
    expect(renderedText(renderer)).toContain('Permission is turned off');
    expect(renderedText(renderer)).not.toContain('We need permission to continue');
  });

  it('Unauthorized on Android renders ON-7 (denied once), a genuinely different screen from ON-8', async () => {
    Platform.OS = 'android';
    const { renderer } = await renderGate(fakeManager('Unauthorized'));
    expect(renderedText(renderer)).toContain('We need permission to continue');
    expect(renderedText(renderer)).not.toContain('Permission is turned off');
  });

  it('ON-7\'s Try again re-requests, and a resulting grant re-checks state to resolve', async () => {
    Platform.OS = 'android';
    // `requestMultiple`'s real type demands every Android permission key the OS defines, not
    // just the two this module requests — the cast stays local to this one mock call.
    const requestSpy = jest.spyOn(PermissionsAndroid, 'requestMultiple').mockResolvedValue(
      {
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN]: PermissionsAndroid.RESULTS.GRANTED,
        [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]: PermissionsAndroid.RESULTS.GRANTED,
      } as unknown as Awaited<ReturnType<typeof PermissionsAndroid.requestMultiple>>,
    );
    // First manager.state() call (initial mount) reports Unauthorized; the second (triggered by
    // Try again's re-check after the OS grants) reports PoweredOn.
    const { renderer, onResolved } = await renderGate(fakeManager('Unauthorized', 'PoweredOn'));
    expect(renderedText(renderer)).toContain('We need permission to continue');

    await act(async () => {
      findByLabel(renderer, 'Try again').props.onPress();
    });

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledTimes(1);
    requestSpy.mockRestore();
  });

  it('a rejected state() read does not crash or leave an unhandled rejection', async () => {
    const failing: BleManagerLike = {
      ...fakeManager('PoweredOn'),
      state: async () => {
        throw new Error('BLE manager unavailable');
      },
    };
    const { renderer, onResolved } = await renderGate(failing);

    // Nothing decisive is claimed: not resolved, and none of the three gate screens are shown.
    expect(onResolved).not.toHaveBeenCalled();
    const text = renderedText(renderer);
    expect(text).not.toContain('Bluetooth is off');
    expect(text).not.toContain('Permission is turned off');
    expect(text).not.toContain('We need permission to continue');
  });

  it("ON-7's Try again re-checks state even when the OS request itself rejects", async () => {
    Platform.OS = 'android';
    // Regression: `requestAndroidBluetoothPermission().then(check)` with no rejection handler
    // made this a silently dead button whenever the request threw.
    const requestSpy = jest
      .spyOn(PermissionsAndroid, 'requestMultiple')
      .mockRejectedValue(new Error('activity is not available'));
    const { renderer, onResolved } = await renderGate(fakeManager('Unauthorized', 'PoweredOn'));
    expect(renderedText(renderer)).toContain('We need permission to continue');

    await act(async () => {
      findByLabel(renderer, 'Try again').props.onPress();
    });

    // The re-read still happened, so a state that changed underneath us is still picked up.
    expect(onResolved).toHaveBeenCalledTimes(1);
    requestSpy.mockRestore();
  });

  it('re-checks on AppState foreground — a fixed permission is picked up without a manual retry', async () => {
    Platform.OS = 'ios';
    const { renderer, onResolved } = await renderGate(fakeManager('PoweredOff', 'PoweredOn'));
    expect(renderedText(renderer)).toContain('Bluetooth is off');
    expect(onResolved).not.toHaveBeenCalled();

    // Invoke the listener `BluetoothGateScreen` itself registered via
    // `AppState.addEventListener('change', ...)` directly, rather than depending on the RN
    // preset mock's own event-emission mechanics, which this project doesn't otherwise rely on.
    // `.mock.calls` accumulates across every test in this file, so take the MOST RECENT
    // registration (this render's) rather than the first, which would belong to an earlier,
    // already-unmounted instance closing over a different test's manager.
    const listenerCalls = (AppState.addEventListener as jest.Mock).mock.calls;
    const changeHandler = [...listenerCalls].reverse().find(([event]) => event === 'change')?.[1];
    await act(async () => {
      changeHandler?.('active');
    });

    expect(onResolved).toHaveBeenCalledTimes(1);
  });
});
