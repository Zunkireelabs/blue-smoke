package com.itorn.hqd.ble

import com.itorn.hqd.itronlib.config.BleSdkConfig
import com.itorn.hqd.itronlib.model.BleEvent
import com.itorn.hqd.itronlib.model.BleScanDevice
import com.itorn.hqd.itronlib.model.BleState
import com.itorn.hqd.itronlib.model.DeviceInfo
import com.itorn.hqd.itronlib.model.SystemState
import org.junit.Assert.assertNull
import org.junit.Assert.assertEquals
import org.junit.Test

class BleDemoViewModelTest {
    @Test
    fun onBleEvent_addsScanDevice() {
        val viewModel = BleDemoViewModel(deviceController = FakeDeviceController())

        viewModel.onBleEvent(BleEvent.ScanResult(BleScanDevice("HQD", "AA:BB", -42)))

        assertEquals("HQD", viewModel.uiState.value.devices.single().name)
    }

    @Test
    fun onBleEvent_updatesExistingScanDevice() {
        val viewModel = BleDemoViewModel(deviceController = FakeDeviceController())

        viewModel.onBleEvent(BleEvent.ScanResult(BleScanDevice("HQD", "AA:BB", -70)))
        viewModel.onBleEvent(BleEvent.ScanResult(BleScanDevice("HQD", "AA:BB", -42)))

        assertEquals(-42, viewModel.uiState.value.devices.single().rssi)
    }

    @Test
    fun onBleEvent_keepsFirstSeenScanOrder() {
        val viewModel = BleDemoViewModel(deviceController = FakeDeviceController())

        viewModel.onBleEvent(BleEvent.ScanResult(BleScanDevice("First", "AA:BB", -80)))
        viewModel.onBleEvent(BleEvent.ScanResult(BleScanDevice("Second", "CC:DD", -40)))
        viewModel.onBleEvent(BleEvent.ScanResult(BleScanDevice("First", "AA:BB", -30)))

        assertEquals(listOf("AA:BB", "CC:DD"), viewModel.uiState.value.devices.map { it.mac })
    }

    @Test
    fun disconnectStatus_clearsSelectedDevice() {
        val viewModel = BleDemoViewModel(deviceController = FakeDeviceController())
        val device = BleScanDevice("HQD", "AA:BB", -42)

        viewModel.connect(device)
        viewModel.onBleEvent(BleEvent.ConnectStatusChanged(BleState.DisConnected))

        assertNull(viewModel.uiState.value.selectedDevice)
    }

    @Test
    fun genericError_preservesSelectedDevice() {
        val viewModel = BleDemoViewModel(deviceController = FakeDeviceController())
        val device = BleScanDevice("HQD", "AA:BB", -42)

        viewModel.connect(device)
        viewModel.onBleEvent(BleEvent.ConnectStatusChanged(BleState.ConnectSuccess))
        viewModel.onBleEvent(BleEvent.Error("BLE write failed"))

        assertEquals(device, viewModel.uiState.value.selectedDevice)
        assertEquals(BleState.ConnectSuccess, viewModel.uiState.value.connectionState)
    }

    @Test
    fun genericErrorDuringConnecting_clearsSelectedDevice() {
        val viewModel = BleDemoViewModel(deviceController = FakeDeviceController())
        val device = BleScanDevice("HQD", "AA:BB", -42)

        viewModel.connect(device)
        viewModel.onBleEvent(BleEvent.Error("Invalid BLE MAC address"))

        assertNull(viewModel.uiState.value.selectedDevice)
        assertEquals(BleState.Error, viewModel.uiState.value.connectionState)
    }

    @Test
    fun startScanIfIdle_doesNotScanWhenConnected() {
        val controller = FakeDeviceController()
        val viewModel = BleDemoViewModel(deviceController = controller)
        val device = BleScanDevice("HQD", "AA:BB", -42)

        viewModel.connect(device)
        viewModel.onBleEvent(BleEvent.ConnectStatusChanged(BleState.ConnectSuccess))
        viewModel.startScanIfIdle()

        assertEquals(0, controller.scanCount)
    }

    @Test
    fun setYp65Filter_off_clearsPrefixAndRescans() {
        val controller = FakeDeviceController()
        val viewModel = BleDemoViewModel(deviceController = controller)

        viewModel.setYp65Filter(false)

        assertEquals(false, viewModel.uiState.value.yp65FilterEnabled)
        assertNull(controller.lastScanNamePrefix)
        assertEquals(1, controller.scanCount)
    }

    @Test
    fun setYp65Filter_on_restoresPrefixAndRescans() {
        val controller = FakeDeviceController()
        val viewModel = BleDemoViewModel(deviceController = controller)

        viewModel.setYp65Filter(false)
        viewModel.setYp65Filter(true)

        assertEquals(true, viewModel.uiState.value.yp65FilterEnabled)
        assertEquals(BleSdkConfig.DEFAULT_SCAN_NAME_PREFIX, controller.lastScanNamePrefix)
        assertEquals(2, controller.scanCount)
    }

    @Test
    fun deviceInfoReceived_updatesDeviceInfoInState() {
        val viewModel = BleDemoViewModel(deviceController = FakeDeviceController())
        val info = DeviceInfo(locked = true, systemState = SystemState.PREHEAT, batteryPercent = 80)

        viewModel.onBleEvent(BleEvent.DeviceInfoReceived(info))

        assertEquals(info, viewModel.uiState.value.deviceInfo)
    }

    @Test
    fun deviceStateReceived_updatesLockOnly() {
        val viewModel = BleDemoViewModel(deviceController = FakeDeviceController())
        viewModel.onBleEvent(
            BleEvent.DeviceInfoReceived(
                DeviceInfo(locked = true, systemState = SystemState.HEATING, batteryPercent = 50),
            ),
        )

        viewModel.onBleEvent(BleEvent.DeviceStateReceived(false))

        val info = viewModel.uiState.value.deviceInfo
        assertEquals(false, info?.locked)
        assertEquals(SystemState.HEATING, info?.systemState)
        assertEquals(50, info?.batteryPercent)
    }

    @Test
    fun deviceStateReceived_withoutPriorInfo_createsInfo() {
        val viewModel = BleDemoViewModel(deviceController = FakeDeviceController())

        viewModel.onBleEvent(BleEvent.DeviceStateReceived(true))

        assertEquals(true, viewModel.uiState.value.deviceInfo?.locked)
    }

    @Test
    fun disconnectStatus_clearsDeviceInfo() {
        val viewModel = BleDemoViewModel(deviceController = FakeDeviceController())
        val device = BleScanDevice("HQD", "AA:BB", -42)

        viewModel.connect(device)
        viewModel.onBleEvent(BleEvent.DeviceInfoReceived(DeviceInfo(locked = true, batteryPercent = 80)))
        viewModel.onBleEvent(BleEvent.ConnectStatusChanged(BleState.DisConnected))

        assertNull(viewModel.uiState.value.deviceInfo)
    }

    private class FakeDeviceController : BleDeviceController {
        var scanCount = 0
        var lastScanNamePrefix: String? = "INITIAL"

        override fun scanBle() {
            scanCount += 1
        }
        override fun stopScan() = Unit
        override fun connectDevice(device: BleScanDevice) = Unit
        override fun disconnect(mac: String) = Unit
        override fun readDeviceInfo() = Unit
        override fun setChildLock(lock: Boolean) = Unit
        override fun setScanNamePrefix(prefix: String?) {
            lastScanNamePrefix = prefix
        }
    }
}
