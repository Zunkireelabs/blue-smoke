import CoreBluetooth
import Foundation

final class ReconnectPolicy {
    private let maxAttempts: Int
    private var attempts = 0

    init(maxAttempts: Int) {
        self.maxAttempts = maxAttempts
    }

    func shouldRetry() -> Bool {
        guard attempts < maxAttempts else { return false }
        attempts += 1
        return true
    }

    func reset() {
        attempts = 0
    }
}

final class BleConnectionManager: NSObject {
    private let config: BleSdkConfig
    private let eventBus: EventBus
    private let reconnectPolicy = ReconnectPolicy(maxAttempts: 1)

    private var peripheral: CBPeripheral?
    private var connectedId: String?
    private var writeCharacteristic: CBCharacteristic?
    private var notifyCharacteristic: CBCharacteristic?
    private var communicationReady = false
    private var pendingWriteHex: String?
    private var connectRetryCount = 0

    /// 由 DeviceManager 注入：实际的连接/断开走共享的 CBCentralManager
    var connectAction: ((CBPeripheral) -> Void)?
    var cancelConnectAction: ((CBPeripheral) -> Void)?

    init(config: BleSdkConfig, eventBus: EventBus) {
        self.config = config
        self.eventBus = eventBus
    }

    func connect(id: String, device: CBPeripheral) {
        connectRetryCount = 0
        connect(id: id, peripheral: device, resetReconnectPolicy: true)
    }

    private func connect(id: String, peripheral target: CBPeripheral, resetReconnectPolicy: Bool) {
        guard let connectAction else {
            eventBus.dispatch(.error(message: "Bluetooth central is unavailable", cause: nil))
            finishReconnectFailure(resetReconnectPolicy: resetReconnectPolicy)
            return
        }

        clearSession()
        connectedId = id
        peripheral = target
        if resetReconnectPolicy {
            reconnectPolicy.reset()
        }
        eventBus.dispatch(.connectStatusChanged(state: .connecting, message: nil))
        target.delegate = self
        connectAction(target)
    }

    func disconnect(id: String) {
        guard connectedId == id else { return }
        let current = peripheral
        connectedId = nil
        reconnectPolicy.reset()
        connectRetryCount = 0
        clearSession()
        peripheral = nil
        if let current {
            cancelConnectAction?(current)
        }
        eventBus.dispatch(.connectStatusChanged(state: .disConnected, message: nil))
    }

    func release() {
        let current = peripheral
        connectedId = nil
        reconnectPolicy.reset()
        connectRetryCount = 0
        clearSession()
        peripheral = nil
        if let current {
            cancelConnectAction?(current)
        }
        eventBus.dispatch(.connectStatusChanged(state: .disConnected, message: nil))
    }

    var isConnected: Bool {
        peripheral != nil && writeCharacteristic != nil && communicationReady
    }

    @discardableResult
    func send(_ bytes: [UInt8]) -> Bool {
        guard let target = peripheral, let characteristic = writeCharacteristic else { return false }
        guard communicationReady else {
            eventBus.dispatch(.error(message: "BLE communication is not ready", cause: nil))
            return false
        }
        guard pendingWriteHex == nil else {
            eventBus.dispatch(.error(message: "BLE write already in progress", cause: nil))
            return false
        }
        let hex = HexCodec.encode(bytes)
        let writeType: CBCharacteristicWriteType =
            characteristic.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
        if writeType == .withResponse {
            pendingWriteHex = hex
        }
        target.writeValue(Data(bytes), for: characteristic, type: writeType)
        if writeType == .withoutResponse {
            eventBus.dispatch(.dataSent(hex: hex))
        }
        return true
    }

    @discardableResult
    func readDeviceInfo() -> Bool {
        send(BleProtocol.terminalInfoCommand())
    }

    @discardableResult
    func setChildLock(_ lock: Bool) -> Bool {
        send(BleProtocol.childLockCommand(lock: lock))
    }

    // ---- CBCentralManager 回调转发入口（由 DeviceManager 调用）----

