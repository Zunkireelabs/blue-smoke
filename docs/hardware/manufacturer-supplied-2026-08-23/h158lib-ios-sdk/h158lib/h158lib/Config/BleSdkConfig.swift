import Foundation

public struct BleSdkConfig {
    public let serviceUuid: UUID?
    public let writeCharacteristicUuid: UUID?
    public let notifyCharacteristicUuid: UUID?
    public let scanTimeoutMs: UInt64
    /// 扫描只保留名称匹配该前缀的设备；为 nil 时不过滤
    public let scanNamePrefix: String?

    public init(
        serviceUuid: UUID? = BleSdkConfig.defaultServiceUuid,
        writeCharacteristicUuid: UUID? = BleSdkConfig.defaultWriteCharacteristicUuid,
        notifyCharacteristicUuid: UUID? = BleSdkConfig.defaultNotifyCharacteristicUuid,
        scanTimeoutMs: UInt64 = 20_000,
        scanNamePrefix: String? = BleSdkConfig.defaultScanNamePrefix
    ) {
        self.serviceUuid = serviceUuid
        self.writeCharacteristicUuid = writeCharacteristicUuid
        self.notifyCharacteristicUuid = notifyCharacteristicUuid
        self.scanTimeoutMs = scanTimeoutMs
        self.scanNamePrefix = scanNamePrefix
    }

    public func isConfigured() -> Bool {
        serviceUuid != nil && writeCharacteristicUuid != nil && notifyCharacteristicUuid != nil
    }
}

public extension BleSdkConfig {
    // YP65-AT 真实 UUID（LightBlue 实测）：服务 0xFFF0，收发数据均走 0xFFF1
    static let defaultScanNamePrefix = "YP65-AT"
    static let defaultServiceUuid = UUID(uuidString: "0000FFF0-0000-1000-8000-00805F9B34FB")
    static let defaultWriteCharacteristicUuid = UUID(uuidString: "0000FFF1-0000-1000-8000-00805F9B34FB")
    static let defaultNotifyCharacteristicUuid = UUID(uuidString: "0000FFF1-0000-1000-8000-00805F9B34FB")
}
