import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthClientProvider } from '@/features/auth/AuthClientContext';
import { BleClientProvider, type BleManagerLike } from '@/features/ble/BleClientContext';

const queryClient = new QueryClient();

/**
 * P1-3.0 §3.3 — the ONE place `tools/mock-peripheral` may be imported from `src/` for a
 * real (non-test) run, gated by `__DEV__` so it can never reach a release bundle. Before this
 * task, `DV`/`LK` screens were unreachable on a simulator at all: no Bluetooth radio, so the
 * `P1-2.0` gate never resolved and a scan found nothing (real hardware isn't available until
 * ~Day 26). `tools/mock-peripheral`'s `MockBleManager` already implements `BleManagerLike` —
 * this is the wiring that was missing, not new mock code.
 *
 * `require()`, lexically inside `if (__DEV__)` — deliberately NOT a top-level `import`. Metro
 * resolves every top-level `import` unconditionally, regardless of any `__DEV__` check wrapped
 * around its use (`deviceCore.ts`'s module doc comment: a top-level `node:crypto` import broke
 * the bundle even on a path that never ran). A `require()` call lexically inside
 * `if (__DEV__) { ... }` is exactly what `metro-react-native-babel-preset`'s dead-code
 * elimination strips for a release build — `__DEV__` is inlined to `false` at that point,
 * collapsing the whole block before Metro ever sees a `require()` to resolve. `npm run
 * bundle:check`'s release-mode step (§3.4) proves this empirically for this repo's toolchain,
 * not just this comment: a `--dev false` bundle is built and grepped for a mock-only symbol.
 *
 * Untyped deliberately (no `import type` from `tools/mock-peripheral/devFixture`): that file
 * (and `bleAdapter.ts`/`deviceCore.ts` beneath it) use `Buffer` internally, which is why the
 * root `tsconfig.json` excludes `tools/mock-peripheral/**` from this program's `"types":
 * ["jest"]` (no Node types) — pulling in its types here would drag this file into the same
 * carve-out `auth.test.ts`/`deviceInfo.test.ts` needed, which is wrong for production code, not
 * a test. `DevBleManagerModule` below is a hand-written structural type covering only what this
 * file calls.
 */
interface DevBleManagerModule {
  createDevBleManager(): { manager: BleManagerLike };
}

let devBleManager: BleManagerLike | undefined;
if (__DEV__) {
  const devFixture = require('../../tools/mock-peripheral/devFixture') as DevBleManagerModule;
  devBleManager = devFixture.createDevBleManager().manager;
}

/**
 * App-wide providers — spec §9.2 app/. TanStack Query owns server state via
 * this provider. Zustand stores (src/app/stores, and one per feature
 * concern) need no provider — components import the hook directly.
 *
 * `AuthClientProvider` and `BleClientProvider` are both wired here — P1-4.0's composition-root
 * default, mirroring §3.5. `BleClientProvider` gets `devBleManager` in a `__DEV__` build (the
 * mock, built above) and no override at all in a release build, which falls through to
 * `useBleManager()`'s lazily-constructed real `BleManager` (`BleClientContext.tsx`) — exactly
 * today's release behaviour, unchanged. Tests substitute their own `manager` prop directly at
 * the point of use, never here.
 */
export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthClientProvider>
          <BleClientProvider manager={devBleManager}>{children}</BleClientProvider>
        </AuthClientProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
