# BLE SDK App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first product-ready Android BLE demo: SDK scanning, connection, baseline protocol commands, and app UI for scanning, connecting, sending hex, and printing received data.

**Architecture:** Keep Android BLE details inside `itronlib` and expose the baseline protocol API through `DeviceManager`. The app consumes listener events and renders three user states: scanning, connecting, and session/logging. UUIDs are fixed SDK configuration values; until real values are provided, connection fails with a clear `UuidNotConfigured` error.

**Tech Stack:** Android Gradle Plugin 8.11.2, Kotlin 2.0.21, Android minSdk 31, compileSdk 36, JDK 17, Android BLE GATT APIs, JUnit 4, AndroidX test, Espresso.

## Global Constraints

- SDK library/module name is `itronlib`.
- SDK Kotlin package root is `com.itorn.hqd.itronlib`.
- Public SDK entry point must be `DeviceManager.getInstance()`.
- Public SDK methods must include `init(app: Application)`, `release()`, `isServiceConnect()`, `scanBle()`, `stopScan()`, `connectDevice(mac: String)`, `disconnect(mac: String)`, `isConnected()`, `readDeviceInfo()`, `setRecordState(state: Boolean)`, and `sendHex(hexText: String)`.
- BLE scan timeout defaults to 20 seconds and may be configured through `BleSdkConfig` for debugging.
- Scan results show name, RSSI, and MAC address.
- BLE model is GATT only; Classic Bluetooth SPP is out of scope.
- First version supports one connected device.
- Characteristic selection is fixed UUID configuration only.
- Automatic reconnect is attempted once after unexpected disconnect.
- Hex input must contain an even number of characters after spaces are removed.
- Basic protocol commands are `0x01` for device info and `0x02` for device state.
- Build commands require JDK 17 because Android Gradle Plugin 8.11.2 does not run on JDK 11.
- App must request required Bluetooth runtime permissions when it starts.

---

## File Structure

- Rename module directory `belsdk/` to `itronlib/`.
- Modify `settings.gradle.kts`: replace `include(":belsdk")` with `include(":itronlib")`.
- Modify `itronlib/build.gradle.kts`: set `namespace = "com.itorn.hqd.itronlib"`.
- Move existing tests and source package paths from `com/itorn/hqd/belsdk/` to `com/itorn/hqd/itronlib/`.
- Create `itronlib/src/main/java/com/itorn/hqd/itronlib/config/BleSdkConfig.kt`: fixed Service/Characteristic UUID configuration and validation.
- Create `itronlib/src/main/java/com/itorn/hqd/itronlib/model/BleModels.kt`: scan result, connection state, event, device info, and error models.
- Create `itronlib/src/main/java/com/itorn/hqd/itronlib/event/EventBus.kt`: listener registration and event dispatch compatible with the protocol document.
- Create `itronlib/src/main/java/com/itorn/hqd/itronlib/protocol/HexCodec.kt`: hex validation and byte conversion.
- Create `itronlib/src/main/java/com/itorn/hqd/itronlib/protocol/BleProtocol.kt`: command frame builders and basic response parsing.
- Create `itronlib/src/main/java/com/itorn/hqd/itronlib/scan/BleScanner.kt`: Android BLE scanner wrapper with 20-second timeout and MAC deduplication.
- Create `itronlib/src/main/java/com/itorn/hqd/itronlib/connection/BleConnectionManager.kt`: GATT connect, service discovery, UUID binding, writes, notifications, disconnect, and reconnect once.
- Create `itronlib/src/main/java/com/itorn/hqd/itronlib/DeviceManager.kt`: public singleton facade.
- Modify `itronlib/src/main/AndroidManifest.xml`: SDK Bluetooth LE feature plus scan/connect permissions.
- Modify `app/src/main/AndroidManifest.xml`: runtime BLE permissions and application class if needed.
- Create `app/src/main/java/com/itorn/hqd/ble/MainActivity.kt`: single-activity app UI.
- Create `app/src/main/java/com/itorn/hqd/ble/BleDemoViewModel.kt`: adapter between SDK listener events and UI state.
- Create focused unit tests under `itronlib/src/test/java/com/itorn/hqd/itronlib/`.

## Reference Notes

- Android 12+ requires `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT`; legacy Bluetooth permissions should use `android:maxSdkVersion="30"`.
- `BluetoothLeScanner.startScan(callback)` returns results through `ScanCallback`; unfiltered scans are stopped on screen off, so foreground demo scanning is acceptable for this first version.
- BLE data transfer uses `BluetoothGatt`, service discovery, characteristics, and notification subscription.
- Android 13+ exposes newer write status codes; SDK errors should map platform write failures to app-visible events.

### Task 0: Rename SDK Module to itronlib

**Files:**
- Move: `belsdk/` to `itronlib/`
- Add: `build.gradle.kts`
- Add: `gradle.properties`
- Add: `gradle/libs.versions.toml`
- Add: `gradle/wrapper/gradle-wrapper.jar`
- Add: `gradle/wrapper/gradle-wrapper.properties`
- Add: `gradlew`
- Add: `gradlew.bat`
- Add: `.gitignore`
- Modify: `settings.gradle.kts`
- Modify: `itronlib/build.gradle.kts`
- Modify: `itronlib/src/test/java/com/itorn/hqd/itronlib/ExampleUnitTest.kt`
- Modify: `itronlib/src/androidTest/java/com/itorn/hqd/itronlib/ExampleInstrumentedTest.kt`

**Interfaces:**
- Consumes: existing `belsdk` Gradle module.
- Produces: tracked Gradle project skeleton and module `:itronlib` with namespace `com.itorn.hqd.itronlib`.

- [ ] **Step 1: Move the module directory**

Run:

