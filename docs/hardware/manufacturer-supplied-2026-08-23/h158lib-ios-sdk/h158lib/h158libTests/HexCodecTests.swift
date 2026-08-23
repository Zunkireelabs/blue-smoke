import Testing
@testable import h158lib

struct HexCodecTests {

    @Test func encode_producesUppercaseSpaceSeparatedHex() {
        #expect(HexCodec.encode([0x02, 0xA1, 0x78, 0x01]) == "02 A1 78 01")
    }

    @Test func encode_emptyInputProducesEmptyString() {
        #expect(HexCodec.encode([]) == "")
    }

    @Test func decode_parsesPlainHex() throws {
        let result = HexCodec.decode("02A17801")
        #expect(try result.get() == [0x02, 0xA1, 0x78, 0x01])
    }

    @Test func decode_ignoresWhitespaceAndCase() throws {
        let result = HexCodec.decode("02 a1 78 01")
        #expect(try result.get() == [0x02, 0xA1, 0x78, 0x01])
    }

    @Test func decode_rejectsEmptyInput() {
        #expect(HexCodec.decode("") == .failure(.empty))
        #expect(HexCodec.decode("   ") == .failure(.empty))
    }

    @Test func decode_rejectsOddLength() {
        #expect(HexCodec.decode("ABC") == .failure(.oddLength))
    }

    @Test func decode_rejectsInvalidCharacters() {
        #expect(HexCodec.decode("GG") == .failure(.invalidCharacters))
        #expect(HexCodec.decode("0X12") == .failure(.invalidCharacters))
    }

    @Test func roundtrip_preservesBytes() throws {
        let bytes: [UInt8] = [0x00, 0x02, 0xA1, 0xFF, 0x78]
        #expect(try HexCodec.decode(HexCodec.encode(bytes)).get() == bytes)
    }
}
