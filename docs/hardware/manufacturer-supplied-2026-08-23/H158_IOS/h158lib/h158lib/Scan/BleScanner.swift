import CoreBluetooth
import Foundation

final class ScanResultStore {
    private var devices: [String: BleScanDevice] = [:]
    private var order: [String] = []

    func upsert(_ device: BleScanDevice) -> [BleScanDevice] {
        if devices[device.id] == nil {
            order.append(device.id)
        }
        devices[device.id] = device
        return order.compactMap { devices[$0] }
    }

    func clear() {
        devices.removeAll()
        order.removeAll()
    }
}

final class BleScanner {
    private let config: BleSdkConfig
    private let eventBus: EventBus
    private let store = ScanResultStore()
    private var scanning = false
    private var timeoutItem: DispatchWorkItem?

    /// 运行时可切换的扫描名称前缀过滤；为 nil 时不过滤
    var scanNamePrefix: String?

    /// 由 DeviceManager 注入：实际的扫描启停走共享的 CBCentralManager
    var startScanAction: (() -> Void)?
    var stopScanAction: (() -> Void)?
    /// 扫描超时计时所在的队列（与 CBCentralManager 回调同队列，避免竞态）
    var timeoutQueue: DispatchQueue = .main

    init(config: BleSdkConfig, eventBus: EventBus) {
        self.config = config
        self.eventBus = eventBus
        scanNamePrefix = config.scanNamePrefix
    }

    func startScan() {
        guard !scanning else { return }
        guard let startScanAction else {
            eventBus.dispatch(.error(message: "Bluetooth LE scanner is unavailable", cause: nil))
            return
        }
        timeoutItem?.cancel()
        store.clear()
        scanning = true
        startScanAction()

        let item = DispatchWorkItem { [weak self] in self?.stopScan() }
        timeoutItem = item
        timeoutQueue.asyncAfter(deadline: .now() + .milliseconds(Int(config.scanTimeoutMs)), execute: item)
    }

    func stopScan() {
        guard scanning else { return }
        stopScanAction?()
        timeoutItem?.cancel()
        timeoutItem = nil
        scanning = false
        eventBus.dispatch(.scanFinished)
    }

    func handleScanFailed(_ message: String) {
        timeoutItem?.cancel()
        timeoutItem = nil
        scanning = false
        eventBus.dispatch(.error(message: message, cause: nil))
        eventBus.dispatch(.scanFinished)
    }

    /// 由 DeviceManager 的 CBCentralManagerDelegate 回调转发
    func handleDiscovered(peripheral: CBPeripheral, advertisementData: [String: Any], rssi: Int) {
        let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        guard let name = BleScanner.visibleDeviceName(peripheralName: peripheral.name, advertisedName: advertisedName) else { return }
        guard BleScanner.matchesScanFilter(name: name, prefix: scanNamePrefix) else { return }

        let scanDevice = BleScanDevice(
            name: name,
            id: peripheral.identifier.uuidString,
            rssi: rssi,
            peripheral: peripheral
        )
        let devices = store.upsert(scanDevice)
        eventBus.dispatch(.scanResult(device: scanDevice, devices: devices))
    }

    static func matchesScanFilter(name: String, prefix: String?) -> Bool {
        guard let prefix, !prefix.isEmpty else { return true }
        return name.range(of: prefix, options: [.caseInsensitive, .anchored]) != nil
    }

    static func visibleDeviceName(peripheralName: String?, advertisedName: String?) -> String? {
        [peripheralName, advertisedName]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .first { !$0.isEmpty && $0.caseInsensitiveCompare("Unknown") != .orderedSame }
    }
}
