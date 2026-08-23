#!/bin/bash
# Safe tap into the iOS Simulator.
#
# Blind `cliclick` at screen coordinates will happily click whatever window happens to be under
# the cursor. During this project that landed a click on a WhatsApp window. This wrapper makes
# that failure mode impossible rather than unlikely:
#
#   1. raises the Simulator and waits for it to actually be frontmost
#   2. refuses to click if anything else is frontmost
#   3. refuses to click if the point is outside the Simulator window's own bounds
#
# Usage: simtap.sh <device-point-x> <device-point-y>
#   Coordinates are in iOS POINTS (screenshot pixels / 3 on a 3x device), not screen pixels.

set -euo pipefail

DEVICE_X="${1:?device point x required}"
DEVICE_Y="${2:?device point y required}"

osascript -e 'tell application "Simulator" to activate' >/dev/null 2>&1

# Wait for the Simulator to genuinely take focus before trusting any coordinate.
for _ in 1 2 3 4 5 6 7 8 9 10; do
  FRONT=$(osascript -e 'tell application "System Events" to name of first process whose frontmost is true')
  [ "$FRONT" = "Simulator" ] && break
  sleep 0.3
done

if [ "$FRONT" != "Simulator" ]; then
  echo "ABORT: frontmost app is '$FRONT', not Simulator. Not clicking." >&2
  exit 1
fi

read -r WIN_X WIN_Y WIN_W WIN_H <<<"$(
  osascript -e 'tell application "System Events" to tell process "Simulator" to get {position, size} of window 1' \
    | tr ',' ' '
)"

# Empirically derived for the standard Simulator chrome: ~50pt title bar, ~28pt top bezel,
# content scaled to ~0.867. Recomputed rather than hardcoded so a resized window still works.
SCALE=0.867
OFFSET_X=$(echo "$WIN_X + 23.6" | bc -l)
OFFSET_Y=$(echo "$WIN_Y + 77.8" | bc -l)

SCREEN_X=$(printf '%.0f' "$(echo "$OFFSET_X + $DEVICE_X * $SCALE" | bc -l)")
SCREEN_Y=$(printf '%.0f' "$(echo "$OFFSET_Y + $DEVICE_Y * $SCALE" | bc -l)")

# Refuse anything outside the Simulator's own window rectangle.
if (( SCREEN_X < WIN_X || SCREEN_X > WIN_X + WIN_W || SCREEN_Y < WIN_Y || SCREEN_Y > WIN_Y + WIN_H )); then
  echo "ABORT: ($SCREEN_X,$SCREEN_Y) falls outside the Simulator window" \
       "(${WIN_X},${WIN_Y} ${WIN_W}x${WIN_H}). Not clicking." >&2
  exit 1
fi

# Slow press: iOS ScrollView delays touch delivery and swallows a fast synthetic click.
cliclick m:"$SCREEN_X","$SCREEN_Y" w:200 dd:"$SCREEN_X","$SCREEN_Y" w:220 du:"$SCREEN_X","$SCREEN_Y"
echo "tapped device point ($DEVICE_X,$DEVICE_Y) -> screen ($SCREEN_X,$SCREEN_Y)"
