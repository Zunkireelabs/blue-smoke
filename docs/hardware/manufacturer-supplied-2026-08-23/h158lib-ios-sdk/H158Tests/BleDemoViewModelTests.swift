import h158lib
import Testing
@testable import H158

@MainActor
struct BleDemoViewModelTests {

    @Test func onBleEvent_addsScanDevice() {
        let viewModel = BleDemoViewModel(deviceController: FakeDeviceController())

        viewModel.onBleEvent(.scanResult(
            device: BleScanDevice(name: "HQD", id: "AA-BB", rssi: -42),
            devices: [BleScanDevice(name: "HQD", id: "AA-BB", rssi: -42)]
        ))

        #expect(viewModel.uiState.devices.count == 1)
        #expect(viewModel.uiState.devices.first?.name == "HQD")
    }

    @Test func onBleEvent_updatesExistingScanDevice() {
        let viewModel = BleDemoViewModel(deviceController: FakeDeviceController())

        viewModel.onBleEvent(.scanResult(
            device: BleScanDevice(name: "HQD", id: "AA-BB", rssi: -70),
            devices: [BleScanDevice(name: "HQD", id: "AA-BB", rssi: -70)]
        ))
        viewModel.onBleEvent(.scanResult(
            device: BleScanDevice(name: "HQD", id: "AA-BB", rssi: -42),
            devices: [BleScanDevice(name: "HQD", id: "AA-BB", rssi: -42)]
        ))

        #expect(viewModel.uiState.devices.count == 1)
        #expect(viewModel.uiState.devices.first?.rssi == -42)
    }

    @Test func onBleEvent_keepsFirstSeenScanOrder() {
        let viewModel = BleDemoViewModel(deviceController: FakeDeviceController())

        viewModel.onBleEvent(.scanResult(
            device: BleScanDevice(name: "First", id: "AA-BB", rssi: -80),
            devices: [BleScanDevice(name: "First", id: "AA-BB", rssi: -80)]
        ))
        viewModel.onBleEvent(.scanResult(
            device: BleScanDevice(name: "Second", id: "CC-DD", rssi: -40),
            devices: [BleScanDevice(name: "First", id: "AA-BB", rssi: -80),
                      BleScanDevice(name: "Second", id: "CC-DD", rssi: -40)]
        ))
        viewModel.onBleEvent(.scanResult(
            device: BleScanDevice(name: "First", id: "AA-BB", rssi: -30),
            devices: [BleScanDevice(name: "First", id: "AA-BB", rssi: -30),
                      BleScanDevice(name: "Second", id: "CC-DD", rssi: -40)]
        ))

        #expect(viewModel.uiState.devices.map(\.id) == ["AA-BB", "CC-DD"])
    }

    @Test func disconnectStatus_clearsSelectedDevice() {
        let viewModel = BleDemoViewModel(deviceController: FakeDeviceController())
        let device = BleScanDevice(name: "HQD", id: "AA-BB", rssi: -42)

        viewModel.connect(device)
        viewModel.onBleEvent(.connectStatusChanged(state: .disConnected, message: nil))

        #expect(viewModel.uiState.selectedDevice == nil)
    }

    @Test func genericError_preservesSelectedDevice() {
        let viewModel = BleDemoViewModel(deviceController: FakeDeviceController())
        let device = BleScanDevice(name: "HQD", id: "AA-BB", rssi: -42)

        viewModel.connect(device)
        viewModel.onBleEvent(.connectStatusChanged(state: .connectSuccess, message: nil))
        viewModel.onBleEvent(.error(message: "BLE write failed", cause: nil))

        #expect(viewModel.uiState.selectedDevice == device)
        #expect(viewModel.uiState.connectionState == .connectSuccess)
    }

