# BLE SDK and App Design

## Summary

This project will build a product-ready BLE demo with two modules:

- `itronlib`: BLE scanning, connection, GATT communication, fixed UUID binding, basic protocol commands, hex write, notification receive, and one automatic reconnect attempt.
- `app`: Android UI for scanning devices, connecting to a selected device, and printing sent/received data after connection.

The first version targets a single connected BLE GATT device and uses `HQD BLE Android.md` as the baseline protocol reference. Classic Bluetooth SPP, multi-device sessions, manual characteristic selection, and advanced protocol parsing are out of scope.

The SDK library/module name is `itronlib`, and its Kotlin package root is `com.itorn.hqd.itronlib`.

## Protocol Baseline

The baseline SDK shape follows `HQD BLE Android.md` v1.0.0:

- SDK entry point: `DeviceManager.getInstance()`.
- Initialization: `DeviceManager.init(app: Application)`.
- Resource cleanup: `release()`.
- BLE service check: `isServiceConnect()`.
- Scanning: `scanBle()` starts a scan with a default 20-second timeout, `stopScan()` stops it.
- Connection: `connectDevice(mac: String)`, `disconnect(mac: String)`, and `isConnected()`.
- Events: scan and connection updates are emitted through registered event listeners.
- Basic BLE commands: `readDeviceInfo()` sends command `0x01`; `setRecordState(state: Boolean)` sends command `0x02`.
- Device info includes device SN and lock state.

The protocol document does not define GATT Service/Characteristic UUID values yet. The SDK will keep them as fixed configuration values in one SDK config object so implementation can use known UUIDs once they are provided.

## Goals

- Scan BLE devices and show name, RSSI, and MAC address.
- Use a default 20-second scan timeout while allowing SDK configuration for debugging.
- Connect to a selected BLE device through `itronlib`.
- Discover GATT services and bind fixed read/write characteristic UUIDs.
- Send hex data from the app after connection.
- Receive BLE notification/indication data and display it as hex.
- Provide baseline protocol APIs for reading device info and setting device state.
- Show connection state, reconnecting state, errors, and logs in the app.
- Automatically retry connection once after unexpected disconnect.

## SDK Design

`itronlib` exposes the public API through `DeviceManager` to match the baseline protocol document. The app should not call Android BLE APIs directly.

Core SDK components:

- `BleScanner`: starts and stops scanning, deduplicates devices by MAC address, and updates RSSI.
- `BleConnectionManager`: handles GATT connect, disconnect, service discovery, fixed UUID characteristic binding, notification subscription, and reconnect-once behavior.
- `BleSession`: validates hex input, converts hex to bytes, writes data, and emits received bytes as hex strings.
- `BleProtocol`: builds and parses baseline command frames, starting with command `0x01` for device info and `0x02` for device state.
- `DeviceManager`: provides the app-facing facade: `init(app)`, `release()`, `scanBle()`, `stopScan()`, `connectDevice(mac)`, `disconnect(mac)`, `isConnected()`, `readDeviceInfo()`, `setRecordState(state)`, and `sendHex(hexText)`.

SDK outputs:

- Event listeners compatible with the baseline document: scan events, connection status events, device info events, device state events, sent messages, received messages, and user-visible errors.
- Internal state can use Kotlin flows, but the public SDK contract remains listener-based for this version.

## App Design

The app has three main UI states.

Scan screen:

- Shows Bluetooth permission and adapter status.
- Requests required Bluetooth runtime permissions when the app starts.
- Starts scanning from the UI.
- Lists devices with name, RSSI, and MAC address.
- Stops scanning when a device is selected.

Connecting state:

- Shows selected device name and MAC address.
- Shows connecting progress and failure reason when connection fails.
- Navigates to the session screen after successful connection.

Session screen:

- Shows device name, MAC address, and connection state.
- Shows a log list with timestamp, direction, and hex content.
- Provides hex input, send button, clear-log action, disconnect action, and manual reconnect action.
- Provides basic command actions for reading device info and setting device state.
- Shows `Reconnecting` when the SDK performs its one automatic reconnect attempt.

## Data Flow

1. App calls `DeviceManager.scanBle()`.
2. SDK emits scan result updates with name, RSSI, and MAC address.
3. User selects a device; app calls `connectDevice(macAddress)`.
4. SDK connects GATT, discovers services, binds configured characteristics, and subscribes to notifications.
5. SDK emits `Connected`; app opens the session UI.
6. User sends hex data; app calls `sendHex(hexText)`.
7. SDK writes bytes and emits sent or failed events.
8. SDK receives notifications and emits received hex messages.
9. On unexpected disconnect, SDK attempts one reconnect. If it fails, the app shows disconnected state and manual reconnect.
10. User triggers `readDeviceInfo()` or `setRecordState(state)`; SDK sends command `0x01` or `0x02` and emits the parsed result event.

## Error Handling

- Missing Bluetooth permission or disabled Bluetooth blocks scanning and shows a clear UI state.
- No devices found keeps scanning available and lets the user retry.
- Connection failure returns to the scan flow with an error message.
- Missing configured characteristic UUID fails connection with a "communication characteristic not found" style error.
- Invalid hex input is rejected before BLE write. Hex must contain an even number of characters after spaces are removed.
- Write failure marks the log entry as failed and surfaces an error event.
- Notification subscription failure fails the connection because communication cannot continue.

## Testing Scope

Unit tests should cover SDK logic that does not require Android hardware:

- Hex validation and conversion.
- Scan result deduplication and RSSI update behavior.
- Connection state transitions.
- Automatic reconnect attempt count.

App tests should cover:

- Scan-to-connect UI state changes.
- Send button enabled/disabled behavior.
- Log append and clear behavior.
- Disconnected and reconnecting UI states.

Manual device testing must verify scanning, connecting, fixed UUID binding, writing, notification receiving, and reconnect-once behavior on a real BLE device.

Protocol testing should verify command frame generation for `0x01` and `0x02`, event dispatch for device info and state responses, and graceful handling of malformed responses.

## Out of Scope

- Classic Bluetooth SPP.
- Multi-device simultaneous connections.
- Manual service or characteristic selection.
- Advanced protocol command parsing beyond `0x01` and `0x02`.
- Background long-running connection.
- OTA update.
- Log export or persistence.
