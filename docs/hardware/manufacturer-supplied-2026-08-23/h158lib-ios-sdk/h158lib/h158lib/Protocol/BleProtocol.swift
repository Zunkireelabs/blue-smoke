import Foundation

struct ParsedFrame: Equatable {
    let cmd: Int
    let ack: Int
    let data: [UInt8]
}

struct ProtocolError: Error, Equatable, CustomStringConvertible {
    let message: String

    var description: String { message }
}

public enum BleProtocol {
    private static let frameHead: UInt8 = 0x02
    private static let frameTail: UInt8 = 0x01

    private static let cmdChildLock = 0xA1
    private static let cmdTerminalInfo = 0xA2

    private static let ackSuccess = 0x00

    private static let childLockLocked: UInt8 = 0x78
    private static let childLockUnlocked: UInt8 = 0x87

    private static let termInfoLocked: UInt8 = 0x31

    // ---- Frame encoding ----

    /// 构造 SDK→设备的命令帧：HEAD + LENGTH + CMD + DATA + CHECKSUM + TAIL（无 ACK 字节）
    public static func encodeFrame(cmd: Int, data: [UInt8]? = nil) -> [UInt8] {
        let payload = data ?? []
        let length = 1 + payload.count // CMD + DATA
        var frame = [UInt8]()
        frame.reserveCapacity(2 + length + 1 + 1)
        frame.append(frameHead)
        frame.append(UInt8(length & 0xFF))
        frame.append(UInt8(cmd & 0xFF))
        frame.append(contentsOf: payload)

        let checksum = frame.reduce(0) { $0 ^ $1 }
        frame.append(checksum)
        frame.append(frameTail)

        return frame
    }

    // ---- Frame decoding ----

    /// 解析设备→SDK 的响应帧：HEAD + LENGTH + CMD + ACK + DATA + CHECKSUM + TAIL
    static func decodeFrame(_ bytes: [UInt8]) -> Result<ParsedFrame, ProtocolError> {
        guard bytes.count >= 5 else {
            return .failure(ProtocolError(message: "Frame too short: need at least 5 bytes, got \(bytes.count)"))
        }
        guard bytes[0] == frameHead else {
            return .failure(ProtocolError(message: "Invalid frame head: 0x\(String(bytes[0], radix: 16).uppercased())"))
        }
        guard bytes.last == frameTail else {
            return .failure(ProtocolError(message: "Invalid frame tail: 0x\(String(bytes[bytes.count - 1], radix: 16).uppercased())"))
        }

        let length = Int(bytes[1])
        guard length >= 2 else {
            return .failure(ProtocolError(message: "Frame length too short: need CMD and ACK, got \(length)"))
        }
        guard bytes.count == 2 + length + 1 + 1 else {
            return .failure(ProtocolError(message: "Frame length mismatch: header says \(length) payload bytes, actual size \(bytes.count)"))
        }

        let checksumOffset = 2 + length
        let expectedChecksum = bytes[0 ..< checksumOffset].reduce(0) { $0 ^ $1 }
        let actualChecksum = bytes[checksumOffset]
        guard expectedChecksum == actualChecksum else {
            return .failure(ProtocolError(message: "Checksum mismatch: expected 0x\(String(expectedChecksum, radix: 16).uppercased()), got 0x\(String(actualChecksum, radix: 16).uppercased())"))
        }

        let cmd = Int(bytes[2])
        let ack = Int(bytes[3])
        let data = length > 2 ? Array(bytes[4 ..< 2 + length]) : []

        return .success(ParsedFrame(cmd: cmd, ack: ack, data: data))
    }

    // ---- Command builders ----

    public static func childLockCommand(lock: Bool) -> [UInt8] {
        encodeFrame(cmd: cmdChildLock, data: [lock ? childLockLocked : childLockUnlocked])
    }

    public static func terminalInfoCommand() -> [UInt8] {
        encodeFrame(cmd: cmdTerminalInfo)
    }

    // ---- Response parsers ----

    static func parseChildLockResponse(_ frame: ParsedFrame) -> Result<ChildLockState, ProtocolError> {
        guard frame.cmd == cmdChildLock else {
            return .failure(ProtocolError(message: "Expected CMD 0xA1, got 0x\(String(frame.cmd, radix: 16).uppercased())"))
        }
        guard frame.ack == ackSuccess else {
            return .failure(ProtocolError(message: "Child lock returned ACK=0x\(String(frame.ack, radix: 16).uppercased()), expected 0x00"))
        }
        guard !frame.data.isEmpty else {
            return .failure(ProtocolError(message: "Child lock response has no data"))
        }
        return .success(ChildLockState(locked: frame.data[0] == childLockLocked))
    }

    static func parseTerminalInfoResponse(_ frame: ParsedFrame) -> Result<DeviceInfo, ProtocolError> {
        guard frame.cmd == cmdTerminalInfo || frame.cmd == cmdChildLock else {
            return .failure(ProtocolError(message: "Expected CMD 0xA2, got 0x\(String(frame.cmd, radix: 16).uppercased())"))
        }
        guard frame.ack == ackSuccess else {
            return .failure(ProtocolError(message: "Terminal info returned ACK=0x\(String(frame.ack, radix: 16).uppercased()), expected 0x00"))
        }
        guard frame.data.count >= 3 else {
            return .failure(ProtocolError(message: "Terminal info data too short: \(frame.data.count) bytes, need at least 3"))
        }

        let locked = frame.data[0] == termInfoLocked
        let systemState = SystemState.fromValue(Int(frame.data[1]))
        let batteryPercent = Int(frame.data[2])

        return .success(DeviceInfo(
            locked: locked,
            systemState: systemState,
            batteryPercent: batteryPercent
        ))
    }
}
