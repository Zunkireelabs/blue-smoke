import CoreBluetooth
import Foundation

public final class DeviceManager: NSObject {
    public static let shared = DeviceManager()

    private let eventBus = EventBus()
    private var config = BleSdkConfig()
    private var central: CBCentralManager?
    private var scanner: BleScanner?
    private var connectionManager: BleConnectionManager?
    /// 蓝牙回调专用串行队列，EventBus 的 dispatch 也在此队列同步执行
    private let bleQueue = DispatchQueue(label: "com.itron.hqd.h158lib.ble")

    /// connectDevice(id:) 通过 retrievePeripherals 找回的外设缓存
    private var knownPeripherals: [String: CBPeripheral] = [:]

    private override init() {
        super.init()
    }

    public func configure(config: BleSdkConfig = BleSdkConfig()) {
        bleQueue.async {
            self.releaseInternal(clearListeners: false)
            self.config = config
            let central = CBCentralManager(delegate: self, queue: self.bleQueue)
            self.central = central

            let scanner = BleScanner(config: config, eventBus: self.eventBus)
            scanner.timeoutQueue = self.bleQueue
            scanner.startScanAction = { [weak central] in
                central?.scanForPeripherals(withServices: nil, options: nil)
            }
            scanner.stopScanAction = { [weak central] in
                central?.stopScan()
            }
            self.scanner = scanner

            let connection = BleConnectionManager(config: config, eventBus: self.eventBus)
            connection.connectAction = { [weak central] peripheral in
                central?.connect(peripheral, options: nil)
            }
            connection.cancelConnectAction = { [weak central] peripheral in
                central?.cancelPeripheralConnection(peripheral)
            }
            self.connectionManager = connection
        }
    }

    public func release() {
        bleQueue.async {
            self.releaseInternal(clearListeners: true)
        }
    }

    /// 必须在 bleQueue 上调用
    private func releaseInternal(clearListeners: Bool) {
        scanner?.stopScan()
        connectionManager?.release()
        if clearListeners {
            eventBus.clear()
        }
        scanner = nil
        connectionManager = nil
        central = nil
        knownPeripherals.removeAll()
    }

    public func scanBle() {
        bleQueue.async {
            guard let scanner = self.scanner else {
                self.eventBus.dispatch(.error(message: "DeviceManager is not configured", cause: nil))
                return
            }
            guard self.centralPoweredOn() else { return }
            scanner.startScan()
        }
    }

    public func stopScan() {
        bleQueue.async {
            self.scanner?.stopScan()
        }
    }

    public func setScanNamePrefix(_ prefix: String?) {
        bleQueue.async {
            self.scanner?.scanNamePrefix = prefix
        }
    }

    public func connectDevice(id: String) {
        bleQueue.async {
            guard let central = self.central, let connection = self.connectionManager else {
                self.eventBus.dispatch(.error(message: "DeviceManager is not configured", cause: nil))
                return
            }
            guard self.centralPoweredOn() else { return }
            guard let uuid = UUID(uuidString: id) else {
                self.eventBus.dispatch(.error(message: "Invalid BLE device id: \(id)", cause: nil))
                return
            }
            let target = self.knownPeripherals[id] ?? central.retrievePeripherals(withIdentifiers: [uuid]).first
            guard let target else {
                self.eventBus.dispatch(.error(message: "Bluetooth device not found: \(id)", cause: nil))
                return
            }
            self.knownPeripherals[id] = target
            connection.connect(id: id, device: target)
        }
    }

    public func connectDevice(_ device: BleScanDevice) {
        bleQueue.async {
            guard let connection = self.connectionManager else {
                self.eventBus.dispatch(.error(message: "DeviceManager is not configured", cause: nil))
                return
            }
            guard self.centralPoweredOn() else { return }
            // 优先使用扫描回调里的原始 CBPeripheral
            if let peripheral = device.peripheral {
                self.knownPeripherals[device.id] = peripheral
                connection.connect(id: device.id, device: peripheral)
            } else {
                self.connectDevice(id: device.id)
            }
        }
    }

    public func disconnect(id: String) {
        bleQueue.async {
            self.connectionManager?.disconnect(id: id)
        }
    }

    public var isConnected: Bool {
        bleQueue.sync {
            connectionManager?.isConnected ?? false
        }
    }

    public func readDeviceInfo() {
        bleQueue.async {
            guard let connection = self.connectionManager else {
                self.eventBus.dispatch(.error(message: "DeviceManager is not configured", cause: nil))
                return
            }
            connection.readDeviceInfo()
        }
    }

    public func setChildLock(_ lock: Bool) {
        bleQueue.async {
            guard let connection = self.connectionManager else {
                self.eventBus.dispatch(.error(message: "DeviceManager is not configured", cause: nil))
                return
            }
            connection.setChildLock(lock)
        }
    }

    public func sendHex(_ hexText: String) {
        switch HexCodec.decode(hexText) {
        case .success(let bytes):
            bleQueue.async {
                guard let connection = self.connectionManager else {
                    self.eventBus.dispatch(.error(message: "DeviceManager is not configured", cause: nil))
                    return
                }
                connection.send(bytes)
            }
        case .failure(let error):
            eventBus.dispatch(.error(message: "Invalid hex input: \(error)", cause: error))
        }
    }

    @discardableResult
    public func addEventListener(_ type: VMPenEventType, listener: @escaping (BleEvent) -> Void) -> UUID {
        eventBus.addEventListener(type, listener: listener)
    }

    public func removeEventListener(_ type: VMPenEventType, token: UUID) {
        eventBus.removeEventListener(type, token: token)
    }

    /// 必须在 bleQueue 上调用；蓝牙未就绪时派错误事件并返回 false
    private func centralPoweredOn() -> Bool {
        guard let central else { return false }
        switch central.state {
        case .poweredOn:
            return true
        case .unauthorized:
            eventBus.dispatch(.error(message: "Bluetooth permission is missing", cause: nil))
        case .poweredOff:
            eventBus.dispatch(.error(message: "Bluetooth is powered off", cause: nil))
        default:
            eventBus.dispatch(.error(message: "Bluetooth is unavailable: \(central.state.rawValue)", cause: nil))
        }
        return false
    }
}

// MARK: - CBCentralManagerDelegate

extension DeviceManager: CBCentralManagerDelegate {
    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state != .poweredOn {
            scanner?.handleScanFailed("Bluetooth is unavailable: \(central.state.rawValue)")
        }
    }

    public func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        knownPeripherals[peripheral.identifier.uuidString] = peripheral
        scanner?.handleDiscovered(peripheral: peripheral, advertisementData: advertisementData, rssi: RSSI.intValue)
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connectionManager?.handleConnected(peripheral)
    }

    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: (any Error)?) {
        connectionManager?.handleConnectFailed(peripheral, error: error)
    }

    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: (any Error)?) {
        connectionManager?.handleDisconnected(peripheral, allowReconnect: true)
    }
}