```bash
mv belsdk itronlib
mkdir -p itronlib/src/test/java/com/itorn/hqd/itronlib
mkdir -p itronlib/src/androidTest/java/com/itorn/hqd/itronlib
mv itronlib/src/test/java/com/itorn/hqd/belsdk/ExampleUnitTest.kt \
  itronlib/src/test/java/com/itorn/hqd/itronlib/ExampleUnitTest.kt
mv itronlib/src/androidTest/java/com/itorn/hqd/belsdk/ExampleInstrumentedTest.kt \
  itronlib/src/androidTest/java/com/itorn/hqd/itronlib/ExampleInstrumentedTest.kt
```

Expected: the `itronlib/` module exists and no source file remains under `com/itorn/hqd/belsdk/`.

- [ ] **Step 2: Update Gradle settings**

In `settings.gradle.kts`, use:

```kotlin
rootProject.name = "H158"
include(":app")
include(":itronlib")
```

- [ ] **Step 3: Update module namespace**

In `itronlib/build.gradle.kts`, use:

```kotlin
android {
    namespace = "com.itorn.hqd.itronlib"
    compileSdk = 36
}
```

- [ ] **Step 4: Update existing example test packages**

Use this package declaration in both moved example tests:

```kotlin
package com.itorn.hqd.itronlib
```

The instrumented test should assert:

```kotlin
assertEquals("com.itorn.hqd.itronlib.test", appContext.packageName)
```

- [ ] **Step 5: Run module discovery**

Run: `./gradlew projects`

Expected: output includes `Project ':itronlib'` and does not include `Project ':belsdk'`.

- [ ] **Step 6: Commit**

```bash
git add .gitignore build.gradle.kts gradle.properties gradle gradlew gradlew.bat settings.gradle.kts itronlib
git rm -r --cached belsdk || true
git commit -m "chore: add Gradle project with itronlib module"
```

### Task 1: SDK Models, Config, Event Bus, and Hex Codec

**Files:**
- Create: `itronlib/src/main/java/com/itorn/hqd/itronlib/config/BleSdkConfig.kt`
- Create: `itronlib/src/main/java/com/itorn/hqd/itronlib/model/BleModels.kt`
- Create: `itronlib/src/main/java/com/itorn/hqd/itronlib/event/EventBus.kt`
- Create: `itronlib/src/main/java/com/itorn/hqd/itronlib/protocol/HexCodec.kt`
- Test: `itronlib/src/test/java/com/itorn/hqd/itronlib/protocol/HexCodecTest.kt`
- Test: `itronlib/src/test/java/com/itorn/hqd/itronlib/event/EventBusTest.kt`

**Interfaces:**
- Consumes: none.
- Produces: `BleSdkConfig.isConfigured(): Boolean`, `HexCodec.decode(hexText: String): Result<ByteArray>`, `HexCodec.encode(bytes: ByteArray): String`, `EventBus.addEventListener(type, listener)`, `EventBus.removeEventListener(type, listener)`, `EventBus.dispatch(event)`, and SDK model classes used by all later tasks.

- [ ] **Step 1: Write failing hex codec tests**

```kotlin
package com.itorn.hqd.itronlib.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HexCodecTest {
    @Test
    fun decode_acceptsSpacesAndUppercase() {
        val result = HexCodec.decode("01 A0 ff")

        assertTrue(result.isSuccess)
        assertArrayEquals(byteArrayOf(0x01, 0xA0.toByte(), 0xFF.toByte()), result.getOrThrow())
    }

    @Test
    fun decode_rejectsOddCharacterCount() {
        val result = HexCodec.decode("0A 1")

        assertTrue(result.isFailure)
        assertEquals("Hex input must contain an even number of characters", result.exceptionOrNull()?.message)
    }

    @Test
    fun encode_formatsUppercaseWithSpaces() {
        assertEquals("01 A0 FF", HexCodec.encode(byteArrayOf(0x01, 0xA0.toByte(), 0xFF.toByte())))
    }
}
```

- [ ] **Step 2: Write failing event bus tests**

```kotlin
package com.itorn.hqd.itronlib.event

import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.VMPenEventType
import org.junit.Assert.assertEquals
import org.junit.Test

class EventBusTest {
    @Test
    fun dispatch_notifiesOnlyMatchingType() {
        val bus = EventBus()
        val received = mutableListOf<BleEvent>()

        bus.addEventListener(VMPenEventType.ScanBleEvent) { received += it }
        bus.dispatch(BleEvent.ScanFinished)
        bus.dispatch(BleEvent.ConnectStatusChanged(com.itorn.hqd.itronlib.model.BleState.DisConnected))

        assertEquals(listOf(BleEvent.ScanFinished), received)
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `./gradlew :itronlib:testDebugUnitTest --tests '*HexCodecTest' --tests '*EventBusTest'`

Expected: FAIL because `HexCodec`, `EventBus`, and model types do not exist.

- [ ] **Step 4: Create SDK config and model classes**

```kotlin
package com.itorn.hqd.itronlib.config

import java.util.UUID

data class BleSdkConfig(
    val serviceUuid: UUID? = null,
    val writeCharacteristicUuid: UUID? = null,
    val notifyCharacteristicUuid: UUID? = null,
    val scanTimeoutMs: Long = 20_000L,
) {
    fun isConfigured(): Boolean =
        serviceUuid != null && writeCharacteristicUuid != null && notifyCharacteristicUuid != null
}
```

```kotlin
package com.itorn.hqd.itronlib.model

import android.bluetooth.BluetoothDevice

enum class VMPenEventType {
    ScanBleEvent,
    ConnectStatusEvent,
    DeviceInfoEvent,
    DeviceStateEvent,
    DataEvent,
    ErrorEvent,
}

enum class BleState {
    Idle,
    Scanning,
    Connecting,
    ConnectSuccess,
    Reconnecting,
    DisConnected,
    Error,
}

data class BleScanDevice(
    val name: String,
    val mac: String,
    val rssi: Int,
    val device: BluetoothDevice? = null,
)

