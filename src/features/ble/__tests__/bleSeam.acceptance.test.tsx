/**
 * P2-6.0 (UI-BUILD-B, B1) — proves the composition-root seam end to end:
 * a component that only ever calls `useBleManager()` (never `BleManager`
 * or `tools/mock-peripheral` by name) can scan, find a device, connect,
 * and read `deviceInfo` — with the manager supplied entirely through
 * `<BleClientProvider>`, exactly the shape a real screen will use once
 * Phase D builds one.
 *
 * `BleClientContext.test.tsx` already proves the context plumbing with a
 * hand-rolled fake; `deviceInfo.test.ts` already proves `readDeviceInfo()`
 * against the real mock. Neither proves both together — that the object
 * `useBleManager()` hands back through the provider is a fully working
 * manager, not just a reference. This file is that missing link.
 *
 * Lives under `src/features/ble/__tests__/`, same as `auth.test.ts` /
 * `deviceInfo.test.ts`, and for the same reason needs the same tsconfig
 * carve-out (see tsconfig.json/tsconfig.test.json) — importing
 * `tools/mock-peripheral/bleAdapter` pulls in Buffer/node:crypto, which the
 * root (app) TypeScript program deliberately excludes.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

import { createMockPeripheral } from '../../../../tools/mock-peripheral/bleAdapter';
import { FakeClock } from '../../../../tools/mock-peripheral/clock';
import { BleClientProvider, useBleManager, type BleDeviceLike, type BleManagerLike } from '../BleClientContext';
import { readDeviceInfo } from '../deviceInfo';
import { BLE_SERVICE_UUID, PROTOCOL_VERSION, ProvisioningState } from '../protocol';

const K_DEV = Uint8Array.from({ length: 16 }, (_, i) => 0x20 + i);
const DEVICE_ID = 'mock-device-0001';

function buildMockPeripheral() {
  return createMockPeripheral({
    kDev: K_DEV,
    clock: new FakeClock(0),
    deviceId: DEVICE_ID,
    provisioningState: ProvisioningState.ACTIVATED,
  });
}

/** Renders nothing — exists only to pull `useBleManager()` out of the tree for assertions. */
function ManagerProbe({ onManager }: { onManager: (manager: BleManagerLike) => void }) {
  onManager(useBleManager());
  return null;
}

function renderWithManager(manager: BleManagerLike): BleManagerLike {
  let seen!: BleManagerLike;
  act(() => {
    ReactTestRenderer.create(
      <BleClientProvider manager={manager}>
        <ManagerProbe onManager={(m) => (seen = m)} />
      </BleClientProvider>,
    );
  });
  return seen;
}

function scanOnce(manager: BleManagerLike, serviceUUIDs: string[] | null): Promise<BleDeviceLike | null> {
  return new Promise((resolve, reject) => {
    let settled = false;
    manager.startDeviceScan(serviceUUIDs, null, (error, device) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        reject(error);
        return;
      }
      resolve(device);
    });
    // The mock's scan is synchronous (bleAdapter.ts: no background loop), so a listener that
    // never fired by the time this microtask runs means the filter excluded every device.
    if (!settled) {
      resolve(null);
    }
  });
}

describe('BLE seam — a screen calling useBleManager() through BleClientProvider', () => {
  test('scans, finds the mock, connects, and reads deviceInfo — no UI-layer fakery', async () => {
    const { manager: mockManager } = buildMockPeripheral();
    const manager = renderWithManager(mockManager);

    expect(await manager.state()).toBe('PoweredOn');

    const found = await scanOnce(manager, [BLE_SERVICE_UUID]);
    expect(found).not.toBeNull();
    manager.stopDeviceScan();

    const connected = await manager.connectToDevice(found!.id);
    await connected.discoverAllServicesAndCharacteristics();
    expect(await manager.isDeviceConnected(DEVICE_ID)).toBe(true);

    const outcome = await readDeviceInfo(connected);
    expect(outcome).toMatchObject({
      ok: true,
      compatible: true,
      info: { protocolVersion: PROTOCOL_VERSION, provisioningState: ProvisioningState.ACTIVATED },
    });
  });

  test('failure path — a scan filtered on a foreign service UUID finds nothing', async () => {
    const { manager: mockManager } = buildMockPeripheral();
    const manager = renderWithManager(mockManager);

    const found = await scanOnce(manager, ['00000000-0000-0000-0000-000000000000']);
    expect(found).toBeNull();
  });

  test('failure path — an abrupt disconnect (link loss, no cancelConnection call) surfaces through the seam', async () => {
    const { manager: mockManager, device: mockDevice } = buildMockPeripheral();
    const manager = renderWithManager(mockManager);

    await manager.connectToDevice(DEVICE_ID);
    expect(await manager.isDeviceConnected(DEVICE_ID)).toBe(true);

    mockDevice.simulateAbruptDisconnect();

    expect(await manager.isDeviceConnected(DEVICE_ID)).toBe(false);
  });
});