    func handleConnected(_ connected: CBPeripheral) {
        guard connected === peripheral else { return }
        eventBus.dispatch(.connectStatusChanged(state: .connecting, message: "Discovering services"))
        connected.discoverServices(config.serviceUuid.map { [CBUUID(nsuuid: $0)] })
    }

    func handleConnectFailed(_ failed: CBPeripheral, error: (any Error)?) {
        guard failed === peripheral else { return }
        let id = connectedId
        let device = peripheral
        if id != nil, let device, connectRetryCount < BleConnectionManager.maxConnectRetries {
            connectRetryCount += 1
            eventBus.dispatch(.connectStatusChanged(
                state: .connecting,
                message: "Retrying connection (\(connectRetryCount)/\(BleConnectionManager.maxConnectRetries))"
            ))
            connect(id: id!, peripheral: device, resetReconnectPolicy: true)
        } else {
            eventBus.dispatch(.error(message: "GATT connection failed: \(error?.localizedDescription ?? "unknown")", cause: error))
            failConnection()
        }
    }

    func handleDisconnected(_ disconnected: CBPeripheral, allowReconnect: Bool) {
        guard disconnected === peripheral else { return }
        let wasReady = communicationReady
        let id = connectedId
        let device = peripheral
        clearSession()

        if allowReconnect, wasReady, let id, let device, reconnectPolicy.shouldRetry() {
            eventBus.dispatch(.connectStatusChanged(state: .reconnecting, message: nil))
            connect(id: id, peripheral: device, resetReconnectPolicy: false)
            return
        }

        peripheral = nil
        connectedId = nil
        eventBus.dispatch(.connectStatusChanged(state: .disConnected, message: nil))
    }

    private func failConnection() {
        guard let current = peripheral else { return }
        cancelConnectAction?(current)
        handleDisconnected(current, allowReconnect: false)
    }

    private func finishReconnectFailure(resetReconnectPolicy: Bool) {
        if !resetReconnectPolicy {
            connectedId = nil
            peripheral = nil
            clearSession()
            eventBus.dispatch(.connectStatusChanged(state: .disConnected, message: nil))
        }
    }

    private func clearSession() {
        writeCharacteristic = nil
        notifyCharacteristic = nil
        communicationReady = false
        pendingWriteHex = nil
    }

    private func handleIncoming(_ bytes: [UInt8]) {
        eventBus.dispatch(.dataReceived(hex: HexCodec.encode(bytes)))
        let frame: ParsedFrame
        switch BleProtocol.decodeFrame(bytes) {
        case .success(let parsed):
            frame = parsed
        case .failure(let error):
            eventBus.dispatch(.error(message: "Failed to parse BLE frame: \(error.message)", cause: error))
            return
        }

        switch frame.cmd {
        case 0xA1:
            if frame.data.count >= 3 {
                switch BleProtocol.parseTerminalInfoResponse(frame) {
                case .success(let info):
                    eventBus.dispatch(.deviceInfoReceived(info: info))
                case .failure(let error):
                    eventBus.dispatch(.error(message: "Terminal info parse error: \(error.message)", cause: error))
                }
            } else {
                switch BleProtocol.parseChildLockResponse(frame) {
                case .success(let state):
                    eventBus.dispatch(.deviceStateReceived(state: state.locked))
                case .failure(let error):
                    eventBus.dispatch(.error(message: "Child lock parse error: \(error.message)", cause: error))
                }
            }
        case 0xA2:
            switch BleProtocol.parseTerminalInfoResponse(frame) {
            case .success(let info):
                eventBus.dispatch(.deviceInfoReceived(info: info))
            case .failure(let error):
                eventBus.dispatch(.error(message: "Terminal info parse error: \(error.message)", cause: error))
            }
        default:
            eventBus.dispatch(.error(message: "Unknown BLE CMD: 0x\(String(frame.cmd, radix: 16).uppercased())", cause: nil))
        }
    }

    private static let maxConnectRetries = 2
}

// MARK: - CBPeripheralDelegate

