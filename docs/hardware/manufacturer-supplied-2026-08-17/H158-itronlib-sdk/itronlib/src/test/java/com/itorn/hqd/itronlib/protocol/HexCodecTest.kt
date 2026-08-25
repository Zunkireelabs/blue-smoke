package com.itorn.hqd.itronlib.protocol

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class HexCodecTest {
    @Test
    fun decode_acceptsSpacesAndUppercase() {
        val result = HexCodec.decode("01 A0 ff")

        assertTrue(result.isSuccess)
        assertArrayEquals(byteArrayOf(0x01, 0xA0.toByte(), 0xFF.toByte()), result.getOrThrow())
    }

    @Test
    fun decode_rejectsOddCharacterCount() {
        val result = HexCodec.decode("0A 1")

        assertTrue(result.isFailure)
        assertEquals("Hex input must contain an even number of characters", result.exceptionOrNull()?.message)
    }

    @Test
    fun encode_formatsUppercaseWithSpaces() {
        assertEquals("01 A0 FF", HexCodec.encode(byteArrayOf(0x01, 0xA0.toByte(), 0xFF.toByte())))
    }
}