data class DeviceInfo(
    val serialNumber: String,
    val locked: Boolean,
)

sealed class BleEvent(val type: VMPenEventType) {
    data class ScanResult(val device: BleScanDevice) : BleEvent(VMPenEventType.ScanBleEvent)
    data object ScanFinished : BleEvent(VMPenEventType.ScanBleEvent)
    data class ConnectStatusChanged(val state: BleState, val message: String? = null) : BleEvent(VMPenEventType.ConnectStatusEvent)
    data class DeviceInfoReceived(val info: DeviceInfo) : BleEvent(VMPenEventType.DeviceInfoEvent)
    data class DeviceStateReceived(val state: Boolean) : BleEvent(VMPenEventType.DeviceStateEvent)
    data class DataSent(val hex: String) : BleEvent(VMPenEventType.DataEvent)
    data class DataReceived(val hex: String) : BleEvent(VMPenEventType.DataEvent)
    data class Error(val message: String, val cause: Throwable? = null) : BleEvent(VMPenEventType.ErrorEvent)
}
```

- [ ] **Step 5: Create event bus and hex codec**

```kotlin
package com.itorn.hqd.itronlib.event

import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.VMPenEventType
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.ConcurrentHashMap

fun interface EventListener {
    fun performed(event: BleEvent)
}

class EventBus {
    private val listeners = ConcurrentHashMap<VMPenEventType, CopyOnWriteArrayList<EventListener>>()

    fun addEventListener(type: VMPenEventType, listener: EventListener) {
        listeners.getOrPut(type) { CopyOnWriteArrayList() }.add(listener)
    }

    fun removeEventListener(type: VMPenEventType, listener: EventListener) {
        listeners[type]?.remove(listener)
    }

    fun clear() {
        listeners.clear()
    }

    fun dispatch(event: BleEvent) {
        listeners[event.type].orEmpty().forEach { it.performed(event) }
    }
}
```

```kotlin
package com.itorn.hqd.itronlib.protocol

object HexCodec {
    fun decode(hexText: String): Result<ByteArray> = runCatching {
        val normalized = hexText.replace("\\s".toRegex(), "").uppercase()
        require(normalized.isNotEmpty()) { "Hex input cannot be empty" }
        require(normalized.length % 2 == 0) { "Hex input must contain an even number of characters" }
        require(normalized.all { it in '0'..'9' || it in 'A'..'F' }) { "Hex input contains invalid characters" }

        normalized.chunked(2)
            .map { it.toInt(16).toByte() }
            .toByteArray()
    }

