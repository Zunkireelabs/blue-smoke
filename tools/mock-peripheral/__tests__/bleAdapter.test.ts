import { createMockPeripheral } from '../bleAdapter';
import { FakeClock } from '../clock';
import {
  AUTOLOCK_GRACE_MS_DEFAULT,
  BLE_CHARACTERISTIC_UUIDS,
  BLE_SERVICE_UUID,
  COMMAND_RESULT_LAYOUT,
  CommandId,
  DEVICE_INFO_LAYOUT,
  LOCK_STATE_LAYOUT,
  LockState,
  PROTOCOL_VERSION,
  ProvisioningState,
  ResultCode,
} from '../../../src/features/ble/protocol';
import { buildHandshakeFrames, buildLockCommandFrame } from './harness';

const K_DEV = Buffer.alloc(16, 0x88);
const SESSION_ID = Buffer.alloc(16, 0x99);

function decode(base64: string): Buffer {
  return Buffer.from(base64, 'base64');
}

describe('bleAdapter — Layer 2 in-process ble-plx-shaped adapter', () => {
  test('full sequence: connect → handshake → activate → unlock → walk away → auto-lock', async () => {
    const clock = new FakeClock(0);
    const { manager, device, core } = createMockPeripheral({ kDev: K_DEV, clock });

    expect(await manager.state()).toBe('PoweredOn');

    const found: string[] = [];
    manager.startDeviceScan([BLE_SERVICE_UUID], null, (error, scanned) => {
      expect(error).toBeNull();
      if (scanned) found.push(scanned.id);
    });
    expect(found).toEqual([device.id]);

    const connected = await manager.connectToDevice(device.id);
    await connected.discoverAllServicesAndCharacteristics();
    expect(await manager.isDeviceConnected(device.id)).toBe(true);

    const infoBytes = decode((await connected.readCharacteristicForService(
      BLE_SERVICE_UUID,
      BLE_CHARACTERISTIC_UUIDS.deviceInfo,
    )).value);
    expect(infoBytes[DEVICE_INFO_LAYOUT.protocolVersion.offset]).toBe(PROTOCOL_VERSION);

    const commandResults: number[] = [];
    connected.monitorCharacteristicForService(BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUIDS.commandResult, (error, characteristic) => {
      expect(error).toBeNull();
      commandResults.push(decode(characteristic!.value)[COMMAND_RESULT_LAYOUT.resultCode.offset]);
    });

    const nonceBytes = decode(
      (await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUIDS.authChallenge)).value,
    );

    const { frame1, frame2, kSess } = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce: nonceBytes,
      expiresAtDeltaSeconds: 3600,
    });
    await connected.writeCharacteristicWithResponseForService(
      BLE_SERVICE_UUID,
      BLE_CHARACTERISTIC_UUIDS.authResponse,
      frame1.toString('base64'),
    );
    await connected.writeCharacteristicWithResponseForService(
      BLE_SERVICE_UUID,
      BLE_CHARACTERISTIC_UUIDS.authResponse,
      frame2.toString('base64'),
    );
    expect(commandResults).toEqual([ResultCode.OK]);

    async function sendCommand(commandId: number, counter: number, payload?: Uint8Array) {
      const frame = buildLockCommandFrame({ kSess, nonce: nonceBytes, commandId, counter, payload });
      await connected.writeCharacteristicWithResponseForService(
        BLE_SERVICE_UUID,
        BLE_CHARACTERISTIC_UUIDS.lockCommand,
        frame.toString('base64'),
      );
    }

    await sendCommand(CommandId.ACTIVATE, 1, Buffer.alloc(4, 1));
    await sendCommand(CommandId.UNLOCK, 2);
    expect(commandResults).toEqual([ResultCode.OK, ResultCode.OK, ResultCode.OK]);

    const lockStateAfterUnlock = decode(
      (await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUIDS.lockState)).value,
    );
    expect(lockStateAfterUnlock[LOCK_STATE_LAYOUT.state.offset]).toBe(LockState.UNLOCKED);

    let disconnectedFired = false;
    connected.onDisconnected(() => {
      disconnectedFired = true;
    });

    // Walk away: an abrupt link loss, not a clean app-initiated disconnect.
    connected.simulateAbruptDisconnect();
    expect(disconnectedFired).toBe(true);
    expect(await manager.isDeviceConnected(device.id)).toBe(false);

    clock.advanceMs(AUTOLOCK_GRACE_MS_DEFAULT + 1);
    core.tick();

    const lockStateAfterGrace = core.read('lockState');
    expect(lockStateAfterGrace[LOCK_STATE_LAYOUT.state.offset]).toBe(LockState.LOCKED);
  });

  test('rejects a scan filtered on the correct service UUID for an unrelated one', () => {
    const { manager } = createMockPeripheral({ kDev: K_DEV, clock: new FakeClock(0) });
    const found: unknown[] = [];
    manager.startDeviceScan(['0000dead-0000-0000-0000-000000000000'], null, (_error, device) => {
      found.push(device);
    });
    expect(found).toEqual([]);
  });

  test('scripted RSSI series is consumed in order via readRSSI(), then holds the last value', async () => {
    const series = [-55, -60, -65, -80, -86, -87];
    const { device } = createMockPeripheral({ kDev: K_DEV, clock: new FakeClock(0), rssiSeries: series });

    const observed: number[] = [];
    for (let i = 0; i < series.length + 2; i += 1) {
      await device.readRSSI();
      observed.push(device.rssi as number);
    }

    expect(observed).toEqual([...series, series[series.length - 1], series[series.length - 1]]);
  });

  test('a boundary-hovering RSSI series does not flap under §7.2 hysteresis', async () => {
    // Test-only reference evaluator of §7.2 (median-of-5, enter <-85 sustained
    // 3, exit >-75 sustained 2). This is NOT proximity.ts — that's P3-3.0's
    // job (out of scope here, CLAUDE.md/brief §4). It exists purely to prove
    // the adapter's scripted-RSSI feed can drive such logic without the
    // MOCK itself introducing spurious flapping.
    function median(values: number[]): number {
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    }

    function evaluateHysteresis(series: number[]): 'in-range' | 'out-of-range' {
      let zone: 'in-range' | 'out-of-range' = 'in-range';
      let belowStreak = 0;
      let aboveStreak = 0;
      const window: number[] = [];
      for (const raw of series) {
        window.push(raw);
        if (window.length > 5) window.shift();
        const smoothed = median(window);

        if (smoothed < -85) {
          belowStreak += 1;
          aboveStreak = 0;
        } else if (smoothed > -75) {
          aboveStreak += 1;
          belowStreak = 0;
        } else {
          belowStreak = 0;
          aboveStreak = 0;
        }

        if (zone === 'in-range' && belowStreak >= 3) zone = 'out-of-range';
        else if (zone === 'out-of-range' && aboveStreak >= 2) zone = 'in-range';
      }
      return zone;
    }

    // Hovers right around -85 without ever sustaining 3 medians below it.
    const boundaryHovering = [-80, -83, -86, -82, -84, -87, -81, -85, -83, -86, -82, -84];
    const { device } = createMockPeripheral({
      kDev: K_DEV,
      clock: new FakeClock(0),
      rssiSeries: boundaryHovering,
    });

    const observed: number[] = [];
    for (let i = 0; i < boundaryHovering.length; i += 1) {
      await device.readRSSI();
      observed.push(device.rssi as number);
    }

    expect(observed).toEqual(boundaryHovering);
    expect(evaluateHysteresis(observed)).toBe('in-range');

    // Contrast: a genuine walk-away (sustained low RSSI) DOES cross.
    const genuineWalkAway = [-70, -80, -88, -89, -90, -91, -90];
    expect(evaluateHysteresis(genuineWalkAway)).toBe('out-of-range');
  });

  test('an unauthenticated command write over the adapter returns UNAUTHENTICATED', async () => {
    const { manager, device } = createMockPeripheral({ kDev: K_DEV, clock: new FakeClock(0) });
    const connected = await manager.connectToDevice(device.id);
    const frame = buildLockCommandFrame({
      kSess: Buffer.alloc(16, 0),
      nonce: Buffer.alloc(16, 0),
      commandId: CommandId.LOCK,
      counter: 1,
    });
    await connected.writeCharacteristicWithResponseForService(
      BLE_SERVICE_UUID,
      BLE_CHARACTERISTIC_UUIDS.lockCommand,
      frame.toString('base64'),
    );
    const result = decode(
      (await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUIDS.commandResult)).value,
    );
    expect(result[COMMAND_RESULT_LAYOUT.resultCode.offset]).toBe(ResultCode.UNAUTHENTICATED);
  });

  test('reading/writing an unknown service UUID throws (defends against un-filtered scan misuse)', async () => {
    const { manager, device } = createMockPeripheral({ kDev: K_DEV, clock: new FakeClock(0) });
    const connected = await manager.connectToDevice(device.id);
    await expect(
      connected.readCharacteristicForService('0000dead-0000-0000-0000-000000000000', BLE_CHARACTERISTIC_UUIDS.deviceInfo),
    ).rejects.toThrow();
  });

  test('activation gate end-to-end via the adapter (NOT_ACTIVATED then OK)', async () => {
    const clock = new FakeClock(0);
    const { manager, device } = createMockPeripheral({
      kDev: K_DEV,
      clock,
      provisioningState: ProvisioningState.PROVISIONED,
    });
    const connected = await manager.connectToDevice(device.id);
    const nonceBytes = decode(
      (await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUIDS.authChallenge)).value,
    );
    const { frame1, frame2, kSess } = buildHandshakeFrames({
      kDev: K_DEV,
      sessionId: SESSION_ID,
      keyGeneration: 1,
      nonce: nonceBytes,
      expiresAtDeltaSeconds: 3600,
    });
    await connected.writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUIDS.authResponse, frame1.toString('base64'));
    await connected.writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUIDS.authResponse, frame2.toString('base64'));

    const unlockFrame = buildLockCommandFrame({ kSess, nonce: nonceBytes, commandId: CommandId.UNLOCK, counter: 1 });
    await connected.writeCharacteristicWithResponseForService(BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUIDS.lockCommand, unlockFrame.toString('base64'));
    const firstResult = decode((await connected.readCharacteristicForService(BLE_SERVICE_UUID, BLE_CHARACTERISTIC_UUIDS.commandResult)).value);
    expect(firstResult[COMMAND_RESULT_LAYOUT.resultCode.offset]).toBe(ResultCode.NOT_ACTIVATED);
  });
});
