import { DeviceCore } from '../deviceCore';
import { FakeClock } from '../clock';
import { LOCK_STATE_LAYOUT, LockStateFlagBit } from '../../../src/features/ble/protocol';

const K_DEV = Buffer.alloc(16, 0x77);

function readBatteryPercent(bytes: Uint8Array): number {
  return bytes[LOCK_STATE_LAYOUT.batteryPercent.offset];
}
function readLowBatteryFlag(bytes: Uint8Array): boolean {
  return ((bytes[LOCK_STATE_LAYOUT.flags.offset] >> LockStateFlagBit.LOW_BATTERY) & 1) === 1;
}

describe('DeviceCore — §4.4 battery model', () => {
  test('reports the configured initial battery percent', () => {
    const core = new DeviceCore({ kDev: K_DEV, clock: new FakeClock(0), initialBatteryPercent: 42 });
    expect(readBatteryPercent(core.read('lockState'))).toBe(42);
  });

  test('drains over time at the configured rate, clamped to 0', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({
      kDev: K_DEV,
      clock,
      initialBatteryPercent: 50,
      batteryDrainPercentPerHour: 10,
    });
    clock.advanceMs(60 * 60 * 1000); // 1 hour
    expect(readBatteryPercent(core.read('lockState'))).toBe(40);

    clock.advanceMs(10 * 60 * 60 * 1000); // 10 more hours — would go well negative
    expect(readBatteryPercent(core.read('lockState'))).toBe(0);
  });

  test('low-battery flag latches below 15% and clears only at/above 20% (hysteresis)', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({
      kDev: K_DEV,
      clock,
      initialBatteryPercent: 20,
      batteryDrainPercentPerHour: 10,
    });
    expect(readLowBatteryFlag(core.read('lockState'))).toBe(false);

    clock.advanceMs(30 * 60 * 1000); // → 15% exactly, not yet below 15
    core.tick();
    expect(readLowBatteryFlag(core.read('lockState'))).toBe(false);

    clock.advanceMs(6 * 60 * 1000); // → 14%
    core.tick();
    expect(readLowBatteryFlag(core.read('lockState'))).toBe(true);

    // Rising back to 16% must NOT clear the latch — only ≥20% does.
    core.setBatteryPercent(16);
    expect(readLowBatteryFlag(core.read('lockState'))).toBe(true);

    core.setBatteryPercent(20);
    expect(readLowBatteryFlag(core.read('lockState'))).toBe(false);
  });

  test('a battery-threshold crossing fires a lockState notification', () => {
    const clock = new FakeClock(0);
    const core = new DeviceCore({
      kDev: K_DEV,
      clock,
      initialBatteryPercent: 20,
      batteryDrainPercentPerHour: 100, // fast drain for the test
    });
    const seenFlags: boolean[] = [];
    core.subscribe('lockState', (bytes) => seenFlags.push(readLowBatteryFlag(bytes)));

    clock.advanceMs(10 * 60 * 1000); // → drains past 15% within a few minutes
    core.tick();

    expect(seenFlags.some((flag) => flag === true)).toBe(true);
  });

  test('setBatteryPercent is a direct override for ad hoc low-battery testing', () => {
    const core = new DeviceCore({ kDev: K_DEV, clock: new FakeClock(0), initialBatteryPercent: 90 });
    core.setBatteryPercent(5);
    const lockState = core.read('lockState');
    expect(readBatteryPercent(lockState)).toBe(5);
    expect(readLowBatteryFlag(lockState)).toBe(true);
  });
});
