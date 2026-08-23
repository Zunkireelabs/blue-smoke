import Testing
@testable import h158lib

struct BleProtocolTests {

    // ---- encodeFrame ----

    @Test func encodeFrame_producesCorrectHeadAndTail() {
        let frame = BleProtocol.encodeFrame(cmd: 0xA1, data: [0x78])

        #expect(frame[0] == 0x02)
        #expect(frame.last == 0x01)
    }

    @Test func encodeFrame_setsCorrectLengthForCommandWithData() {
        let frame = BleProtocol.encodeFrame(cmd: 0xA1, data: [0x78])

        // LENGTH = CMD(1) + DATA(1) = 2
        #expect(frame[1] == 2)
    }

    @Test func encodeFrame_setsCorrectLengthForCommandWithoutData() {
        let frame = BleProtocol.encodeFrame(cmd: 0xA2)

        // LENGTH = CMD(1) + DATA(0) = 1
        #expect(frame[1] == 1)
    }

    @Test func encodeFrame_checksumIsXorFromHeadThroughData() {
        let frame = BleProtocol.encodeFrame(cmd: 0xA1, data: [0x78])

        // head(0x02) XOR length(0x02) XOR cmd(0xA1) XOR data(0x78)
        let expected: UInt8 = 0x02 ^ 0x02 ^ 0xA1 ^ 0x78
        #expect(frame[frame.count - 2] == expected)
    }

    @Test func encodeFrame_withNilDataProducesCorrectFrame() {
        let frame = BleProtocol.encodeFrame(cmd: 0xA2)

        // Expected: [02][01][A2][checksum][01]
        let checksum: UInt8 = 0x02 ^ 0x01 ^ 0xA2
        #expect(frame == [0x02, 0x01, 0xA2, checksum, 0x01])
    }

    // ---- decodeFrame ----

    @Test func decodeFrame_parsesValidResponseFrameCorrectly() throws {
        // Response: HEAD(0x02) LEN(CMD+ACK+DATA) CMD ACK DATA CHECKSUM TAIL(0x01)
        // CMD=0xA1, ACK=0x00, DATA=[0x78], so LEN=3
        let checksum: UInt8 = 0x02 ^ 0x03 ^ 0xA1 ^ 0x00 ^ 0x78
        let responseFrame: [UInt8] = [0x02, 0x03, 0xA1, 0x00, 0x78, checksum, 0x01]

        let parsed = try BleProtocol.decodeFrame(responseFrame).get()

        #expect(parsed.cmd == 0xA1)
        #expect(parsed.ack == 0x00)
        #expect(parsed.data == [0x78])
    }

    @Test func decodeFrame_parsesResponseWithMultipleDataBytes() throws {
        // CMD=0xA2, ACK=0x00, DATA=[0x31, 0x00, 0x50], so LEN=5
        let checksum: UInt8 = 0x02 ^ 0x05 ^ 0xA2 ^ 0x00 ^ 0x31 ^ 0x00 ^ 0x50
        let responseFrame: [UInt8] = [0x02, 0x05, 0xA2, 0x00, 0x31, 0x00, 0x50, checksum, 0x01]

        let parsed = try BleProtocol.decodeFrame(responseFrame).get()

        #expect(parsed.cmd == 0xA2)
        #expect(parsed.ack == 0x00)
        #expect(parsed.data == [0x31, 0x00, 0x50])
    }

    @Test func decodeFrame_rejectsFrameWithWrongHead() {
        let badFrame: [UInt8] = [0xAA, 0x03, 0xA1, 0x00, 0x78, 0x00, 0x01]

        let result = BleProtocol.decodeFrame(badFrame)

        guard case .failure(let error) = result else {
            Issue.record("expected failure")
            return
        }
        #expect(error.message.contains("Invalid frame head"))
    }

    @Test func decodeFrame_rejectsFrameWithWrongTail() {
        let badFrame: [UInt8] = [0x02, 0x03, 0xA1, 0x00, 0x78, 0x00, 0xAA]

        let result = BleProtocol.decodeFrame(badFrame)

        guard case .failure(let error) = result else {
            Issue.record("expected failure")
            return
        }
        #expect(error.message.contains("Invalid frame tail"))
    }

    @Test func decodeFrame_rejectsFrameWithWrongChecksum() {
        let badFrame: [UInt8] = [0x02, 0x03, 0xA1, 0x00, 0x78, 0xFF, 0x01]

        let result = BleProtocol.decodeFrame(badFrame)

        guard case .failure(let error) = result else {
            Issue.record("expected failure")
            return
        }
        #expect(error.message.contains("Checksum mismatch"))
    }

    @Test func decodeFrame_rejectsFrameThatIsTooShort() {
        let badFrame: [UInt8] = [0x02, 0x01]

        let result = BleProtocol.decodeFrame(badFrame)

        guard case .failure(let error) = result else {
            Issue.record("expected failure")
            return
        }
        #expect(error.message.contains("Frame too short"))
    }

