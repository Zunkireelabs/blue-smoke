import Foundation

public enum HexCodec {
    public enum DecodeError: Error, Equatable {
        case empty
        case oddLength
        case invalidCharacters
    }

    public static func decode(_ hexText: String) -> Result<[UInt8], DecodeError> {
        let normalized = hexText
            .replacingOccurrences(of: "\\s", with: "", options: .regularExpression)
            .uppercased()
        guard !normalized.isEmpty else { return .failure(.empty) }
        guard normalized.count % 2 == 0 else { return .failure(.oddLength) }
        guard normalized.allSatisfy({ $0.isHexDigit }) else { return .failure(.invalidCharacters) }

        var bytes = [UInt8]()
        bytes.reserveCapacity(normalized.count / 2)
        var index = normalized.startIndex
        while index < normalized.endIndex {
            let next = normalized.index(index, offsetBy: 2)
            guard let byte = UInt8(normalized[index ..< next], radix: 16) else {
                return .failure(.invalidCharacters)
            }
            bytes.append(byte)
            index = next
        }
        return .success(bytes)
    }

    public static func encode(_ bytes: [UInt8]) -> String {
        bytes.map { String(format: "%02X", $0) }.joined(separator: " ")
    }
}