    @Test func genericErrorDuringConnecting_clearsSelectedDevice() {
        let viewModel = BleDemoViewModel(deviceController: FakeDeviceController())
        let device = BleScanDevice(name: "HQD", id: "AA-BB", rssi: -42)

        viewModel.connect(device)
        viewModel.onBleEvent(.error(message: "Invalid BLE device id", cause: nil))

        #expect(viewModel.uiState.selectedDevice == nil)
        #expect(viewModel.uiState.connectionState == .error)
    }

    @Test func startScanIfIdle_doesNotScanWhenConnected() {
        let controller = FakeDeviceController()
        let viewModel = BleDemoViewModel(deviceController: controller)
        let device = BleScanDevice(name: "HQD", id: "AA-BB", rssi: -42)

        viewModel.connect(device)
        viewModel.onBleEvent(.connectStatusChanged(state: .connectSuccess, message: nil))
        viewModel.startScanIfIdle()

        #expect(controller.scanCount == 0)
    }

    @Test func setYp65Filter_off_clearsPrefixAndRescans() {
        let controller = FakeDeviceController()
        let viewModel = BleDemoViewModel(deviceController: controller)

        viewModel.setYp65Filter(false)

        #expect(viewModel.uiState.yp65FilterEnabled == false)
        #expect(controller.lastScanNamePrefix == nil)
        #expect(controller.scanCount == 1)
    }

    @Test func setYp65Filter_on_restoresPrefixAndRescans() {
        let controller = FakeDeviceController()
        let viewModel = BleDemoViewModel(deviceController: controller)

        viewModel.setYp65Filter(false)
        viewModel.setYp65Filter(true)

        #expect(viewModel.uiState.yp65FilterEnabled == true)
        #expect(controller.lastScanNamePrefix == BleSdkConfig.defaultScanNamePrefix)
        #expect(controller.scanCount == 2)
    }

    @Test func deviceInfoReceived_updatesDeviceInfoInState() {
        let viewModel = BleDemoViewModel(deviceController: FakeDeviceController())
        let info = DeviceInfo(locked: true, systemState: .preheat, batteryPercent: 80)

        viewModel.onBleEvent(.deviceInfoReceived(info: info))

        #expect(viewModel.uiState.deviceInfo == info)
    }

    @Test func deviceStateReceived_updatesLockOnly() {
        let viewModel = BleDemoViewModel(deviceController: FakeDeviceController())
        viewModel.onBleEvent(.deviceInfoReceived(info: DeviceInfo(
            locked: true, systemState: .heating, batteryPercent: 50
        )))

        viewModel.onBleEvent(.deviceStateReceived(state: false))

        let info = viewModel.uiState.deviceInfo
        #expect(info?.locked == false)
        #expect(info?.systemState == .heating)
        #expect(info?.batteryPercent == 50)
    }

    @Test func deviceStateReceived_withoutPriorInfo_createsInfo() {
        let viewModel = BleDemoViewModel(deviceController: FakeDeviceController())

        viewModel.onBleEvent(.deviceStateReceived(state: true))

        #expect(viewModel.uiState.deviceInfo?.locked == true)
    }

    @Test func disconnectStatus_clearsDeviceInfo() {
        let viewModel = BleDemoViewModel(deviceController: FakeDeviceController())
        let device = BleScanDevice(name: "HQD", id: "AA-BB", rssi: -42)

        viewModel.connect(device)
        viewModel.onBleEvent(.deviceInfoReceived(info: DeviceInfo(locked: true, batteryPercent: 80)))
        viewModel.onBleEvent(.connectStatusChanged(state: .disConnected, message: nil))

        #expect(viewModel.uiState.deviceInfo == nil)
    }
}

private final class FakeDeviceController: BleDeviceController {
    var scanCount = 0
    var lastScanNamePrefix: String? = "INITIAL"

    func scanBle() { scanCount += 1 }
    func stopScan() {}
    func connectDevice(_ device: BleScanDevice) {}
    func disconnect(id: String) {}
    func readDeviceInfo() {}
    func setChildLock(_ lock: Bool) {}
    func setScanNamePrefix(_ prefix: String?) { lastScanNamePrefix = prefix }
}
