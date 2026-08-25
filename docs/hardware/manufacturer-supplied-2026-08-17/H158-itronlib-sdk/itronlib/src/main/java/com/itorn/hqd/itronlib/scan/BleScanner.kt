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

internal class ScanResultStore {
    private val devices = linkedMapOf<String, BleScanDevice>()

    fun upsert(device: BleScanDevice): List<BleScanDevice> {
        devices[device.mac] = device
        return devices.values.toList()
    }

    fun clear() {
        devices.clear()
    }
}

internal class BleScanner(
    private val context: Context,
    private val config: BleSdkConfig,
    private val eventBus: EventBus,
) {
    private val handler = Handler(Looper.getMainLooper())
    private val store = ScanResultStore()
    private var scanning = false

    // 运行时可切换的扫描名称前缀过滤；为 null 时不过滤
    var scanNamePrefix: String? = config.scanNamePrefix

    private val stopScanRunnable = Runnable { stopScan() }

    private val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            handleScanResult(result)
        }

        override fun onScanFailed(errorCode: Int) {
            handler.removeCallbacks(stopScanRunnable)
            scanning = false
            eventBus.dispatch(BleEvent.Error("BLE scan failed: $errorCode"))
            eventBus.dispatch(BleEvent.ScanFinished)
        }
    }

    @SuppressLint("MissingPermission")
    fun startScan() {
        if (scanning) return
        val permissionError = missingPermissionMessage()
        if (permissionError != null) {
            eventBus.dispatch(BleEvent.Error(permissionError))
            return
        }
        val scanner = bluetoothManager()?.adapter?.bluetoothLeScanner
        if (scanner == null) {
            eventBus.dispatch(BleEvent.Error("Bluetooth LE scanner is unavailable"))
            return
        }
        handler.removeCallbacks(stopScanRunnable)
        store.clear()
        scanning = true
        scanner.startScan(callback)
        handler.postDelayed(stopScanRunnable, config.scanTimeoutMs)
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        if (!scanning) return
        bluetoothManager()?.adapter?.bluetoothLeScanner?.stopScan(callback)
        handler.removeCallbacks(stopScanRunnable)
        scanning = false
        eventBus.dispatch(BleEvent.ScanFinished)
    }

    @SuppressLint("MissingPermission")
    private fun handleScanResult(result: ScanResult) {
        if (!hasConnectPermission()) return
        val device = result.device
        val name = visibleDeviceName(device.name, result.scanRecord?.deviceName) ?: return
        if (!matchesScanFilter(name, scanNamePrefix)) return
        val scanDevice = BleScanDevice(
            name = name,
            mac = device.address,
            rssi = result.rssi,
            device = device,
        )
        val devices = store.upsert(scanDevice)
        eventBus.dispatch(BleEvent.ScanResult(scanDevice, devices))
    }

    private fun bluetoothManager(): BluetoothManager? =
        context.getSystemService(BluetoothManager::class.java)

    private fun missingPermissionMessage(): String? =
        missingPermissionMessage(
            hasScanPermission = hasScanPermission(),
            hasConnectPermission = hasConnectPermission(),
        )

    private fun hasScanPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) ==
            PackageManager.PERMISSION_GRANTED

    private fun hasConnectPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED

    internal companion object {
        fun matchesScanFilter(name: String, prefix: String?): Boolean =
            prefix.isNullOrEmpty() || name.startsWith(prefix, ignoreCase = true)

        fun visibleDeviceName(deviceName: String?, scanRecordName: String?): String? =
            listOf(deviceName, scanRecordName)
                .asSequence()
                .mapNotNull { it?.trim() }
                .firstOrNull { it.isNotEmpty() && !it.equals("Unknown", ignoreCase = true) }

        fun missingPermissionMessage(
            hasScanPermission: Boolean,
            hasConnectPermission: Boolean,
        ): String? = when {
            !hasScanPermission && !hasConnectPermission ->
                "Bluetooth scan and connect permissions are missing"
            !hasScanPermission -> "Bluetooth scan permission is missing"
            !hasConnectPermission -> "Bluetooth connect permission is missing"
            else -> null
        }
    }
}