    @Test func decodeFrame_rejectsFrameWithLengthMismatch() {
        let badFrame: [UInt8] = [0x02, 0x04, 0xA1, 0x00, 0x78, 0x00, 0x01]

        let result = BleProtocol.decodeFrame(badFrame)

        guard case .failure(let error) = result else {
            Issue.record("expected failure")
            return
        }
        #expect(error.message.contains("Frame length mismatch"))
    }

    // ---- childLockCommand ----

    @Test func childLockCommand_lockTrueProducesCorrectFrame() {
        let cmd = BleProtocol.childLockCommand(lock: true)

        #expect(cmd[0] == 0x02)
        #expect(cmd[1] == 0x02) // LEN = CMD + DATA
        #expect(cmd[2] == 0xA1)
        #expect(cmd[3] == 0x78)
        #expect(cmd.last == 0x01)
    }

    @Test func childLockCommand_lockFalseProducesCorrectFrame() {
        let cmd = BleProtocol.childLockCommand(lock: false)

        #expect(cmd[2] == 0xA1)
        #expect(cmd[3] == 0x87)
        #expect(cmd.last == 0x01)
    }

    // ---- terminalInfoCommand ----

    @Test func terminalInfoCommand_producesCorrectFrame() {
        let cmd = BleProtocol.terminalInfoCommand()

        // HEAD(0x02) LEN(0x01=CMD only) CMD(0xA2) CHECKSUM TAIL(0x01)
        #expect(cmd[0] == 0x02)
        #expect(cmd[1] == 0x01)
        #expect(cmd[2] == 0xA2)
        #expect(cmd.last == 0x01)
    }

    // ---- parseChildLockResponse ----

    @Test func parseChildLockResponse_parsesLockedState() throws {
        let frame = ParsedFrame(cmd: 0xA1, ack: 0x00, data: [0x78])

        let result = try BleProtocol.parseChildLockResponse(frame).get()

        #expect(result.locked == true)
    }

    @Test func parseChildLockResponse_parsesUnlockedState() throws {
        let frame = ParsedFrame(cmd: 0xA1, ack: 0x00, data: [0x87])

        let result = try BleProtocol.parseChildLockResponse(frame).get()

        #expect(result.locked == false)
    }

    @Test func parseChildLockResponse_rejectsWrongCommand() {
        let frame = ParsedFrame(cmd: 0xA2, ack: 0x00, data: [0x78])

        let result = BleProtocol.parseChildLockResponse(frame)

        guard case .failure = result else {
            Issue.record("expected failure")
            return
        }
    }

    @Test func parseChildLockResponse_rejectsNonZeroAck() {
        let frame = ParsedFrame(cmd: 0xA1, ack: 0x01, data: [0x78])

        let result = BleProtocol.parseChildLockResponse(frame)

        guard case .failure = result else {
            Issue.record("expected failure")
            return
        }
    }

    // ---- parseTerminalInfoResponse ----

    @Test func parseTerminalInfoResponse_parsesLockedPowerOn80PercentBattery() throws {
        // B1=0x31(locked), B2=0x00(power on), B3=0x50(80%)
        let frame = ParsedFrame(cmd: 0xA2, ack: 0x00, data: [0x31, 0x00, 0x50])

        let info = try BleProtocol.parseTerminalInfoResponse(frame).get()

        #expect(info.locked == true)
        #expect(info.systemState.label == "Power On")
        #expect(info.batteryPercent == 80)
    }

    @Test func parseTerminalInfoResponse_parsesUnlockedHeating50PercentBattery() throws {
        let frame = ParsedFrame(cmd: 0xA2, ack: 0x00, data: [0x30, 0x03, 0x32])

        let info = try BleProtocol.parseTerminalInfoResponse(frame).get()

        #expect(info.locked == false)
        #expect(info.systemState.label == "Heating")
        #expect(info.batteryPercent == 50)
    }

    @Test func parseTerminalInfoResponse_acceptsDocumentedA1ResponseWithThreeDataBytes() throws {
        let frame = ParsedFrame(cmd: 0xA1, ack: 0x00, data: [0x31, 0x02, 0x64])

        let info = try BleProtocol.parseTerminalInfoResponse(frame).get()

        #expect(info.locked == true)
        #expect(info.systemState.label == "Preheating")
        #expect(info.batteryPercent == 100)
    }

    @Test func parseTerminalInfoResponse_rejectsNonZeroAck() {
        let frame = ParsedFrame(cmd: 0xA2, ack: 0x01, data: [0x31, 0x00, 0x50])

        let result = BleProtocol.parseTerminalInfoResponse(frame)

        guard case .failure = result else {
            Issue.record("expected failure")
            return
        }
    }

    @Test func parseTerminalInfoResponse_rejectsDataTooShort() {
        let frame = ParsedFrame(cmd: 0xA2, ack: 0x00, data: [0x31])

        let result = BleProtocol.parseTerminalInfoResponse(frame)

        guard case .failure = result else {
            Issue.record("expected failure")
            return
        }
    }

    @Test func parseTerminalInfoResponse_rejectsWrongCommand() {
        let frame = ParsedFrame(cmd: 0xA3, ack: 0x00, data: [0x31, 0x00, 0x50])

        let result = BleProtocol.parseTerminalInfoResponse(frame)

        guard case .failure = result else {
            Issue.record("expected failure")
            return
        }
    }
}
