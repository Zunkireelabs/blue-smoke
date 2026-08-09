<!--
 * @Author: wuxiang xiangw@itron.com.cn
 * @Date: 2026-06-09 10:21:52
 * @LastEditors: wuxiang xiangw@itron.com.cn
 * @LastEditTime: 2026-06-09 14:05:00
 * @FilePath: /undefined/Users/xiangwu/Documents/2026workProject/Claude_demo/HQD BLE/HQD BLE Android.md
 * @Description: This is the default setting. Please set `customMade` and open koroFileHeader to view the configuration: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
-->
# Electronic Cigarette BLE Communication Protocol SDK
>
> **Version**: v1.0.0 | **Last Updated**: 2026-06-09 | **Status**: Ongoing Update

> Android Platform

## 1. Overview

**itronlib** is an Android SDK used to connect and manage atomizer devices. It communicates with devices via Bluetooth Low Energy (BLE) protocol, and supports functions such as retrieving device information, unlocking and locking devices.

---

## 2. Quick Start

### 2.1 Initialization

Call the method in `Application.onCreate()`:

```kotlin
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        DeviceManager.getInstance().init(this)
    }
}
```

### 2.2 Register Event Listener

```kotlin
deviceManager.addEventListener(VMPenEventType.ConnectStatusEvent, object : EventListener<VMPenEventType> {
    override fun performed(event: Event<VMPenEventType>) {
        val msg = event as BleConnectStatusMessage
        when (msg.state) {
            BleState.ConnectSuccess -> // Device connected
            BleState.DisConnected -> // Device disconnected
        }
    }
})
```

### 2.3 Scan and Connect Devices

```kotlin
// Start scanning
deviceManager.scanBle()

// Listen to scan results
deviceManager.addEventListener(VMPenEventType.ScanBleEvent, object : EventListener<VMPenEventType> {
    override fun performed(event: Event<VMPenEventType>) {
        val msg = event as ScanMessage
        when (msg.scanType) {
            ScanMessage.SCAN_TYPE_SCANNING -> {
                // msg.mDevice is the scanned device
            }
            ScanMessage.SCAN_TYPE_FINISHED -> {
                // Scan finished
            }
        }
    }
})

// Connect to device
deviceManager.connectDevice(device.mac)
```

## 3. DeviceManager Interface

DeviceManager is the singleton entry of the SDK. All operations are initiated through this class.

### 3.1 Lifecycle

| Method | Signature | Description |
|------|------|------|
| init | fun init(app: Application) | Initialize SDK: Start BLE manager, bind background service |
| release | fun release() | Release resources: unregister event listeners, unbind service |
| isServiceConnect | fun isServiceConnect(): Boolean | Check if the background service is connected |

### 3.2 BLE Scan and Connection

Enter the 6-digit PIN code when connecting via Bluetooth on your mobile device for the first time.

 | Method | Signature | Description |
 |------|------|------|
 | scanBle | fun scanBle() | Start BLE scan (20s timeout), results returned via ScanBleEvent
 | stopScan | fun stopScan() | Stop BLE scan |
 | connectDevice | fun connectDevice(mac: String) | Connect to the device with the specified MAC address, connection status returned via ConnectStatusEvent
 | disconnect | fun disconnect(mac: String) | Disconnect the specified device
 | isConnected | fun isConnected(): Boolean | Check if any device is currently connected

### 3.3 Device Information Query (BLE Commands)

 | Method | Signature | BLE Command | Event Return |
 |------|------|------|------|
 | readDeviceInfo | fun readDeviceInfo() | 0x01 | DeviceInfoEvent → DeviceInfoMessage(devices: DeviceInfo) |
 | setCheckState | fun setRecordState(state:Boolean) | 0x02 | DeviceStateEvent → DeviceStatusMessage(state:Boolean) |

DeviceInfo includes: Device SN, Device Lock Status
