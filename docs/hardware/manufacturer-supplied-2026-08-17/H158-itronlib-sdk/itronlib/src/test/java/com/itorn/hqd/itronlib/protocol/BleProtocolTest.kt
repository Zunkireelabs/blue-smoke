package com.itorn.hqd.itronlib.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BleProtocolTest {

    // ---- encodeFrame ----

    @Test
    fun `encodeFrame produces correct head and tail`() {
        val frame = BleProtocol.encodeFrame(0xA1, byteArrayOf(0x78))

        assertEquals(0x02, frame[0].toInt() and 0xFF)
        assertEquals(0x01, frame.last().toInt() and 0xFF)
    }

    @Test
    fun `encodeFrame sets correct length for command with data`() {
        val frame = BleProtocol.encodeFrame(0xA1, byteArrayOf(0x78))

        // LENGTH = CMD(1) + DATA(1) = 2
        assertEquals(2, frame[1].toInt() and 0xFF)
    }

    @Test
    fun `encodeFrame sets correct length for command without data`() {
        val frame = BleProtocol.encodeFrame(0xA2)

        // LENGTH = CMD(1) + DATA(0) = 1
        assertEquals(1, frame[1].toInt() and 0xFF)
    }

    @Test
    fun `encodeFrame checksum is XOR from head through data`() {
        val frame = BleProtocol.encodeFrame(0xA1, byteArrayOf(0x78))

        // head(0x02) XOR length(0x02) XOR cmd(0xA1) XOR data(0x78)
        val expected = 0x02 xor 0x02 xor 0xA1 xor 0x78
        val checksumIdx = frame.size - 2
        assertEquals(expected, frame[checksumIdx].toInt() and 0xFF)
    }

    @Test
    fun `encodeFrame with null data produces correct frame`() {
        val frame = BleProtocol.encodeFrame(0xA2)

        // Expected: [02][01][A2][checksum][01]
        val checksum = 0x02 xor 0x01 xor 0xA2
        val expected = byteArrayOf(0x02, 0x01, 0xA2.toByte(), checksum.toByte(), 0x01)
        assertArrayEquals(expected, frame)
    }

    // ---- decodeFrame ----

    @Test
    fun `decodeFrame parses valid response frame correctly`() {
        // Response: HEAD(0x02) LEN(CMD+ACK+DATA) CMD ACK DATA CHECKSUM TAIL(0x01)
        // CMD=0xA1, ACK=0x00, DATA=[0x78], so LEN=3
        val checksum = 0x02 xor 0x03 xor 0xA1 xor 0x00 xor 0x78
        val responseFrame = byteArrayOf(
            0x02, 0x03, 0xA1.toByte(), 0x00, 0x78,
            checksum.toByte(), 0x01,
        )

        val parsed = BleProtocol.decodeFrame(responseFrame).getOrThrow()

        assertEquals(0xA1, parsed.cmd)
        assertEquals(0x00, parsed.ack)
        assertArrayEquals(byteArrayOf(0x78.toByte()), parsed.data)
    }

    @Test
    fun `decodeFrame parses response with multiple data bytes`() {
        // CMD=0xA2, ACK=0x00, DATA=[0x31, 0x00, 0x50], so LEN=5
        val checksum = 0x02 xor 0x05 xor 0xA2 xor 0x00 xor 0x31 xor 0x00 xor 0x50
        val responseFrame = byteArrayOf(
            0x02, 0x05, 0xA2.toByte(), 0x00,
            0x31, 0x00, 0x50,
            checksum.toByte(), 0x01,
        )

        val parsed = BleProtocol.decodeFrame(responseFrame).getOrThrow()

        assertEquals(0xA2, parsed.cmd)
        assertEquals(0x00, parsed.ack)
        assertArrayEquals(byteArrayOf(0x31, 0x00, 0x50), parsed.data)
    }

    @Test
    fun `decodeFrame rejects frame with wrong head`() {
        val badFrame = byteArrayOf(0xAA.toByte(), 0x03, 0xA1.toByte(), 0x00, 0x78, 0x00, 0x01)

        val result = BleProtocol.decodeFrame(badFrame)

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("Invalid frame head") == true)
    }

    @Test
    fun `decodeFrame rejects frame with wrong tail`() {
        val badFrame = byteArrayOf(0x02, 0x03, 0xA1.toByte(), 0x00, 0x78, 0x00, 0xAA.toByte())

        val result = BleProtocol.decodeFrame(badFrame)

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("Invalid frame tail") == true)
    }

    @Test
    fun `decodeFrame rejects frame with wrong checksum`() {
        val badFrame = byteArrayOf(0x02, 0x03, 0xA1.toByte(), 0x00, 0x78, 0xFF.toByte(), 0x01)

        val result = BleProtocol.decodeFrame(badFrame)

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("Checksum mismatch") == true)
    }

    @Test
    fun `decodeFrame rejects frame that is too short`() {
        val badFrame = byteArrayOf(0x02, 0x01)

        val result = BleProtocol.decodeFrame(badFrame)

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("Frame too short") == true)
    }

    @Test
    fun `decodeFrame rejects frame with length mismatch`() {
        val badFrame = byteArrayOf(0x02, 0x04, 0xA1.toByte(), 0x00, 0x78, 0x00, 0x01)

        val result = BleProtocol.decodeFrame(badFrame)

        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("Frame length mismatch") == true)
    }

    // ---- childLockCommand ----

    @Test
    fun `childLockCommand lock=true produces correct frame`() {
        val cmd = BleProtocol.childLockCommand(lock = true)

        assertEquals(0x02, cmd[0].toInt() and 0xFF)
        assertEquals(0x02, cmd[1].toInt() and 0xFF) // LEN = CMD + DATA
        assertEquals(0xA1, cmd[2].toInt() and 0xFF)
        assertEquals(0x78, cmd[3].toInt() and 0xFF)
        assertEquals(0x01, cmd.last().toInt() and 0xFF)
    }

    @Test
    fun `childLockCommand lock=false produces correct frame`() {
        val cmd = BleProtocol.childLockCommand(lock = false)

        assertEquals(0xA1, cmd[2].toInt() and 0xFF)
        assertEquals(0x87, cmd[3].toInt() and 0xFF)
        assertEquals(0x01, cmd.last().toInt() and 0xFF)
    }

    // ---- terminalInfoCommand ----

    @Test
    fun `terminalInfoCommand produces correct frame`() {
        val cmd = BleProtocol.terminalInfoCommand()

        // HEAD(0x02) LEN(0x01=CMD only) CMD(0xA2) CHECKSUM TAIL(0x01)
        assertEquals(0x02, cmd[0].toInt() and 0xFF)
        assertEquals(0x01, cmd[1].toInt() and 0xFF)
        assertEquals(0xA2, cmd[2].toInt() and 0xFF)
        assertEquals(0x01, cmd.last().toInt() and 0xFF)
    }

    // ---- parseChildLockResponse ----

    @Test
    fun `parseChildLockResponse parses locked state`() {
        val frame = ParsedFrame(cmd = 0xA1, ack = 0x00, data = byteArrayOf(0x78.toByte()))

        val result = BleProtocol.parseChildLockResponse(frame).getOrThrow()

        assertEquals(true, result.locked)
    }

    @Test
    fun `parseChildLockResponse parses unlocked state`() {
        val frame = ParsedFrame(cmd = 0xA1, ack = 0x00, data = byteArrayOf(0x87.toByte()))

        val result = BleProtocol.parseChildLockResponse(frame).getOrThrow()

        assertEquals(false, result.locked)
    }

    @Test
    fun `parseChildLockResponse rejects wrong command`() {
        val frame = ParsedFrame(cmd = 0xA2, ack = 0x00, data = byteArrayOf(0x78))

        val result = BleProtocol.parseChildLockResponse(frame)

        assertTrue(result.isFailure)
    }

    @Test
    fun `parseChildLockResponse rejects non-zero ACK`() {
        val frame = ParsedFrame(cmd = 0xA1, ack = 0x01, data = byteArrayOf(0x78))

        val result = BleProtocol.parseChildLockResponse(frame)

        assertTrue(result.isFailure)
    }

    // ---- parseTerminalInfoResponse ----

    @Test
    fun `parseTerminalInfoResponse parses locked, power on, 80% battery`() {
        // B1=0x31(locked), B2=0x00(power on), B3=0x50(80%)
        val frame = ParsedFrame(cmd = 0xA2, ack = 0x00, data = byteArrayOf(0x31, 0x00, 0x50))

        val info = BleProtocol.parseTerminalInfoResponse(frame).getOrThrow()

        assertEquals(true, info.locked)
        assertEquals("Power On", info.systemState.label)
        assertEquals(80, info.batteryPercent)
    }

    @Test
    fun `parseTerminalInfoResponse parses unlocked, heating, 50% battery`() {
        val frame = ParsedFrame(cmd = 0xA2, ack = 0x00, data = byteArrayOf(0x30, 0x03, 0x32))

        val info = BleProtocol.parseTerminalInfoResponse(frame).getOrThrow()

        assertEquals(false, info.locked)
        assertEquals("Heating", info.systemState.label)
        assertEquals(50, info.batteryPercent)
    }

    @Test
    fun `parseTerminalInfoResponse accepts documented A1 response with three data bytes`() {
        val frame = ParsedFrame(cmd = 0xA1, ack = 0x00, data = byteArrayOf(0x31, 0x02, 0x64))

        val info = BleProtocol.parseTerminalInfoResponse(frame).getOrThrow()

        assertEquals(true, info.locked)
        assertEquals("Preheating", info.systemState.label)
        assertEquals(100, info.batteryPercent)
    }

    @Test
    fun `parseTerminalInfoResponse rejects non-zero ACK`() {
        val frame = ParsedFrame(cmd = 0xA2, ack = 0x01, data = byteArrayOf(0x31, 0x00, 0x50))

        val result = BleProtocol.parseTerminalInfoResponse(frame)

        assertTrue(result.isFailure)
    }

    @Test
    fun `parseTerminalInfoResponse rejects data too short`() {
        val frame = ParsedFrame(cmd = 0xA2, ack = 0x00, data = byteArrayOf(0x31))

        val result = BleProtocol.parseTerminalInfoResponse(frame)

        assertTrue(result.isFailure)
    }

    @Test
    fun `parseTerminalInfoResponse rejects wrong command`() {
        val frame = ParsedFrame(cmd = 0xA3, ack = 0x00, data = byteArrayOf(0x31, 0x00, 0x50))

        val result = BleProtocol.parseTerminalInfoResponse(frame)

        assertTrue(result.isFailure)
    }
}
