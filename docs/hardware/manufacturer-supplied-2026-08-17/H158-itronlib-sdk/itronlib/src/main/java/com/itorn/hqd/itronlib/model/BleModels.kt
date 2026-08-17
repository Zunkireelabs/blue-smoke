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

enum class SystemState(val value: Int, val label: String) {
    POWER_ON(0x00, "Power On"),
    POWER_OFF(0x01, "Power Off"),
    PREHEAT(0x02, "Preheating"),
    HEATING(0x03, "Heating"),
    UNKNOWN(-1, "Unknown"),
    ;

    companion object {
        fun fromValue(value: Int): SystemState =
            entries.find { it.value == value } ?: UNKNOWN
    }
}

data class ChildLockState(val locked: Boolean)

data class DeviceInfo(
    val serialNumber: String = "",
    val locked: Boolean,
    val systemState: SystemState = SystemState.UNKNOWN,
    val batteryPercent: Int = 0,
) {
    override fun toString(): String =
        buildString {
            append("SN=$serialNumber, locked=$locked")
            append(", systemState=$systemState")
            append(", battery=$batteryPercent%")
        }
}

sealed class BleEvent(val type: VMPenEventType) {
    data class ScanResult(
        val device: BleScanDevice,
        val devices: List<BleScanDevice> = listOf(device),
    ) : BleEvent(VMPenEventType.ScanBleEvent)
    data object ScanFinished : BleEvent(VMPenEventType.ScanBleEvent)
    data class ConnectStatusChanged(val state: BleState, val message: String? = null) :
        BleEvent(VMPenEventType.ConnectStatusEvent)

    data class DeviceInfoReceived(val info: DeviceInfo) : BleEvent(VMPenEventType.DeviceInfoEvent)
    data class DeviceStateReceived(val state: Boolean) : BleEvent(VMPenEventType.DeviceStateEvent)
    data class DataSent(val hex: String) : BleEvent(VMPenEventType.DataEvent)
    data class DataReceived(val hex: String) : BleEvent(VMPenEventType.DataEvent)
    data class Error(val message: String, val cause: Throwable? = null) : BleEvent(VMPenEventType.ErrorEvent)
}
