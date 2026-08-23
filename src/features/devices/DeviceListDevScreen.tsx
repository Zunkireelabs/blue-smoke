import { useEffect, useRef } from 'react';
import { useDeviceScan } from './useDeviceScan';
import { addPairedDevice, __resetDeviceStoreForTests as resetDeviceStore } from '@/app/stores/useDeviceStore';
import { DeviceListScreen } from './DeviceListScreen';

/**
 * 🔴 DEV ONLY — `__DEV__`-gated in `navigation.tsx`, same as every other P1-3.0 seam screen.
 *
 * Deliberately imports NO mock-peripheral module directly. `src/app/providers.tsx` §3.3 is "the
 * ONE place `tools/mock-peripheral` may be imported from `src/` for a real (non-test) run" — a
 * top-level import anywhere else risks leaking mock code into a release bundle, since Metro
 * resolves top-level `import`s regardless of any `__DEV__` branch around their use (see that
 * file's doc comment; `bundle:check:release` is what actually proves it). This screen reaches
 * the dev mock the same indirect way every other P1-3.0 dev screen does: through
 * `useBleManager()`'s context value, which `providers.tsx` already wired to
 * `devFixture.ts`'s three-device fleet — `useDeviceScan()` finds them like any real scan would.
 *
 * Seeds `useDeviceStore` from whatever the scan turns up, so this harness stays correct even if
 * `devFixture.ts`'s fixture ever changes shape — nothing here hardcodes a device id or count.
 */
export function DeviceListDevScreen() {
  const { devices } = useDeviceScan();
  const seeded = useRef(new Set<string>());

  useEffect(() => {
    for (const device of devices) {
      if (!seeded.current.has(device.id)) {
        seeded.current.add(device.id);
        addPairedDevice(device.id, device.name ?? device.id);
      }
    }
  }, [devices]);

  useEffect(() => {
    const seededIds = seeded.current;
    return () => {
      resetDeviceStore();
      seededIds.clear();
    };
  }, []);

  return <DeviceListScreen />;
}
