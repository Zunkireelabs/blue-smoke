package com.itorn.hqd.itronlib.protocol

import com.itorn.hqd.itronlib.model.ChildLockState
import com.itorn.hqd.itronlib.model.DeviceInfo
import com.itorn.hqd.itronlib.model.SystemState

internal data class ParsedFrame(
    val cmd: Int,
    val ack: Int,
    val data: ByteArray,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is ParsedFrame) return false
        return cmd == other.cmd && ack == other.ack && data.contentEquals(other.data)
    }

    override fun hashCode(): Int {
        var result = cmd
        result = 31 * result + ack
        result = 31 * result + data.contentHashCode()
        return result
    }
}

object BleProtocol {
    private const val FRAME_HEAD = 0x02
    private const val FRAME_TAIL = 0x01

    private const val CMD_CHILD_LOCK = 0xA1
    private const val CMD_TERMINAL_INFO = 0xA2

    private const val ACK_SUCCESS = 0x00

    private const val CHILD_LOCK_LOCKED = 0x78
    private const val CHILD_LOCK_UNLOCKED = 0x87

    private const val TERM_INFO_LOCKED = 0x31
    private const val TERM_INFO_UNLOCKED = 0x30

    // ---- Frame encoding ----

    fun encodeFrame(cmd: Int, data: ByteArray? = null): ByteArray {
        val payload = data ?: byteArrayOf()
        val length = 1 + payload.size // CMD + DATA
        val total = 2 + length + 1 + 1 // HEAD + LENGTH + CMD + DATA + CHECKSUM + TAIL
        val frame = ByteArray(total)
        var offset = 0
        frame[offset++] = FRAME_HEAD.toByte()
        frame[offset++] = length.toByte()
        frame[offset++] = cmd.toByte()
        if (payload.isNotEmpty()) {
            payload.copyInto(frame, offset)
            offset += payload.size
        }

        val checksum = (0 until offset).fold(0) { acc, i -> acc xor (frame[i].toInt() and 0xFF) }
        frame[offset++] = checksum.toByte()
        frame[offset++] = FRAME_TAIL.toByte()

        return frame
    }

    // ---- Frame decoding ----

    internal fun decodeFrame(bytes: ByteArray): Result<ParsedFrame> = runCatching {
        require(bytes.size >= 5) { "Frame too short: need at least 5 bytes, got ${bytes.size}" }
        require(bytes[0].toInt() and 0xFF == FRAME_HEAD) { "Invalid frame head: 0x${(bytes[0].toInt() and 0xFF).toString(16).uppercase()}" }
        require(bytes.last().toInt() and 0xFF == FRAME_TAIL) { "Invalid frame tail: 0x${(bytes.last().toInt() and 0xFF).toString(16).uppercase()}" }

        val length = bytes[1].toInt() and 0xFF
        require(length >= 2) { "Frame length too short: need CMD and ACK, got $length" }
        require(bytes.size == 2 + length + 1 + 1) { "Frame length mismatch: header says $length payload bytes, actual size ${bytes.size}" }

        val expectedChecksumOffset = 2 + length
        val expectedChecksum = (0 until expectedChecksumOffset).fold(0) { acc, i -> acc xor (bytes[i].toInt() and 0xFF) }
        val actualChecksum = bytes[expectedChecksumOffset].toInt() and 0xFF
        require(expectedChecksum == actualChecksum) { "Checksum mismatch: expected 0x${expectedChecksum.toString(16).uppercase()}, got 0x${actualChecksum.toString(16).uppercase()}" }

        val cmd = bytes[2].toInt() and 0xFF
        val ack = bytes[3].toInt() and 0xFF
        val data = if (length > 2) {
            bytes.copyOfRange(4, 2 + length)
        } else {
            byteArrayOf()
        }

        ParsedFrame(cmd, ack, data)
    }

    // ---- Command builders ----

    fun childLockCommand(lock: Boolean): ByteArray =
        encodeFrame(CMD_CHILD_LOCK, byteArrayOf(if (lock) CHILD_LOCK_LOCKED.toByte() else CHILD_LOCK_UNLOCKED.toByte()))

    fun terminalInfoCommand(): ByteArray =
        encodeFrame(CMD_TERMINAL_INFO)

    // ---- Response parsers ----

    internal fun parseChildLockResponse(frame: ParsedFrame): Result<ChildLockState> = runCatching {
        require(frame.cmd == CMD_CHILD_LOCK) { "Expected CMD 0xA1, got 0x${frame.cmd.toString(16).uppercase()}" }
        require(frame.ack == ACK_SUCCESS) { "Child lock returned ACK=0x${frame.ack.toString(16).uppercase()}, expected 0x${ACK_SUCCESS.toString(16).uppercase()}" }
        require(frame.data.isNotEmpty()) { "Child lock response has no data" }
        val locked = frame.data[0].toInt() and 0xFF == CHILD_LOCK_LOCKED
        ChildLockState(locked)
    }

    internal fun parseTerminalInfoResponse(frame: ParsedFrame): Result<DeviceInfo> = runCatching {
        require(frame.cmd == CMD_TERMINAL_INFO || frame.cmd == CMD_CHILD_LOCK) { "Expected CMD 0xA2, got 0x${frame.cmd.toString(16).uppercase()}" }
        require(frame.ack == ACK_SUCCESS) { "Terminal info returned ACK=0x${frame.ack.toString(16).uppercase()}, expected 0x${ACK_SUCCESS.toString(16).uppercase()}" }
        require(frame.data.size >= 3) { "Terminal info data too short: ${frame.data.size} bytes, need at least 3" }

        val locked = (frame.data[0].toInt() and 0xFF) == TERM_INFO_LOCKED
        val systemState = SystemState.fromValue(frame.data[1].toInt() and 0xFF)
        val batteryPercent = frame.data[2].toInt() and 0xFF

        DeviceInfo(
            locked = locked,
            systemState = systemState,
            batteryPercent = batteryPercent,
        )
    }
}
