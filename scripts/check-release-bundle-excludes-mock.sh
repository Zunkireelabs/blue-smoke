#!/usr/bin/env bash
#
# P1-3.0 §3.4 — "prove it cannot ship." `npm run bundle:check` only ever builds `--dev true`
# bundles, so it cannot answer whether `tools/mock-peripheral` (wired into `src/app/providers.tsx`
# behind `__DEV__`, P1-3.0) actually gets excluded from a release build. This script builds a
# `--dev false` bundle for each platform and greps it for a marker string that exists nowhere
# except `tools/mock-peripheral/devFixture.ts` — if the `__DEV__` gate ever regresses (e.g. the
# `require()` becomes a top-level `import`, or moves outside the `if` block), this fails loudly
# instead of shipping a device that can unlock without a device.
set -euo pipefail

MARKER="DeviceCore (dev mock)"
OUT_DIR="$(mktemp -d)"
trap 'rm -rf "$OUT_DIR"' EXIT

for PLATFORM in ios android; do
  BUNDLE="$OUT_DIR/$PLATFORM-release.bundle"
  echo "Building $PLATFORM release (--dev false) bundle..."
  npx react-native bundle \
    --platform "$PLATFORM" \
    --dev false \
    --entry-file index.js \
    --bundle-output "$BUNDLE" \
    --reset-cache

  if grep -q "$MARKER" "$BUNDLE"; then
    echo "FAIL: the $PLATFORM release bundle contains the dev BLE mock (found \"$MARKER\")." >&2
    echo "The __DEV__ gate in src/app/providers.tsx did not exclude tools/mock-peripheral from this release build." >&2
    exit 1
  fi
  echo "OK: the $PLATFORM release bundle does not contain the dev BLE mock."
done

echo "Release bundle check passed for both platforms."
