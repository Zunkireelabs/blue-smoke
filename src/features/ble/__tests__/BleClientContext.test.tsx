import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  BleClientProvider,
  useBleManager,
  type BleManagerLike,
} from '../BleClientContext';

function makeFakeManager(): BleManagerLike {
  return {
    state: async () => 'PoweredOn',
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

function Probe({ onManager }: { onManager: (manager: BleManagerLike) => void }) {
  onManager(useBleManager());
  return null;
}

describe('BleClientContext', () => {
  test('BleClientProvider overrides the default and useBleManager() returns it', () => {
    const fakeManager = makeFakeManager();
    let seen: BleManagerLike | undefined;

    ReactTestRenderer.act(() => {
      ReactTestRenderer.create(
        <BleClientProvider manager={fakeManager}>
          <Probe onManager={(m) => (seen = m)} />
        </BleClientProvider>,
      );
    });

    expect(seen).toBe(fakeManager);
  });
});
