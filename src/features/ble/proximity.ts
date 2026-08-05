/**
 * §7.2 RSSI hysteresis: median-of-5 smoothing, enter/exit thresholds,
 * dispatching the explicit app-level lock on range loss.
 *
 * Stub for P0-4.0. Implementation lands in P3-3.0.
 */

export type ProximityZone = 'in-range' | 'out-of-range';

export interface ProximityMonitor {
  start(deviceId: string): void;
  stop(deviceId: string): void;
  onZoneChange(listener: (zone: ProximityZone) => void): () => void;
}

export function createProximityMonitor(): ProximityMonitor {
  throw new Error('P3-3.0');
}
