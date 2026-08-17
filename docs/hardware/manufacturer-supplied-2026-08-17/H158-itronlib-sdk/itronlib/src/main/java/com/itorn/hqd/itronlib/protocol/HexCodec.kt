package com.itorn.hqd.itronlib.protocol

object HexCodec {
    fun decode(hexText: String): Result<ByteArray> = runCatching {
        val normalized = hexText.replace("\\s".toRegex(), "").uppercase()
        require(normalized.isNotEmpty()) { "Hex input cannot be empty" }
        require(normalized.length % 2 == 0) { "Hex input must contain an even number of characters" }
        require(normalized.all { it in '0'..'9' || it in 'A'..'F' }) { "Hex input contains invalid characters" }

        normalized.chunked(2)
            .map { it.toInt(16).toByte() }
            .toByteArray()
    }

    fun encode(bytes: ByteArray): String =
        bytes.joinToString(" ") { "%02X".format(it.toInt() and 0xFF) }
}
