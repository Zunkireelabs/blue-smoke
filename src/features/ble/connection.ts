/**
 * BLE connection lifecycle: connect, reconnect with backoff, and
 * foreground/background state handling — spec §4.9, §7.1.
 *
 * Stub for P0-4.0. Implementation lands in P1-7.0.
 */

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export interface ConnectionManager {
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  getState(deviceId: string): ConnectionState;
  onStateChange(
    deviceId: string,
    listener: (state: ConnectionState) => void,
  ): () => void;
}

export function createConnectionManager(): ConnectionManager {
  throw new Error('P1-7.0');
}
