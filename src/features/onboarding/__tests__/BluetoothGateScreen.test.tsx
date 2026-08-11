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
import { BluetoothGateScreen, GATE_UNKNOWN_TIMEOUT_MS } from '../BluetoothGateScreen';
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

// File-wide, not just the P1-2.0 describe block below: `check()` now arms a real
// `GATE_UNKNOWN_TIMEOUT_MS` `setTimeout` on every call, including every render in the describe
// block above. None of those tests unmount their renderer, so under real timers that setTimeout
// outlives the test and fires after Jest's environment has torn down ("Cannot log after tests are
// done"). Fake timers file-wide sidestep that: a pending fake timer is simply discarded when
// `jest.useRealTimers()` runs, never firing for real.
beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

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

/**
 * P1-2.0 — the defect this branch fixes: `'unsupported'` and `null`/`'unknown'` used to share one
 * bare-spinner branch, so a phone with no BLE radio hung forever behind the exact same spinner as
 * a transient "still checking." These two facts are asserted as genuinely different screens, the
 * same way the describe block above proves ON-7/8/9 aren't one component with a variant prop.
 */
describe('BluetoothGateScreen — ON-10 and the recoverable timeout (P1-2.0)', () => {
  it("Unsupported renders ON-10, a terminal screen distinct from the bare spinner and every other gate screen", async () => {
    const { renderer, onResolved } = await renderGate(fakeManager('Unsupported'));
    const text = renderedText(renderer);
    expect(text).toContain("This phone can't pair with BlueSmoke");
    expect(text).not.toContain('Bluetooth is off');
    expect(text).not.toContain('Permission is turned off');
    expect(text).not.toContain('We need permission to continue');
    expect(text).not.toContain('Still checking Bluetooth');
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('ON-10 never offers Open Settings — there is no radio for Settings to enable', async () => {
    const { renderer } = await renderGate(fakeManager('Unsupported'));
    expect(renderedText(renderer)).not.toContain('Open Settings');
  });

  it("Unsupported never times out into the recoverable screen — it is a final answer, not a still-checking state", async () => {
    const { renderer } = await renderGate(fakeManager('Unsupported'));
    act(() => {
      jest.advanceTimersByTime(GATE_UNKNOWN_TIMEOUT_MS);
    });
    expect(renderedText(renderer)).toContain("This phone can't pair with BlueSmoke");
  });

  it('an unresolved/Unknown state shows a bare spinner before the timeout, not the recoverable screen', async () => {
    const { renderer } = await renderGate(fakeManager('Unknown'));
    const text = renderedText(renderer);
    expect(text).not.toContain('Still checking Bluetooth');
    expect(text).not.toContain("This phone can't pair with BlueSmoke");
  });

  it('an Unknown state that never resolves flips to the recoverable timeout screen after GATE_UNKNOWN_TIMEOUT_MS', async () => {
    const { renderer, onResolved } = await renderGate(fakeManager('Unknown'));

    act(() => {
      jest.advanceTimersByTime(GATE_UNKNOWN_TIMEOUT_MS);
    });

    expect(renderedText(renderer)).toContain('Still checking Bluetooth');
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("Try again on the timeout screen genuinely re-checks — a resolved PoweredOn still resolves the gate", async () => {
    const { renderer, onResolved } = await renderGate(fakeManager('Unknown', 'PoweredOn'));

    act(() => {
      jest.advanceTimersByTime(GATE_UNKNOWN_TIMEOUT_MS);
    });
    expect(renderedText(renderer)).toContain('Still checking Bluetooth');

    await act(async () => {
      findByLabel(renderer, 'Try again').props.onPress();
    });

    expect(onResolved).toHaveBeenCalledTimes(1);
  });

  it('Try again re-arms its own fresh timeout — a second stuck read times out again rather than hanging silently', async () => {
    const { renderer } = await renderGate(fakeManager('Unknown', 'Unknown'));

    act(() => {
      jest.advanceTimersByTime(GATE_UNKNOWN_TIMEOUT_MS);
    });
    expect(renderedText(renderer)).toContain('Still checking Bluetooth');

    await act(async () => {
      findByLabel(renderer, 'Try again').props.onPress();
    });
    // The re-check's own read is still in flight (async manager.state()) — back to the bare
    // spinner, not stuck showing stale "Still checking" copy from the previous attempt.
    expect(renderedText(renderer)).not.toContain('Still checking Bluetooth');

    act(() => {
      jest.advanceTimersByTime(GATE_UNKNOWN_TIMEOUT_MS);
    });
    expect(renderedText(renderer)).toContain('Still checking Bluetooth');
  });

  it('a RESOLVED gate never flips to the timeout screen on a foreground re-check, even if the caller keeps it mounted', async () => {
    // The trap: `poweredOn` is the one state with no early return of its own — it falls through
    // to the spinner while the caller navigates away. A foreground re-check re-arms the timer,
    // and because the re-read resolves to the SAME 'poweredOn', `setState` is a no-op React bails
    // out of, so the conclusive-state effect never re-runs to clear it. Today's only caller
    // (`DevicePairingGateScreen`) calls `navigation.replace` on resolve, so the gate unmounts and
    // this cannot bite in production — this test exists so the NEXT caller, one that keeps the
    // gate mounted, doesn't silently render "Still checking Bluetooth" over a working radio.
    const { renderer, onResolved } = await renderGate(fakeManager('PoweredOn'));
    expect(onResolved).toHaveBeenCalledTimes(1);

    const listenerCalls = (AppState.addEventListener as jest.Mock).mock.calls;
    const changeHandler = [...listenerCalls].reverse().find(([event]) => event === 'change')?.[1];
    await act(async () => {
      changeHandler?.('active');
    });

    act(() => {
      jest.advanceTimersByTime(GATE_UNKNOWN_TIMEOUT_MS);
    });

    expect(renderedText(renderer)).not.toContain('Still checking Bluetooth');
  });

  it('reaching a conclusive state before the timeout clears the pending timer — no stray flip to the timeout screen', async () => {
    const { renderer } = await renderGate(fakeManager('PoweredOff'));
    expect(renderedText(renderer)).toContain('Bluetooth is off');

    act(() => {
      jest.advanceTimersByTime(GATE_UNKNOWN_TIMEOUT_MS);
    });

    expect(renderedText(renderer)).toContain('Bluetooth is off');
    expect(renderedText(renderer)).not.toContain('Still checking Bluetooth');
  });
});