    fun encode(bytes: ByteArray): String =
        bytes.joinToString(" ") { "%02X".format(it.toInt() and 0xFF) }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `./gradlew :itronlib:testDebugUnitTest --tests '*HexCodecTest' --tests '*EventBusTest'`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add itronlib/src/main/java/com/itorn/hqd/itronlib/config/BleSdkConfig.kt \
  itronlib/src/main/java/com/itorn/hqd/itronlib/model/BleModels.kt \
  itronlib/src/main/java/com/itorn/hqd/itronlib/event/EventBus.kt \
  itronlib/src/main/java/com/itorn/hqd/itronlib/protocol/HexCodec.kt \
  itronlib/src/test/java/com/itorn/hqd/itronlib/protocol/HexCodecTest.kt \
  itronlib/src/test/java/com/itorn/hqd/itronlib/event/EventBusTest.kt
git commit -m "feat: add BLE SDK core models"
```

### Task 2: Baseline Protocol Commands

**Files:**
- Create: `itronlib/src/main/java/com/itorn/hqd/itronlib/protocol/BleProtocol.kt`
- Test: `itronlib/src/test/java/com/itorn/hqd/itronlib/protocol/BleProtocolTest.kt`

**Interfaces:**
- Consumes: `DeviceInfo`, `HexCodec.encode(bytes)`.
- Produces: `BleProtocol.readDeviceInfoCommand(): ByteArray`, `BleProtocol.setRecordStateCommand(state: Boolean): ByteArray`, `BleProtocol.parseDeviceInfo(bytes: ByteArray): Result<DeviceInfo>`, `BleProtocol.parseDeviceState(bytes: ByteArray): Result<Boolean>`.

- [ ] **Step 1: Write failing protocol tests**

```kotlin
package com.itorn.hqd.itronlib.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BleProtocolTest {
    @Test
    fun readDeviceInfoCommand_isCommand01() {
        assertArrayEquals(byteArrayOf(0x01), BleProtocol.readDeviceInfoCommand())
    }

    @Test
    fun setRecordStateCommand_usesCommand02AndBooleanByte() {
        assertArrayEquals(byteArrayOf(0x02, 0x01), BleProtocol.setRecordStateCommand(true))
        assertArrayEquals(byteArrayOf(0x02, 0x00), BleProtocol.setRecordStateCommand(false))
    }

    @Test
    fun parseDeviceInfo_readsSnAndLockStateFromSimpleFrame() {
        val frame = byteArrayOf(0x01, 0x01, 0x48, 0x51, 0x44)

        val info = BleProtocol.parseDeviceInfo(frame).getOrThrow()

        assertEquals("HQD", info.serialNumber)
        assertEquals(true, info.locked)
    }

    @Test
    fun parseDeviceState_rejectsWrongCommand() {
        val result = BleProtocol.parseDeviceState(byteArrayOf(0x03, 0x01))

        assertTrue(result.isFailure)
        assertEquals("Unexpected device state response command: 0x03", result.exceptionOrNull()?.message)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :itronlib:testDebugUnitTest --tests '*BleProtocolTest'`

Expected: FAIL because `BleProtocol` does not exist.

- [ ] **Step 3: Add protocol implementation**

```kotlin
package com.itorn.hqd.itronlib.protocol

import com.itorn.hqd.itronlib.model.DeviceInfo

object BleProtocol {
    private const val CMD_DEVICE_INFO = 0x01
    private const val CMD_DEVICE_STATE = 0x02

    fun readDeviceInfoCommand(): ByteArray = byteArrayOf(CMD_DEVICE_INFO.toByte())

    fun setRecordStateCommand(state: Boolean): ByteArray =
        byteArrayOf(CMD_DEVICE_STATE.toByte(), if (state) 0x01 else 0x00)

    fun parseDeviceInfo(bytes: ByteArray): Result<DeviceInfo> = runCatching {
        require(bytes.size >= 3) { "Device info response is too short" }
        val command = bytes[0].toInt() and 0xFF
        require(command == CMD_DEVICE_INFO) { "Unexpected device info response command: 0x%02X".format(command) }
        val locked = bytes[1].toInt() != 0
        val serialNumber = bytes.copyOfRange(2, bytes.size).toString(Charsets.UTF_8)
        DeviceInfo(serialNumber = serialNumber, locked = locked)
    }

    fun parseDeviceState(bytes: ByteArray): Result<Boolean> = runCatching {
        require(bytes.size >= 2) { "Device state response is too short" }
        val command = bytes[0].toInt() and 0xFF
        require(command == CMD_DEVICE_STATE) { "Unexpected device state response command: 0x%02X".format(command) }
        bytes[1].toInt() != 0
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./gradlew :itronlib:testDebugUnitTest --tests '*BleProtocolTest'`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add itronlib/src/main/java/com/itorn/hqd/itronlib/protocol/BleProtocol.kt \
  itronlib/src/test/java/com/itorn/hqd/itronlib/protocol/BleProtocolTest.kt
git commit -m "feat: add baseline BLE protocol commands"
```

### Task 3: BLE Scanner

**Files:**
- Create: `itronlib/src/main/java/com/itorn/hqd/itronlib/scan/BleScanner.kt`
- Modify: `itronlib/src/main/AndroidManifest.xml`
- Test: `itronlib/src/test/java/com/itorn/hqd/itronlib/scan/ScanResultStoreTest.kt`

**Interfaces:**
- Consumes: `BleScanDevice`, `BleEvent`, `EventBus`, `BleSdkConfig.scanTimeoutMs`.
- Produces: `BleScanner.startScan()`, `BleScanner.stopScan()`, and internal `ScanResultStore.upsert(device): List<BleScanDevice>`.

- [ ] **Step 1: Write failing scan deduplication test**

```kotlin
package com.itorn.hqd.itronlib.scan

import com.itorn.hqd.itronlib.model.BleScanDevice
import org.junit.Assert.assertEquals
import org.junit.Test

class ScanResultStoreTest {
    @Test
    fun upsert_replacesExistingDeviceByMacAndKeepsLatestRssi() {
        val store = ScanResultStore()

        store.upsert(BleScanDevice(name = "HQD", mac = "AA:BB", rssi = -70))
        val devices = store.upsert(BleScanDevice(name = "HQD", mac = "AA:BB", rssi = -51))

        assertEquals(1, devices.size)
        assertEquals(-51, devices.single().rssi)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :itronlib:testDebugUnitTest --tests '*ScanResultStoreTest'`

Expected: FAIL because `ScanResultStore` does not exist.

- [ ] **Step 3: Add manifest permissions**

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-feature
        android:name="android.hardware.bluetooth_le"
        android:required="true" />

    <uses-permission
        android:name="android.permission.BLUETOOTH"
        android:maxSdkVersion="30" />
    <uses-permission
        android:name="android.permission.BLUETOOTH_ADMIN"
        android:maxSdkVersion="30" />
    <uses-permission
        android:name="android.permission.BLUETOOTH_SCAN"
        android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
</manifest>
```

- [ ] **Step 4: Add scanner implementation**

```kotlin
package com.itorn.hqd.itronlib.scan

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.itorn.hqd.itronlib.config.BleSdkConfig
import com.itorn.hqd.itronlib.event.EventBus
import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.BleScanDevice

class ScanResultStore {
    private val devices = linkedMapOf<String, BleScanDevice>()

    fun upsert(device: BleScanDevice): List<BleScanDevice> {
        devices[device.mac] = device
        return devices.values.sortedByDescending { it.rssi }
    }

    fun clear() {
        devices.clear()
    }
}

class BleScanner(
    private val context: Context,
    private val config: BleSdkConfig,
    private val eventBus: EventBus,
) {
    private val handler = Handler(Looper.getMainLooper())
    private val store = ScanResultStore()
    private var scanning = false

    private val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device
            val item = BleScanDevice(
                name = device.name ?: "Unknown",
                mac = device.address,
                rssi = result.rssi,
                device = device,
            )
            store.upsert(item)
            eventBus.dispatch(BleEvent.ScanResult(item))
        }

        override fun onScanFailed(errorCode: Int) {
            scanning = false
            eventBus.dispatch(BleEvent.Error("BLE scan failed: $errorCode"))
            eventBus.dispatch(BleEvent.ScanFinished)
        }
    }

    @SuppressLint("MissingPermission")
    fun startScan() {
        if (!hasScanPermission()) {
            eventBus.dispatch(BleEvent.Error("Bluetooth scan permission is missing"))
            return
        }
        val scanner = context.getSystemService(BluetoothManager::class.java)
            ?.adapter
            ?.bluetoothLeScanner
        if (scanner == null) {
            eventBus.dispatch(BleEvent.Error("Bluetooth LE scanner is unavailable"))
            return
        }
        store.clear()
        scanning = true
        scanner.startScan(callback)
        handler.postDelayed({ stopScan() }, config.scanTimeoutMs)
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        if (!scanning) return
        val scanner = context.getSystemService(BluetoothManager::class.java)
            ?.adapter
            ?.bluetoothLeScanner
        scanner?.stopScan(callback)
        scanning = false
        eventBus.dispatch(BleEvent.ScanFinished)
    }

    private fun hasScanPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
}
```

- [ ] **Step 5: Add SDK dependency for `androidx.core` if missing**

Confirm `itronlib/build.gradle.kts` contains:

```kotlin
dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}
```

- [ ] **Step 6: Run scanner test**

Run: `./gradlew :itronlib:testDebugUnitTest --tests '*ScanResultStoreTest'`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add itronlib/src/main/AndroidManifest.xml \
  itronlib/src/main/java/com/itorn/hqd/itronlib/scan/BleScanner.kt \
  itronlib/src/test/java/com/itorn/hqd/itronlib/scan/ScanResultStoreTest.kt
git commit -m "feat: add BLE scanner"
```

### Task 4: GATT Connection Manager and Writes

**Files:**
- Create: `itronlib/src/main/java/com/itorn/hqd/itronlib/connection/BleConnectionManager.kt`
- Test: `itronlib/src/test/java/com/itorn/hqd/itronlib/connection/ReconnectPolicyTest.kt`

**Interfaces:**
- Consumes: `BleSdkConfig`, `BleEvent`, `BleState`, `EventBus`, `HexCodec`, and `BleProtocol`.
- Produces: `BleConnectionManager.connect(mac: String)`, `disconnect(mac: String)`, `isConnected(): Boolean`, `send(bytes: ByteArray): Boolean`, `readDeviceInfo()`, `setRecordState(state)`, and `ReconnectPolicy.shouldRetry()`.

- [ ] **Step 1: Write failing reconnect policy test**

```kotlin
package com.itorn.hqd.itronlib.connection

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReconnectPolicyTest {
    @Test
    fun shouldRetry_returnsTrueOnlyOnce() {
        val policy = ReconnectPolicy(maxAttempts = 1)

        assertTrue(policy.shouldRetry())
        assertFalse(policy.shouldRetry())
    }

    @Test
    fun reset_allowsOneRetryAgain() {
        val policy = ReconnectPolicy(maxAttempts = 1)

        policy.shouldRetry()
        policy.reset()

        assertTrue(policy.shouldRetry())
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :itronlib:testDebugUnitTest --tests '*ReconnectPolicyTest'`

Expected: FAIL because `ReconnectPolicy` does not exist.

- [ ] **Step 3: Add reconnect policy and connection manager**

```kotlin
package com.itorn.hqd.itronlib.connection

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.itorn.hqd.itronlib.config.BleSdkConfig
import com.itorn.hqd.itronlib.event.EventBus
import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.BleState
import com.itorn.hqd.itronlib.protocol.BleProtocol
import com.itorn.hqd.itronlib.protocol.HexCodec
import java.util.UUID

class ReconnectPolicy(private val maxAttempts: Int) {
    private var attempts = 0

    fun shouldRetry(): Boolean {
        if (attempts >= maxAttempts) return false
        attempts += 1
        return true
    }

    fun reset() {
        attempts = 0
    }
}

class BleConnectionManager(
    private val context: Context,
    private val config: BleSdkConfig,
    private val eventBus: EventBus,
) {
    private val reconnectPolicy = ReconnectPolicy(maxAttempts = 1)
    private var gatt: BluetoothGatt? = null
    private var connectedMac: String? = null
    private var writeCharacteristic: BluetoothGattCharacteristic? = null
    private var notifyCharacteristic: BluetoothGattCharacteristic? = null

    private val callback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.Connecting, "Discovering services"))
                gatt.discoverServices()
                return
            }
            if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                handleDisconnected()
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                eventBus.dispatch(BleEvent.Error("GATT service discovery failed: $status"))
                handleDisconnected()
                return
            }
            bindCharacteristics(gatt)
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
            handleIncoming(value)
        }

        @Deprecated("Android keeps this callback for older API behavior")
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            handleIncoming(characteristic.value ?: byteArrayOf())
        }
    }

    @SuppressLint("MissingPermission")
    fun connect(mac: String) {
        if (!config.isConfigured()) {
            eventBus.dispatch(BleEvent.Error("BLE communication UUIDs are not configured"))
            eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.Error, "UUID not configured"))
            return
        }
        if (!hasConnectPermission()) {
            eventBus.dispatch(BleEvent.Error("Bluetooth connect permission is missing"))
            return
        }
        val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
        val device = adapter?.getRemoteDevice(mac)
        if (device == null) {
            eventBus.dispatch(BleEvent.Error("Bluetooth device not found: $mac"))
            return
        }
        connectedMac = mac
        eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.Connecting))
        gatt = device.connectGatt(context, false, callback)
    }

    @SuppressLint("MissingPermission")
    fun disconnect(mac: String) {
        if (connectedMac == mac) {
            reconnectPolicy.reset()
            gatt?.disconnect()
            gatt?.close()
            gatt = null
            eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.DisConnected))
        }
    }

    fun isConnected(): Boolean = gatt != null && writeCharacteristic != null

    @SuppressLint("MissingPermission")
    fun send(bytes: ByteArray): Boolean {
        val targetGatt = gatt ?: return false
        val characteristic = writeCharacteristic ?: return false
        characteristic.value = bytes
        val success = targetGatt.writeCharacteristic(characteristic)
        if (success) eventBus.dispatch(BleEvent.DataSent(HexCodec.encode(bytes)))
        if (!success) eventBus.dispatch(BleEvent.Error("BLE write failed"))
        return success
    }

    fun readDeviceInfo(): Boolean = send(BleProtocol.readDeviceInfoCommand())

    fun setRecordState(state: Boolean): Boolean = send(BleProtocol.setRecordStateCommand(state))

    @SuppressLint("MissingPermission")
    private fun bindCharacteristics(gatt: BluetoothGatt) {
        val service = gatt.getService(config.serviceUuid)
        if (service == null) {
            eventBus.dispatch(BleEvent.Error("Communication service not found"))
            handleDisconnected()
            return
        }
        writeCharacteristic = service.getCharacteristic(config.writeCharacteristicUuid)
        notifyCharacteristic = service.getCharacteristic(config.notifyCharacteristicUuid)
        if (writeCharacteristic == null || notifyCharacteristic == null) {
            eventBus.dispatch(BleEvent.Error("Communication characteristic not found"))
            handleDisconnected()
            return
        }
        val notify = notifyCharacteristic ?: return
        gatt.setCharacteristicNotification(notify, true)
        notify.getDescriptor(UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"))?.let { descriptor ->
            descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
            gatt.writeDescriptor(descriptor)
        }
        reconnectPolicy.reset()
        eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.ConnectSuccess))
    }

    private fun handleIncoming(bytes: ByteArray) {
        eventBus.dispatch(BleEvent.DataReceived(HexCodec.encode(bytes)))
        BleProtocol.parseDeviceInfo(bytes).onSuccess { eventBus.dispatch(BleEvent.DeviceInfoReceived(it)) }
        BleProtocol.parseDeviceState(bytes).onSuccess { eventBus.dispatch(BleEvent.DeviceStateReceived(it)) }
    }

    private fun handleDisconnected() {
        writeCharacteristic = null
        notifyCharacteristic = null
        if (connectedMac != null && reconnectPolicy.shouldRetry()) {
            eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.Reconnecting))
            connect(connectedMac!!)
            return
        }
        eventBus.dispatch(BleEvent.ConnectStatusChanged(BleState.DisConnected))
    }

    private fun hasConnectPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
}
```

- [ ] **Step 4: Run reconnect policy test**

Run: `./gradlew :itronlib:testDebugUnitTest --tests '*ReconnectPolicyTest'`

Expected: PASS.

- [ ] **Step 5: Run SDK compile check**

Run: `./gradlew :itronlib:compileDebugKotlin`

Expected: PASS with JDK 17.

- [ ] **Step 6: Commit**

```bash
git add itronlib/src/main/java/com/itorn/hqd/itronlib/connection/BleConnectionManager.kt \
  itronlib/src/test/java/com/itorn/hqd/itronlib/connection/ReconnectPolicyTest.kt
git commit -m "feat: add BLE GATT connection manager"
```

### Task 5: DeviceManager Public Facade

**Files:**
- Create: `itronlib/src/main/java/com/itorn/hqd/itronlib/DeviceManager.kt`
- Test: `itronlib/src/test/java/com/itorn/hqd/itronlib/DeviceManagerTest.kt`

**Interfaces:**
- Consumes: `BleScanner`, `BleConnectionManager`, `EventBus`, `BleSdkConfig`, `EventListener`, and `VMPenEventType`.
- Produces: baseline public singleton API used by the app.

- [ ] **Step 1: Write failing singleton API test**

```kotlin
package com.itorn.hqd.itronlib

import org.junit.Assert.assertSame
import org.junit.Test

class DeviceManagerTest {
    @Test
    fun getInstance_returnsSingleton() {
        assertSame(DeviceManager.getInstance(), DeviceManager.getInstance())
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :itronlib:testDebugUnitTest --tests '*DeviceManagerTest'`

Expected: FAIL because `DeviceManager` does not exist.

- [ ] **Step 3: Add DeviceManager facade**

```kotlin
package com.itorn.hqd.itronlib

import android.app.Application
import com.itorn.hqd.itronlib.config.BleSdkConfig
import com.itorn.hqd.itronlib.connection.BleConnectionManager
import com.itorn.hqd.itronlib.event.EventBus
import com.itorn.hqd.itronlib.event.EventListener
import com.itorn.hqd.itronlib.model.VMPenEventType
import com.itorn.hqd.itronlib.protocol.HexCodec
import com.itorn.hqd.itronlib.scan.BleScanner

class DeviceManager private constructor() {
    private val eventBus = EventBus()
    private var app: Application? = null
    private var config: BleSdkConfig = BleSdkConfig()
    private var scanner: BleScanner? = null
    private var connectionManager: BleConnectionManager? = null

    fun init(app: Application, config: BleSdkConfig = BleSdkConfig()) {
        this.app = app
        this.config = config
        scanner = BleScanner(app, config, eventBus)
        connectionManager = BleConnectionManager(app, config, eventBus)
    }

    fun release() {
        scanner?.stopScan()
        eventBus.clear()
        scanner = null
        connectionManager = null
        app = null
    }

    fun isServiceConnect(): Boolean = app != null

    fun scanBle() {
        scanner?.startScan() ?: dispatchNotInitialized()
    }

    fun stopScan() {
        scanner?.stopScan()
    }

    fun connectDevice(mac: String) {
        connectionManager?.connect(mac) ?: dispatchNotInitialized()
    }

    fun disconnect(mac: String) {
        connectionManager?.disconnect(mac)
    }

    fun isConnected(): Boolean = connectionManager?.isConnected() == true

    fun readDeviceInfo() {
        connectionManager?.readDeviceInfo() ?: dispatchNotInitialized()
    }

    fun setRecordState(state: Boolean) {
        connectionManager?.setRecordState(state) ?: dispatchNotInitialized()
    }

    fun sendHex(hexText: String) {
        val bytes = HexCodec.decode(hexText).getOrElse {
            eventBus.dispatch(com.itorn.hqd.itronlib.model.BleEvent.Error(it.message ?: "Invalid hex input", it))
            return
        }
        connectionManager?.send(bytes) ?: dispatchNotInitialized()
    }

    fun addEventListener(type: VMPenEventType, listener: EventListener) {
        eventBus.addEventListener(type, listener)
    }

    fun removeEventListener(type: VMPenEventType, listener: EventListener) {
        eventBus.removeEventListener(type, listener)
    }

    private fun dispatchNotInitialized() {
        eventBus.dispatch(com.itorn.hqd.itronlib.model.BleEvent.Error("DeviceManager is not initialized"))
    }

    companion object {
        private val INSTANCE = DeviceManager()

        fun getInstance(): DeviceManager = INSTANCE
    }
}
```

- [ ] **Step 4: Run facade test and SDK tests**

Run: `./gradlew :itronlib:testDebugUnitTest`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add itronlib/src/main/java/com/itorn/hqd/itronlib/DeviceManager.kt \
  itronlib/src/test/java/com/itorn/hqd/itronlib/DeviceManagerTest.kt
git commit -m "feat: expose DeviceManager BLE API"
```

### Task 6: App Permission Manifest, ViewModel, and Single-Screen UI

**Files:**
- Modify: `app/build.gradle.kts`
- Modify: `app/src/main/AndroidManifest.xml`
- Create: `app/src/main/java/com/itorn/hqd/ble/BleDemoViewModel.kt`
- Create: `app/src/main/java/com/itorn/hqd/ble/MainActivity.kt`
- Test: `app/src/test/java/com/itorn/hqd/ble/BleDemoViewModelTest.kt`

**Interfaces:**
- Consumes: `DeviceManager`, `BleEvent`, `BleScanDevice`, and `BleState`.
- Produces: app UI state: scan devices, selected device, connection label, log entries, hex input handling, command buttons.

- [ ] **Step 1: Add app dependency on SDK module**

In `app/build.gradle.kts`, add:

```kotlin
dependencies {
    implementation(project(":itronlib"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.material)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
}
```

- [ ] **Step 2: Add app BLE permissions**

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <uses-feature
        android:name="android.hardware.bluetooth_le"
        android:required="true" />

    <uses-permission
        android:name="android.permission.BLUETOOTH"
        android:maxSdkVersion="30" />
    <uses-permission
        android:name="android.permission.BLUETOOTH_ADMIN"
        android:maxSdkVersion="30" />
    <uses-permission
        android:name="android.permission.BLUETOOTH_SCAN"
        android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

    <application
        android:allowBackup="true"
        android:dataExtractionRules="@xml/data_extraction_rules"
        android:fullBackupContent="@xml/backup_rules"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.H158"
        tools:targetApi="31">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

- [ ] **Step 3: Write failing ViewModel reducer test**

```kotlin
package com.itorn.hqd.ble

import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.BleScanDevice
import org.junit.Assert.assertEquals
import org.junit.Test

class BleDemoViewModelTest {
    @Test
    fun onBleEvent_addsScanDevice() {
        val viewModel = BleDemoViewModel(deviceManager = FakeDeviceManager())

        viewModel.onBleEvent(BleEvent.ScanResult(BleScanDevice("HQD", "AA:BB", -42)))

        assertEquals("HQD", viewModel.uiState.value.devices.single().name)
    }
}
```

- [ ] **Step 4: Add ViewModel UI state**

```kotlin
package com.itorn.hqd.ble

import androidx.lifecycle.ViewModel
import com.itorn.hqd.itronlib.DeviceManager
import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.BleScanDevice
import com.itorn.hqd.itronlib.model.BleState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class LogEntry(
    val time: String,
    val direction: String,
    val hex: String,
)

data class BleDemoUiState(
    val devices: List<BleScanDevice> = emptyList(),
    val selectedDevice: BleScanDevice? = null,
    val connectionState: BleState = BleState.Idle,
    val statusText: String = "Idle",
    val logs: List<LogEntry> = emptyList(),
    val errorText: String? = null,
)

class BleDemoViewModel(
    private val deviceManager: DeviceManager = DeviceManager.getInstance(),
) : ViewModel() {
    private val _uiState = MutableStateFlow(BleDemoUiState())
    val uiState: StateFlow<BleDemoUiState> = _uiState

    fun onBleEvent(event: BleEvent) {
        when (event) {
            is BleEvent.ScanResult -> _uiState.update { state ->
                state.copy(devices = (state.devices.filterNot { it.mac == event.device.mac } + event.device).sortedByDescending { it.rssi })
            }
            is BleEvent.ConnectStatusChanged -> _uiState.update { state ->
                state.copy(connectionState = event.state, statusText = event.message ?: event.state.name)
            }
            is BleEvent.DataSent -> appendLog("TX", event.hex)
            is BleEvent.DataReceived -> appendLog("RX", event.hex)
            is BleEvent.Error -> _uiState.update { it.copy(errorText = event.message) }
            else -> Unit
        }
    }

    fun startScan() = deviceManager.scanBle()

    fun connect(device: BleScanDevice) {
        _uiState.update { it.copy(selectedDevice = device, connectionState = BleState.Connecting) }
        deviceManager.stopScan()
        deviceManager.connectDevice(device.mac)
    }

    fun sendHex(hex: String) = deviceManager.sendHex(hex)

    fun readDeviceInfo() = deviceManager.readDeviceInfo()

    fun setRecordState(state: Boolean) = deviceManager.setRecordState(state)

    fun disconnect() {
        _uiState.value.selectedDevice?.let { deviceManager.disconnect(it.mac) }
    }

    fun clearLogs() {
        _uiState.update { it.copy(logs = emptyList()) }
    }

    private fun appendLog(direction: String, hex: String) {
        val time = SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(Date())
        _uiState.update { it.copy(logs = it.logs + LogEntry(time, direction, hex)) }
    }
}
```

- [ ] **Step 5: Add MainActivity UI**

```kotlin
package com.itorn.hqd.ble

import android.Manifest
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.itorn.hqd.itronlib.DeviceManager
import com.itorn.hqd.itronlib.event.EventListener
import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.BleState
import com.itorn.hqd.itronlib.model.VMPenEventType
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private val viewModel = BleDemoViewModel()
    private lateinit var root: LinearLayout
    private val deviceManager = DeviceManager.getInstance()
    private val listener = EventListener { event -> viewModel.onBleEvent(event) }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        viewModel.startScan()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        deviceManager.init(application)
        VMPenEventType.values().forEach { deviceManager.addEventListener(it, listener) }
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
        }
        setContentView(root)
        permissionLauncher.launch(arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT))
        lifecycleScope.launch {
            viewModel.uiState.collect { render(it) }
        }
    }

    override fun onDestroy() {
        VMPenEventType.values().forEach { deviceManager.removeEventListener(it, listener) }
        deviceManager.release()
        super.onDestroy()
    }

    private fun render(state: BleDemoUiState) {
        root.removeAllViews()
        root.addView(TextView(this).apply { text = "Status: ${state.statusText}" })
        state.errorText?.let { root.addView(TextView(this).apply { text = "Error: $it" }) }

        if (state.connectionState == BleState.ConnectSuccess || state.selectedDevice != null) {
            renderSession(state)
        } else {
            renderScanner(state)
        }
    }

    private fun renderScanner(state: BleDemoUiState) {
        root.addView(Button(this).apply {
            text = "Scan BLE"
            setOnClickListener { viewModel.startScan() }
        })
        state.devices.forEach { device ->
            root.addView(Button(this).apply {
                text = "${device.name}  RSSI ${device.rssi}  ${device.mac}"
                setOnClickListener { viewModel.connect(device) }
            })
        }
    }

    private fun renderSession(state: BleDemoUiState) {
        root.addView(TextView(this).apply {
            text = state.selectedDevice?.let { "${it.name} ${it.mac}" } ?: "No device"
        })
        val input = EditText(this).apply {
            hint = "Hex, for example: 01 A0 FF"
        }
        root.addView(input)
        root.addView(Button(this).apply {
            text = "Send"
            setOnClickListener { viewModel.sendHex(input.text.toString()) }
        })
        root.addView(Button(this).apply {
            text = "Read Device Info"
            setOnClickListener { viewModel.readDeviceInfo() }
        })
        root.addView(Button(this).apply {
            text = "Set State On"
            setOnClickListener { viewModel.setRecordState(true) }
        })
        root.addView(Button(this).apply {
            text = "Clear Logs"
            setOnClickListener { viewModel.clearLogs() }
        })
        root.addView(Button(this).apply {
            text = "Disconnect"
            setOnClickListener { viewModel.disconnect() }
        })
        state.logs.takeLast(80).forEach {
            root.addView(TextView(this).apply { text = "${it.time} ${it.direction} ${it.hex}" })
        }
    }
}
```

- [ ] **Step 6: Run app compile check**

Run: `./gradlew :app:compileDebugKotlin`

Expected: PASS with JDK 17.

- [ ] **Step 7: Commit**

```bash
git add app/build.gradle.kts app/src/main/AndroidManifest.xml \
  app/src/main/java/com/itorn/hqd/ble/BleDemoViewModel.kt \
  app/src/main/java/com/itorn/hqd/ble/MainActivity.kt \
  app/src/test/java/com/itorn/hqd/ble/BleDemoViewModelTest.kt
