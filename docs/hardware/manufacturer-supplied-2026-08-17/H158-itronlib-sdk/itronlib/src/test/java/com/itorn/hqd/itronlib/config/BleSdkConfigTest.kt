package com.itorn.hqd.itronlib.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.UUID

class BleSdkConfigTest {
    @Test
    fun defaults_useProvidedCommunicationUuids() {
        val config = BleSdkConfig()

        assertEquals(UUID.fromString("0000fff0-0000-1000-8000-00805f9b34fb"), config.serviceUuid)
        assertEquals(UUID.fromString("0000fff1-0000-1000-8000-00805f9b34fb"), config.writeCharacteristicUuid)
        assertEquals(UUID.fromString("0000fff1-0000-1000-8000-00805f9b34fb"), config.notifyCharacteristicUuid)
        assertTrue(config.isConfigured())
    }
}
