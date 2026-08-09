/**
 * ON-7/8/9 leaf screens, individually — CTA-press tests independent of the selector
 * (`BluetoothGateScreen.test.tsx` covers state -> component routing).
 */
import React from 'react';
import { Linking } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BluetoothDeniedScreen } from '../BluetoothDeniedScreen';
import { BluetoothBlockedScreen } from '../BluetoothBlockedScreen';
import { BluetoothOffScreen } from '../BluetoothOffScreen';
import { findByLabel } from '@/features/auth/testUtils';

async function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  await act(async () => {
    findByLabel(renderer, label).props.onPress();
  });
}

describe('ON-7 — BluetoothDeniedScreen', () => {
  it('Try again calls onTryAgain', async () => {
    const onTryAgain = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<BluetoothDeniedScreen onTryAgain={onTryAgain} />);
    });

    await press(renderer, 'Try again');
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });
});

describe('ON-8 — BluetoothBlockedScreen', () => {
  it('Open Settings, with no override, calls the real Linking.openSettings', async () => {
    const spy = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<BluetoothBlockedScreen />);
    });

    await press(renderer, 'Open Settings');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('Open Settings calls an injected override when provided', async () => {
    const onOpenSettings = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<BluetoothBlockedScreen onOpenSettings={onOpenSettings} />);
    });

    await press(renderer, 'Open Settings');
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});

describe('ON-9 — BluetoothOffScreen', () => {
  it('never claims to turn Bluetooth on, and Open Settings calls Linking.openSettings', async () => {
    const spy = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<BluetoothOffScreen />);
    });

    const text = JSON.stringify(renderer.toJSON());
    expect(text).not.toContain('Turn on Bluetooth');

    await press(renderer, 'Open Settings');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
