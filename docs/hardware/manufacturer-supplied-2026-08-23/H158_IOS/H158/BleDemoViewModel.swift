import Foundation
import h158lib

struct LogEntry: Equatable {
    let time: String
    let direction: String
    let hex: String
}

struct BleDemoUiState {
    var devices: [BleScanDevice] = []
    var selectedDevice: BleScanDevice?
    var connectionState: BleState = .idle
    var statusText: String = "Idle"
    var deviceInfo: DeviceInfo?
    var yp65FilterEnabled: Bool = true
    var logs: [LogEntry] = []
    var errorText: String?
}

protocol BleDeviceController {
    func scanBle()
    func stopScan()
    func connectDevice(_ device: BleScanDevice)
    func disconnect(id: String)
    func readDeviceInfo()
    func setChildLock(_ lock: Bool)
    func setScanNamePrefix(_ prefix: String?)
}

final class DeviceManagerController: BleDeviceController {
    private let deviceManager: DeviceManager

    init(deviceManager: DeviceManager = .shared) {
        self.deviceManager = deviceManager
    }

    func scanBle() { deviceManager.scanBle() }
    func stopScan() { deviceManager.stopScan() }

    func connectDevice(_ device: BleScanDevice) {
        // 优先使用扫描回调里的原始 CBPeripheral
        deviceManager.connectDevice(device)
    }

    func disconnect(id: String) { deviceManager.disconnect(id: id) }
    func readDeviceInfo() { deviceManager.readDeviceInfo() }
    func setChildLock(_ lock: Bool) { deviceManager.setChildLock(lock) }
    func setScanNamePrefix(_ prefix: String?) { deviceManager.setScanNamePrefix(prefix) }
}

@MainActor
@Observable
final class BleDemoViewModel {
    private(set) var uiState = BleDemoUiState()
    private var deviceController: BleDeviceController
    private var listenerTokens: [UUID] = []

    init(deviceController: BleDeviceController) {
        self.deviceController = deviceController
    }

    /// 注册 SDK 事件监听（回调从 BLE 队列切回主线程，对齐 Android 的 runOnUiThread）
    func startListening(deviceManager: DeviceManager = .shared) {
        guard listenerTokens.isEmpty else { return }
        for type in [VMPenEventType.scanBleEvent, .connectStatusEvent, .deviceInfoEvent, .deviceStateEvent, .dataEvent, .errorEvent] {
            let token = deviceManager.addEventListener(type) { [weak self] event in
                Task { @MainActor in
                    self?.onBleEvent(event)
                }
            }
            listenerTokens.append(token)
        }
    }

    func onBleEvent(_ event: BleEvent) {
        switch event {
        case .scanResult(_, let devices):
            updateScanDevices(devices)
        case .scanFinished:
            uiState.statusText = "Scan finished"
        case .connectStatusChanged(let state, let message):
            let clearSelection = state == .disConnected || state == .error
            if clearSelection {
                uiState.selectedDevice = nil
                uiState.deviceInfo = nil
            }
            uiState.connectionState = state
            uiState.statusText = message ?? state.displayName
        case .deviceInfoReceived(let info):
            uiState.deviceInfo = info
            appendLog("INFO", "\(info.locked ? "Locked" : "Unlocked") | \(info.systemState.label) | Battery \(info.batteryPercent)%")
        case .deviceStateReceived(let state):
            let current = uiState.deviceInfo
            uiState.deviceInfo = DeviceInfo(
                serialNumber: current?.serialNumber ?? "",
                locked: state,
                systemState: current?.systemState ?? .unknown,
                batteryPercent: current?.batteryPercent ?? 0
            )
            appendLog("LOCK", state ? "Child lock: Locked" : "Child lock: Unlocked")
        case .dataSent(let hex):
            appendLog("TX", hex)
        case .dataReceived(let hex):
            appendLog("RX", hex)
        case .error(let message, _):
            if uiState.connectionState == .connecting {
                uiState.selectedDevice = nil
                uiState.deviceInfo = nil
                uiState.connectionState = .error
                uiState.statusText = "Connection failed"
                uiState.errorText = message
            } else {
                uiState.errorText = message
            }
        @unknown default:
            break
        }
    }

    func startScan() {
        uiState.statusText = "Scanning"
        uiState.errorText = nil
        deviceController.scanBle()
    }

    func startScanIfIdle() {
        let state = uiState.connectionState
        if state == .connecting || state == .connectSuccess || state == .reconnecting {
            return
        }
        startScan()
    }

    func setYp65Filter(_ enabled: Bool) {
        uiState.yp65FilterEnabled = enabled
        deviceController.setScanNamePrefix(enabled ? BleSdkConfig.defaultScanNamePrefix : nil)
        // 重新扫描以按新过滤条件刷新列表
        startScanIfIdle()
    }

    func connect(_ device: BleScanDevice) {
        uiState.selectedDevice = device
        uiState.connectionState = .connecting
        uiState.statusText = "Connecting \(device.name)"
        uiState.errorText = nil
        deviceController.stopScan()
        deviceController.connectDevice(device)
    }

    func disconnect() {
        if let id = uiState.selectedDevice?.id {
            deviceController.disconnect(id: id)
        }
    }

    func readDeviceInfo() {
        deviceController.readDeviceInfo()
    }

    func setChildLock(_ lock: Bool) {
        deviceController.setChildLock(lock)
    }

    func clearLogs() {
        uiState.logs = []
    }

    func onPermissionDenied() {
        uiState.statusText = "Bluetooth permissions required"
        uiState.errorText = "Please grant Bluetooth permissions to scan and connect."
    }

    private func updateScanDevices(_ devices: [BleScanDevice]) {
        let incomingById = Dictionary(devices.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
        let existingIds = Set(uiState.devices.map(\.id))
        let updatedExisting = uiState.devices.map { incomingById[$0.id] ?? $0 }
        let newDevices = devices.filter { !existingIds.contains($0.id) }
        let merged = updatedExisting + newDevices
        uiState.devices = merged
        uiState.statusText = "Found \(merged.count) device(s)"
    }

    private func appendLog(_ direction: String, _ hex: String) {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm:ss.SSS"
        let time = formatter.string(from: Date())
        uiState.logs.append(LogEntry(time: time, direction: direction, hex: hex))
    }
}

private extension BleState {
    var displayName: String {
        switch self {
        case .idle: return "Idle"
        case .scanning: return "Scanning"
        case .connecting: return "Connecting"
        case .connectSuccess: return "ConnectSuccess"
        case .reconnecting: return "Reconnecting"
        case .disConnected: return "DisConnected"
        case .error: return "Error"
        @unknown default: return "Unknown"
        }
    }
}
