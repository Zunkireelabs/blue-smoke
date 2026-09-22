/**
 * The composition root for `h158ReconnectSupervisor.ts` — one supervisor for the whole app, and
 * the small surface the rest of the app uses to talk to it.
 *
 * A **module singleton**, not a React context value, because the thing it owns (a standing
 * connection intent held by the OS) must outlive every screen that happens to be mounted. Home
 * unmounts when the user opens Profile; the connection does not, and neither should the intent
 * to keep it. This mirrors the split `useH158ConnectionStore` already documents — a GATT link
 * routinely outlives whichever screen dialled it.
 *
 * Mounted once, in `navigation.tsx`'s `home` stack: that stack is only reachable by a user who
 * is signed in and past the age gate, which is also the only state in which having devices
 * connected is meaningful.
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { BleClientProvider, useBleManager, useBleScanner } from '../BleClientContext';
import { getPairedH158Devices } from './h158DeviceStorage';
import {
  createH158ReconnectSupervisor,
  type H158ReconnectSupervisor,
} from './h158ReconnectSupervisor';

let supervisor: H158ReconnectSupervisor | undefined;

/**
 * Re-read the remembered-devices list and tell the supervisor about it. Call after anything that
 * changes that list — pairing a new device, forgetting one.
 *
 * Safe to call when no supervisor is mounted (before sign-in, in a test that never rendered the
 * home stack): it is a no-op rather than a crash, so call sites do not need their own guard.
 */
export async function refreshH158ReconnectTargets(): Promise<void> {
  if (!supervisor) {
    return;
  }
  const devices = await getPairedH158Devices();
  supervisor.sync(devices.map((device) => ({ id: device.id, name: device.name })));
}

/**
 * "The user pressed Disconnect." Stops auto-reconnect for this device until they ask for it
 * again — silently undoing a button the user just pressed is worse than not reconnecting.
 */
export function suppressH158AutoReconnect(deviceId: string): void {
  supervisor?.suppress(deviceId);
}

/** "The user asked for this device again" — tapped Connect on a row, or re-paired it. */
export function allowH158AutoReconnect(deviceId: string): void {
  supervisor?.allow(deviceId);
}

/** "Forget device" — drop the intent entirely. Pair with `removePairedH158Device`. */
export function forgetH158AutoReconnect(deviceId: string): void {
  supervisor?.forget(deviceId);
}

/** Test seam — lets a test drive the singleton without rendering the navigator. */
export function __setH158ReconnectSupervisorForTests(next: H158ReconnectSupervisor | undefined): void {
  supervisor = next;
}

/**
 * Renders nothing. Owns the supervisor's lifetime and keeps it fed:
 *
 * - creates it on mount, disposes on unmount (sign-out);
 * - syncs the remembered-device list on mount and on every foreground, since a device may have
 *   been paired or forgotten on another screen;
 * - pokes it on foreground, which is the one moment where our view of the world may be stale:
 *   while suspended, JS timers do not run and a native disconnect callback can be missed
 *   entirely, so the app can wake up believing a link is alive that died minutes ago. This is
 *   the same reasoning `appState.ts`'s `reconcileConnections` documents for the §4 transport —
 *   that machinery was never wired to the H158 chain, which is part of why the drop went
 *   unnoticed in the first place.
 */
export function H158AutoReconnect() {
  // 🔴 Wrapped in its own bare `<BleClientProvider>` — no `manager` prop — so `useBleManager()`
  // inside falls through to the lazily-constructed REAL `BleManager`. Identical reasoning to
  // `H158HomeConnectAgent` and `H158PairScreen`, and for the same reason: in a `__DEV__` build
  // `providers.tsx` (§3.3) overrides the app-wide provider with `tools/mock-peripheral`'s
  // `MockBleManager`, so anything mounted under `AppProviders` talks to the mock.
  //
  // Found on real hardware, 2026-09-22: without this, the supervisor dialled the MOCK with a
  // real device's MAC on every reconnect and got back "MockBleManager: unknown device ...".
  // The row correctly said "Out of range — will reconnect automatically" and then never
  // reconnected, which looked exactly like a firmware problem and was not one. A release build
  // would have worked by accident (no override to inherit) — a debug-only failure is the worst
  // kind, because it is the build every test runs on.
  return (
    <BleClientProvider>
      <H158AutoReconnectSupervisorHost />
    </BleClientProvider>
  );
}

function H158AutoReconnectSupervisorHost() {
  const manager = useBleManager();
  const scanner = useBleScanner();

  useEffect(() => {
    // 🔴 `useBleScanner()` is an unchecked cast (`BleClientContext.tsx` — the real `BleManager`
    // satisfies both interfaces structurally, so the cast is sound in production but proves
    // nothing at the type level). Any narrow double injected through `BleClientProvider` has
    // only the four connection methods, and calling `onStateChange` on one throws at mount —
    // which took down the whole navigator, not just auto-reconnect. Feature-detect instead of
    // trusting the cast; the supervisor already treats the adapter as optional and falls back
    // to `poke()` on foreground, which is the weaker but still correct behaviour.
    const adapter =
      typeof (scanner as Partial<typeof scanner>).onStateChange === 'function' ? scanner : undefined;
    const created = createH158ReconnectSupervisor({ manager, adapter });
    supervisor = created;
    void refreshH158ReconnectTargets();

    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        return;
      }
      void refreshH158ReconnectTargets();
      created.poke();
    });

    return () => {
      subscription.remove();
      created.dispose();
      if (supervisor === created) {
        supervisor = undefined;
      }
    };
  }, [manager, scanner]);

  return null;
}
