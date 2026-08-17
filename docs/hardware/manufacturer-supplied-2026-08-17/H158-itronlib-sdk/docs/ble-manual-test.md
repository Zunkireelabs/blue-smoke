# BLE Manual Test

## Preconditions

- JDK 17 is active.
- Android device is API 31 or newer.
- Bluetooth is enabled.
- The BLE device is powered on and advertising.
- SDK UUID values are configured before connection testing.
- Install the debug APK from `app/build/outputs/apk/debug/app-debug.apk`.

## Steps

1. Launch the app and grant Nearby Devices permissions.
2. Verify the app starts BLE scanning after permissions are granted.
3. Tap `Scan BLE` if scanning is not already running.
4. Verify the target device appears with name, RSSI, and MAC address.
5. Tap the target device and verify the app enters connecting state.
6. Verify the app reaches connected state.
7. Tap `Read Device Info` and verify the TX log includes the terminal info command.
8. Verify an RX log appears when the device responds.
9. Tap `Child Lock ON` and verify the TX log includes the corresponding command.
10. Tap `Child Lock OFF` and verify the TX log includes the corresponding command.
11. Verify the device status line (Lock / System / Battery) updates after device responses.
12. Power off or move the device out of range.
13. Verify the app shows reconnecting once, then disconnected if reconnect fails.
14. Verify `Scan BLE` is available again after disconnect or connection failure.

## Notes

- Target device name is `YP65-AT`. UUIDs are confirmed on real hardware: service `0000fff0`, write and notify both `0000fff1` (Notify + Write without Response), matching the `BleSdkConfig` defaults.
- If permissions are denied, the app should show a Bluetooth permission error instead of scanning.
- Generic send errors should keep the current session visible; connection failures should return to scanning.
