/**
 * A dev-only, in-app fake `BleManagerLike` for the P1-7.0 demo screen.
 *
 * Why this exists when `tools/mock-peripheral/` already fakes a device: that
 * mock is a Node artifact — `bleAdapter.ts` and `byteLayout.ts` use `Buffer`
 * throughout and the mock's crypto uses `node:crypto`, neither of which exists
 * in React Native's Hermes runtime. It is the right target for Jest and the
 * wrong one for a running app. This fake covers only the *connection* surface
 * of `BleManagerLike`, which needs no bytes and no crypto at all, so it stays
 * RN-safe with no polyfills.
 *
 * Scope is deliberately narrow: it exercises `connection.ts`'s state machine
 * (connect / voluntary disconnect / involuntary drop / reconnect+backoff), and
 * nothing else. It does NOT model GATT, the §4.5 handshake, or lock state —
 * `auth.ts` and `commands.ts` keep testing against the Node mock, which speaks
 * the real §4 byte layouts.
 *
 * Not shipped behind any user-reachable path: the demo screen that consumes it
 * is mounted under `__DEV__` only (see navigation.tsx).
 */

import type { BleDeviceLike, BleManagerLike } from './BleClientContext';

/** What the next `connectToDevice()` should do — driven from the demo UI. */
export type NextConnectOutcome = 'success' | 'fail' | 'hang';

export interface DevFakeControls {
  /**
   * Models a supervision timeout / radio loss: the link drops with no
   * `cancelDeviceConnection()` call, which is exactly the case `connection.ts`
   * must answer with reconnect-and-backoff rather than staying disconnected.
   */
  simulateDrop(): void;
  /** `fail` rejects immediately; `hang` never settles, so the connect timeout fires. */
  setNextConnectOutcome(outcome: NextConnectOutcome): void;
  getNextConnectOutcome(): NextConnectOutcome;
  /** Total `connectToDevice()` calls — makes reconnect attempts visible in the UI. */
  getConnectAttempts(): number;
  isConnected(): boolean;
}

/**
 * The connection lifecycle never reads or writes a characteristic, so the
 * device handle only has to exist and carry an id. Every GATT method throws
 * rather than returning a plausible-looking empty value: if some future caller
 * reaches for one through this fake, it should fail loudly here instead of
 * silently pretending a read succeeded.
 */
function createFakeDevice(deviceId: string): BleDeviceLike {
  const unsupported = (method: string): never => {
    throw new Error(
      `devFakeManager: ${method}() is out of scope — this fake covers the connection lifecycle only. Use tools/mock-peripheral for GATT.`,
    );
  };

  const device: BleDeviceLike = {
    id: deviceId,
    async discoverAllServicesAndCharacteristics() {
      return device;
    },
    async readCharacteristicForService() {
      return unsupported('readCharacteristicForService');
    },
    async writeCharacteristicWithResponseForService() {
      return unsupported('writeCharacteristicWithResponseForService');
    },
    monitorCharacteristicForService() {
      return unsupported('monitorCharacteristicForService');
    },
  };
  return device;
}

export function createDevFakeManager(): { manager: BleManagerLike; controls: DevFakeControls } {
  let connected = false;
  let nextOutcome: NextConnectOutcome = 'success';
  let connectAttempts = 0;
  // Keyed by deviceId so a listener armed for one link isn't fired by another;
  // `connection.ts` re-arms this on every successful open and removes it on
  // disconnect, so the set is normally 0 or 1 entries.
  const disconnectListeners = new Map<string, Set<(error: Error | null, deviceId: string) => void>>();

  const manager: BleManagerLike = {
    async state() {
      return 'PoweredOn';
    },

    async connectToDevice(deviceId: string) {
      connectAttempts += 1;
      if (nextOutcome === 'fail') {
        throw new Error('devFakeManager: simulated connect failure');
      }
      if (nextOutcome === 'hang') {
        // Never settles — `connection.ts`'s CONNECT_TIMEOUT_MS is what ends
        // this, which is the behaviour the demo is there to show.
        return new Promise<BleDeviceLike>(() => {});
      }
      connected = true;
      return createFakeDevice(deviceId);
    },

    async isDeviceConnected() {
      return connected;
    },

    async cancelDeviceConnection(deviceId: string) {
      connected = false;
      // A voluntary disconnect deliberately does NOT notify
      // `onDeviceDisconnected`: `connection.ts` distinguishes voluntary from
      // involuntary, and firing here would make the app fight its own
      // disconnect with a reconnect loop.
      return createFakeDevice(deviceId);
    },

    onDeviceDisconnected(deviceId, listener) {
      let listeners = disconnectListeners.get(deviceId);
      if (!listeners) {
        listeners = new Set();
        disconnectListeners.set(deviceId, listeners);
      }
      listeners.add(listener);
      return {
        remove() {
          listeners?.delete(listener);
        },
      };
    },
  };

  const controls: DevFakeControls = {
    simulateDrop() {
      if (!connected) {
        return;
      }
      connected = false;
      for (const [deviceId, listeners] of disconnectListeners) {
        // Copy before iterating: `connection.ts` removes its subscription
        // inside the handler, which mutates this set mid-loop.
        for (const listener of [...listeners]) {
          listener(null, deviceId);
        }
      }
    },
    setNextConnectOutcome(outcome: NextConnectOutcome) {
      nextOutcome = outcome;
    },
    getNextConnectOutcome() {
      return nextOutcome;
    },
    getConnectAttempts() {
      return connectAttempts;
    },
    isConnected() {
      return connected;
    },
  };

  return { manager, controls };
}
