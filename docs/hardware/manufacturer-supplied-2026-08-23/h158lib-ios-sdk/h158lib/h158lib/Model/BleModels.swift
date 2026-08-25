import CoreBluetooth
import Foundation

public enum VMPenEventType {
    case scanBleEvent
    case connectStatusEvent
    case deviceInfoEvent
    case deviceStateEvent
    case dataEvent
    case errorEvent
}

public enum BleState {
    case idle
    case scanning
    case connecting
    case connectSuccess
    case reconnecting
    case disConnected
    case error
}

public struct BleScanDevice: Equatable {
    public let name: String
    /// iOS 不暴露 MAC 地址，使用 CBPeripheral.identifier 的 UUID 字符串作为设备唯一标识
    public let id: String
    public let rssi: Int
    /// 扫描回调传入的原始 CBPeripheral，用于连接时保留正确的引用
    public let peripheral: CBPeripheral?

    public init(name: String, id: String, rssi: Int, peripheral: CBPeripheral? = nil) {
        self.name = name
        self.id = id
        self.rssi = rssi
        self.peripheral = peripheral
    }

    public static func == (lhs: BleScanDevice, rhs: BleScanDevice) -> Bool {
        lhs.name == rhs.name && lhs.id == rhs.id && lhs.rssi == rhs.rssi && lhs.peripheral === rhs.peripheral
    }
}

public enum SystemState: Int {
    case powerOn = 0x00
    case powerOff = 0x01
    case preheat = 0x02
    case heating = 0x03
    case unknown = -1

    public var label: String {
        switch self {
        case .powerOn: return "Power On"
        case .powerOff: return "Power Off"
        case .preheat: return "Preheating"
        case .heating: return "Heating"
        case .unknown: return "Unknown"
        }
    }

    public static func fromValue(_ value: Int) -> SystemState {
        SystemState(rawValue: value) ?? .unknown
    }
}

public struct ChildLockState: Equatable {
    public let locked: Bool

    public init(locked: Bool) {
        self.locked = locked
    }
}

public struct DeviceInfo: Equatable, CustomStringConvertible {
    public let serialNumber: String
    public let locked: Bool
    public let systemState: SystemState
    public let batteryPercent: Int

    public init(
        serialNumber: String = "",
        locked: Bool,
        systemState: SystemState = .unknown,
        batteryPercent: Int = 0
    ) {
        self.serialNumber = serialNumber
        self.locked = locked
        self.systemState = systemState
        self.batteryPercent = batteryPercent
    }

    public var description: String {
        "SN=\(serialNumber), locked=\(locked), systemState=\(systemState), battery=\(batteryPercent)%"
    }
}

public enum BleEvent {
    case scanResult(device: BleScanDevice, devices: [BleScanDevice])
    case scanFinished
    case connectStatusChanged(state: BleState, message: String?)
    case deviceInfoReceived(info: DeviceInfo)
    case deviceStateReceived(state: Bool)
    case dataSent(hex: String)
    case dataReceived(hex: String)
    case error(message: String, cause: (any Error)?)

    public var type: VMPenEventType {
        switch self {
        case .scanResult, .scanFinished: return .scanBleEvent
        case .connectStatusChanged: return .connectStatusEvent
        case .deviceInfoReceived: return .deviceInfoEvent
        case .deviceStateReceived: return .deviceStateEvent
        case .dataSent, .dataReceived: return .dataEvent
        case .error: return .errorEvent
        }
    }
}
