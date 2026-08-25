package com.itorn.hqd.ble

import androidx.lifecycle.ViewModel
import com.itorn.hqd.itronlib.DeviceManager
import com.itorn.hqd.itronlib.config.BleSdkConfig
import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.BleScanDevice
import com.itorn.hqd.itronlib.model.BleState
import com.itorn.hqd.itronlib.model.DeviceInfo
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
    val deviceInfo: DeviceInfo? = null,
    val yp65FilterEnabled: Boolean = true,
    val logs: List<LogEntry> = emptyList(),
    val errorText: String? = null,
)

interface BleDeviceController {
    fun scanBle()
    fun stopScan()
    fun connectDevice(device: BleScanDevice)
    fun disconnect(mac: String)
    fun readDeviceInfo()
    fun setChildLock(lock: Boolean)
    fun setScanNamePrefix(prefix: String?)
}

internal class DeviceManagerController(
    private val deviceManager: DeviceManager = DeviceManager.getInstance(),
) : BleDeviceController {
    override fun scanBle() = deviceManager.scanBle()
    override fun stopScan() = deviceManager.stopScan()
    override fun connectDevice(device: BleScanDevice) {
        // 优先使用扫描回调里的原始 BluetoothDevice，保留正确的地址类型
        device.device?.let { deviceManager.connectDevice(it) }
            ?: deviceManager.connectDevice(device.mac)
    }
    override fun disconnect(mac: String) = deviceManager.disconnect(mac)
    override fun readDeviceInfo() = deviceManager.readDeviceInfo()
    override fun setChildLock(lock: Boolean) = deviceManager.setChildLock(lock)
    override fun setScanNamePrefix(prefix: String?) = deviceManager.setScanNamePrefix(prefix)
}

class BleDemoViewModel() : ViewModel() {
    private var deviceController: BleDeviceController = DeviceManagerController()
    private val _uiState = MutableStateFlow(BleDemoUiState())
    val uiState: StateFlow<BleDemoUiState> = _uiState
    var sdkInitialized: Boolean = false
        private set

    internal constructor(deviceController: BleDeviceController) : this() {
        this.deviceController = deviceController
    }

    fun markSdkInitialized() {
        sdkInitialized = true
    }

    fun markSdkReleased() {
        sdkInitialized = false
    }

    fun onBleEvent(event: BleEvent) {
        when (event) {
            is BleEvent.ScanResult -> updateScanDevices(event.devices)
            BleEvent.ScanFinished -> _uiState.update { it.copy(statusText = "Scan finished") }
            is BleEvent.ConnectStatusChanged -> _uiState.update {
                val clearSelection = event.state == BleState.DisConnected || event.state == BleState.Error
                it.copy(
                    selectedDevice = if (clearSelection) null else it.selectedDevice,
                    deviceInfo = if (clearSelection) null else it.deviceInfo,
                    connectionState = event.state,
                    statusText = event.message ?: event.state.name,
                )
            }
            is BleEvent.DeviceInfoReceived -> {
                _uiState.update { it.copy(deviceInfo = event.info) }
                appendLog("INFO", "${if (event.info.locked) "Locked" else "Unlocked"} | ${event.info.systemState.label} | Battery ${event.info.batteryPercent}%")
            }
            is BleEvent.DeviceStateReceived -> {
                _uiState.update {
                    it.copy(deviceInfo = (it.deviceInfo ?: DeviceInfo(locked = event.state)).copy(locked = event.state))
                }
                appendLog("LOCK", if (event.state) "Child lock: Locked" else "Child lock: Unlocked")
            }
            is BleEvent.DataSent -> appendLog("TX", event.hex)
            is BleEvent.DataReceived -> appendLog("RX", event.hex)
            is BleEvent.Error -> _uiState.update {
                if (it.connectionState == BleState.Connecting) {
                    it.copy(
                        selectedDevice = null,
                        deviceInfo = null,
                        connectionState = BleState.Error,
                        statusText = "Connection failed",
                        errorText = event.message,
                    )
                } else {
                    it.copy(errorText = event.message)
                }
            }
        }
    }

    fun startScan() {
        _uiState.update { it.copy(statusText = "Scanning", errorText = null) }
        deviceController.scanBle()
    }

    fun startScanIfIdle() {
        val state = _uiState.value.connectionState
        if (state == BleState.Connecting || state == BleState.ConnectSuccess || state == BleState.Reconnecting) {
            return
        }
        startScan()
    }

    fun setYp65Filter(enabled: Boolean) {
        _uiState.update { it.copy(yp65FilterEnabled = enabled) }
        deviceController.setScanNamePrefix(
            if (enabled) BleSdkConfig.DEFAULT_SCAN_NAME_PREFIX else null,
        )
        // 重新扫描以按新过滤条件刷新列表（startScan 会清空已累积结果）
        startScanIfIdle()
    }

    fun connect(device: BleScanDevice) {
        _uiState.update {
            it.copy(
                selectedDevice = device,
                connectionState = BleState.Connecting,
                statusText = "Connecting ${device.name}",
                errorText = null,
            )
        }
        deviceController.stopScan()
        deviceController.connectDevice(device)
    }

    fun disconnect() {
        _uiState.value.selectedDevice?.let { deviceController.disconnect(it.mac) }
    }

    fun readDeviceInfo() {
        deviceController.readDeviceInfo()
    }

    fun setChildLock(lock: Boolean) {
        deviceController.setChildLock(lock)
    }

    fun clearLogs() {
        _uiState.update { it.copy(logs = emptyList()) }
    }

    fun onPermissionDenied() {
        _uiState.update {
            it.copy(
                statusText = "Bluetooth permissions required",
                errorText = "Please grant Bluetooth permissions to scan and connect.",
            )
        }
    }

    private fun updateScanDevices(devices: List<BleScanDevice>) {
        _uiState.update { state ->
            val incomingByMac = devices.associateBy { it.mac }
            val existingMacs = state.devices.map { it.mac }.toSet()
            val updatedExisting = state.devices.map { incomingByMac[it.mac] ?: it }
            val newDevices = devices.filterNot { it.mac in existingMacs }
            val merged = updatedExisting + newDevices
            state.copy(devices = merged, statusText = "Found ${merged.size} device(s)")
        }
    }

    private fun appendLog(direction: String, hex: String) {
        val time = SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(Date())
        _uiState.update { it.copy(logs = it.logs + LogEntry(time, direction, hex)) }
    }
}