git commit -m "feat: add BLE demo app UI"
```

### Task 7: End-to-End Verification and Documentation Update

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-07-09-ble-sdk-app-design.md` only if implementation discovers a necessary correction.
- Create: `docs/ble-manual-test.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: repeatable build/test/manual BLE verification notes.

- [ ] **Step 1: Add manual test document**

```markdown
# BLE Manual Test

## Preconditions

- JDK 17 is active.
- Android device is API 31 or newer.
- Bluetooth is enabled.
- The BLE device is powered on and advertising.
- SDK UUID configuration is set before connection testing.

## Steps

1. Install the debug app.
2. Grant Nearby Devices permissions.
3. Tap `Scan BLE`.
4. Verify the target device appears with name, RSSI, and MAC address.
5. Tap the device.
6. Verify the app reaches connected state.
7. Tap `Read Device Info`.
8. Verify TX log includes `01`.
9. Verify RX log appears when the device responds.
10. Enter `02 01` and tap `Send`.
11. Verify TX log includes `02 01`.
12. Power off or move the device out of range.
13. Verify the app shows reconnecting once, then disconnected if reconnect fails.
```

- [ ] **Step 2: Update AGENTS.md commands**

Add these commands to the existing build section:

```markdown
- `./gradlew :itronlib:testDebugUnitTest` runs SDK unit tests.
- `./gradlew :app:assembleDebug` builds the demo APK.
- `./gradlew connectedDebugAndroidTest` runs device tests when a device is connected.
```

- [ ] **Step 3: Run full verification**

Run: `./gradlew :itronlib:testDebugUnitTest :app:testDebugUnitTest :app:assembleDebug`

Expected: PASS with JDK 17.

- [ ] **Step 4: Record artifact path**

Expected debug APK path: `app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/ble-manual-test.md docs/superpowers/specs/2026-07-09-ble-sdk-app-design.md
git commit -m "docs: add BLE verification guide"
```

## Self-Review

- Spec coverage: SDK module rename, SDK scan, connect, fixed UUID config, hex send, notification receive, `DeviceManager`, baseline commands `0x01` and `0x02`, UI scan/connect/session states, reconnect once, tests, and manual verification are covered by Tasks 0-7.
- Scope check: Classic Bluetooth SPP, multi-device support, manual characteristic selection, OTA, background connection, and log export are not included in the tasks.
- Placeholder scan: The plan uses explicit code and commands. Real UUID values are absent by current project fact; the plan handles this with `BleSdkConfig.isConfigured()` and a clear runtime error until values are supplied.
- Type consistency: `DeviceManager`, `BleEvent`, `BleState`, `BleScanDevice`, `BleSdkConfig`, `HexCodec`, `BleProtocol`, `BleScanner`, and `BleConnectionManager` names are consistent across tasks.