extension BleConnectionManager: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: (any Error)?) {
        guard peripheral === self.peripheral else { return }
        if let error {
            eventBus.dispatch(.error(message: "GATT service discovery failed: \(error.localizedDescription)", cause: error))
            failConnection()
            return
        }
        discoverCharacteristics(peripheral)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: (any Error)?) {
        guard peripheral === self.peripheral else { return }
        if let error {
            eventBus.dispatch(.error(message: "GATT characteristic discovery failed: \(error.localizedDescription)", cause: error))
            failConnection()
            return
        }
        bindCharacteristics(peripheral, service: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: (any Error)?) {
        guard peripheral === self.peripheral,
              characteristic.uuid == config.writeCharacteristicUuid.map({ CBUUID(nsuuid: $0) }) else { return }
        let hex = pendingWriteHex
        pendingWriteHex = nil
        if let error {
            eventBus.dispatch(.error(message: "BLE write failed: \(error.localizedDescription)", cause: error))
        } else if let hex {
            eventBus.dispatch(.dataSent(hex: hex))
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: (any Error)?) {
        guard peripheral === self.peripheral else { return }
        if let error {
            eventBus.dispatch(.error(message: "BLE notify read failed: \(error.localizedDescription)", cause: error))
            return
        }
        handleIncoming(Array(characteristic.value ?? Data()))
    }

    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: (any Error)?) {
        guard peripheral === self.peripheral,
              characteristic.uuid == config.notifyCharacteristicUuid.map({ CBUUID(nsuuid: $0) }) else { return }
        if let error {
            eventBus.dispatch(.error(message: "BLE notification descriptor write failed: \(error.localizedDescription)", cause: error))
            failConnection()
            return
        }
        if characteristic.isNotifying {
            communicationReady = true
            reconnectPolicy.reset()
            connectRetryCount = 0
            eventBus.dispatch(.connectStatusChanged(state: .connectSuccess, message: nil))
        }
    }

    private func discoverCharacteristics(_ peripheral: CBPeripheral) {
        guard let serviceUuid = config.serviceUuid,
              let writeUuid = config.writeCharacteristicUuid,
              let notifyUuid = config.notifyCharacteristicUuid else {
            eventBus.dispatch(.error(message: "BLE communication UUIDs are not configured", cause: nil))
            eventBus.dispatch(.connectStatusChanged(state: .error, message: "UUID not configured"))
            failConnection()
            return
        }

        let serviceCBUUID = CBUUID(nsuuid: serviceUuid)
        guard let service = peripheral.services?.first(where: { $0.uuid == serviceCBUUID }) else {
            eventBus.dispatch(.error(message: "Communication service not found", cause: nil))
            failConnection()
            return
        }

        // iOS 的服务发现与特征发现是两步：先 discoverServices，再 discoverCharacteristics
        peripheral.discoverCharacteristics(
            [CBUUID(nsuuid: writeUuid), CBUUID(nsuuid: notifyUuid)],
            for: service
        )
    }

    private func bindCharacteristics(_ peripheral: CBPeripheral, service: CBService) {
        guard let writeUuid = config.writeCharacteristicUuid,
              let notifyUuid = config.notifyCharacteristicUuid else {
            return // discoverCharacteristics 已做过配置校验并报错
        }

        let writeCBUUID = CBUUID(nsuuid: writeUuid)
        let notifyCBUUID = CBUUID(nsuuid: notifyUuid)
        let characteristics = service.characteristics ?? []
        writeCharacteristic = characteristics.first(where: { $0.uuid == writeCBUUID })
        notifyCharacteristic = characteristics.first(where: { $0.uuid == notifyCBUUID })
        guard writeCharacteristic != nil, let notify = notifyCharacteristic else {
            eventBus.dispatch(.error(message: "Communication characteristic not found", cause: nil))
            failConnection()
            return
        }

        // iOS 的 setNotifyValue 会自动写入 CCCD，成功后在 didUpdateNotificationStateFor 回调确认
        peripheral.setNotifyValue(true, for: notify)
    }
}
